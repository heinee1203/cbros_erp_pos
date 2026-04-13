/**
 * MainTabs — 4-tab bottom navigation matching the Base44 reference design.
 *
 * Tabs: POS | Inventory | Customers | More
 *
 * The bottom tab bar is ALWAYS visible (tablet and phone), replacing the old
 * NavRail sidebar. A persistent TopBar sits above the tab navigator showing
 * C-BROS branding, branch selector, and sync status.
 *
 * POS tab renders a split-screen on tablet (60/40 catalog + cart) and a
 * stack navigator on phone. Other tabs render full-screen content.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import SyncStatusBar from '@/components/SyncStatusBar';
import { NetworkBanner } from '@/components/NetworkBanner';
import { TopBar } from '@/components/TopBar';
import { SplitView } from '@/components/SplitView';
import { useCartStore } from '@/stores/cart-store';
import { useLayout } from '@/hooks/use-layout';
import { startNetworkMonitor } from '@/services/network-monitor';
import { colors, textStyles, layout } from '@/theme';
import { useTheme } from '@/theme/ThemeContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import CatalogScreen from './screens/CatalogScreen';
import CartScreen from './screens/CartScreen';
import PaymentScreen from './screens/PaymentScreen';
import TransactionListScreen from './screens/TransactionListScreen';
import TransactionDetailScreen from './screens/TransactionDetailScreen';
import ZReadingScreen from './screens/ZReadingScreen';
import SettingsScreen from './screens/SettingsScreen';
import PrinterSetupScreen from './screens/PrinterSetupScreen';
import InventoryScreen from './screens/InventoryScreen';
import CustomersScreen from './screens/CustomersScreen';
import MoreScreen from './screens/MoreScreen';
import {
  ParkedOrdersScreen,
  ReturnsScreen,
  BarcodePrintScreen,
  ReportsScreen,
  PriceManagementScreen,
  SuppliersScreen,
  UserRolesScreen,
  SyncManagementScreen,
  AboutScreen,
} from './screens/PlaceholderScreens';

// ─── Tab Icons (unicode emoji — matches the existing NavRail pattern) ───
const TAB_ICONS: Record<string, string> = {
  POS: '\uD83D\uDED2',       // 🛒
  Inventory: '\uD83D\uDCCB', // 📋
  Customers: '\uD83D\uDC65', // 👥
  More: '\u2026',              // …
};

// ─── POS Stack (phone: stacked screens, tablet: split-screen) ───
export type POSStackParamList = {
  Catalog: undefined;
  Cart: undefined;
  Payment: undefined;
};

const POSStack = createStackNavigator<POSStackParamList>();

/** Tablet: Catalog + Cart/Payment rendered side-by-side */
function POSSplitScreen() {
  const [showPayment, setShowPayment] = useState(false);
  const cartLineCount = useCartStore(s => s.lines.length);
  const cartIsEmpty = cartLineCount === 0 && !showPayment;

  const handleProceedToPayment = useCallback(() => {
    setShowPayment(true);
  }, []);

  const handleBackToCart = useCallback(() => {
    setShowPayment(false);
  }, []);

  return (
    <SplitView
      primary={<ErrorBoundary><CatalogScreen /></ErrorBoundary>}
      secondary={
        showPayment ? (
          <ErrorBoundary><PaymentScreen onBack={handleBackToCart} /></ErrorBoundary>
        ) : (
          <ErrorBoundary><CartScreen onProceedToPayment={handleProceedToPayment} /></ErrorBoundary>
        )
      }
      primaryRatio={0.6}
      secondaryCollapsed={cartIsEmpty}
      collapsedBadgeCount={cartLineCount}
    />
  );
}

function POSNavigator() {
  const { isTablet } = useLayout();

  if (isTablet) {
    return (
      <POSStack.Navigator screenOptions={{ headerShown: false }}>
        <POSStack.Screen name="Catalog" component={POSSplitScreen} />
      </POSStack.Navigator>
    );
  }

  return (
    <POSStack.Navigator screenOptions={{ headerShown: false }}>
      <POSStack.Screen name="Catalog">{() => <ErrorBoundary><CatalogScreen /></ErrorBoundary>}</POSStack.Screen>
      <POSStack.Screen name="Cart">{() => <ErrorBoundary><CartScreen /></ErrorBoundary>}</POSStack.Screen>
      <POSStack.Screen name="Payment">{() => <ErrorBoundary><PaymentScreen /></ErrorBoundary>}</POSStack.Screen>
    </POSStack.Navigator>
  );
}

// ─── Transactions Stack (accessed from More → Recent Transactions) ───
export type TransactionsStackParamList = {
  TransactionList: undefined;
  TransactionDetail: { saleId: string };
  ZReading: { shiftId: string; mode: 'view' | 'close' };
};

const TxStack = createStackNavigator<TransactionsStackParamList>();

function TransactionsNavigator() {
  return (
    <TxStack.Navigator screenOptions={{ headerShown: false }}>
      <TxStack.Screen name="TransactionList">{() => <ErrorBoundary><TransactionListScreen /></ErrorBoundary>}</TxStack.Screen>
      <TxStack.Screen name="TransactionDetail">{(props: any) => <ErrorBoundary><TransactionDetailScreen {...props} /></ErrorBoundary>}</TxStack.Screen>
      <TxStack.Screen name="ZReading">{(props: any) => <ErrorBoundary><ZReadingScreen {...props} /></ErrorBoundary>}</TxStack.Screen>
    </TxStack.Navigator>
  );
}

// ─── Settings Stack (accessed from More → Settings) ───
export type SettingsStackParamList = {
  SettingsHome: undefined;
  PrinterSetup: undefined;
};

const SettingsStack = createStackNavigator<SettingsStackParamList>();

function SettingsNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="SettingsHome">{() => <ErrorBoundary><SettingsScreen /></ErrorBoundary>}</SettingsStack.Screen>
      <SettingsStack.Screen name="PrinterSetup">{() => <ErrorBoundary><PrinterSetupScreen /></ErrorBoundary>}</SettingsStack.Screen>
    </SettingsStack.Navigator>
  );
}

// ─── More Stack (grid menu + sub-screens) ───
export type MoreStackParamList = {
  MoreMenu: undefined;
  Transactions: undefined;
  Settings: undefined;
  PrinterSetup: undefined;
  ParkedOrders: undefined;
  Returns: undefined;
  BarcodePrint: undefined;
  Reports: undefined;
  PriceManagement: undefined;
  Suppliers: undefined;
  UserRoles: undefined;
  SyncManagement: undefined;
  About: undefined;
};

const MoreStack = createStackNavigator<MoreStackParamList>();

function MoreNavigator() {
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: false }}>
      <MoreStack.Screen name="MoreMenu" component={MoreScreen} />
      <MoreStack.Screen name="Transactions" component={TransactionsNavigator} />
      <MoreStack.Screen name="Settings" component={SettingsNavigator} />
      <MoreStack.Screen name="PrinterSetup">{() => <ErrorBoundary><PrinterSetupScreen /></ErrorBoundary>}</MoreStack.Screen>
      <MoreStack.Screen name="ParkedOrders" component={ParkedOrdersScreen} />
      <MoreStack.Screen name="Returns" component={ReturnsScreen} />
      <MoreStack.Screen name="BarcodePrint" component={BarcodePrintScreen} />
      <MoreStack.Screen name="Reports" component={ReportsScreen} />
      <MoreStack.Screen name="PriceManagement" component={PriceManagementScreen} />
      <MoreStack.Screen name="Suppliers" component={SuppliersScreen} />
      <MoreStack.Screen name="UserRoles" component={UserRolesScreen} />
      <MoreStack.Screen name="SyncManagement" component={SyncManagementScreen} />
      <MoreStack.Screen name="About" component={AboutScreen} />
    </MoreStack.Navigator>
  );
}

// ─── Main Tab Navigator ───
const Tab = createBottomTabNavigator();

const BOTTOM_TAB_HEIGHT = 60;

export default function MainTabs() {
  const { isDark } = useTheme();

  useEffect(() => {
    const unsub = startNetworkMonitor();
    return unsub;
  }, []);

  return (
    <View key={isDark ? 'dark' : 'light'} style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <TopBar />
      <SyncStatusBar />
      <NetworkBanner />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 22, color }}>{TAB_ICONS[route.name] ?? '?'}</Text>
          ),
          tabBarActiveTintColor: colors.tab.active,
          tabBarInactiveTintColor: colors.tab.inactive,
          tabBarStyle: {
            backgroundColor: colors.tab.bg,
            borderTopColor: colors.tab.border,
            borderTopWidth: 1,
            height: BOTTOM_TAB_HEIGHT,
            paddingBottom: 6,
            paddingTop: 4,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600' as const,
          },
        })}
      >
        <Tab.Screen name="POS" component={POSNavigator} />
        <Tab.Screen name="Inventory" component={InventoryScreen} />
        <Tab.Screen name="Customers" component={CustomersScreen} />
        <Tab.Screen name="More" component={MoreNavigator} />
      </Tab.Navigator>
    </View>
  );
}

