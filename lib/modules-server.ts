import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { canAny, type Capability } from '@/lib/roles';
import { MODULES, MODULE_STATUSES, isModuleId, type ModuleId } from '@/lib/modules';

export const itemFields = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().max(2000).nullish(),
  status: z.enum(MODULE_STATUSES),
  position: z.number().int().min(0).max(100000),
  qty: z.number().int().min(0).max(1_000_000).nullish(),
  link: z.string().trim().url().max(500).refine((u) => u.startsWith('https://'), 'Links must start with https://').nullish().or(z.literal('')),
});

/** Signed in, active, and holding one of the module's capabilities. Returns the identity and the module id. */
export async function moduleAuth(req: NextRequest, requestId: string, moduleParam: string) {
  if (!isModuleId(moduleParam)) return { ok: false as const, error: apiError('not_found', 'Unknown module', requestId) };
  const token = getBearerToken(req);
  if (!token) return { ok: false as const, error: apiError('unauthorized', 'Missing bearer token', requestId) };
  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || !canAny(identity.grants, MODULES[moduleParam].needs as readonly Capability[])) {
    return { ok: false as const, error: apiError('forbidden', `${MODULES[moduleParam].label} access required`, requestId) };
  }
  return { ok: true as const, identity, module: moduleParam as ModuleId };
}
