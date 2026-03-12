import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/services/query-client';
import { AuthProvider } from '@/hooks/use-auth';
import { ScannerProviderComponent } from '@/hardware/scanner/context';
import { PrinterProviderComponent } from '@/hardware/printer/context';
import RootNavigator from '@/app/RootNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ScannerProviderComponent>
            <PrinterProviderComponent>
              <RootNavigator />
            </PrinterProviderComponent>
          </ScannerProviderComponent>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
