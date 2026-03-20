import React from 'react';
import {
  Modal,
  Pressable,
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout } from '@/hooks/use-layout';
import { colors, textStyles, spacing, radius } from '@/theme';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

/**
 * Phone: slides up from bottom (full width).
 * Tablet: centered dialog (max 480dp wide, rounded corners).
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  title,
}: BottomSheetProps) {
  const styles = createStyles();
  const insets = useSafeAreaInsets();
  const { isTablet } = useLayout();

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isTablet ? 'fade' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.overlay, isTablet && styles.overlayTablet]}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            isTablet ? styles.dialog : styles.sheet,
            !isTablet && { paddingBottom: Math.max(insets.bottom, spacing.lg) },
          ]}
        >
          {!isTablet && (
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>
          )}
          {title && (
            <View style={isTablet ? styles.dialogHeader : undefined}>
              <Text style={styles.title}>{title}</Text>
              {isTablet && (
                <Pressable onPress={onClose} hitSlop={8}>
                  <Text style={styles.closeButton}>{'\u2715'}</Text>
                </Pressable>
              )}
            </View>
          )}
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            style={styles.content}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = () => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlayTablet: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  // Phone: bottom sheet
  sheet: {
    backgroundColor: colors.bg.elevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
  },
  // Tablet: centered dialog
  dialog: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing['2xl'],
    paddingTop: spacing.lg,
    width: 480,
    maxWidth: '90%',
    maxHeight: '80%',
    elevation: 24,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  closeButton: {
    ...textStyles.body,
    color: colors.text.muted,
    fontSize: 18,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.default,
  },
  title: {
    ...textStyles.subheading,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  content: {
    paddingTop: spacing.sm,
  },
});
