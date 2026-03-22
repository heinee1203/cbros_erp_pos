import React, { useState, useCallback, useMemo } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/theme/ThemeContext';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import LocationSelectScreen from './screens/LocationSelectScreen';
import SyncProgressScreen from './screens/SyncProgressScreen';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '@/theme';

type AppPhase = 'location-select' | 'syncing' | 'ready';

export default function RootNavigator() {
  const { isAuthenticated, needsLocationSelect, isLoading, setLocationId, locations, locationId } = useAuth();
  const { isDark } = useTheme();

  // Dynamic navigation theme — follows app theme
  const navigationTheme = useMemo(() => ({
    dark: isDark,
    colors: {
      primary: colors.accent.primary,
      background: colors.bg.primary,
      card: colors.bg.surface,
      text: colors.text.primary,
      border: colors.border.default,
      notification: colors.accent.primary,
    },
    fonts: { regular: { fontFamily: 'System', fontWeight: '400' as const }, medium: { fontFamily: 'System', fontWeight: '500' as const }, bold: { fontFamily: 'System', fontWeight: '700' as const }, heavy: { fontFamily: 'System', fontWeight: '900' as const } },
  }), [isDark]);

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
      <NavigationContainer theme={navigationTheme}>
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
    <NavigationContainer theme={navigationTheme}>
      <MainTabs />
    </NavigationContainer>
  );
}
