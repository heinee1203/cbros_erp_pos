import type { ScanResult, ScannerProvider } from './types';
import { recordScannerScan, setScannerCaptureActive } from '@/storage/scanner-diagnostics';

/**
 * Camera Scanner Adapter
 *
 * Uses react-native-vision-camera for barcode scanning via device camera.
 * Opens a modal scanner view; auto-detects barcode and returns result.
 *
 * The actual camera UI is a React component (BarcodeScannerModal).
 * This adapter coordinates between the component and consumers.
 */
export class CameraScannerAdapter implements ScannerProvider {
  readonly type = 'camera' as const;
  readonly isAvailable = false;

  private _callbacks: Array<(result: ScanResult) => void> = [];
  private _resolvePromise: ((result: ScanResult | null) => void) | null = null;

  startListening(): void {
    // Camera scanner doesn't passively listen — it requires explicit open
  }

  stopListening(): void {
    // No-op for camera
  }

  async openCameraScanner(): Promise<ScanResult | null> {
    setScannerCaptureActive(true, 'Camera scanner');
    return null;
  }

  /** Called by BarcodeScannerModal when a barcode is detected */
  handleCameraResult(barcode: string, format: string): void {
    const result: ScanResult = { barcode, format, timestamp: Date.now() };
    recordScannerScan('camera', barcode, format);
    setScannerCaptureActive(false);
    if (this._resolvePromise) {
      this._resolvePromise(result);
      this._resolvePromise = null;
    }
    // Also notify scan listeners (excluding the COMMAND signal)
    this._callbacks.forEach(cb => cb(result));
  }

  /** Called when camera modal is dismissed without scanning */
  handleCameraCancel(): void {
    setScannerCaptureActive(false);
    if (this._resolvePromise) {
      this._resolvePromise(null);
      this._resolvePromise = null;
    }
  }

  onScan(callback: (result: ScanResult) => void): () => void {
    this._callbacks.push(callback);
    return () => {
      this._callbacks = this._callbacks.filter(cb => cb !== callback);
    };
  }
}
