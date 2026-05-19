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
import { runFullSync, onSyncStatus, type SyncStatus } from '@/sync/sync-manager';
import { formatPosError, isStoreLockError } from '@/utils/pos-error-messages';
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
  const [progressText, setProgressText] = useState('Preparing...');
  const [syncedCount, setSyncedCount] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const styles = createStyles();
  const isStoreLockBlocked = isStoreLockError(errorMsg);

  const doSync = async () => {
    setPhase('syncing');
    setErrorMsg('');
    setProgressText('Preparing...');
    setSyncedCount(0);
    try {
      const result = await runFullSync();
      if (result.error) {
        setPhase('error');
        setErrorMsg(formatPosError(result.error, 'Sync failed'));
      } else {
        setPhase('success');
        setTimeout(onSyncComplete, 800);
      }
    } catch (err: any) {
      setPhase('error');
      setErrorMsg(formatPosError(err, 'Sync failed'));
    }
  };

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Listen for progress updates
    const unsub = onSyncStatus((status: SyncStatus) => {
      if (status.progress) {
        const { phase: syncPhase, synced } = status.progress;
        setSyncedCount(synced);
        if (syncPhase === 'catalog') {
          setProgressText(`Syncing products: ${synced.toLocaleString()}`);
        } else {
          setProgressText(`Syncing inventory: ${synced.toLocaleString()}`);
        }
      }
    });

    doSync();

    return unsub;
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
      <Animated.View style={[styles.content, { opacity: fadeAnim } as any]}>
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
            ? progressText
            : phase === 'success'
              ? `Synced ${syncedCount.toLocaleString()} items for ${locationName}.`
              : errorMsg || 'Could not sync data from server.'}
        </Text>

        {phase === 'syncing' && syncedCount > 0 && (
          <View style={styles.progressBar}>
            <View style={styles.progressBarTrack}>
              <Animated.View style={[styles.progressBarFill, { width: '100%' }]} />
            </View>
            <Text style={styles.progressCount}>{syncedCount.toLocaleString()} items synced</Text>
          </View>
        )}

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
            {!isStoreLockBlocked && (
              <Pressable
                style={styles.skipButton}
                onPress={handleSkip}
                android_ripple={{ color: colors.accent.glow }}
              >
                <Text style={styles.skipText}>Continue with Stale Data</Text>
              </Pressable>
            )}
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
  progressBar: {
    marginTop: spacing.lg,
    width: '100%',
    alignItems: 'center',
  },
  progressBarTrack: {
    width: '100%',
    height: 4,
    backgroundColor: colors.border.default,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accent.primary,
    borderRadius: 2,
  },
  progressCount: {
    ...textStyles.caption,
    color: colors.text.muted,
    marginTop: spacing.xs,
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
