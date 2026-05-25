import { getJSON, setJSON, storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';

export type SetupWizardStep =
  | 'connect-printer'
  | 'receipt-test'
  | 'label-test'
  | 'scanner-test'
  | 'manager-auth-test'
  | 'drawer-kick';

export interface SetupWizardProgress {
  completedSteps: SetupWizardStep[];
  updatedAt: string;
}

type Listener = (progress: SetupWizardProgress) => void;
let listeners: Listener[] = [];

export const SETUP_WIZARD_STEPS: Array<{ id: SetupWizardStep; label: string }> = [
  { id: 'connect-printer', label: 'Connect printer' },
  { id: 'receipt-test', label: 'Receipt test' },
  { id: 'label-test', label: 'Label test' },
  { id: 'scanner-test', label: 'Scanner test' },
  { id: 'manager-auth-test', label: 'Manager auth test' },
  { id: 'drawer-kick', label: 'Cash drawer kick' },
];

function emptyProgress(): SetupWizardProgress {
  return { completedSteps: [], updatedAt: new Date().toISOString() };
}

function notify() {
  const progress = getSetupWizardProgress();
  listeners.forEach(listener => listener(progress));
}

export function getSetupWizardProgress(): SetupWizardProgress {
  return getJSON<SetupWizardProgress>(storage, KEYS.SETUP_WIZARD_PROGRESS) ?? emptyProgress();
}

export function markSetupWizardStepComplete(step: SetupWizardStep): void {
  const current = getSetupWizardProgress();
  const completedSteps = Array.from(new Set([...current.completedSteps, step]));
  setJSON(storage, KEYS.SETUP_WIZARD_PROGRESS, {
    completedSteps,
    updatedAt: new Date().toISOString(),
  });
  notify();
}

export function resetSetupWizardProgress(): void {
  setJSON(storage, KEYS.SETUP_WIZARD_PROGRESS, emptyProgress());
  notify();
}

export function subscribeSetupWizardProgress(listener: Listener): () => void {
  listeners.push(listener);
  listener(getSetupWizardProgress());
  return () => {
    listeners = listeners.filter(item => item !== listener);
  };
}
