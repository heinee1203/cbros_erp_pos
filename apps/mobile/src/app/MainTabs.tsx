import React, { useEffect, useState, useCallback } from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import SyncStatusBar from '@/components/SyncStatusBar';
import { NetworkBanner } from '@/components/NetworkBanner';
import { NavRail, NAV_RAIL_WIDTH } from '@/components/NavRail';
import { SplitView } from '@/components/SplitView';
import { useCartStore } from '@/stores/cart-store';
import { useLayout } from '@/hooks/use-layout';
import { startNetworkMonitor } from '@/services/network-monitor';
import { colors, textStyles, layout } from '@/theme';
import CatalogScreen from './screens/CatalogScreen';
import CartScreen from './screens/CartScreen';
import PaymentScreen from './screens/PaymentScreen';
import TransactionListScreen from './screens/TransactionListScreen';
import TransactionDetailScreen from './screens/TransactionDetailScreen';
import ZReadingScreen from './screens/ZReadingScreen';
import SettingsScreen from './screens/SettingsScreen';
import PrinterSetupScreen from './screens/PrinterSetupScreen';

// ─── Tablet offset wrapper ───
// NavRail is absolutely positioned at left:0 inside the tabBar slot.
// Scenes render full-width, so we offset them on tablet.
function TabletOffset({ children }: { children: React.ReactNode }) {
  const { isTablet } = useLayout();
  if (!isTablet) return <>{children}</>;
  return (
    <View style={{ flex: 1, marginLeft: NAV_RAIL_WIDTH }}>
      {children}
    </View>
  );
}

// ─── POS Stack ───
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
      primary={<CatalogScreen />}
      secondary={
        showPayment ? (
          <PaymentScreen onBack={handleBackToCart} />
        ) : (
          <CartScreen onProceedToPayment={handleProceedToPayment} />
        )
      }
      primaryRatio={0.6}
      secondaryCollapsed={cartIsEmpty}
    />
  );
}

function POSNavigator() {
  const { isTablet } = useLayout();

  if (isTablet) {
    return (
      <TabletOffset>
        <POSStack.Navigator screenOptions={{ headerShown: false }}>
          <POSStack.Screen name="Catalog" component={POSSplitScreen} />
        </POSStack.Navigator>
      </TabletOffset>
    );
  }

  return (
    <POSStack.Navigator screenOptions={{ headerShown: false }}>
      <POSStack.Screen name="Catalog" component={CatalogScreen} />
      <POSStack.Screen name="Cart" component={CartScreen} />
      <POSStack.Screen name="Payment" component={PaymentScreen} />
    </POSStack.Navigator>
  );
}

// ─── Transactions Stack ───
export type TransactionsStackParamList = {
  TransactionList: undefined;
  TransactionDetail: { saleId: string };
  ZReading: { shiftId: string; mode: 'view' | 'close' };
};

const TxStack = createStackNavigator<TransactionsStackParamList>();

function TransactionsNavigator() {
  return (
    <TabletOffset>
      <TxStack.Navigator screenOptions={{ headerShown: false }}>
        <TxStack.Screen name="TransactionList" component={TransactionListScreen} />
        <TxStack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
        <TxStack.Screen name="ZReading" component={ZReadingScreen} />
      </TxStack.Navigator>
    </TabletOffset>
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
    <TabletOffset>
      <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
        <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} />
        <SettingsStack.Screen name="PrinterSetup" component={PrinterSetupScreen} />
      </SettingsStack.Navigator>
    </TabletOffset>
  );
}

// ─── Main Tabs ───
const Tab = createBottomTabNavigator();

/**
 * Custom tab bar that renders NavRail on the left via absolute positioning.
 * Returns null for the actual tab bar slot (bottom) since NavRail handles nav.
 * NavRail is absolutely positioned but the scene content is offset by
 * wrapping each screen's content with left padding in their own layouts.
 */
function TabletTabBar(props: any) {
  return <NavRail {...props} />;
}

export default function MainTabs() {
  const { isTablet } = useLayout();

  useEffect(() => {
    const unsub = startNetworkMonitor();
    return unsub;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <SyncStatusBar />
      <NetworkBanner />
      <Tab.Navigator
        tabBar={isTablet ? TabletTabBar : undefined}
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
