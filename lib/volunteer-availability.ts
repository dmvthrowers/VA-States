import { createAdminClient } from './supabase/admin';
import { VOLUNTEER_ROLES, type VolunteerRoleCategory } from './volunteer-roles';

export interface VolunteerRoleAvailability {
  role_key: string;
  label: string;
  category: VolunteerRoleCategory;
  description: string;
  is_priority: boolean;
  sort_order: number;
  /** Confirmed count for this specific role. */
  confirmed_count: number;
  /** Individual cap, null when governed by a group cap instead. */
  max_capacity: number | null;
  /** Shared pool key (e.g. judge roles), null if this role has its own cap. */
  group_key: string | null;
  group_max_capacity: number | null;
  /** Confirmed count across the whole group, null if not grouped. */
  group_confirmed_count: number | null;
  /** Remaining spots against whichever cap applies (individual or group). */
  spots_remaining: number | null;
  is_full: boolean;
}

interface AvailabilityRow {
  role_key: string;
  label: string;
  category: VolunteerRoleCategory;
  description: string;
  max_capacity: number | null;
  group_key: string | null;
  group_max_capacity: number | null;
  is_priority: boolean;
  sort_order: number;
  confirmed_count: number;
  group_confirmed_count: number | null;
}

/**
 * Confirmed-only fill counts per volunteer role, read from the
 * vsyc_volunteer_role_availability view (aggregate, no PII). Server-only —
 * uses the service-role admin client, matching this app's convention of
 * never exposing anon/browser reads for VSYC-26 data.
 *
 * Falls back to the static VOLUNTEER_ROLES catalog with zero counts if the
 * DB is unreachable, so the public page/form degrade gracefully instead of
 * hard-failing.
 */
export async function getVolunteerRoleAvailability(): Promise<VolunteerRoleAvailability[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('vsyc_volunteer_role_availability')
      .select('*')
      .order('sort_order', { ascending: true })
      .returns<AvailabilityRow[]>();

    if (error || !data) {
      return fallbackAvailability();
    }

    return data.map((row) => {
      const cap = row.group_key ? row.group_max_capacity : row.max_capacity;
      const count = row.group_key ? (row.group_confirmed_count ?? 0) : row.confirmed_count;
      const spotsRemaining = cap != null ? Math.max(0, cap - count) : null;
      return {
        role_key: row.role_key,
        label: row.label,
        category: row.category,
        description: row.description,
        is_priority: row.is_priority,
        sort_order: row.sort_order,
        confirmed_count: row.confirmed_count,
        max_capacity: row.max_capacity,
        group_key: row.group_key,
        group_max_capacity: row.group_max_capacity,
        group_confirmed_count: row.group_confirmed_count,
        spots_remaining: spotsRemaining,
        is_full: spotsRemaining !== null && spotsRemaining <= 0,
      };
    });
  } catch {
    return fallbackAvailability();
  }
}

function fallbackAvailability(): VolunteerRoleAvailability[] {
  return VOLUNTEER_ROLES.map((r) => ({
    role_key: r.key,
    label: r.label,
    category: r.category,
    description: r.description,
    is_priority: r.isPriority,
    sort_order: r.sortOrder,
    confirmed_count: 0,
    max_capacity: r.maxCapacity,
    group_key: r.groupKey,
    group_max_capacity: r.groupMaxCapacity,
    group_confirmed_count: r.groupKey ? 0 : null,
    spots_remaining: r.maxCapacity ?? r.groupMaxCapacity ?? null,
    is_full: false,
  }));
}
