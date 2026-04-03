import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, radius, fonts, fontSize } from '@/theme';
import { apiFetch } from '@/services/api-client';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useScanner } from '@/hardware/scanner/context';

interface SerialInputProps {
  lineId: string;
  productId: string;
  productName: string;
  requiredCount: number;
  serials: string[];
  onUpdate: (serials: string[]) => void;
  onClose: () => void;
}

/**
 * SerialInput — modal for entering and validating serial numbers per cart line.
 * Each serial is validated against the API before being accepted.
 */
export function SerialInput({
  lineId,
  productId,
  productName,
  requiredCount,
  serials,
  onUpdate,
  onClose,
}: SerialInputProps) {
  const [input, setInput] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const { isOnline } = useNetworkStatus();
  const scanner = useScanner();

  const isComplete = serials.length >= requiredCount;

  // Listen for barcode scans
  React.useEffect(() => {
    const unsub = scanner.onScan((result) => {
      if (isComplete) return;
      setInput(result.barcode);
      // Auto-submit on scan
      handleAdd(result.barcode);
    });
    return unsub;
  }, [scanner, isComplete, serials]);

  const handleAdd = useCallback(async (serialToAdd?: string) => {
    const sn = (serialToAdd || input).trim();
    if (!sn) return;

    // Local duplicate check
    if (serials.includes(sn)) {
      setError(`"${sn}" already entered`);
      return;
    }

    if (!isOnline) {
      setError('Serial validation requires internet connection');
      return;
    }

    setValidating(true);
    setError(null);

    try {
      const res = await apiFetch<{ exists: boolean; status: string | null }>(
        `/inventory/serials/validate?serialNumber=${encodeURIComponent(sn)}&productId=${productId}`,
      );

      if (!res.exists) {
        setError(`"${sn}" not found in system`);
        setValidating(false);
        return;
      }

      if (res.status !== 'IN_STOCK') {
        setError(`"${sn}" is ${res.status} — not available for sale`);
        setValidating(false);
        return;
      }

      // Valid — add to list
      const newSerials = [...serials, sn];
      onUpdate(newSerials);
      setInput('');
      setError(null);

      if (newSerials.length >= requiredCount) {
        // All serials entered — close after a brief delay
        setTimeout(onClose, 300);
      } else {
        inputRef.current?.focus();
      }
    } catch (err: any) {
      setError(err.message || 'Validation failed');
    } finally {
      setValidating(false);
    }
  }, [input, serials, isOnline, productId, requiredCount, onUpdate, onClose]);

  const removeSerial = useCallback((index: number) => {
    onUpdate(serials.filter((_, i) => i !== index));
  }, [serials, onUpdate]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Serial Numbers</Text>
        <View style={[styles.badge, isComplete ? styles.badgeComplete : styles.badgeIncomplete]}>
          <Text style={[styles.badgeText, isComplete ? styles.badgeTextComplete : styles.badgeTextIncomplete]}>
            {serials.length} / {requiredCount}
          </Text>
        </View>
      </View>
      <Text style={styles.productName}>{productName}</Text>

      {/* Offline warning */}
      {!isOnline && (
        <View style={styles.offlineWarning}>
          <Text style={styles.offlineText}>Serial validation requires internet</Text>
        </View>
      )}

      {/* Input */}
      {!isComplete && (
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={input}
            onChangeText={(t) => { setInput(t); setError(null); }}
            onSubmitEditing={() => handleAdd()}
            placeholder="Scan or type serial..."
            placeholderTextColor={colors.text.muted}
            autoFocus
            returnKeyType="done"
          />
          <Pressable
            onPress={() => handleAdd()}
            disabled={!input.trim() || validating}
            style={[styles.addBtn, (!input.trim() || validating) && styles.addBtnDisabled]}
          >
            {validating ? (
              <ActivityIndicator size="small" color={colors.text.inverse} />
            ) : (
              <Text style={styles.addBtnText}>Add</Text>
            )}
          </Pressable>
        </View>
      )}

      {/* Error */}
      {error && <Text style={styles.error}>{error}</Text>}

      {/* Serial list */}
      {serials.length > 0 && (
        <FlatList
          data={serials}
          keyExtractor={(_, i) => String(i)}
          style={styles.list}
          renderItem={({ item, index }) => (
            <View style={styles.serialRow}>
              <Text style={styles.serialCheck}>✓</Text>
              <Text style={styles.serialText}>{item}</Text>
              <Pressable onPress={() => removeSerial(index)} hitSlop={8}>
                <Text style={styles.removeBtn}>✕</Text>
              </Pressable>
            </View>
          )}
        />
      )}

      {/* Done button */}
      <Pressable onPress={onClose} style={styles.doneBtn}>
        <Text style={styles.doneBtnText}>{isComplete ? 'Done' : 'Close'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: 500,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
    color: colors.text.primary,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  badgeComplete: { backgroundColor: 'rgba(52,199,89,0.15)' },
  badgeIncomplete: { backgroundColor: 'rgba(245,166,35,0.15)' },
  badgeText: { fontSize: fontSize.xs, fontFamily: fonts.bodyMedium },
  badgeTextComplete: { color: colors.status.success },
  badgeTextIncomplete: { color: colors.status.warning },
  productName: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  offlineWarning: {
    backgroundColor: colors.status.dangerBg,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  offlineText: {
    color: colors.status.dangerText,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
    fontFamily: fonts.mono,
    color: colors.text.primary,
    backgroundColor: colors.bg.input,
  },
  addBtn: {
    height: 44,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.accent.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: {
    color: colors.text.inverse,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyBold,
  },
  error: {
    color: colors.status.danger,
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
  },
  list: {
    maxHeight: 200,
    marginBottom: spacing.md,
  },
  serialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.sm,
    marginBottom: 4,
  },
  serialCheck: {
    color: colors.status.success,
    fontSize: fontSize.sm,
    marginRight: spacing.sm,
  },
  serialText: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  removeBtn: {
    color: colors.status.danger,
    fontSize: fontSize.base,
    paddingHorizontal: spacing.xs,
  },
  doneBtn: {
    height: 44,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBtnText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
  },
});
