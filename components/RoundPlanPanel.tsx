'use client';

import { useCallback, useEffect, useState } from 'react';
import { notifyRoundPlansChanged } from '@/lib/use-round-plans';

interface PlanRound { round: number; key: string; advance: number | null }
interface Plan { entrants: number; tier: number; rounds: PlanRound[]; confirmed_at?: string; confirmed_by?: string | null }
interface DivisionPlan {
  division: string;
  name: string;
  round_names: string[];
  rules: string[];
  entrants: number;
  suggested: Plan | null;
  confirmed: Plan | null;
  stale: boolean;
}

const describe = (p: Plan, names: string[]) =>
  p.rounds.map((r) => `${names[r.round - 1] ?? r.key}${r.advance ? ` (top ${r.advance} advance)` : ''}`).join(' → ');

/**
 * Admin: which rounds each division runs. Shows how many entered, the plan the rules suggest and
 * the one confirmed so far. Nothing changes for a division until an organizer confirms it here.
 * Hidden for staff who aren't admins (the API refuses them) and for contests without round plans.
 */
export default function RoundPlanPanel({ token }: { token: string }) {
  const [rows, setRows] = useState<DivisionPlan[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/rounds/plan', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { setRows(null); return; }
    setRows((await res.json()).divisions);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function confirm(division: string, tier?: number) {
    setBusy(division);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/rounds/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ division, tier }),
      });
      const json = await res.json();
      setMsg(res.ok ? { ok: true, text: `${division} round plan confirmed.` } : { ok: false, text: json.error?.message ?? 'Could not confirm the plan.' });
      if (res.ok) { await load(); notifyRoundPlansChanged(); }
    } catch {
      setMsg({ ok: false, text: 'Network error.' });
    }
    setBusy(null);
  }

  if (!rows || rows.length === 0) return null;

  return (
    <section aria-label="Round plans" className="bg-navy border border-navy-border p-4 mb-6">
      <div className="text-xs font-black tracking-caps text-gold mb-3">ROUND PLANS</div>
      <p className="text-xs text-text-muted mb-3">
        How many rounds a division runs depends on how many entered. Confirm each plan once registration closes; until you do, every round counts.
      </p>
      <div className="grid gap-3">
        {rows.map((d) => (
          <div key={d.division} className="border border-navy-border p-3">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="font-black text-white">{d.name}</span>
              <span className="text-xs text-text-muted">{d.entrants} entered</span>
              {d.confirmed && !d.stale && <span className="text-xs font-bold text-[#7fff7f]">CONFIRMED</span>}
              {d.stale && <span className="text-xs font-bold text-[#ff6b6b]">ENTRANT COUNT CHANGED SINCE CONFIRMING</span>}
            </div>
            <ul className="text-xs text-text-muted mt-1 pl-4 list-disc">{d.rules.map((r) => <li key={r}>{r}</li>)}</ul>
            <div className="text-sm text-text-body mt-2">
              {d.confirmed ? <>Running: <strong>{describe(d.confirmed, d.round_names)}</strong> (confirmed for {d.confirmed.entrants} entrants{d.confirmed.confirmed_by ? ` by ${d.confirmed.confirmed_by}` : ''})</> : <>Suggested: <strong>{d.suggested ? describe(d.suggested, d.round_names) : 'none'}</strong></>}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-text-muted flex-wrap">
              Override with a different tier
              <select
                aria-label={`Use a different plan for ${d.name}`}
                defaultValue=""
                disabled={busy === d.division}
                onChange={(e) => { const v = e.target.value; e.target.value = ''; if (v !== '' && window.confirm(`Run ${d.name} as: ${d.rules[Number(v)]}`)) confirm(d.division, Number(v)); }}
                className="bg-navy-deep border border-navy-border text-text-body p-1"
              >
                <option value="">Choose…</option>
                {d.rules.map((r, i) => <option key={r} value={i}>{r}</option>)}
              </select>
            </label>
            {(!d.confirmed || d.stale) && d.suggested && (
              <button
                type="button"
                disabled={busy === d.division}
                onClick={() => confirm(d.division)}
                className={`mt-2 px-4 py-2 font-black text-xs tracking-caps ${busy === d.division ? 'bg-navy-border text-text-muted' : 'bg-gold text-navy-deep'}`}
              >
                {busy === d.division ? 'Working…' : `Confirm: ${describe(d.suggested, d.round_names)}`}
              </button>
            )}
          </div>
        ))}
      </div>
      {msg && <p role="status" className={`mt-3 text-sm font-bold ${msg.ok ? 'text-[#7fff7f]' : 'text-[#ff6b6b]'}`}>{msg.text}</p>}
    </section>
  );
}
