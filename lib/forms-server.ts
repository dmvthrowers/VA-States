import { NextRequest } from 'next/server';
import { contest } from '@/contest.config';
import { apiError } from '@/lib/api-error';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { can } from '@/lib/roles';
import type { FormDef } from '@/lib/forms';

/** The configured form with this id, or null when there is none or it is turned off. */
export function findForm(id: string): FormDef | null {
  const f = contest.forms.find((x) => x.id === id);
  return f && f.enabled ? f : null;
}

/** Staff who may read and handle form answers (`forms.review`). Returns the identity, or an error response. */
export async function formReviewAuth(req: NextRequest, requestId: string) {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);
  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || !can(identity.grants, 'forms.review')) {
    return apiError('forbidden', 'Form review access required', requestId);
  }
  return identity;
}
