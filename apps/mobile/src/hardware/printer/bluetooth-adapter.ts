import { BleManager, type Device } from 'react-native-ble-plx';
import { ESCPOSBuilder, fmtPHP } from './escpos-builder';
import type { PrinterProvider, PrinterDevice, ReceiptData, PrintResult } from './types';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINTER_CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

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
    const devices: PrinterDevice[] = [];

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.manager.stopDeviceScan();
        resolve(devices);
      }, 10000);

      this.manager.startDeviceScan(null, null, (error, device) => {
        if (error || !device?.name) return;
        if (!devices.find(d => d.id === device.id)) {
          devices.push({
            id: device.id,
            name: device.name || 'Unknown',
            address: device.id,
            rssi: device.rssi ?? undefined,
          });
        }
      });
    });
  }

  async connect(deviceId: string): Promise<void> {
    const device = await this.manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();
    this.device = device;
    storage.set(KEYS.PRINTER_DEVICE_ID, deviceId);
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      await this.manager.cancelDeviceConnection(this.device.id);
      this.device = null;
    }
  }

  async printReceipt(receipt: ReceiptData): Promise<PrintResult> {
    if (!this.device) return { success: false, error: 'Printer not connected' };

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
      .separator()
      .columns('Payment', receipt.transaction.paymentMethod);

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
      // Write in chunks (BLE has MTU limits)
      const CHUNK_SIZE = 512;
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        const base64 = this.uint8ToBase64(chunk);
        await this.device.writeCharacteristicWithResponseForService(
          PRINTER_SERVICE_UUID,
          PRINTER_CHAR_UUID,
          base64,
        );
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async printRaw(data: Uint8Array): Promise<PrintResult> {
    if (!this.device) return { success: false, error: 'Printer not connected' };

    try {
      const CHUNK_SIZE = 512;
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        const base64 = this.uint8ToBase64(chunk);
        await this.device.writeCharacteristicWithResponseForService(
          PRINTER_SERVICE_UUID,
          PRINTER_CHAR_UUID,
          base64,
        );
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async printTestPage(): Promise<PrintResult> {
    return this.printReceipt({
      header: { storeName: 'APEX AUTO PARTS', address: 'Test Print' },
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
    const builder = new ESCPOSBuilder();
    builder.openDrawer();
    const data = builder.build();
    const base64 = this.uint8ToBase64(data);
    await this.device.writeCharacteristicWithResponseForService(
      PRINTER_SERVICE_UUID,
      PRINTER_CHAR_UUID,
      base64,
    );
  }

  private uint8ToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
