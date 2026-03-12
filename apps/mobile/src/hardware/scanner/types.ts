export interface ScanResult {
  barcode: string;
  format: 'EAN13' | 'EAN8' | 'UPC_A' | 'CODE128' | 'QR' | string;
  timestamp: number;
}

export interface ScannerProvider {
  readonly type: 'hid' | 'camera' | 'mock';
  readonly isAvailable: boolean;

  /** HID: start listening for keyboard-wedge input */
  startListening(): void;
  /** HID: stop listening */
  stopListening(): void;
  /** Camera: open scanner modal, returns result or null if cancelled */
  openCameraScanner(): Promise<ScanResult | null>;
  /** Subscribe to scan events. Returns unsubscribe function. */
  onScan(callback: (result: ScanResult) => void): () => void;
}
