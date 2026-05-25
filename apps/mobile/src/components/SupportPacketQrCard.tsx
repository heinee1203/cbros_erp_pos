import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { buildSupportQrPayload, recordSupportQrMetadata } from '@/storage/support-qr';
import { colors, radius, spacing, textStyles } from '@/theme';

export function SupportPacketQrCard({ text }: { text: string }) {
  const payload = React.useMemo(() => buildSupportQrPayload(text), [text]);

  React.useEffect(() => {
    recordSupportQrMetadata({
      source: 'recovery-diagnostics',
      length: payload.length,
    });
  }, [payload]);

  return (
    <View style={styles.card}>
      <View style={styles.qrWrap}>
        <QRCode value={payload || 'APEX POS SUPPORT'} size={148} backgroundColor="#FFFFFF" color="#172033" />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Support QR</Text>
        <Text style={styles.body}>
          Scan for a compact support packet. Full copy text remains below for detailed troubleshooting.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  qrWrap: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  body: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
});
