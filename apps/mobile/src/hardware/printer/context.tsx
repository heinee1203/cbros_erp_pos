import React, { createContext, useContext, useRef, useEffect } from 'react';
import type { PrinterProvider } from './types';
import { BluetoothPrinterAdapter } from './bluetooth-adapter';
import { MockPrinterAdapter } from './mock-adapter';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

const PrinterContext = createContext<PrinterProvider | null>(null);

function createPrinter(): PrinterProvider {
  if (__DEV__) return new MockPrinterAdapter();
  return new BluetoothPrinterAdapter();
}

export function PrinterProviderComponent({ children }: { children: React.ReactNode }) {
  const printerRef = useRef<PrinterProvider>(createPrinter());

  // Auto-reconnect to last known printer
  useEffect(() => {
    const lastDeviceId = storage.getString(KEYS.PRINTER_DEVICE_ID);
    if (lastDeviceId && !printerRef.current.isConnected) {
      printerRef.current.connect(lastDeviceId).catch(() => {
        // Silent fail on auto-reconnect — user can manually reconnect in settings
      });
    }
  }, []);

  return React.createElement(
    PrinterContext.Provider,
    { value: printerRef.current },
    children,
  );
}

export function usePrinter(): PrinterProvider {
  const ctx = useContext(PrinterContext);
  if (!ctx) throw new Error('usePrinter must be used within PrinterProvider');
  return ctx;
}
