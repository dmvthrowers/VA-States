'use client';

import { useEffect, useState } from 'react';

interface Plan {
  default_places: number;
  champion_title: string;
  rows: { division: string; name: string; entrants: number; places: number; champion: boolean; prizes: number }[];
  podium: number;
  champions: number;
  total: number;
}

/**
 * Admin: how many prizes the number of people entered so far calls for, per division and in total.
 * Prize sizes live in contest.config.ts (contest.prizes, and a division's own `prizes` by entrants),
 * so this updates as registration does. Read-only.
 */
export default function PrizePlanPanel({ token }: { token: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/admin/prizes', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j) setPlan(j); })
      .catch(() => {});
    return () => { live = false; };
  }, [token]);

  if (!plan) return null;
  return (
    <section aria-label="Prize plan" className="border border-navy-border bg-navy p-4 mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <h2 className="font-display text-2xl text-white font-bold">Prizes</h2>
        <span className="text-sm text-gold font-bold">{plan.total} prizes ({plan.podium} podium + {plan.champions} {plan.champion_title})</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-navy-border text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="py-2 pr-3">Division</th>
              <th className="py-2 pr-3">Entered</th>
              <th className="py-2 pr-3">Podium</th>
              <th className="py-2 pr-3">{plan.champion_title}</th>
              <th className="py-2 pr-3">Prizes</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((r) => (
              <tr key={r.division} className="border-b border-navy-border">
                <td className="py-2 pr-3 text-white">{r.name}</td>
                <td className="py-2 pr-3 text-text-body">{r.entrants}</td>
                <td className="py-2 pr-3 text-text-body">{r.places === 0 ? 'none' : `top ${r.places}`}</td>
                <td className="py-2 pr-3 text-text-body">{r.champion ? 'yes' : 'no'}</td>
                <td className="py-2 pr-3 text-white font-bold">{r.prizes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-muted mt-2">
        Based on paid entries so far; it moves as registration does. The champion prize isn&rsquo;t awarded in a division with no eligible finisher, so the total is a maximum. Change the sizes in <code>contest.config.ts</code> (<code>contest.prizes</code>, or a division&rsquo;s own <code>prizes</code> by number entered).
      </p>
    </section>
  );
}
