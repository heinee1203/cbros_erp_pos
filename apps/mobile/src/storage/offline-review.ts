import { KEYS } from '@/storage/keys';
import { getJSON, setJSON, storage } from '@/storage/mmkv';
import { recordSupportLog } from '@/storage/support-logs';

export type OfflineReviewType = 'pending-sale' | 'drawer-event';

export interface OfflineReviewMarker {
  id: string;
  type: OfflineReviewType;
  reviewedAt: string;
  reviewedBy: string;
  note: string;
}

type Listener = () => void;

const listeners = new Set<Listener>();

function keyFor(type: OfflineReviewType, id: string) {
  return `${type}:${id}`;
}

function notify() {
  listeners.forEach(listener => listener());
}

export function getOfflineReviewMarkers(): Record<string, OfflineReviewMarker> {
  return getJSON<Record<string, OfflineReviewMarker>>(storage, KEYS.OFFLINE_REVIEW_MARKERS) ?? {};
}

export function getOfflineReviewMarker(type: OfflineReviewType, id: string): OfflineReviewMarker | null {
  return getOfflineReviewMarkers()[keyFor(type, id)] ?? null;
}

export function markOfflineRecordReviewed(input: {
  id: string;
  type: OfflineReviewType;
  reviewedBy: string;
  note?: string;
}): OfflineReviewMarker {
  const marker: OfflineReviewMarker = {
    id: input.id,
    type: input.type,
    reviewedAt: new Date().toISOString(),
    reviewedBy: input.reviewedBy,
    note: input.note?.trim() || 'Manager reviewed; keep record for retry/support.',
  };
  const next = {
    ...getOfflineReviewMarkers(),
    [keyFor(input.type, input.id)]: marker,
  };
  setJSON(storage, KEYS.OFFLINE_REVIEW_MARKERS, next);
  recordSupportLog({
    category: input.type === 'pending-sale' ? 'checkout' : 'drawer',
    level: 'info',
    message: `${input.type} marked manager-reviewed`,
    detail: marker.note,
    context: { id: input.id, reviewedBy: input.reviewedBy },
  });
  notify();
  return marker;
}

export function subscribeOfflineReviewMarkers(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
