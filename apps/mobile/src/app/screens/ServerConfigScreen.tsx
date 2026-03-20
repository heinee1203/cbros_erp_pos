import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import type { AuthStackParamList } from '@/app/AuthStack';
import { colors, textStyles, spacing } from '@/theme';
import { Button, Input } from '@/components/ui';

type Nav = StackNavigationProp<AuthStackParamList, 'ServerConfig'>;

export default function ServerConfigScreen() {
  const navigation = useNavigation<Nav>();
  const existing = storage.getString(KEYS.API_BASE_URL);
  const [url, setUrl] = useState(existing || 'http://10.0.2.2:3000');
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);

  const styles = createStyles();

  // If already configured, skip directly to login
  React.useEffect(() => {
    if (existing) {
      navigation.replace('Login');
    }
  }, [existing, navigation]);

  const handleSave = async () => {
    const trimmed = url.trim().replace(/\/+$/, '');
    if (!trimmed) {
      setError('Server URL is required');
      return;
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      setError('URL must start with http:// or https://');
      return;
    }

    // Test connectivity
    setTesting(true);
    setError('');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${trimmed}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        setError(`Server responded with ${response.status}. Check the URL.`);
        setTesting(false);
        return;
      }
      // Success — save and navigate
      storage.set(KEYS.API_BASE_URL, trimmed);
      navigation.replace('Login');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Connection timed out (5s). Check the URL and network.');
      } else {
        setError(`Cannot reach server: ${err.message}`);
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.logo}>APEX</Text>
        <Text style={styles.title}>Device Setup</Text>
        <Text style={styles.subtitle}>
          Enter the API server URL for this device.
        </Text>

        <Text style={styles.label}>API Base URL</Text>
        <Input
          value={url}
          onChangeText={setUrl}
          placeholder="http://192.168.1.100:3000"
          keyboardType="url"
          style={styles.inputSpacing}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.buttonContainer}>
          <Button
            title={testing ? 'Testing connection...' : 'Save & Connect'}
            onPress={handleSave}
            variant="primary"
            disabled={testing}
            loading={testing}
            fullWidth
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing['3xl'],
  },
  logo: {
    ...textStyles.display,
    color: colors.accent.primary,
    letterSpacing: 4,
    marginBottom: spacing.xs,
  },
  title: {
    ...textStyles.heading,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...textStyles.body,
    color: colors.text.secondary,
    marginBottom: spacing['3xl'],
  },
  label: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  inputSpacing: {
    marginBottom: spacing.sm,
  },
  error: {
    ...textStyles.caption,
    color: colors.status.danger,
    marginBottom: spacing.sm,
  },
  buttonContainer: {
    marginTop: spacing.lg,
  },
});
