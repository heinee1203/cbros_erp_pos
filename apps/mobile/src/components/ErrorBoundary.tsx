import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { colors } from '@/theme';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (__DEV__) {
      console.error('[ErrorBoundary]', error.message, errorInfo.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const styles = createStyles();
      return (
        <View style={styles.container}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          <Pressable style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try Again</Text>
          </Pressable>
          {__DEV__ && this.state.error && (
            <ScrollView style={styles.devInfo}>
              <Text style={styles.devText}>{this.state.error.stack?.slice(0, 500)}</Text>
            </ScrollView>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}

function createStyles() {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
      backgroundColor: colors.bg.primary,
    },
    icon: {
      fontSize: 48,
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontFamily: 'Outfit-SemiBold',
      color: colors.text.primary,
      marginBottom: 8,
    },
    message: {
      fontSize: 14,
      fontFamily: 'DMSans-Regular',
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    button: {
      backgroundColor: colors.accent.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    buttonText: {
      fontSize: 14,
      fontFamily: 'Outfit-SemiBold',
      color: '#FFFFFF',
    },
    devInfo: {
      marginTop: 24,
      maxHeight: 150,
      backgroundColor: 'rgba(0,0,0,0.1)',
      borderRadius: 4,
      padding: 8,
      width: '100%',
    },
    devText: {
      fontSize: 10,
      fontFamily: 'monospace',
      color: colors.text.muted,
    },
  });
}
