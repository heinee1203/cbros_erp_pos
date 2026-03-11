import React, { useEffect } from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import SyncStatusBar from '@/components/SyncStatusBar';
import { NavRail, NAV_RAIL_WIDTH } from '@/components/NavRail';
import { SplitView } from '@/components/SplitView';
import { useLayout } from '@/hooks/use-layout';
import { startNetworkMonitor } from '@/services/network-monitor';
import { colors, textStyles, layout } from '@/theme';
import CatalogScreen from './screens/CatalogScreen';
import CartScreen from './screens/CartScreen';
import TransactionListScreen from './screens/TransactionListScreen';
import TransactionDetailScreen from './screens/TransactionDetailScreen';
import SettingsScreen from './screens/SettingsScreen';
import PrinterSetupScreen from './screens/PrinterSetupScreen';

// ─── POS Stack ───
export type POSStackParamList = {
  Catalog: undefined;
  Cart: undefined;
};

const POSStack = createStackNavigator<POSStackParamList>();

/** Tablet: Catalog + Cart rendered side-by-side */
function POSSplitScreen() {
  return (
    <SplitView
      primary={<CatalogScreen />}
      secondary={<CartScreen />}
      primaryRatio={0.6}
    />
  );
}

function POSNavigator() {
  const { isTablet } = useLayout();

  if (isTablet) {
    // Single screen with split view — no stack navigation needed
    return (
      <POSStack.Navigator screenOptions={{ headerShown: false }}>
        <POSStack.Screen name="Catalog" component={POSSplitScreen} />
      </POSStack.Navigator>
    );
  }

  return (
    <POSStack.Navigator screenOptions={{ headerShown: false }}>
      <POSStack.Screen name="Catalog" component={CatalogScreen} />
      <POSStack.Screen name="Cart" component={CartScreen} />
    </POSStack.Navigator>
  );
}

// ─── Transactions Stack ───
export type TransactionsStackParamList = {
  TransactionList: undefined;
  TransactionDetail: { saleId: string };
};

const TxStack = createStackNavigator<TransactionsStackParamList>();

function TransactionsNavigator() {
  return (
    <TxStack.Navigator screenOptions={{ headerShown: false }}>
      <TxStack.Screen name="TransactionList" component={TransactionListScreen} />
      <TxStack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
    </TxStack.Navigator>
  );
}

// ─── Settings Stack ───
export type SettingsStackParamList = {
  SettingsHome: undefined;
  PrinterSetup: undefined;
};

const SettingsStack = createStackNavigator<SettingsStackParamList>();

function SettingsNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} />
      <SettingsStack.Screen name="PrinterSetup" component={PrinterSetupScreen} />
    </SettingsStack.Navigator>
  );
}

// ─── Main Tabs ───
const Tab = createBottomTabNavigator();

export default function MainTabs() {
  const { isTablet } = useLayout();

  useEffect(() => {
    const unsub = startNetworkMonitor();
    return unsub;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <SyncStatusBar />
      <Tab.Navigator
        tabBar={(props: any) => (isTablet ? <NavRail {...props} /> : undefined)}
        sceneContainerStyle={isTablet ? { marginLeft: NAV_RAIL_WIDTH } : undefined}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.tab.active,
          tabBarInactiveTintColor: colors.tab.inactive,
          tabBarStyle: isTablet
            ? { display: 'none' as const }
            : {
                backgroundColor: colors.tab.bg,
                borderTopColor: colors.tab.border,
                borderTopWidth: 1,
                height: layout.tabBarHeight,
                paddingBottom: layout.tabBarPaddingBottom,
              },
          tabBarLabelStyle: { ...textStyles.tabLabel },
        }}
      >
        <Tab.Screen
          name="POS"
          component={POSNavigator}
          options={{ tabBarLabel: 'POS' }}
        />
        <Tab.Screen
          name="Transactions"
          component={TransactionsNavigator}
          options={{ tabBarLabel: 'Transactions' }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsNavigator}
          options={{ tabBarLabel: 'Settings' }}
        />
      </Tab.Navigator>
    </View>
  );
}
