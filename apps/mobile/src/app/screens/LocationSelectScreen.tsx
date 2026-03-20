import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '@/hooks/use-auth';
import { colors, textStyles, spacing, radius } from '@/theme';
import type { LocationInfo } from '@/services/auth';

interface Props {
  onLocationSelected: (locationId: string) => void;
}

export default function LocationSelectScreen({ onLocationSelected }: Props) {
  const { locations, user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const styles = createStyles();

  const activeLocations = locations.filter(l => l.isActive);

  const handleSelect = (loc: LocationInfo) => {
    setSelectedId(loc.id);
    onLocationSelected(loc.id);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>
          Welcome, {user?.fullName?.split(' ')[0] || 'User'}
        </Text>
        <Text style={styles.title}>Select Your Store</Text>
        <Text style={styles.subtitle}>
          Choose the location you're working at today.
        </Text>
      </View>

      <FlatList
        data={activeLocations}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isSelected = selectedId === item.id;
          return (
            <Pressable
              style={[styles.locationCard, isSelected && styles.locationCardActive]}
              onPress={() => handleSelect(item)}
              disabled={isSelected}
              android_ripple={{ color: colors.accent.glow }}
            >
              <View style={[styles.locationIcon, isSelected && styles.locationIconActive]}>
                <Text style={styles.locationIconText}>
                  {item.type === 'WAREHOUSE' ? '\uD83C\uDFED' : '\uD83C\uDFEA'}
                </Text>
              </View>
              <View style={styles.locationInfo}>
                <Text style={[styles.locationName, isSelected && styles.locationNameActive]}>
                  {item.name}
                </Text>
                <Text style={styles.locationType}>
                  {item.type?.replace(/_/g, ' ') || 'Store'}
                  {item.code ? ` \u2022 ${item.code}` : ''}
                </Text>
              </View>
              {isSelected && (
                <ActivityIndicator size="small" color={colors.accent.primary} />
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No locations available.</Text>
            <Text style={styles.emptySubtext}>
              Contact your admin to assign store locations.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  greeting: {
    ...textStyles.body,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  title: {
    ...textStyles.heading,
    color: colors.text.primary,
    fontSize: 24,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...textStyles.body,
    color: colors.text.muted,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  locationCardActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.glow,
  },
  locationIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.bg.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  locationIconActive: {
    backgroundColor: colors.accent.primary,
  },
  locationIconText: {
    fontSize: 22,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontSize: 16,
  },
  locationNameActive: {
    color: colors.accent.primary,
  },
  locationType: {
    ...textStyles.caption,
    color: colors.text.muted,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  emptySubtext: {
    ...textStyles.caption,
    color: colors.text.muted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
