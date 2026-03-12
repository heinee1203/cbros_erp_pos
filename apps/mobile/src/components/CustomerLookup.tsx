import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
  TextInput,
} from 'react-native';
import { BottomSheet, Input, Button, Divider } from '@/components/ui';
import { colors, textStyles, spacing, radius, layout } from '@/theme';
import { useCustomerSearch, type Customer, type Vehicle } from '@/hooks/use-customer-search';
import { apiFetch } from '@/services/api-client';

interface CustomerLookupProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (customer: Customer, vehicle?: Vehicle) => void;
}

export function CustomerLookup({ visible, onClose, onSelect }: CustomerLookupProps) {
  const { query, results, loading, search, fetchVehicles, clear } = useCustomerSearch();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [vehicleList, setVehicleList] = useState<Vehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);

  const handleClose = useCallback(() => {
    clear();
    setShowNewForm(false);
    setNewName('');
    setNewPhone('');
    setSelectedCustomer(null);
    setVehicleList([]);
    onClose();
  }, [clear, onClose]);

  const handleSelectCustomer = useCallback(async (customer: Customer) => {
    setSelectedCustomer(customer);
    setLoadingVehicles(true);
    const vehicles = await fetchVehicles(customer.id);
    setLoadingVehicles(false);
    setVehicleList(vehicles);

    if (vehicles.length === 0) {
      // No vehicles — select customer directly
      onSelect(customer);
      handleClose();
    }
    // If vehicles exist, show vehicle picker (render below)
  }, [fetchVehicles, onSelect, handleClose]);

  const handleSelectVehicle = useCallback((vehicle: Vehicle) => {
    if (selectedCustomer) {
      onSelect(selectedCustomer, vehicle);
      handleClose();
    }
  }, [selectedCustomer, onSelect, handleClose]);

  const handleSelectNoVehicle = useCallback(() => {
    if (selectedCustomer) {
      onSelect(selectedCustomer);
      handleClose();
    }
  }, [selectedCustomer, onSelect, handleClose]);

  const handleCreateCustomer = useCallback(async () => {
    if (!newName.trim()) {
      Alert.alert('Name required', 'Please enter a customer name.');
      return;
    }
    if (!newPhone.trim()) {
      Alert.alert('Phone required', 'Please enter a phone number.');
      return;
    }
    setCreating(true);
    try {
      const customer = await apiFetch<Customer>('/customers', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim() }),
      });
      onSelect(customer);
      handleClose();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create customer');
    }
    setCreating(false);
  }, [newName, newPhone, onSelect, handleClose]);

  // Vehicle picker view
  if (selectedCustomer && vehicleList.length > 0) {
    return (
      <BottomSheet visible={visible} onClose={handleClose} title="Select Vehicle">
        <View style={styles.vehicleList}>
          <Pressable
            style={styles.vehicleRow}
            onPress={handleSelectNoVehicle}
            android_ripple={{ color: colors.accent.glow }}
          >
            <Text style={styles.vehicleText}>No vehicle</Text>
          </Pressable>
          <Divider />
          {vehicleList.map(v => (
            <React.Fragment key={v.id}>
              <Pressable
                style={styles.vehicleRow}
                onPress={() => handleSelectVehicle(v)}
                android_ripple={{ color: colors.accent.glow }}
              >
                <Text style={styles.vehicleText}>
                  {v.year ? `${v.year} ` : ''}{v.make} {v.model}
                </Text>
                {v.plateNo && (
                  <Text style={styles.plateText}>{v.plateNo}</Text>
                )}
              </Pressable>
              <Divider />
            </React.Fragment>
          ))}
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="Customer">
      {showNewForm ? (
        <View style={styles.newForm}>
          <Input
            value={newName}
            onChangeText={setNewName}
            placeholder="Customer name"
            autoFocus
          />
          <View style={{ height: spacing.sm }} />
          <Input
            value={newPhone}
            onChangeText={setNewPhone}
            placeholder="Phone number"
            keyboardType="phone-pad"
          />
          <View style={{ height: spacing.lg }} />
          <Button
            title="Create Customer"
            onPress={handleCreateCustomer}
            loading={creating}
            fullWidth
          />
          <View style={{ height: spacing.sm }} />
          <Button
            title="Cancel"
            variant="ghost"
            onPress={() => setShowNewForm(false)}
            fullWidth
          />
        </View>
      ) : (
        <>
          <View style={styles.searchWrap}>
            <Input
              value={query}
              onChangeText={search}
              placeholder="Search by name, phone, or plate..."
              autoFocus
            />
          </View>

          {loading && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.accent.primary} />
            </View>
          )}

          <FlatList
            data={results}
            keyExtractor={item => item.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={styles.customerRow}
                onPress={() => handleSelectCustomer(item)}
                android_ripple={{ color: colors.accent.glow }}
              >
                <Text style={styles.customerName}>{item.name}</Text>
                <Text style={styles.customerPhone}>{item.phone}</Text>
              </Pressable>
            )}
            ItemSeparatorComponent={Divider}
            ListEmptyComponent={
              query.length >= 2 && !loading ? (
                <Text style={styles.emptyText}>No customers found</Text>
              ) : null
            }
          />

          {loadingVehicles && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.accent.primary} />
              <Text style={styles.loadingText}>Loading vehicles...</Text>
            </View>
          )}

          <View style={styles.newButtonWrap}>
            <Button
              title="+ New Customer"
              variant="secondary"
              onPress={() => setShowNewForm(true)}
              fullWidth
            />
          </View>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
  },
  list: {
    maxHeight: 300,
  },
  customerRow: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
  },
  customerName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  customerPhone: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
  vehicleList: {
    paddingBottom: spacing.lg,
  },
  vehicleRow: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehicleText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  plateText: {
    ...textStyles.monoSm,
    color: colors.accent.primary,
  },
  emptyText: {
    ...textStyles.body,
    color: colors.text.muted,
    textAlign: 'center',
    paddingVertical: spacing['2xl'],
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  loadingText: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
  newForm: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.lg,
  },
  newButtonWrap: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
});
