/**
 * Customers Screen — customer list with search, tier avatars, and AR balances.
 *
 * Matches the Base44 reference: full-width customer list, search bar,
 * colored avatar circles based on tier, AR balance displayed in red/green.
 *
 * Data comes from the API (/customers/search endpoint), not WatermelonDB,
 * since the full customer list with AR balances isn't synced to the local DB.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { apiFetch } from '@/services/api-client';
import { colors, fonts, fontSize } from '@/theme';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  tier: string | null;
  arBalance: number;
}

const TIER_COLORS: Record<string, string> = {
  WHOLESALE: '#22C55E',
  FLEET: '#8B5CF6',
  VIP: '#F97316',
  REGULAR: '#6B7280',
};

function getTierColor(tier: string | null): string {
  return TIER_COLORS[tier?.toUpperCase() ?? ''] ?? '#6B7280';
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

function fmtPeso(n: number): string {
  return `\u20B1${Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CustomersScreen() {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const searchQuery = query.length >= 2 ? query : '';
      const endpoint = searchQuery
        ? `/customers/search?q=${encodeURIComponent(searchQuery)}`
        : '/customers?limit=50';
      const data = await apiFetch<{ data: Customer[] }>(endpoint);
      setCustomers(data.data ?? []);
    } catch (err) {
      console.error('[CustomersScreen] Error:', err);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(), query.length > 0 ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchCustomers]);

  const renderItem = ({ item }: { item: Customer }) => {
    const tierColor = getTierColor(item.tier);
    const hasBalance = item.arBalance > 0;
    return (
      <Pressable style={styles.row}>
        {/* Avatar circle */}
        <View style={[styles.avatar, { backgroundColor: tierColor }]}>
          <Text style={styles.avatarText}>{getInitial(item.name)}</Text>
        </View>

        {/* Name + phone + tier */}
        <View style={styles.rowInfo}>
          <Text style={styles.customerName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.metaRow}>
            {item.phone && <Text style={styles.phone}>{item.phone}</Text>}
            {item.tier && (
              <View style={[styles.tierBadge, { borderColor: tierColor }]}>
                <Text style={[styles.tierText, { color: tierColor }]}>{item.tier}</Text>
              </View>
            )}
          </View>
        </View>

        {/* AR balance */}
        <View style={styles.balanceContainer}>
          {hasBalance ? (
            <Text style={styles.balanceRed}>{fmtPeso(item.arBalance)}</Text>
          ) : (
            <Text style={styles.balanceGreen}>No balance</Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Customers</Text>
        <Pressable style={styles.newCustomerBtn}>
          <Text style={styles.newCustomerBtnText}>+ New Customer</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>{'\u2315'}</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone..."
          placeholderTextColor={colors.text.muted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
      </View>

      {/* Customer list */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>{'\uD83D\uDC65'}</Text>
              <Text style={styles.emptyTitle}>
                {query.length >= 2 ? 'No customers found' : 'Search for customers'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {query.length >= 2
                  ? 'Try a different name or phone number'
                  : 'Type at least 2 characters to search'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  newCustomerBtn: {
    backgroundColor: '#1E40AF',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newCustomerBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.surface,
    borderRadius: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  searchIcon: {
    fontSize: 18,
    color: colors.text.muted,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
    fontFamily: fonts.body.regular,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 80,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    minHeight: 72,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phone: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  tierBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tierText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  balanceContainer: {
    alignItems: 'flex-end',
    minWidth: 100,
  },
  balanceRed: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  balanceGreen: {
    fontSize: 12,
    color: colors.text.muted,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 48,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.text.muted,
  },
});
