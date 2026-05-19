import { getJSON, setJSON, storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

export type RegisterDrawerAction = 'NO_SALE' | 'PAID_IN' | 'PAID_OUT';

export interface RegisterDrawerEvent {
  id: string;
  serverId?: string;
  type: RegisterDrawerAction;
  amount: number;
  reason: string;
  locationId: string;
  locationName: string;
  shiftId: string;
  cashierId: string;
  cashierName: string;
  approvedBy: string;
  authorizationMethod: 'pin' | 'barcode' | 'card';
  authorizationUserId?: string;
  drawerOpened: boolean;
  drawerError?: string;
  createdAt: string;
  syncStatus?: 'pending' | 'synced' | 'failed';
  syncError?: string;
}

export interface RegisterDrawerSummary {
  eventCount: number;
  noSaleCount: number;
  paidInCount: number;
  paidOutCount: number;
  paidInTotal: number;
  paidOutTotal: number;
  netCash: number;
}

const MAX_EVENTS = 200;
type DrawerEventListener = (events: RegisterDrawerEvent[]) => void;

let listeners: DrawerEventListener[] = [];

function createId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function getRegisterDrawerEvents(): RegisterDrawerEvent[] {
  return getJSON<RegisterDrawerEvent[]>(storage, KEYS.REGISTER_DRAWER_EVENTS) ?? [];
}

function notifyDrawerEventsChanged(): void {
  const next = getRegisterDrawerEvents();
  listeners.forEach(listener => listener(next));
}

export function onRegisterDrawerEventsChanged(listener: DrawerEventListener): () => void {
  listeners.push(listener);
  listener(getRegisterDrawerEvents());
  return () => {
    listeners = listeners.filter(item => item !== listener);
  };
}

export function addRegisterDrawerEvent(
  event: Omit<RegisterDrawerEvent, 'id' | 'createdAt'>,
): RegisterDrawerEvent {
  const next: RegisterDrawerEvent = {
    ...event,
    id: createId(),
    createdAt: new Date().toISOString(),
    syncStatus: event.syncStatus ?? 'pending',
  };
  const events = [next, ...getRegisterDrawerEvents()].slice(0, MAX_EVENTS);
  setJSON(storage, KEYS.REGISTER_DRAWER_EVENTS, events);
  notifyDrawerEventsChanged();
  return next;
}

export function updateRegisterDrawerEvent(
  id: string,
  patch: Partial<RegisterDrawerEvent>,
): RegisterDrawerEvent | null {
  let updated: RegisterDrawerEvent | null = null;
  const events = getRegisterDrawerEvents().map(event => {
    if (event.id !== id) return event;
    updated = { ...event, ...patch };
    return updated;
  });
  if (!updated) return null;
  setJSON(storage, KEYS.REGISTER_DRAWER_EVENTS, events);
  notifyDrawerEventsChanged();
  return updated;
}

export function getRecentRegisterDrawerEvents(limit = 10): RegisterDrawerEvent[] {
  return getRegisterDrawerEvents().slice(0, limit);
}

export function getRegisterDrawerEventsForShift(shiftId: string): RegisterDrawerEvent[] {
  return getRegisterDrawerEvents().filter(event => event.shiftId === shiftId);
}

export function getUnsyncedRegisterDrawerEvents(): RegisterDrawerEvent[] {
  return getRegisterDrawerEvents().filter(event => event.syncStatus !== 'synced' && !event.serverId);
}

export function getUnsyncedRegisterDrawerEventsForShift(shiftId: string): RegisterDrawerEvent[] {
  return getUnsyncedRegisterDrawerEvents().filter(event => event.shiftId === shiftId);
}

export function summarizeRegisterDrawerEvents(events: RegisterDrawerEvent[]): RegisterDrawerSummary {
  return events.reduce<RegisterDrawerSummary>(
    (summary, event) => {
      summary.eventCount += 1;
      if (event.type === 'NO_SALE') {
        summary.noSaleCount += 1;
      } else if (event.type === 'PAID_IN') {
        summary.paidInCount += 1;
        summary.paidInTotal += event.amount;
        summary.netCash += event.amount;
      } else if (event.type === 'PAID_OUT') {
        summary.paidOutCount += 1;
        summary.paidOutTotal += event.amount;
        summary.netCash -= event.amount;
      }
      return summary;
    },
    {
      eventCount: 0,
      noSaleCount: 0,
      paidInCount: 0,
      paidOutCount: 0,
      paidInTotal: 0,
      paidOutTotal: 0,
      netCash: 0,
    },
  );
}
