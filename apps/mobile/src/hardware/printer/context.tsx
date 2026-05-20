import React, { createContext, useContext, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { PrinterProvider } from './types';
import { BluetoothPrinterAdapter } from './bluetooth-adapter';
import { MockPrinterAdapter } from './mock-adapter';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { runAutoPrintRetryCycle } from './settings';

const PrinterContext = createContext<PrinterProvider | null>(null);

function createPrinter(): PrinterProvider {
  if (__DEV__) return new MockPrinterAdapter();
  return new BluetoothPrinterAdapter();
}

export function PrinterProviderComponent({ children }: { children: React.ReactNode }) {
  const printerRef = useRef<PrinterProvider>(createPrinter());

  // Auto-reconnect to the last known printer, then flush eligible queued jobs.
  useEffect(() => {
    const lastDeviceId = storage.getString(KEYS.PRINTER_DEVICE_ID);
    if (lastDeviceId && !printerRef.current.isConnected) {
      printerRef.current.connect(lastDeviceId)
        .then(() => {
          void runAutoPrintRetryCycle(printerRef.current);
        })
        .catch(() => {
          // User can manually reconnect in Printer Setup.
        });
    }
  }, []);

  useEffect(() => {
    const runIfActive = (state: AppStateStatus) => {
      if (state === 'active') {
        void runAutoPrintRetryCycle(printerRef.current);
      }
    };
    const subscription = AppState.addEventListener('change', runIfActive);
    runIfActive(AppState.currentState);
    return () => subscription.remove();
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
