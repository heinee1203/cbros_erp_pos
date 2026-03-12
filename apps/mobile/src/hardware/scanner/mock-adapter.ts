import type { ScanResult, ScannerProvider } from './types';

export class MockScannerAdapter implements ScannerProvider {
  readonly type = 'mock' as const;
  readonly isAvailable = true;

  private _callbacks: Array<(result: ScanResult) => void> = [];

  startListening(): void {}
  stopListening(): void {}

  async openCameraScanner(): Promise<ScanResult | null> {
    // Simulate a scan after 1 second
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          barcode: '4806512345678',
          format: 'EAN13',
          timestamp: Date.now(),
        });
      }, 1000);
    });
  }

  /** Manually trigger a mock scan (for dev/testing) */
  simulateScan(barcode: string): void {
    const result: ScanResult = {
      barcode,
      format: /^\d{13}$/.test(barcode) ? 'EAN13' : 'CODE128',
      timestamp: Date.now(),
    };
    this._callbacks.forEach(cb => cb(result));
  }

  onScan(callback: (result: ScanResult) => void): () => void {
    this._callbacks.push(callback);
    return () => {
      this._callbacks = this._callbacks.filter(cb => cb !== callback);
    };
  }
}
