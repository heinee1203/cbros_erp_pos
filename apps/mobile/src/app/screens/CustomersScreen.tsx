import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { apiFetch } from '@/services/api-client';
import { useCartStore } from '@/stores/cart-store';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '@/theme';
import { Button, Icon } from '@/components/ui';

type CustomerType = 'INDIVIDUAL' | 'SHOP' | 'FLEET' | 'WHOLESALE';
type FilterKey = 'all' | 'balance' | 'overdue' | CustomerType;

interface CustomerSummary {
  id: string;
  name: string;
  customerType?: CustomerType | string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tin?: string | null;
  creditLimit?: string | number | null;
  paymentTermsDays?: number | null;
  currentBalance?: string | number | null;
  totalPurchases?: string | number | null;
  txnCount?: number | null;
  totalChargeCount?: number | null;
  unbilledCount?: number | null;
  lastPaymentDate?: string | null;
  isOverdue?: boolean | null;
  tierName?: string | null;
  tierColor?: string | null;
  primaryPlateNo?: string | null;
  vehicleCount?: number | null;
  notes?: string | null;
  matchedRef?: string | null;
}

interface CustomerDetailResponse {
  customer: CustomerSummary;
  recentTransactions: CustomerTransaction[];
}

interface CustomerListResponse {
  data: CustomerSummary[];
  hasMore?: boolean;
  nextCursor?: string | null;
}

interface CustomerVehicle {
  id: string;
  make: string;
  model: string;
  year?: number | null;
  plateNo?: string | null;
  notes?: string | null;
}

interface CustomerTransaction {
  id: string;
  type: string;
  amount: string | number;
  balanceAfter?: string | number | null;
  referenceNumber?: string | null;
  paymentNumber?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  recordedAt?: string | null;
  paymentStatus?: string | null;
  allocatedAmount?: string | number | null;
}

interface CustomerFormState {
  name: string;
  phone: string;
  customerType: CustomerType;
  contactPerson: string;
  email: string;
  address: string;
  tin: string;
  creditLimit: string;
  paymentTermsDays: string;
  notes: string;
}

interface VehicleFormState {
  make: string;
  model: string;
  year: string;
  plateNo: string;
  notes: string;
}

const CUSTOMER_TYPES: CustomerType[] = ['INDIVIDUAL', 'SHOP', 'FLEET', 'WHOLESALE'];
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'balance', label: 'With Balance' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'INDIVIDUAL', label: 'Individual' },
  { key: 'SHOP', label: 'Shop' },
  { key: 'FLEET', label: 'Fleet' },
  { key: 'WHOLESALE', label: 'Wholesale' },
];

const emptyCustomerForm = (): CustomerFormState => ({
  name: '',
  phone: '',
  customerType: 'INDIVIDUAL',
  contactPerson: '',
  email: '',
  address: '',
  tin: '',
  creditLimit: '0.00',
  paymentTermsDays: '30',
  notes: '',
});

const emptyVehicleForm = (): VehicleFormState => ({
  make: '',
  model: '',
  year: '',
  plateNo: '',
  notes: '',
});

function toNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value ?? '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtPHP(value: string | number | null | undefined): string {
  return `\u20B1${toNumber(value).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDateTime(value?: string | null): string {
  if (!value) return 'No activity';
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatType(type?: string | null): string {
  if (!type) return 'Individual';
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatMethod(value?: string | null): string {
  if (!value) return '';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function typeTone(type?: string | null): string {
  if (type === 'WHOLESALE') return colors.status.success;
  if (type === 'FLEET') return colors.status.info;
  if (type === 'SHOP') return colors.status.warning;
  return colors.accent.primary;
}

function cleanMoneyInput(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot < 0) return cleaned;
  return `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
}

function buildQueryString(params: Record<string, string | undefined>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value.length > 0)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value!)}`)
    .join('&');
}

function createCustomerPayload(form: CustomerFormState) {
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    customerType: form.customerType,
    contactPerson: form.contactPerson.trim() || undefined,
    email: form.email.trim() || undefined,
    address: form.address.trim() || undefined,
    tin: form.tin.trim() || undefined,
    creditLimit: (cleanMoneyInput(form.creditLimit) || '0').replace(/^\./, '0.'),
    paymentTermsDays: Number.parseInt(form.paymentTermsDays, 10) || 30,
    notes: form.notes.trim() || undefined,
  };
}

function createVehiclePayload(form: VehicleFormState) {
  const year = Number.parseInt(form.year, 10);
  return {
    make: form.make.trim(),
    model: form.model.trim(),
    year: Number.isFinite(year) ? year : undefined,
    plateNo: form.plateNo.trim() || undefined,
    notes: form.notes.trim() || undefined,
  };
}

export default function CustomersScreen() {
  const navigation = useNavigation<any>();
  const attachCustomer = useCartStore(s => s.attachCustomer);
  const cartCustomerId = useCartStore(s => s.customerId);
  const cartLineCount = useCartStore(s => s.lines.length);
  const styles = createStyles();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<CustomerSummary | null>(null);
  const [vehicles, setVehicles] = useState<CustomerVehicle[]>([]);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [customerFormVisible, setCustomerFormVisible] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(emptyCustomerForm);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [vehicleFormVisible, setVehicleFormVisible] = useState(false);
  const [vehicleForm, setVehicleForm] = useState<VehicleFormState>(emptyVehicleForm);
  const [vehicleSaving, setVehicleSaving] = useState(false);

  const loadCustomers = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const params = buildQueryString({
        limit: '80',
        search: query.trim() || undefined,
        hasBalance: filter === 'balance' ? 'true' : undefined,
        type: CUSTOMER_TYPES.includes(filter as CustomerType) ? filter : undefined,
      });

      const result = await apiFetch<CustomerListResponse>(`/customers?${params}`);
      const rows = result.data ?? [];
      setCustomers(filter === 'overdue' ? rows.filter(customer => Boolean(customer.isOverdue)) : rows);
    } catch (err: any) {
      setCustomers([]);
      setError(err.message || 'Unable to load customers.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCustomers(query.trim() ? 'refresh' : 'initial');
    }, query.trim() ? 260 : 0);
    return () => clearTimeout(timer);
  }, [loadCustomers, query]);

  useFocusEffect(useCallback(() => {
    void loadCustomers('refresh');
  }, [loadCustomers]));

  const metrics = useMemo(() => {
    const balanceTotal = customers.reduce((sum, customer) => sum + toNumber(customer.currentBalance), 0);
    const overdueCount = customers.filter(customer => customer.isOverdue).length;
    const unbilledCount = customers.reduce((sum, customer) => sum + (customer.unbilledCount ?? 0), 0);
    return {
      shown: customers.length,
      balanceTotal,
      overdueCount,
      unbilledCount,
    };
  }, [customers]);

  const loadCustomerDetail = useCallback(async (customer: CustomerSummary) => {
    setSelectedCustomer(customer);
    setDetailCustomer(customer);
    setDetailLoading(true);
    setDetailError(null);
    setVehicles([]);
    setTransactions([]);

    try {
      const [detail, vehicleResult, txnResult] = await Promise.all([
        apiFetch<CustomerDetailResponse>(`/customers/${customer.id}`),
        apiFetch<{ data: CustomerVehicle[] }>(`/customers/${customer.id}/vehicles`),
        apiFetch<CustomerListResponse & { data: CustomerTransaction[] }>(`/customers/${customer.id}/transactions?limit=12`),
      ]);
      setDetailCustomer(detail.customer);
      setTransactions(detail.recentTransactions?.length ? detail.recentTransactions : (txnResult.data ?? []));
      setVehicles(vehicleResult.data ?? []);
    } catch (err: any) {
      setDetailError(err.message || 'Unable to load customer details.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedCustomer(null);
    setDetailCustomer(null);
    setVehicles([]);
    setTransactions([]);
    setDetailError(null);
  }, []);

  const handleAttach = useCallback((vehicle?: CustomerVehicle) => {
    const customer = detailCustomer ?? selectedCustomer;
    if (!customer) return;
    attachCustomer(customer.id, customer.name, vehicle?.id);
    closeDetail();
    navigation.navigate('POS');
    Alert.alert(
      'Customer Attached',
      vehicle?.plateNo
        ? `${customer.name} with ${vehicle.plateNo} is ready on the active sale.`
        : `${customer.name} is ready on the active sale.`,
    );
  }, [attachCustomer, closeDetail, detailCustomer, navigation, selectedCustomer]);

  const validateCustomerForm = useCallback(() => {
    if (!customerForm.name.trim()) {
      Alert.alert('Customer Name Required', 'Enter the customer name before saving.');
      return false;
    }
    if (!customerForm.phone.trim()) {
      Alert.alert('Phone Required', 'Enter a phone number before saving.');
      return false;
    }
    if (customerForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerForm.email.trim())) {
      Alert.alert('Invalid Email', 'Enter a valid email address or leave it blank.');
      return false;
    }
    const creditLimit = Number.parseFloat(cleanMoneyInput(customerForm.creditLimit) || '0');
    if (!Number.isFinite(creditLimit) || creditLimit < 0) {
      Alert.alert('Invalid Credit Limit', 'Credit limit must be zero or more.');
      return false;
    }
    const terms = Number.parseInt(customerForm.paymentTermsDays, 10);
    if (!Number.isFinite(terms) || terms < 1 || terms > 365) {
      Alert.alert('Invalid Terms', 'Payment terms must be between 1 and 365 days.');
      return false;
    }
    return true;
  }, [customerForm]);

  const saveCustomer = useCallback(async () => {
    if (!validateCustomerForm()) return;
    setCustomerSaving(true);
    try {
      const created = await apiFetch<CustomerSummary>('/customers', {
        method: 'POST',
        body: JSON.stringify(createCustomerPayload(customerForm)),
      });
      setCustomerFormVisible(false);
      setCustomerForm(emptyCustomerForm());
      await loadCustomers('refresh');
      void loadCustomerDetail(created);
      Alert.alert('Customer Saved', `${created.name} has been added.`);
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Unable to save this customer.');
    } finally {
      setCustomerSaving(false);
    }
  }, [customerForm, loadCustomerDetail, loadCustomers, validateCustomerForm]);

  const validateVehicleForm = useCallback(() => {
    if (!vehicleForm.make.trim()) {
      Alert.alert('Vehicle Make Required', 'Enter the vehicle make before saving.');
      return false;
    }
    if (!vehicleForm.model.trim()) {
      Alert.alert('Vehicle Model Required', 'Enter the vehicle model before saving.');
      return false;
    }
    if (vehicleForm.year.trim()) {
      const year = Number.parseInt(vehicleForm.year, 10);
      if (!Number.isFinite(year) || year < 1900 || year > 2100) {
        Alert.alert('Invalid Year', 'Vehicle year must be between 1900 and 2100.');
        return false;
      }
    }
    return true;
  }, [vehicleForm]);

  const saveVehicle = useCallback(async () => {
    const customer = detailCustomer ?? selectedCustomer;
    if (!customer || !validateVehicleForm()) return;
    setVehicleSaving(true);
    try {
      const created = await apiFetch<CustomerVehicle>(`/customers/${customer.id}/vehicles`, {
        method: 'POST',
        body: JSON.stringify(createVehiclePayload(vehicleForm)),
      });
      setVehicleFormVisible(false);
      setVehicleForm(emptyVehicleForm());
      setVehicles(prev => [created, ...prev]);
      Alert.alert('Vehicle Saved', `${created.make} ${created.model} has been added.`);
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Unable to save this vehicle.');
    } finally {
      setVehicleSaving(false);
    }
  }, [detailCustomer, selectedCustomer, validateVehicleForm, vehicleForm]);

  const renderCustomer = useCallback(({ item }: { item: CustomerSummary }) => (
    <CustomerRow
      customer={item}
      active={cartCustomerId === item.id}
      onPress={() => { void loadCustomerDetail(item); }}
    />
  ), [cartCustomerId, loadCustomerDetail]);

  return (
    <View style={styles.container}>
      <FlatList
        data={customers}
        keyExtractor={item => item.id}
        renderItem={renderCustomer}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { void loadCustomers('refresh'); }}
            tintColor={colors.accent.primary}
            colors={[colors.accent.primary]}
          />
        }
        ListHeaderComponent={
          <View style={styles.pageHeader}>
            <View style={styles.titleRow}>
              <View>
                <Text style={styles.title}>Customers</Text>
                <Text style={styles.subtitle}>Accounts, vehicles, AR balance, and sale attachment.</Text>
              </View>
              <Button
                title="New Customer"
                onPress={() => setCustomerFormVisible(true)}
                icon={<Icon name="customers" size={18} color={colors.text.inverse} />}
                style={styles.newButton}
              />
            </View>

            <View style={styles.metricsRow}>
              <MetricCard label="Shown" value={String(metrics.shown)} />
              <MetricCard label="A/R Balance" value={fmtPHP(metrics.balanceTotal)} tone={metrics.balanceTotal > 0 ? 'warning' : 'default'} />
              <MetricCard label="Overdue" value={String(metrics.overdueCount)} tone={metrics.overdueCount > 0 ? 'danger' : 'default'} />
              <MetricCard label="Unbilled" value={String(metrics.unbilledCount)} />
            </View>

            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Icon name="search" size={20} color={colors.text.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search customer, phone, email, invoice, payment, or SOA"
                  placeholderTextColor={colors.text.muted}
                  returnKeyType="search"
                  style={styles.searchInput}
                />
                {query.trim() ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <Icon name="close" size={18} color={colors.text.muted} />
                  </Pressable>
                ) : null}
              </View>
              <Button
                title="Refresh"
                variant="secondary"
                onPress={() => { void loadCustomers('refresh'); }}
                icon={<Icon name="sync" size={18} color={colors.text.primary} />}
                style={styles.refreshButton}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {FILTERS.map(item => (
                <FilterChip
                  key={item.key}
                  label={item.label}
                  active={filter === item.key}
                  onPress={() => setFilter(item.key)}
                />
              ))}
            </ScrollView>

            {error ? (
              <View style={styles.errorBox}>
                <Icon name="alert" size={18} color={colors.status.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {loading ? (
              <>
                <ActivityIndicator color={colors.accent.primary} />
                <Text style={styles.emptyTitle}>Loading customers...</Text>
              </>
            ) : (
              <>
                <View style={styles.emptyIcon}>
                  <Icon name="customers" size={28} color={colors.accent.primary} />
                </View>
                <Text style={styles.emptyTitle}>No customers found</Text>
                <Text style={styles.emptyText}>Adjust the search or create a new customer profile.</Text>
              </>
            )}
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.rowDivider} />}
      />

      <CustomerDetailModal
        visible={Boolean(selectedCustomer)}
        customer={detailCustomer ?? selectedCustomer}
        vehicles={vehicles}
        transactions={transactions}
        loading={detailLoading}
        error={detailError}
        cartLineCount={cartLineCount}
        onClose={closeDetail}
        onAttach={handleAttach}
        onAddVehicle={() => setVehicleFormVisible(true)}
        onRetry={() => {
          if (selectedCustomer) void loadCustomerDetail(selectedCustomer);
        }}
      />

      <CustomerFormModal
        visible={customerFormVisible}
        form={customerForm}
        saving={customerSaving}
        onChange={setCustomerForm}
        onClose={() => {
          setCustomerFormVisible(false);
          setCustomerForm(emptyCustomerForm());
        }}
        onSave={saveCustomer}
      />

      <VehicleFormModal
        visible={vehicleFormVisible}
        form={vehicleForm}
        saving={vehicleSaving}
        onChange={setVehicleForm}
        onClose={() => {
          setVehicleFormVisible(false);
          setVehicleForm(emptyVehicleForm());
        }}
        onSave={saveVehicle}
      />
    </View>
  );
}

function MetricCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const styles = createStyles();
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        style={[
          styles.metricValue,
          tone === 'warning' && styles.metricWarning,
          tone === 'danger' && styles.metricDanger,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const styles = createStyles();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
      android_ripple={{ color: colors.accent.glow }}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </Pressable>
  );
}

function CustomerRow({
  customer,
  active,
  onPress,
}: {
  customer: CustomerSummary;
  active: boolean;
  onPress: () => void;
}) {
  const styles = createStyles();
  const balance = toNumber(customer.currentBalance);
  const limit = toNumber(customer.creditLimit);
  const available = limit > 0 ? Math.max(0, limit - balance) : null;
  const tone = typeTone(customer.customerType);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.customerRow,
        active && styles.customerRowActive,
        pressed && styles.customerRowPressed,
      ]}
      onPress={onPress}
      android_ripple={{ color: colors.accent.glow }}
    >
      <View style={[styles.avatar, { borderColor: tone }]}>
        <Text style={[styles.avatarText, { color: tone }]}>{initials(customer.name)}</Text>
      </View>

      <View style={styles.customerMain}>
        <View style={styles.customerTitleLine}>
          <Text style={styles.customerName} numberOfLines={1}>{customer.name}</Text>
          {active ? <Text style={styles.activeBadge}>On Sale</Text> : null}
          {customer.isOverdue ? <Text style={styles.overdueBadge}>Overdue</Text> : null}
        </View>
        <Text style={styles.customerMeta} numberOfLines={1}>
          {formatType(customer.customerType)}
          {customer.phone ? ` / ${customer.phone}` : ''}
          {customer.primaryPlateNo ? ` / ${customer.primaryPlateNo}` : ''}
        </Text>
        <Text style={styles.customerSubMeta} numberOfLines={1}>
          Terms {customer.paymentTermsDays ?? 30}d
          {available !== null ? ` / Available ${fmtPHP(available)}` : ' / No credit limit'}
          {customer.unbilledCount ? ` / ${customer.unbilledCount} unbilled` : ''}
        </Text>
      </View>

      <View style={styles.balanceBlock}>
        <Text style={[styles.balanceValue, balance > 0 && styles.balanceDue]} numberOfLines={1}>
          {fmtPHP(balance)}
        </Text>
        <Text style={styles.balanceLabel}>{balance > 0 ? 'Balance' : 'Clear'}</Text>
      </View>
    </Pressable>
  );
}

function CustomerDetailModal({
  visible,
  customer,
  vehicles,
  transactions,
  loading,
  error,
  cartLineCount,
  onClose,
  onAttach,
  onAddVehicle,
  onRetry,
}: {
  visible: boolean;
  customer: CustomerSummary | null;
  vehicles: CustomerVehicle[];
  transactions: CustomerTransaction[];
  loading: boolean;
  error: string | null;
  cartLineCount: number;
  onClose: () => void;
  onAttach: (vehicle?: CustomerVehicle) => void;
  onAddVehicle: () => void;
  onRetry: () => void;
}) {
  const styles = createStyles();
  if (!customer) return null;

  const balance = toNumber(customer.currentBalance);
  const limit = toNumber(customer.creditLimit);
  const available = limit > 0 ? Math.max(0, limit - balance) : null;
  const tone = typeTone(customer.customerType);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.detailModal}>
          <View style={styles.modalHeader}>
            <View style={styles.detailHeaderLeft}>
              <View style={[styles.detailAvatar, { borderColor: tone }]}>
                <Text style={[styles.detailAvatarText, { color: tone }]}>{initials(customer.name)}</Text>
              </View>
              <View style={styles.modalTitleBlock}>
                <Text style={styles.modalTitle} numberOfLines={1}>{customer.name}</Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {formatType(customer.customerType)}
                  {customer.phone ? ` / ${customer.phone}` : ''}
                </Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
              <Icon name="close" size={24} color={colors.text.secondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent}>
            {error ? (
              <View style={styles.errorBox}>
                <Icon name="alert" size={18} color={colors.status.danger} />
                <Text style={styles.errorText}>{error}</Text>
                <Button title="Retry" variant="secondary" onPress={onRetry} style={styles.inlineRetry} />
              </View>
            ) : null}

            {loading ? (
              <View style={styles.detailLoading}>
                <ActivityIndicator color={colors.accent.primary} />
                <Text style={styles.detailLoadingText}>Loading account...</Text>
              </View>
            ) : null}

            <View style={styles.detailMetrics}>
              <DetailStat label="Balance" value={fmtPHP(balance)} tone={balance > 0 ? 'danger' : 'default'} />
              <DetailStat label="Credit Limit" value={limit > 0 ? fmtPHP(limit) : 'No limit'} />
              <DetailStat label="Available" value={available !== null ? fmtPHP(available) : 'Open'} tone={available === 0 && balance > 0 ? 'warning' : 'default'} />
              <DetailStat label="Terms" value={`${customer.paymentTermsDays ?? 30} days`} />
            </View>

            <View style={styles.infoGrid}>
              <InfoLine label="Contact" value={customer.contactPerson || customer.email || 'Not set'} />
              <InfoLine label="Email" value={customer.email || 'Not set'} />
              <InfoLine label="Address" value={customer.address || 'Not set'} />
              <InfoLine label="TIN" value={customer.tin || 'Not set'} />
              <InfoLine label="Last Payment" value={fmtDateTime(customer.lastPaymentDate)} />
              <InfoLine label="Total Purchases" value={fmtPHP(customer.totalPurchases)} />
            </View>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Attach To Active Sale</Text>
              <Text style={styles.sectionHint}>{cartLineCount} item{cartLineCount === 1 ? '' : 's'} in cart</Text>
            </View>
            <Pressable
              style={styles.attachRow}
              onPress={() => onAttach()}
              android_ripple={{ color: colors.accent.glow }}
            >
              <View>
                <Text style={styles.attachTitle}>Customer only</Text>
                <Text style={styles.attachMeta}>No vehicle linked to this sale</Text>
              </View>
              <Icon name="chevron-right" size={20} color={colors.text.secondary} />
            </Pressable>
            {vehicles.map(vehicle => (
              <Pressable
                key={vehicle.id}
                style={styles.attachRow}
                onPress={() => onAttach(vehicle)}
                android_ripple={{ color: colors.accent.glow }}
              >
                <View>
                  <Text style={styles.attachTitle} numberOfLines={1}>
                    {vehicle.year ? `${vehicle.year} ` : ''}{vehicle.make} {vehicle.model}
                  </Text>
                  <Text style={styles.attachMeta}>{vehicle.plateNo || 'No plate number'}</Text>
                </View>
                <Icon name="chevron-right" size={20} color={colors.text.secondary} />
              </Pressable>
            ))}
            <Button
              title="Add Vehicle"
              variant="secondary"
              onPress={onAddVehicle}
              icon={<Icon name="package" size={18} color={colors.text.primary} />}
              style={styles.addVehicleButton}
            />

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent A/R Activity</Text>
            </View>
            {transactions.length === 0 && !loading ? (
              <View style={styles.emptyInline}>
                <Text style={styles.emptyInlineText}>No customer ledger activity yet.</Text>
              </View>
            ) : (
              transactions.map(txn => <TransactionRow key={txn.id} transaction={txn} />)
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DetailStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const styles = createStyles();
  return (
    <View style={styles.detailStat}>
      <Text style={styles.detailStatLabel}>{label}</Text>
      <Text
        style={[
          styles.detailStatValue,
          tone === 'warning' && styles.metricWarning,
          tone === 'danger' && styles.metricDanger,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  const styles = createStyles();
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function TransactionRow({ transaction }: { transaction: CustomerTransaction }) {
  const styles = createStyles();
  const amount = toNumber(transaction.amount);
  const isPayment = transaction.type === 'PAYMENT';
  const ref = transaction.paymentNumber || transaction.referenceNumber || 'No reference';

  return (
    <View style={styles.transactionRow}>
      <View style={[styles.transactionStripe, isPayment ? styles.transactionStripePayment : styles.transactionStripeCharge]} />
      <View style={styles.transactionMain}>
        <Text style={styles.transactionTitle} numberOfLines={1}>
          {formatMethod(transaction.type)} / {ref}
        </Text>
        <Text style={styles.transactionMeta} numberOfLines={1}>
          {fmtDateTime(transaction.recordedAt)}
          {transaction.paymentMethod ? ` / ${formatMethod(transaction.paymentMethod)}` : ''}
          {transaction.paymentStatus ? ` / ${transaction.paymentStatus}` : ''}
        </Text>
        {transaction.notes ? <Text style={styles.transactionNotes} numberOfLines={1}>{transaction.notes}</Text> : null}
      </View>
      <View style={styles.transactionAmountBlock}>
        <Text style={[styles.transactionAmount, isPayment ? styles.paymentAmount : styles.chargeAmount]}>
          {isPayment ? '-' : '+'}{fmtPHP(amount)}
        </Text>
        <Text style={styles.transactionBalance}>Bal {fmtPHP(transaction.balanceAfter)}</Text>
      </View>
    </View>
  );
}

function CustomerFormModal({
  visible,
  form,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  visible: boolean;
  form: CustomerFormState;
  saving: boolean;
  onChange: (form: CustomerFormState) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const styles = createStyles();
  const update = (patch: Partial<CustomerFormState>) => onChange({ ...form, ...patch });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.formModal}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleBlock}>
              <Text style={styles.modalTitle}>New Customer</Text>
              <Text style={styles.modalSubtitle}>Create account details for POS and A/R workflows</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
              <Icon name="close" size={24} color={colors.text.secondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.formLabel}>Customer Type</Text>
            <View style={styles.typeGrid}>
              {CUSTOMER_TYPES.map(type => (
                <Pressable
                  key={type}
                  onPress={() => update({ customerType: type })}
                  style={[
                    styles.typeOption,
                    form.customerType === type && styles.typeOptionActive,
                  ]}
                >
                  <Text style={[styles.typeOptionText, form.customerType === type && styles.typeOptionTextActive]}>
                    {formatType(type)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <FormInput label="Name" value={form.name} onChangeText={name => update({ name })} placeholder="Customer or company name" autoFocus />
            <FormInput label="Phone" value={form.phone} onChangeText={phone => update({ phone })} placeholder="Phone number" keyboardType="phone-pad" />
            <View style={styles.twoColumn}>
              <FormInput label="Contact" value={form.contactPerson} onChangeText={contactPerson => update({ contactPerson })} placeholder="Contact person" />
              <FormInput label="Email" value={form.email} onChangeText={email => update({ email })} placeholder="Email address" keyboardType="email-address" />
            </View>
            <FormInput label="Address" value={form.address} onChangeText={address => update({ address })} placeholder="Billing address" multiline />
            <View style={styles.twoColumn}>
              <FormInput label="TIN" value={form.tin} onChangeText={tin => update({ tin })} placeholder="TIN" />
              <FormInput label="Terms" value={form.paymentTermsDays} onChangeText={paymentTermsDays => update({ paymentTermsDays: paymentTermsDays.replace(/[^\d]/g, '') })} placeholder="30" keyboardType="number-pad" />
            </View>
            <FormInput label="Credit Limit" value={form.creditLimit} onChangeText={creditLimit => update({ creditLimit: cleanMoneyInput(creditLimit) })} placeholder="0.00" keyboardType="decimal-pad" />
            <FormInput label="Notes" value={form.notes} onChangeText={notes => update({ notes })} placeholder="Internal notes" multiline />
          </ScrollView>

          <View style={styles.formFooter}>
            <Button title="Cancel" variant="secondary" onPress={onClose} disabled={saving} style={styles.footerButton} />
            <Button title={saving ? 'Saving...' : 'Save Customer'} onPress={onSave} loading={saving} style={styles.footerButton} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function VehicleFormModal({
  visible,
  form,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  visible: boolean;
  form: VehicleFormState;
  saving: boolean;
  onChange: (form: VehicleFormState) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const styles = createStyles();
  const update = (patch: Partial<VehicleFormState>) => onChange({ ...form, ...patch });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.smallFormModal}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleBlock}>
              <Text style={styles.modalTitle}>Add Vehicle</Text>
              <Text style={styles.modalSubtitle}>Link a vehicle to this customer</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
              <Icon name="close" size={24} color={colors.text.secondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            <View style={styles.twoColumn}>
              <FormInput label="Make" value={form.make} onChangeText={make => update({ make })} placeholder="Toyota" autoFocus />
              <FormInput label="Model" value={form.model} onChangeText={model => update({ model })} placeholder="Vios" />
            </View>
            <View style={styles.twoColumn}>
              <FormInput label="Year" value={form.year} onChangeText={year => update({ year: year.replace(/[^\d]/g, '') })} placeholder="2020" keyboardType="number-pad" />
              <FormInput label="Plate" value={form.plateNo} onChangeText={plateNo => update({ plateNo: plateNo.toUpperCase() })} placeholder="ABC 1234" autoCapitalize="characters" />
            </View>
            <FormInput label="Notes" value={form.notes} onChangeText={notes => update({ notes })} placeholder="Vehicle notes" multiline />
          </ScrollView>

          <View style={styles.formFooter}>
            <Button title="Cancel" variant="secondary" onPress={onClose} disabled={saving} style={styles.footerButton} />
            <Button title={saving ? 'Saving...' : 'Save Vehicle'} onPress={onSave} loading={saving} style={styles.footerButton} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  autoFocus,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'decimal-pad' | 'number-pad';
  multiline?: boolean;
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  const styles = createStyles();
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.muted}
        keyboardType={keyboardType}
        multiline={multiline}
        autoFocus={autoFocus}
        autoCapitalize={autoCapitalize}
        selectionColor={colors.accent.primary}
        cursorColor={colors.accent.primary}
        style={[styles.formInput, multiline && styles.formInputMultiline]}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 92,
  },
  pageHeader: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize['6xl'],
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.lg,
    marginTop: 4,
  },
  newButton: {
    minWidth: 188,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricCard: {
    flex: 1,
    minHeight: 76,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  metricLabel: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
  metricValue: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
    marginTop: 4,
  },
  metricWarning: {
    color: colors.status.warning,
  },
  metricDanger: {
    color: colors.status.danger,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchBox: {
    flex: 1,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.lg,
    paddingVertical: spacing.sm,
  },
  refreshButton: {
    minWidth: 148,
  },
  filterRow: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  filterChip: {
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.bg.surface,
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: colors.accent.muted,
    borderColor: colors.accent.primary,
  },
  filterText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.base,
  },
  filterTextActive: {
    color: colors.accent.primary,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.status.danger,
    backgroundColor: colors.status.dangerBg,
    padding: spacing.md,
  },
  errorText: {
    flex: 1,
    color: colors.status.dangerText,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.base,
  },
  inlineRetry: {
    minWidth: 104,
  },
  customerRow: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bg.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  customerRowPressed: {
    backgroundColor: colors.bg.elevated,
  },
  customerRowActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.muted,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: colors.bg.elevated,
  },
  avatarText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
  },
  customerMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  customerTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  customerName: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize['3xl'],
  },
  activeBadge: {
    color: colors.accent.primary,
    backgroundColor: colors.accent.muted,
    borderRadius: radius.sm,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.xs,
  },
  overdueBadge: {
    color: colors.status.dangerText,
    backgroundColor: colors.status.dangerBg,
    borderRadius: radius.sm,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.xs,
  },
  customerMeta: {
    color: colors.text.secondary,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.base,
  },
  customerSubMeta: {
    color: colors.text.muted,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.sm,
  },
  balanceBlock: {
    width: 152,
    alignItems: 'flex-end',
  },
  balanceValue: {
    color: colors.status.success,
    fontFamily: fonts.display.bold,
    fontSize: fontSize['3xl'],
  },
  balanceDue: {
    color: colors.status.danger,
  },
  balanceLabel: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    marginTop: 4,
  },
  rowDivider: {
    height: spacing.sm,
  },
  emptyState: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.accent.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize['2xl'],
  },
  emptyText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.base,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(23,32,51,0.48)',
  },
  detailModal: {
    width: '72%',
    maxWidth: 1220,
    minWidth: 760,
    maxHeight: '86%',
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.medium,
    overflow: 'hidden',
    elevation: 18,
  },
  formModal: {
    width: '64%',
    maxWidth: 980,
    minWidth: 720,
    maxHeight: '86%',
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.medium,
    overflow: 'hidden',
    elevation: 18,
  },
  smallFormModal: {
    width: '52%',
    maxWidth: 720,
    minWidth: 560,
    maxHeight: '78%',
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.medium,
    overflow: 'hidden',
    elevation: 18,
  },
  modalHeader: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  detailHeaderLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  detailAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: colors.bg.elevated,
  },
  detailAvatarText: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize.xl,
  },
  modalTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  modalTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize['5xl'],
  },
  modalSubtitle: {
    color: colors.text.secondary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.base,
    marginTop: 3,
  },
  closeButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.bg.elevated,
  },
  detailScroll: {
    maxHeight: '100%',
  },
  detailContent: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  detailLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bg.elevated,
  },
  detailLoadingText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.base,
  },
  detailMetrics: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  detailStat: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    backgroundColor: colors.bg.primary,
    padding: spacing.md,
  },
  detailStatLabel: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
  detailStatValue: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
    marginTop: 5,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  infoLine: {
    width: '32%',
    minHeight: 68,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.primary,
    padding: spacing.md,
  },
  infoLabel: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
  infoValue: {
    color: colors.text.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.base,
    marginTop: 5,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize['2xl'],
  },
  sectionHint: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
  attachRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  attachTitle: {
    color: colors.text.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.lg,
  },
  attachMeta: {
    color: colors.text.secondary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.sm,
    marginTop: 3,
  },
  addVehicleButton: {
    alignSelf: 'flex-start',
    minWidth: 170,
  },
  emptyInline: {
    minHeight: 82,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyInlineText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.base,
  },
  transactionRow: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    backgroundColor: colors.bg.primary,
    padding: spacing.md,
  },
  transactionStripe: {
    width: 5,
    height: 54,
    borderRadius: 3,
  },
  transactionStripePayment: {
    backgroundColor: colors.status.success,
  },
  transactionStripeCharge: {
    backgroundColor: colors.status.warning,
  },
  transactionMain: {
    flex: 1,
    minWidth: 0,
  },
  transactionTitle: {
    color: colors.text.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.lg,
  },
  transactionMeta: {
    color: colors.text.secondary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.sm,
    marginTop: 4,
  },
  transactionNotes: {
    color: colors.text.muted,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.sm,
    marginTop: 4,
  },
  transactionAmountBlock: {
    width: 152,
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
  },
  paymentAmount: {
    color: colors.status.success,
  },
  chargeAmount: {
    color: colors.status.warning,
  },
  transactionBalance: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    marginTop: 4,
  },
  formContent: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  formLabel: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
    marginBottom: 6,
  },
  typeGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  typeOption: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.bg.primary,
  },
  typeOptionActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.muted,
  },
  typeOptionText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  typeOptionTextActive: {
    color: colors.accent.primary,
  },
  twoColumn: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  inputGroup: {
    flex: 1,
  },
  formInput: {
    minHeight: touchTarget.min,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text.primary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.base,
  },
  formInputMultiline: {
    minHeight: 86,
    textAlignVertical: 'top',
  },
  formFooter: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
  },
  footerButton: {
    flex: 1,
  },
});
