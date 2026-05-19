import type { PrinterProvider, PrinterDevice, ReceiptData, PrintResult } from './types';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

export class MockPrinterAdapter implements PrinterProvider {
  readonly type = 'mock' as const;
  private _connected = false;

  get isConnected(): boolean {
    return this._connected;
  }

  async discover(): Promise<PrinterDevice[]> {
    return [
      { id: 'mock-printer-1', name: 'Mock Printer (Dev)', address: 'AA:BB:CC:DD:EE:FF' },
    ];
  }

  async connect(_deviceId: string): Promise<void> {
    this._connected = true;
    storage.set(KEYS.PRINTER_DEVICE_ID, _deviceId);
    console.log('[MockPrinter] Connected');
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    storage.delete(KEYS.PRINTER_DEVICE_ID);
    console.log('[MockPrinter] Disconnected');
  }

  async printReceipt(receipt: ReceiptData): Promise<PrintResult> {
    console.log('[MockPrinter] Receipt:', JSON.stringify(receipt, null, 2));
    return { success: true };
  }

  async printRaw(data: Uint8Array): Promise<PrintResult> {
    console.log(`[MockPrinter] Raw print: ${data.length} bytes`);
    return { success: true };
  }

  async printTestPage(): Promise<PrintResult> {
    console.log('[MockPrinter] Test page printed');
    return { success: true };
  }

  async openCashDrawer(): Promise<void> {
    console.log('[MockPrinter] Cash drawer opened');
  }
}
