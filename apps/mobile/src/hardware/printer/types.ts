export interface PrinterDevice {
  id: string;
  name: string;
  address: string;
  rssi?: number;
}

export interface ReceiptData {
  header: {
    storeName: string;
    address?: string;
    phone?: string;
  };
  transaction: {
    receiptNumber: string;
    date: string;
    cashier: string;
    lines: Array<{
      name: string;
      qty: number;
      unitPrice: number;
      total: number;
    }>;
    subtotal: number;
    discount: number;
    grandTotal: number;
    paymentMethod: string;
    cashTendered?: number;
    change?: number;
    payments?: Array<{
      method: string;
      amount: number;
      reference?: string;
      installmentTerm?: string;
    }>;
  };
  footer: {
    message: string;
  };
}

export interface PrintResult {
  success: boolean;
  error?: string;
}

export interface PrinterProvider {
  readonly type: 'bluetooth' | 'mock';
  readonly isConnected: boolean;

  discover(): Promise<PrinterDevice[]>;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  printReceipt(receipt: ReceiptData): Promise<PrintResult>;
  printRaw(data: Uint8Array): Promise<PrintResult>;
  printTestPage(): Promise<PrintResult>;
  openCashDrawer(): Promise<void>;
}
