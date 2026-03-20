import React, { useState, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '@/hooks/use-auth';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import LocationSelectScreen from './screens/LocationSelectScreen';
import SyncProgressScreen from './screens/SyncProgressScreen';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '@/theme';

type AppPhase = 'location-select' | 'syncing' | 'ready';

export default function RootNavigator() {
  const { isAuthenticated, needsLocationSelect, isLoading, setLocationId, locations, locationId } = useAuth();
  const [phase, setPhase] = useState<AppPhase>(
    // If returning user already has a location, skip straight to ready
    'ready',
  );

  const handleLocationSelected = useCallback((locId: string) => {
    setLocationId(locId);
    setPhase('syncing');
  }, [setLocationId]);

  const handleSyncComplete = useCallback(() => {
    setPhase('ready');
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg.primary }}>
        <ActivityIndicator size="large" color={colors.text.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <NavigationContainer>
        <AuthStack />
      </NavigationContainer>
    );
  }

  // Authenticated but no location selected → show location picker
  if (needsLocationSelect || (phase === 'location-select')) {
    return <LocationSelectScreen onLocationSelected={handleLocationSelected} />;
  }

  // Location selected, syncing data
  if (phase === 'syncing') {
    const selectedLoc = locations.find(l => l.id === locationId);
    return (
      <SyncProgressScreen
        locationName={selectedLoc?.name || 'your store'}
        onSyncComplete={handleSyncComplete}
      />
    );
  }

  // Ready — show the POS
  return (
    <NavigationContainer>
      <MainTabs />
    </NavigationContainer>
  );
}
