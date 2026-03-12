import React, { createContext, useContext, useRef } from 'react';
import type { ScannerProvider } from './types';
import { HIDScannerAdapter } from './hid-adapter';
import { CameraScannerAdapter } from './camera-adapter';
import { MockScannerAdapter } from './mock-adapter';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

const ScannerContext = createContext<ScannerProvider | null>(null);

function createScanner(): ScannerProvider {
  const mode = storage.getString(KEYS.SCANNER_MODE);

  if (__DEV__ && mode === 'mock') return new MockScannerAdapter();
  if (mode === 'camera') return new CameraScannerAdapter();

  // Default: HID for counter POS
  return new HIDScannerAdapter();
}

export function ScannerProviderComponent({ children }: { children: React.ReactNode }) {
  const scannerRef = useRef<ScannerProvider>(createScanner());

  return React.createElement(
    ScannerContext.Provider,
    { value: scannerRef.current },
    children,
  );
}

export function useScanner(): ScannerProvider {
  const ctx = useContext(ScannerContext);
  if (!ctx) throw new Error('useScanner must be used within ScannerProvider');
  return ctx;
}
