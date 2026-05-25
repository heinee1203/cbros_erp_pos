import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import SyncStatusBar from '@/components/SyncStatusBar';
import { NetworkBanner } from '@/components/NetworkBanner';
import { RegisterRecoveryBanner } from '@/components/RegisterRecoveryBanner';
import { TopBar } from '@/components/TopBar';
import { SplitView } from '@/components/SplitView';
import { useCartStore } from '@/stores/cart-store';
import { useLayout } from '@/hooks/use-layout';
import { startNetworkMonitor } from '@/services/network-monitor';
import { colors, fonts, fontSize } from '@/theme';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Icon, type IconName } from '@/components/ui';
import CatalogScreen from './screens/CatalogScreen';
import CartScreen from './screens/CartScreen';
import PaymentScreen from './screens/PaymentScreen';
import TransactionListScreen from './screens/TransactionListScreen';
import TransactionDetailScreen from './screens/TransactionDetailScreen';
import ZReadingScreen from './screens/ZReadingScreen';
import ShiftHistoryScreen from './screens/ShiftHistoryScreen';
import SettingsScreen from './screens/SettingsScreen';
import PrinterSetupScreen from './screens/PrinterSetupScreen';
import RegisterToolsScreen from './screens/RegisterToolsScreen';
import InventoryScreen from './screens/InventoryScreen';
import CustomersScreen from './screens/CustomersScreen';
import MoreScreen from './screens/MoreScreen';
import ManagerAuditScreen from './screens/ManagerAuditScreen';
import {
  ParkedOrdersScreen,
  ReturnsScreen,
  BarcodePrintScreen,
  SyncManagementScreen,
  AboutScreen,
} from './screens/PlaceholderScreens';

const TAB_ICONS: Record<string, IconName> = {
  POS: 'pos',
  Inventory: 'inventory',
  Customers: 'customers',
  More: 'more',
};

export type PaymentIntent = 'CASH' | 'CHARGE' | 'SPLIT';

export type POSStackParamList = {
  Catalog: undefined;
  Cart: undefined;
  Payment: { initialMethod?: PaymentIntent } | undefined;
};

const POSStack = createStackNavigator<POSStackParamList>();

function POSSplitScreen() {
  const [showPayment, setShowPayment] = useState(false);
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent>('CASH');
  const cartLineCount = useCartStore(s => s.lines.length);
  const cartIsEmpty = cartLineCount === 0 && !showPayment;

  const handleProceedToPayment = useCallback((intent: PaymentIntent = 'CASH') => {
    setPaymentIntent(intent);
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
          <ErrorBoundary><PaymentScreen onBack={handleBackToCart} initialMethod={paymentIntent} /></ErrorBoundary>
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
      <POSStack.Screen name="Payment">
        {(props: any) => (
          <ErrorBoundary>
            <PaymentScreen initialMethod={props.route.params?.initialMethod} />
          </ErrorBoundary>
        )}
      </POSStack.Screen>
    </POSStack.Navigator>
  );
}

export type TransactionsStackParamList = {
  TransactionList: undefined;
  TransactionDetail: { saleId: string };
  ZReading: { shiftId: string; mode: 'view' | 'close' | 'snapshot' };
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

export type MoreStackParamList = {
  MoreMenu: undefined;
  Transactions: undefined;
  ShiftHistory: undefined;
  ShiftZReading: { shiftId: string; mode: 'view' | 'close' | 'snapshot' };
  Settings: undefined;
  PrinterSetup: undefined;
  RegisterTools: undefined;
  ParkedOrders: undefined;
  Returns: undefined;
  BarcodePrint: undefined;
  SyncManagement: undefined;
  ManagerAudit: undefined;
  About: undefined;
};

const MoreStack = createStackNavigator<MoreStackParamList>();

function MoreNavigator() {
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: false }}>
      <MoreStack.Screen name="MoreMenu" component={MoreScreen} />
      <MoreStack.Screen name="Transactions" component={TransactionsNavigator} />
      <MoreStack.Screen name="ShiftHistory">{() => <ErrorBoundary><ShiftHistoryScreen /></ErrorBoundary>}</MoreStack.Screen>
      <MoreStack.Screen name="ShiftZReading">{(props: any) => <ErrorBoundary><ZReadingScreen {...props} /></ErrorBoundary>}</MoreStack.Screen>
      <MoreStack.Screen name="Settings" component={SettingsNavigator} />
      <MoreStack.Screen name="PrinterSetup">{() => <ErrorBoundary><PrinterSetupScreen /></ErrorBoundary>}</MoreStack.Screen>
      <MoreStack.Screen name="RegisterTools">{() => <ErrorBoundary><RegisterToolsScreen /></ErrorBoundary>}</MoreStack.Screen>
      <MoreStack.Screen name="ParkedOrders" component={ParkedOrdersScreen} />
      <MoreStack.Screen name="Returns" component={ReturnsScreen} />
      <MoreStack.Screen name="BarcodePrint" component={BarcodePrintScreen} />
      <MoreStack.Screen name="SyncManagement" component={SyncManagementScreen} />
      <MoreStack.Screen name="ManagerAudit">{() => <ErrorBoundary><ManagerAuditScreen /></ErrorBoundary>}</MoreStack.Screen>
      <MoreStack.Screen name="About" component={AboutScreen} />
    </MoreStack.Navigator>
  );
}

const Tab = createBottomTabNavigator();
const BOTTOM_TAB_HEIGHT = 66;

export default function MainTabs() {
  useEffect(() => {
    const unsub = startNetworkMonitor();
    return unsub;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <TopBar />
      <SyncStatusBar />
      <NetworkBanner />
      <RegisterRecoveryBanner />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarAccessibilityLabel: `${route.name} tab`,
          tabBarTestID: `tab-${route.name.toLowerCase()}`,
          tabBarIcon: ({ color }) => (
            <Icon name={TAB_ICONS[route.name] ?? 'more'} size={22} color={color} strokeWidth={2.3} />
          ),
          tabBarActiveTintColor: colors.tab.active,
          tabBarInactiveTintColor: colors.tab.inactive,
          tabBarStyle: {
            backgroundColor: colors.tab.bg,
            borderTopColor: colors.tab.border,
            borderTopWidth: 1,
            height: BOTTOM_TAB_HEIGHT,
            paddingBottom: 9,
            paddingTop: 8,
            elevation: 8,
          },
          tabBarLabelStyle: {
            fontSize: fontSize.xs,
            fontFamily: fonts.body.semiBold,
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
