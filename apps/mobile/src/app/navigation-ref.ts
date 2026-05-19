import { createNavigationContainerRef } from '@react-navigation/native';

export const rootNavigationRef = createNavigationContainerRef<any>();

export function openSyncRecovery(): void {
  if (!rootNavigationRef.isReady()) return;
  rootNavigationRef.navigate('More', { screen: 'SyncManagement' });
}
