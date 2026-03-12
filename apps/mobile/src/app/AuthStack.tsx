import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import ServerConfigScreen from './screens/ServerConfigScreen';
import LoginScreen from './screens/LoginScreen';

export type AuthStackParamList = {
  ServerConfig: undefined;
  Login: undefined;
};

const Stack = createStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ServerConfig" component={ServerConfigScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}
