import type { ScanResult, ScannerProvider } from './types';

/**
 * HID Scanner Adapter
 *
 * Listens for rapid keystroke sequences from USB/Bluetooth HID barcode scanners.
 * These scanners act as keyboard input — they type the barcode followed by Enter.
 *
 * Focus/capture rules:
 * - Only captures when explicitly listening (startListening called)
 * - Detects scanner vs manual typing by inter-keystroke speed (<50ms = scanner)
 * - Barcode must end with Enter key within 300ms of first character
 * - Minimum barcode length: 4 characters
 * - While listening, scanner input is captured and NOT passed to focused text fields
 */
export class HIDScannerAdapter implements ScannerProvider {
  readonly type = 'hid' as const;
  readonly isAvailable = true;

  private _listening = false;
  private _buffer = '';
  private _lastKeyTime = 0;
  private _timeout: ReturnType<typeof setTimeout> | null = null;
  private _callbacks: Array<(result: ScanResult) => void> = [];

  private static readonly INTER_KEY_THRESHOLD = 50;  // ms — scanner types faster than this
  private static readonly BUFFER_TIMEOUT = 300;       // ms — max time for complete barcode
  private static readonly MIN_LENGTH = 4;

  startListening(): void {
    if (this._listening) return;
    this._listening = true;
    // NOTE: Actual key interception requires a native module or
    // a transparent overlay that captures KeyEvent before TextInput.
    // This adapter provides the processing logic; native bridge
    // calls handleKeyEvent() for each hardware key press.
    console.log('[HIDScanner] Listening started');
  }

  stopListening(): void {
    this._listening = false;
    this._clearBuffer();
    console.log('[HIDScanner] Listening stopped');
  }

  async openCameraScanner(): Promise<ScanResult | null> {
    // HID adapter doesn't support camera
    return null;
  }

  onScan(callback: (result: ScanResult) => void): () => void {
    this._callbacks.push(callback);
    return () => {
      this._callbacks = this._callbacks.filter(cb => cb !== callback);
    };
  }

  /** Called by native key event handler */
  handleKeyEvent(key: string, timestamp: number): void {
    if (!this._listening) return;

    const elapsed = timestamp - this._lastKeyTime;
    this._lastKeyTime = timestamp;

    // If too slow between keystrokes, this is manual typing — reset buffer
    if (this._buffer.length > 0 && elapsed > HIDScannerAdapter.INTER_KEY_THRESHOLD) {
      this._clearBuffer();
    }

    if (key === 'Enter' || key === '\n') {
      if (this._buffer.length >= HIDScannerAdapter.MIN_LENGTH) {
        this._emitScan(this._buffer);
      }
      this._clearBuffer();
      return;
    }

    this._buffer += key;

    // Safety timeout — if no Enter received within BUFFER_TIMEOUT, discard
    if (this._timeout) clearTimeout(this._timeout);
    this._timeout = setTimeout(() => this._clearBuffer(), HIDScannerAdapter.BUFFER_TIMEOUT);
  }

  private _emitScan(barcode: string): void {
    const result: ScanResult = {
      barcode,
      format: this._detectFormat(barcode),
      timestamp: Date.now(),
    };
    this._callbacks.forEach(cb => cb(result));
  }

  private _detectFormat(barcode: string): string {
    if (/^\d{13}$/.test(barcode)) return 'EAN13';
    if (/^\d{8}$/.test(barcode)) return 'EAN8';
    if (/^\d{12}$/.test(barcode)) return 'UPC_A';
    return 'CODE128';
  }

  private _clearBuffer(): void {
    this._buffer = '';
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
  }
}
