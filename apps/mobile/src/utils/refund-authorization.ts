import { apiFetch } from '@/services/api-client';

const REFUND_ROLES = new Set(['ADMIN', 'MANAGER']);

export type RefundAuthorizationMethod = 'pin' | 'barcode' | 'card';
export interface RefundAuthorizationResult {
  valid: boolean;
  userId: string | null;
  fullName?: string;
  role?: string;
  method: RefundAuthorizationMethod;
  credential: string;
}

export async function verifyRefundAuthorizationCredential(
  credential: string,
  method: RefundAuthorizationMethod = 'pin',
): Promise<RefundAuthorizationResult> {
  try {
    const result = await apiFetch<{
      valid: boolean;
      userId: string | null;
      fullName?: string;
      role?: string;
    }>('/auth/verify-authorization', {
      method: 'POST',
      body: JSON.stringify({ credential, method }),
    });

    return {
      valid: result.valid && REFUND_ROLES.has(result.role ?? ''),
      userId: result.userId ?? null,
      fullName: result.fullName,
      role: result.role,
      method,
      credential,
    };
  } catch {
    return {
      valid: false,
      userId: null,
      method,
      credential,
    };
  }
}

export async function verifyRefundAuthorizationPin(pin: string): Promise<boolean> {
  const result = await verifyRefundAuthorizationCredential(pin, 'pin');
  return result.valid;
}
