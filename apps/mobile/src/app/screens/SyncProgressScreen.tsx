import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Animated,
  SafeAreaView,
} from 'react-native';
import { runFullSync } from '@/sync/sync-manager';
import { colors, textStyles, spacing, radius } from '@/theme';

interface Props {
  locationName: string;
  onSyncComplete: () => void;
}

type SyncPhase = 'syncing' | 'success' | 'error';

export default function SyncProgressScreen({ locationName, onSyncComplete }: Props) {
  const [phase, setPhase] = useState<SyncPhase>('syncing');
  const [errorMsg, setErrorMsg] = useState('');
  const [retrying, setRetrying] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const styles = createStyles();

  const doSync = async () => {
    setPhase('syncing');
    setErrorMsg('');
    try {
      const result = await runFullSync();
      if (result.error) {
        setPhase('error');
        setErrorMsg(result.error);
      } else {
        setPhase('success');
        // Brief pause to show success, then proceed
        setTimeout(onSyncComplete, 800);
      }
    } catch (err: any) {
      setPhase('error');
      setErrorMsg(err.message || 'Sync failed');
    }
  };

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    doSync();
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    await doSync();
    setRetrying(false);
  };

  const handleSkip = () => {
    onSyncComplete();
  };

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <View style={styles.iconContainer}>
          {phase === 'syncing' && (
            <ActivityIndicator size="large" color={colors.accent.primary} />
          )}
          {phase === 'success' && (
            <Text style={styles.successIcon}>{'\u2714'}</Text>
          )}
          {phase === 'error' && (
            <Text style={styles.errorIcon}>{'\u26A0'}</Text>
          )}
        </View>

        <Text style={styles.title}>
          {phase === 'syncing'
            ? 'Syncing Data...'
            : phase === 'success'
              ? 'All Set!'
              : 'Sync Failed'}
        </Text>

        <Text style={styles.subtitle}>
          {phase === 'syncing'
            ? `Downloading catalog & inventory for ${locationName}`
            : phase === 'success'
              ? 'Catalog and inventory are up to date.'
              : errorMsg || 'Could not sync data from server.'}
        </Text>

        {phase === 'error' && (
          <View style={styles.errorActions}>
            <Pressable
              style={styles.retryButton}
              onPress={handleRetry}
              disabled={retrying}
              android_ripple={{ color: colors.accent.glow }}
            >
              {retrying ? (
                <ActivityIndicator size="small" color={colors.text.inverse} />
              ) : (
                <Text style={styles.retryText}>Retry Sync</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.skipButton}
              onPress={handleSkip}
              android_ripple={{ color: colors.accent.glow }}
            >
              <Text style={styles.skipText}>Continue with Stale Data</Text>
            </Pressable>
          </View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
    maxWidth: 360,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  successIcon: {
    fontSize: 36,
    color: colors.status.success,
  },
  errorIcon: {
    fontSize: 36,
    color: colors.status.danger,
  },
  title: {
    ...textStyles.heading,
    color: colors.text.primary,
    fontSize: 22,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...textStyles.body,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorActions: {
    marginTop: spacing.xl,
    width: '100%',
    gap: spacing.md,
  },
  retryButton: {
    backgroundColor: colors.accent.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  retryText: {
    ...textStyles.bodyMedium,
    color: colors.text.inverse,
    fontWeight: '700',
  },
  skipButton: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  skipText: {
    ...textStyles.body,
    color: colors.text.muted,
  },
});
