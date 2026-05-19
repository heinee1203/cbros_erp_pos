export const MANAGER_BADGE_TITLE = 'APEX MANAGER BADGE';

export function normalizeManagerAuthorizationPin(value: string): string {
  return value.replace(/\D/g, '').slice(0, 4);
}

export function isManagerAuthorizationPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

export function buildManagerBarcodeCredential(pin: string): string {
  const normalized = normalizeManagerAuthorizationPin(pin);
  if (!isManagerAuthorizationPin(normalized)) {
    throw new Error('Manager authorization PIN must be exactly 4 digits.');
  }
  return `APEX-MGR/${normalized}`;
}

export function buildManagerCardCredential(pin: string): string {
  const normalized = normalizeManagerAuthorizationPin(pin);
  if (!isManagerAuthorizationPin(normalized)) {
    throw new Error('Manager authorization PIN must be exactly 4 digits.');
  }
  return `;${normalized}=APEXMANAGER?`;
}

export function maskManagerCredential(value: string): string {
  return value.replace(/\d/g, '*');
}
