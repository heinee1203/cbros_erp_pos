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

  // If already configured, skip directly to login
  React.useEffect(() => {
    if (existing) {
      navigation.replace('Login');
    }
  }, [existing, navigation]);

  const handleSave = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('API URL is required');
      return;
    }
    storage.set(KEYS.API_BASE_URL, trimmed);
    navigation.replace('Login');
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
            title="Save & Continue"
            onPress={handleSave}
            variant="primary"
            fullWidth
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
