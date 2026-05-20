import React, { useState, useCallback, useMemo } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '@/hooks/use-auth';
import { rootNavigationRef } from './navigation-ref';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import LocationSelectScreen from './screens/LocationSelectScreen';
import SyncProgressScreen from './screens/SyncProgressScreen';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, fontSize, radius, spacing } from '@/theme';

type AppPhase = 'location-select' | 'syncing' | 'ready';

export default function RootNavigator() {
  const {
    isAuthenticated,
    needsLocationSelect,
    isLoading,
    setLocationId,
    locations,
    locationId,
    deviceBinding,
    bindingInvalidReason,
    isDeviceBindingInvalid,
  } = useAuth();
  // Dynamic navigation theme — follows app theme
  const navigationTheme = useMemo(() => ({
    dark: false,
    colors: {
      primary: colors.accent.primary,
      background: colors.bg.primary,
      card: colors.bg.surface,
      text: colors.text.primary,
      border: colors.border.default,
      notification: colors.accent.primary,
    },
    fonts: { regular: { fontFamily: 'System', fontWeight: '400' as const }, medium: { fontFamily: 'System', fontWeight: '500' as const }, bold: { fontFamily: 'System', fontWeight: '700' as const }, heavy: { fontFamily: 'System', fontWeight: '900' as const } },
  }), []);

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

  if (isDeviceBindingInvalid && deviceBinding) {
    return (
      <DeviceLockedScreen
        storeName={deviceBinding.locationName}
        storeCode={deviceBinding.locationCode}
        reason={bindingInvalidReason}
      />
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
    <NavigationContainer ref={rootNavigationRef} theme={navigationTheme}>
      <MainTabs />
    </NavigationContainer>
  );
}

function DeviceLockedScreen({
  storeName,
  storeCode,
  reason,
}: {
  storeName: string;
  storeCode: string;
  reason: 'missing' | 'inactive' | null;
}) {
  const reasonText = reason === 'inactive'
    ? 'This store is inactive in ERP.'
    : 'This store could not be found in ERP.';

  return (
    <View style={lockedStyles.container}>
      <View
        style={lockedStyles.card}
        testID="device-locked-screen"
        accessibilityLabel="Device locked to store"
      >
        <View style={lockedStyles.badge}>
          <Text style={lockedStyles.badgeText}>A</Text>
        </View>
        <Text style={lockedStyles.title}>Device Locked To Store</Text>
        <Text style={lockedStyles.store}>{storeName || 'Unknown store'}</Text>
        <Text style={lockedStyles.code}>{storeCode || 'No store code'}</Text>
        <Text style={lockedStyles.body}>
          {reasonText} This register cannot switch stores or continue POS work until an ERP admin fixes the device registration.
        </Text>
      </View>
    </View>
  );
}

const lockedStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.bg.primary,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.status.danger,
    backgroundColor: colors.bg.surface,
    padding: spacing.xl,
    alignItems: 'center',
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.status.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  badgeText: {
    color: colors.status.dangerText,
    fontFamily: fonts.display.extraBold,
    fontSize: fontSize['5xl'],
  },
  title: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize['3xl'],
    textAlign: 'center',
  },
  store: {
    color: colors.accent.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xl,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  code: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  body: {
    color: colors.text.secondary,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.base,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
