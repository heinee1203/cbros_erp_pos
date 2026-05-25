import { ApiError, apiFetch } from '@/services/api-client';
import {
  getUnsyncedRegisterDrawerEvents,
  getUnsyncedRegisterDrawerEventsForShift,
  updateRegisterDrawerEvent,
  type RegisterDrawerEvent,
} from '@/storage/register-drawer-events';
import { getLockedLocationId } from '@/config/device-binding';
import { formatPosError } from '@/utils/pos-error-messages';
import { recordOfflineReconciliationOutcome } from '@/storage/offline-reconciliation';

export interface RegisterDrawerReconcileApproval {
  credential: string;
  method: RegisterDrawerEvent['authorizationMethod'];
}

export interface RegisterDrawerReconciliationSummary {
  total: number;
  synced: number;
  retryLater: number;
  failed: number;
  skipped: number;
  blockedReason?: 'store_lock' | 'authorization';
}

export interface RegisterDrawerReconciliationOptions {
  shiftId?: string;
}

function isTransientSyncError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500);
}

async function replayDrawerEvent(
  event: RegisterDrawerEvent,
  approval: RegisterDrawerReconcileApproval,
): Promise<string> {
  const response = await apiFetch<{ data: { id: string } }>(
    `/shifts/${event.shiftId}/drawer-events`,
    {
      method: 'POST',
      requireLockedLocation: true,
      body: JSON.stringify({
        type: event.type,
        amount: event.amount.toFixed(2),
        reason: event.reason,
        clientEventId: event.id,
        authorizationCredential: approval.credential,
        authorizationMethod: approval.method,
        drawerOpened: event.drawerOpened,
        drawerError: event.drawerError,
      }),
    },
  );

  return response.data.id;
}

export async function reconcileRegisterDrawerEvents(
  approval?: RegisterDrawerReconcileApproval,
  options: RegisterDrawerReconciliationOptions = {},
): Promise<RegisterDrawerReconciliationSummary> {
  const events = options.shiftId
    ? getUnsyncedRegisterDrawerEventsForShift(options.shiftId)
    : getUnsyncedRegisterDrawerEvents();
  const lockedLocationId = getLockedLocationId();
  const summary: RegisterDrawerReconciliationSummary = {
    total: events.length,
    synced: 0,
    retryLater: 0,
    failed: 0,
    skipped: 0,
  };

  if (!lockedLocationId) {
    summary.skipped = events.length;
    summary.blockedReason = 'store_lock';
    return summary;
  }

  if (!approval?.credential) {
    summary.skipped = events.length;
    summary.blockedReason = 'authorization';
    return summary;
  }

  for (const event of events) {
    if (event.locationId !== lockedLocationId) {
      updateRegisterDrawerEvent(event.id, {
        syncStatus: 'failed',
        lifecycleStatus: 'blocked',
        syncError: 'Queued drawer event belongs to a different locked store.',
      });
      recordOfflineReconciliationOutcome({
        type: 'drawer-event',
        id: event.id,
        status: 'blocked',
        message: 'Queued drawer event belongs to a different locked store.',
      });
      summary.failed += 1;
      continue;
    }

    updateRegisterDrawerEvent(event.id, {
      syncStatus: 'pending',
      lifecycleStatus: 'retrying',
      syncError: undefined,
    });
    recordOfflineReconciliationOutcome({
      type: 'drawer-event',
      id: event.id,
      status: 'retrying',
      message: 'Drawer sync attempt started',
    });

    try {
      const serverId = await replayDrawerEvent(event, approval);
      updateRegisterDrawerEvent(event.id, {
        serverId,
        syncStatus: 'synced',
        lifecycleStatus: 'accepted',
        serverOutcome: `Drawer event ${serverId}`,
        syncError: undefined,
      });
      recordOfflineReconciliationOutcome({
        type: 'drawer-event',
        id: event.id,
        status: 'accepted',
        serverId,
        message: 'Drawer event accepted by server',
      });
      summary.synced += 1;
    } catch (error) {
      const message = formatPosError(error, 'Drawer event could not be synced.');
      if (isTransientSyncError(error)) {
        updateRegisterDrawerEvent(event.id, {
          syncStatus: 'pending',
          lifecycleStatus: 'queued',
          nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
          syncError: message,
        });
        recordOfflineReconciliationOutcome({
          type: 'drawer-event',
          id: event.id,
          status: 'queued',
          nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
          message,
        });
        summary.retryLater += 1;
      } else {
        updateRegisterDrawerEvent(event.id, {
          syncStatus: 'failed',
          lifecycleStatus: 'support_needed',
          syncError: message,
        });
        recordOfflineReconciliationOutcome({
          type: 'drawer-event',
          id: event.id,
          status: 'support_needed',
          message,
        });
        summary.failed += 1;
      }
    }
  }

  return summary;
}
