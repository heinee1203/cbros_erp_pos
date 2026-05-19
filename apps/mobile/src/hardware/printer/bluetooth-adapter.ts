import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, type Device } from 'react-native-ble-plx';
import { ESCPOSBuilder, fmtPHP } from './escpos-builder';
import type { PrinterProvider, PrinterDevice, ReceiptData, PrintResult } from './types';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINTER_CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb';
const BLE_WRITE_CHUNK_SIZE = 180;
const BLE_WRITE_DELAY_MS = 20;
type AndroidPermission = Parameters<typeof PermissionsAndroid.requestMultiple>[0][number];

export class BluetoothPrinterAdapter implements PrinterProvider {
  readonly type = 'bluetooth' as const;

  private manager: BleManager;
  private device: Device | null = null;

  get isConnected(): boolean {
    return this.device !== null;
  }

  constructor() {
    this.manager = new BleManager();
  }

  async discover(): Promise<PrinterDevice[]> {
    await this.ensureBluetoothReady('scan');

    const devices: PrinterDevice[] = [];

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (result: PrinterDevice[]) => {
        if (settled) return;
        settled = true;
        this.manager.stopDeviceScan();
        resolve(result);
      };
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        this.manager.stopDeviceScan();
        reject(new Error(message));
      };

      const timeout = setTimeout(() => {
        finish(devices);
      }, 10000);

      this.manager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          clearTimeout(timeout);
          fail(error.message || 'Bluetooth printer scan failed');
          return;
        }

        const name = device?.name || device?.localName;
        if (!device || !name) return;
        if (!devices.find(d => d.id === device.id)) {
          devices.push({
            id: device.id,
            name,
            address: device.id,
            rssi: device.rssi ?? undefined,
          });
        }
      });
    });
  }

  async connect(deviceId: string): Promise<void> {
    await this.ensureBluetoothReady('connect');
    const device = await this.manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();
    this.device = device;
    storage.set(KEYS.PRINTER_DEVICE_ID, deviceId);
  }

  async disconnect(): Promise<void> {
    await this.ensureBluetoothPermissions('connect');
    if (this.device) {
      await this.manager.cancelDeviceConnection(this.device.id);
      this.device = null;
    }
    storage.delete(KEYS.PRINTER_DEVICE_ID);
  }

  async printReceipt(receipt: ReceiptData): Promise<PrintResult> {
    if (!this.device) return { success: false, error: 'Printer not connected' };
    await this.ensureBluetoothPermissions('connect');

    const paperWidth = (storage.getString(KEYS.PRINTER_PAPER_WIDTH) || '80mm') as '58mm' | '80mm';
    const builder = new ESCPOSBuilder(paperWidth);

    builder
      .initialize()
      .alignCenter()
      .bold(true)
      .fontSize(2)
      .text(receipt.header.storeName)
      .fontSize(1)
      .bold(false);

    if (receipt.header.address) builder.text(receipt.header.address);
    if (receipt.header.phone) builder.text(receipt.header.phone);

    builder
      .separator()
      .alignLeft()
      .columns('Receipt:', receipt.transaction.receiptNumber)
      .columns('Date:', receipt.transaction.date)
      .columns('Cashier:', receipt.transaction.cashier)
      .separator();

    // Line items
    for (const line of receipt.transaction.lines) {
      const nameStr = line.name.substring(0, paperWidth === '58mm' ? 20 : 32);
      builder.text(nameStr);
      builder.columns(
        `  ${line.qty} x ${fmtPHP(line.unitPrice)}`,
        fmtPHP(line.total),
      );
    }

    builder
      .separator()
      .columns('Subtotal', fmtPHP(receipt.transaction.subtotal));

    if (receipt.transaction.discount > 0) {
      builder.columns('Discount', `-${fmtPHP(receipt.transaction.discount)}`);
    }

    builder
      .bold(true)
      .fontSize(2)
      .columns('TOTAL', fmtPHP(receipt.transaction.grandTotal))
      .fontSize(1)
      .bold(false)
      .separator();

    if (receipt.transaction.payments?.length) {
      builder.text('PAYMENTS');
      for (const payment of receipt.transaction.payments) {
        builder.columns(payment.method, fmtPHP(payment.amount));
        if (payment.reference) {
          builder.text(`  Ref: ${payment.reference}`);
        }
        if (payment.installmentTerm) {
          builder.text(`  Term: ${payment.installmentTerm.replace(/_/g, ' ')}`);
        }
      }
    } else {
      builder.columns('Payment', receipt.transaction.paymentMethod);
    }

    if (receipt.transaction.cashTendered !== undefined) {
      builder.columns('Cash', fmtPHP(receipt.transaction.cashTendered));
      builder.columns('Change', fmtPHP(receipt.transaction.change ?? 0));
    }

    builder
      .newline()
      .alignCenter()
      .text(receipt.footer.message)
      .newline(2)
      .cut();

    try {
      const data = builder.build();
      await this.writeBytes(data);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async printRaw(data: Uint8Array): Promise<PrintResult> {
    if (!this.device) return { success: false, error: 'Printer not connected' };
    await this.ensureBluetoothPermissions('connect');

    try {
      await this.writeBytes(data);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async printTestPage(): Promise<PrintResult> {
    return this.printReceipt({
      header: { storeName: 'CBROS GENUINE AUTOPARTS', address: 'Test Print' },
      transaction: {
        receiptNumber: 'TEST-001',
        date: new Date().toLocaleString(),
        cashier: 'System',
        lines: [{ name: 'Test Item', qty: 1, unitPrice: 100, total: 100 }],
        subtotal: 100,
        discount: 0,
        grandTotal: 100,
        paymentMethod: 'CASH',
      },
      footer: { message: 'Printer test successful' },
    });
  }

  async openCashDrawer(): Promise<void> {
    if (!this.device) return;
    await this.ensureBluetoothPermissions('connect');
    const builder = new ESCPOSBuilder();
    builder.openDrawer();
    const data = builder.build();
    await this.writeBytes(data);
  }

  private async writeBytes(data: Uint8Array): Promise<void> {
    if (!this.device) throw new Error('Printer not connected');
    for (let i = 0; i < data.length; i += BLE_WRITE_CHUNK_SIZE) {
      const chunk = data.slice(i, i + BLE_WRITE_CHUNK_SIZE);
      const base64 = this.uint8ToBase64(chunk);
      await this.device.writeCharacteristicWithResponseForService(
        PRINTER_SERVICE_UUID,
        PRINTER_CHAR_UUID,
        base64,
      );
      if (i + BLE_WRITE_CHUNK_SIZE < data.length) {
        await delay(BLE_WRITE_DELAY_MS);
      }
    }
  }

  private uint8ToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private async ensureBluetoothReady(intent: 'scan' | 'connect'): Promise<void> {
    await this.ensureBluetoothPermissions(intent);
    const state = await this.manager.state();
    if (state !== 'PoweredOn') {
      throw new Error('Bluetooth is off. Turn on Bluetooth before scanning for printers.');
    }
  }

  private async ensureBluetoothPermissions(intent: 'scan' | 'connect'): Promise<void> {
    if (Platform.OS !== 'android') return;

    const apiLevel = typeof Platform.Version === 'string'
      ? Number.parseInt(Platform.Version, 10)
      : Platform.Version;
    const permissions: AndroidPermission[] = [];

    if (apiLevel >= 31) {
      if (intent === 'scan') {
        permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN as AndroidPermission);
      }
      permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT as AndroidPermission);
    } else if (intent === 'scan') {
      permissions.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION as AndroidPermission);
    }

    if (permissions.length === 0) return;

    const statuses = await PermissionsAndroid.requestMultiple(permissions);
    const denied = permissions.filter(permission => statuses[permission] !== PermissionsAndroid.RESULTS.GRANTED);
    if (denied.length > 0) {
      throw new Error(
        apiLevel >= 31
          ? 'Bluetooth permission denied. Allow Nearby devices permission to scan and connect printers.'
          : 'Location permission denied. Android requires location permission to scan Bluetooth printers.',
      );
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
