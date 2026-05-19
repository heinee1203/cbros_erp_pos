export type AuthorizationCredentialMethod = 'pin' | 'barcode' | 'card';

const LABELED_AUTH_PATTERN = /^(?:APEXAUTH|AUTH|APEX-MGR|MGR|MANAGER|PIN)[\s:/|=+#-]?\d{4}$/i;
const CARD_TRACK_PATTERN = /^[%;].*\?$/;
const JSON_AUTH_PATTERN = /^\{.*"(?:pin|auth|authorizationPin|managerPin)"\s*:\s*"\d{4}".*\}$/i;
const URL_AUTH_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/.+[?&](?:pin|auth|code|managerPin)=\d{4}(?:&|$)/i;

export interface AuthorizationCredentialInput {
  credential: string;
  method: Exclude<AuthorizationCredentialMethod, 'pin'>;
  complete: boolean;
  label: string;
}

export function sanitizeAuthorizationCredential(value: string): string {
  return value.replace(/\0/g, '').replace(/[\r\n\t]+$/g, '').trim();
}

export function detectAuthorizationCredentialMethod(
  credential: string,
): Exclude<AuthorizationCredentialMethod, 'pin'> {
  const trimmed = sanitizeAuthorizationCredential(credential);
  return /^[%;]/.test(trimmed) ? 'card' : 'barcode';
}

export function getAuthorizationMethodLabel(method: AuthorizationCredentialMethod): string {
  switch (method) {
    case 'card':
      return 'Card swipe';
    case 'barcode':
      return 'Manager barcode';
    case 'pin':
    default:
      return 'PIN';
  }
}

export function maskAuthorizationCredential(value: string): string {
  const sanitized = sanitizeAuthorizationCredential(value);
  if (!sanitized) return '';
  return sanitized.replace(/[A-Za-z0-9]/g, '*');
}

export function parseAuthorizationCredentialInput(value: string): AuthorizationCredentialInput | null {
  const credential = sanitizeAuthorizationCredential(value);
  if (!credential) return null;

  const method = detectAuthorizationCredentialMethod(credential);
  return {
    credential,
    method,
    complete: isCompleteAuthorizationCredentialInput(value),
    label: getAuthorizationMethodLabel(method),
  };
}

export function isCompleteAuthorizationCredentialInput(value: string): boolean {
  if (/[\r\n]$/.test(value)) return true;

  const trimmed = sanitizeAuthorizationCredential(value);
  if (!trimmed) return false;

  const compact = trimmed.replace(/\s/g, '');
  return /^\d{4}$/.test(compact) ||
    LABELED_AUTH_PATTERN.test(compact) ||
    JSON_AUTH_PATTERN.test(trimmed) ||
    URL_AUTH_PATTERN.test(trimmed) ||
    CARD_TRACK_PATTERN.test(trimmed);
}
