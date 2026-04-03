import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '@/hooks/use-auth';
import { getDeviceBinding } from '@/config/device-binding';
import { colors, textStyles, spacing } from '@/theme';
import { Button, Input } from '@/components/ui';

export default function LoginScreen() {
  const { login, locations, setLocationId, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const styles = createStyles();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(email.trim(), password);
      // If multiple locations, useAuth auto-selects first retail location
      // Auth context will switch to MainTabs automatically
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.logo}>CBROS</Text>
        {(() => {
          const binding = getDeviceBinding();
          return binding ? (
            <Text style={[styles.subtitle, { marginBottom: 4 }]}>
              {'\uD83D\uDCCD'} {binding.locationName} ({binding.locationCode})
            </Text>
          ) : null;
        })()}
        <Text style={styles.title}>Sign In</Text>
        <Text style={styles.subtitle}>Enter your credentials to continue</Text>

        <Text style={styles.label}>Email</Text>
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder="your.email@company.com"
          keyboardType="email-address"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          style={styles.inputSpacing}
        />

        <Text style={styles.label}>Password</Text>
        <Input
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          placeholder="Enter password"
          secureTextEntry
          returnKeyType="go"
          onSubmitEditing={handleLogin}
          style={styles.inputSpacing}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.accent.primary} size="large" />
          </View>
        ) : (
          <View style={styles.buttonContainer}>
            <Button
              title="Sign In"
              onPress={handleLogin}
              variant="primary"
              disabled={loading}
              fullWidth
            />
          </View>
        )}
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
    marginBottom: spacing.xs,
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
    marginBottom: spacing.lg,
  },
  error: {
    ...textStyles.caption,
    color: colors.status.danger,
    marginBottom: spacing.sm,
  },
  loadingContainer: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonContainer: {
    marginTop: spacing.sm,
  },
});
