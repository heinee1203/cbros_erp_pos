import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/hooks/use-auth';
import { usePosPermission } from '@/hooks/use-pos-permission';
import { getAuditLog } from '@/services/audit-logger';
import { getPendingElevationLogs } from '@/services/elevation-log';
import { getHardwareTestResults } from '@/storage/hardware-tests';
import { getDrawerVarianceHistory } from '@/storage/drawer-variance-history';
import { getOfflineReconciliationOutcomes } from '@/storage/offline-reconciliation';
import { getOfflineReviewMarkers } from '@/storage/offline-review';
import { getSupportLogs } from '@/storage/support-logs';
import { colors, fonts, fontSize, radius, spacing, textStyles } from '@/theme';
import { Icon } from '@/components/ui';

function fmtTime(value: string): string {
  return new Date(value).toLocaleString('en-PH');
}

function methodBadge(value?: string | null): string {
  if (value === 'barcode') return 'Barcode';
  if (value === 'card') return 'Card';
  if (value === 'pin') return 'PIN';
  if (value === 'session') return 'Session';
  return 'Local';
}

export default function ManagerAuditScreen() {
  const { user } = useAuth();
  const { can } = usePosPermission();
  const styles = createStyles();
  const canView = can('viewManagerAudit');

  const audit = getAuditLog();
  const elevation = getPendingElevationLogs();
  const hardware = getHardwareTestResults();
  const varianceHistory = getDrawerVarianceHistory();
  const reconciliationOutcomes = Object.values(getOfflineReconciliationOutcomes());
  const offlineReviews = Object.values(getOfflineReviewMarkers());
  const supportWarnings = getSupportLogs().filter(log => log.level !== 'info');

  const copyText = [
    'APEX POS MANAGER AUDIT',
    `Generated: ${new Date().toLocaleString('en-PH')}`,
    `User: ${user?.fullName || user?.email || 'Unknown'}`,
    '',
    'LOCAL APPROVALS',
    ...audit.slice(0, 30).map(entry =>
      `${fmtTime(entry.timestamp)} / ${entry.action} / ${entry.description} / approved by ${entry.approvedBy}`,
    ),
    '',
    'PENDING ELEVATIONS',
    ...elevation.slice(0, 30).map(entry =>
      `${fmtTime(entry.timestamp)} / ${entry.action} / ${entry.details} / approved by ${entry.approvedBy}`,
    ),
    '',
    'OFFLINE REVIEWS',
    ...offlineReviews.slice(0, 30).map(marker =>
      `${fmtTime(marker.reviewedAt)} / ${marker.type} / ${marker.id} / ${marker.reviewedBy} / ${marker.note}`,
    ),
    '',
    'OFFLINE RECONCILIATION',
    ...reconciliationOutcomes.slice(0, 30).map(outcome =>
      `${fmtTime(outcome.updatedAt)} / ${outcome.type} / ${outcome.id} / ${outcome.status} / ${outcome.message || outcome.serverId || 'no outcome yet'}`,
    ),
    '',
    'DRAWER VARIANCE HISTORY',
    ...varianceHistory.slice(0, 30).map(record =>
      `${fmtTime(record.createdAt)} / ${record.storeCode || 'store'} / ${record.shiftId} / expected ${record.expectedCash} / actual ${record.actualCash} / variance ${record.variance} / ${record.note || 'no note'}`,
    ),
    '',
    'HARDWARE CERTIFICATION',
    ...hardware.slice(0, 30).map(result =>
      `${fmtTime(result.createdAt)} / ${result.type} / ${result.status} / ${result.operator || 'unknown'} / ${result.note || result.error || 'no note'}`,
    ),
  ].join('\n');

  if (!canView) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyCard}>
          <Icon name="alert" size={28} color={colors.status.warning} />
          <Text style={styles.title}>Manager Audit</Text>
          <Text style={styles.subtitle}>Manager or admin access is required.</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="manager-audit-screen"
      accessibilityLabel="Manager audit screen"
    >
      <Text style={styles.screenTitle}>Manager Audit</Text>
      <Text style={styles.screenSubtitle}>Local approvals, exceptions, and support-safe audit text.</Text>

      <View style={styles.metricRow}>
        <Metric label="Approvals" value={String(audit.length + elevation.length)} />
        <Metric label="Reviews" value={String(offlineReviews.length)} />
        <Metric label="Variance" value={String(varianceHistory.length)} tone={varianceHistory.length > 0 ? 'warning' : 'default'} />
        <Metric label="Hardware" value={String(hardware.length)} />
        <Metric label="Warnings" value={String(supportWarnings.length)} tone={supportWarnings.length > 0 ? 'warning' : 'default'} />
      </View>

      <Section title="Recent Local Approvals">
        {audit.length === 0 ? <Empty label="No local approvals recorded." /> : audit.slice(0, 10).map(entry => (
          <AuditRow
            key={entry.id}
            title={entry.action.replace(/_/g, ' ')}
            detail={entry.description}
            meta={`${fmtTime(entry.timestamp)} / ${entry.performedBy}`}
            badge={methodBadge(entry.metadata?.authorizationMethod)}
          />
        ))}
      </Section>

      <Section title="Pending Elevation Sync">
        {elevation.length === 0 ? <Empty label="No elevation logs waiting." /> : elevation.slice(0, 10).map((entry, index) => (
          <AuditRow
            key={`${entry.timestamp}-${index}`}
            title={entry.action.replace(/_/g, ' ')}
            detail={entry.details}
            meta={`${fmtTime(entry.timestamp)} / ${entry.requestedByName}`}
            badge={methodBadge()}
          />
        ))}
      </Section>

      <Section title="Offline Manager Reviews">
        {offlineReviews.length === 0 ? <Empty label="No offline records marked reviewed." /> : offlineReviews.slice(0, 10).map(marker => (
          <AuditRow
            key={`${marker.type}-${marker.id}`}
            title={marker.type.replace('-', ' ')}
            detail={marker.note}
            meta={`${fmtTime(marker.reviewedAt)} / ${marker.reviewedBy}`}
            badge="Reviewed"
          />
        ))}
      </Section>

      <Section title="Offline Reconciliation Outcomes">
        {reconciliationOutcomes.length === 0 ? <Empty label="No reconciliation outcomes recorded." /> : reconciliationOutcomes.slice(0, 10).map(outcome => (
          <AuditRow
            key={`${outcome.type}-${outcome.id}`}
            title={outcome.type.replace('-', ' ')}
            detail={outcome.message || outcome.serverId || 'No server outcome yet'}
            meta={`${fmtTime(outcome.updatedAt)} / ${outcome.id}`}
            badge={outcome.status.replace('_', ' ').toUpperCase()}
            danger={outcome.status === 'blocked' || outcome.status === 'support_needed'}
          />
        ))}
      </Section>

      <Section title="Drawer Variance History">
        {varianceHistory.length === 0 ? <Empty label="No drawer variance history recorded." /> : varianceHistory.slice(0, 10).map(record => (
          <AuditRow
            key={record.id}
            title={`Shift ${record.shiftId}`}
            detail={record.note || 'No closeout note'}
            meta={`${fmtTime(record.createdAt)} / variance ${record.variance.toFixed(2)}`}
            badge={record.variance === 0 ? 'EVEN' : 'VARIANCE'}
            danger={record.variance !== 0}
          />
        ))}
      </Section>

      <Section title="Hardware Certification Outcomes">
        {hardware.length === 0 ? <Empty label="No hardware certification outcomes." /> : hardware.slice(0, 10).map(result => (
          <AuditRow
            key={result.id}
            title={result.title}
            detail={result.note || result.error || 'No note'}
            meta={`${fmtTime(result.createdAt)} / ${result.operator || 'Unknown operator'}`}
            badge={result.status.toUpperCase()}
            danger={result.status === 'fail'}
          />
        ))}
      </Section>

      <View style={styles.copyCard}>
        <Text style={styles.sectionTitle}>Copy-Friendly Audit Packet</Text>
        <Text selectable style={styles.copyText}>{copyText}</Text>
      </View>
    </ScrollView>
  );
}

function Metric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warning' }) {
  const styles = createStyles();
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === 'warning' && styles.metricWarning]}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = createStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Empty({ label }: { label: string }) {
  const styles = createStyles();
  return <Text style={styles.emptyText}>{label}</Text>;
}

function AuditRow({
  title,
  detail,
  meta,
  badge,
  danger = false,
}: {
  title: string;
  detail: string;
  meta: string;
  badge: string;
  danger?: boolean;
}) {
  const styles = createStyles();
  return (
    <View style={styles.auditRow}>
      <View style={styles.auditCopy}>
        <Text style={styles.auditTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.auditDetail} numberOfLines={2}>{detail}</Text>
        <Text style={styles.auditMeta} numberOfLines={1}>{meta}</Text>
      </View>
      <View style={[styles.badge, danger && styles.badgeDanger]}>
        <Text style={[styles.badgeText, danger && styles.badgeTextDanger]}>{badge}</Text>
      </View>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 90,
  },
  screenTitle: {
    ...textStyles.heading,
    color: colors.text.primary,
  },
  screenSubtitle: {
    ...textStyles.body,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  metric: {
    flex: 1,
    minHeight: 66,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    padding: spacing.sm,
    justifyContent: 'center',
  },
  metricLabel: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
  },
  metricValue: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
    marginTop: 2,
  },
  metricWarning: {
    color: colors.status.warning,
  },
  section: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...textStyles.caption,
    color: colors.text.muted,
  },
  auditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  auditCopy: {
    flex: 1,
  },
  auditTitle: {
    color: colors.text.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
    textTransform: 'capitalize',
  },
  auditDetail: {
    color: colors.text.secondary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.xs,
    lineHeight: 17,
    marginTop: 2,
  },
  auditMeta: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  badge: {
    minWidth: 76,
    minHeight: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.accent.muted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  badgeDanger: {
    backgroundColor: colors.status.dangerBg,
  },
  badgeText: {
    color: colors.accent.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.xs,
  },
  badgeTextDanger: {
    color: colors.status.danger,
  },
  copyCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    padding: spacing.md,
  },
  copyText: {
    fontFamily: 'monospace',
    color: colors.text.secondary,
    fontSize: 11,
    lineHeight: 16,
  },
  emptyCard: {
    margin: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.surface,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...textStyles.heading,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
