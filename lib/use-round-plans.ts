'use client';

import { useEffect, useState } from 'react';
import type { RoundPlan } from '@/lib/round-plan';

type Plans = Record<string, RoundPlan>;

/**
 * The confirmed round plans (which rounds each division runs), fetched once. Until it loads, or
 * when a division has no plan, every configured round shows, which is the old behavior.
 */
export function useRoundPlans(): Plans {
  const [plans, setPlans] = useState<Plans>({});
  useEffect(() => {
    let live = true;
    const load = () => {
      fetch('/api/rounds/plan', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (live && j?.plans) setPlans(j.plans); })
        .catch(() => {});
    };
    load();
    window.addEventListener(CHANGED, load);
    return () => { live = false; window.removeEventListener(CHANGED, load); };
  }, []);
  return plans;
}

const CHANGED = 'round-plans-changed';

/** Tell every page component using useRoundPlans to reload (after an organizer confirms a plan). */
export const notifyRoundPlansChanged = () => window.dispatchEvent(new Event(CHANGED));
