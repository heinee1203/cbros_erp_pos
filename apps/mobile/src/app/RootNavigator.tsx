import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '@/hooks/use-auth';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '@/theme';

export default function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg.primary }}>
        <ActivityIndicator size="large" color={colors.text.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
