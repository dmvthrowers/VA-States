'use client';

import { useCallback, useEffect, useState } from 'react';

interface Preview {
  entrants: number;
  spread: { min: number; max: number; mean: number; median: number } | null;
  cutAge: number | null;
  younger: number;
  older: number;
  shouldSplit: boolean;
  reason: 'few_entrants' | 'too_small' | 'ok';
  candidates: { cutAge: number; younger: number; older: number; gap: number }[];
}
interface DivisionSplit {
  division: string;
  name: string;
  labels: [string, string];
  rule: { above: number; min_bracket: number };
  by_age: Record<string, number>;
  preview: Preview;
}

const VERDICT: Record<Preview['reason'], (d: DivisionSplit) => string> = {
  few_entrants: (d) => `${d.rule.above} or fewer entered: one division.`,
  too_small: (d) => `A split would leave a bracket under ${d.rule.min_bracket} players: one division.`,
  ok: (d) => `Split into ${d.labels[0]} and ${d.labels[1]}.`,
};

/**
 * Admin: a read-only look at splitting a big division by age (site issue #81). Shows how many
 * entered, how old they are, what the rule says and the suggested cut, and lets you try another cut.
 * Nothing is saved or applied: the split itself isn't wired into run order and results yet.
 * Hidden for non-admins (the API refuses them) and when no division has a split rule.
 */
export default function SplitPreviewPanel({ token }: { token: string }) {
  const [rows, setRows] = useState<DivisionSplit[] | null>(null);
  const [tryCut, setTryCut] = useState<Record<string, string>>({});

  const load = useCallback(async (division?: string, cut?: string) => {
    const q = division ? `?division=${encodeURIComponent(division)}${cut ? `&cut_age=${encodeURIComponent(cut)}` : ''}` : '';
    const res = await fetch(`/api/admin/division-split${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { if (!division) setRows(null); return; }
    const json: { divisions: DivisionSplit[] } = await res.json();
    setRows((prev) => (division && prev ? prev.map((r) => json.divisions.find((d) => d.division === r.division) ?? r) : json.divisions));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (!rows || rows.length === 0) return null;

  return (
    <section aria-label="Age split preview" className="bg-navy border border-navy-border p-4 mb-6">
      <div className="text-xs font-black tracking-caps text-gold mb-3">AGE SPLIT PREVIEW</div>
      <p className="text-xs text-text-muted mb-3">
        Preview only. Nothing is applied: a split isn&rsquo;t wired into the run order or results yet.
      </p>
      <div className="grid gap-3">
        {rows.map((d) => {
          const p = d.preview;
          const ages = Object.keys(d.by_age).map(Number).sort((a, b) => a - b);
          return (
            <div key={d.division} className="border border-navy-border p-3">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-black text-white">{d.name}</span>
                <span className="text-xs text-text-muted">{p.entrants} entered</span>
                {p.spread && (
                  <span className="text-xs text-text-muted">
                    ages {p.spread.min}–{p.spread.max}, average {p.spread.mean}, median {p.spread.median}
                  </span>
                )}
              </div>
              <div className="text-sm text-text-body mt-1">
                <strong>{VERDICT[p.reason](d)}</strong>
                {p.cutAge !== null && (
                  <> {d.labels[0]}: age {p.cutAge} and under ({p.younger}). {d.labels[1]}: over {p.cutAge} ({p.older}).</>
                )}
              </div>
              {ages.length > 0 && (
                <div className="text-xs text-text-muted mt-2" aria-label="Players by age">
                  {ages.map((a) => `${a}: ${d.by_age[a]}`).join(' · ')}
                </div>
              )}
              <form
                className="mt-2 flex items-center gap-2 flex-wrap text-xs text-text-muted"
                onSubmit={(e) => { e.preventDefault(); load(d.division, tryCut[d.division]); }}
              >
                <label>
                  Try a different cut: age
                  <input
                    type="number" min={1} max={120} inputMode="numeric"
                    value={tryCut[d.division] ?? ''}
                    onChange={(e) => setTryCut((t) => ({ ...t, [d.division]: e.target.value }))}
                    className="ml-2 w-16 bg-navy-deep border border-navy-border text-text-body p-1"
                  />
                </label>
                <button type="submit" className="px-3 py-1 font-black tracking-caps border border-gold text-gold">Preview</button>
                <button type="button" onClick={() => { setTryCut((t) => ({ ...t, [d.division]: '' })); load(d.division); }} className="px-3 py-1 text-text-muted">Suggested</button>
              </form>
            </div>
          );
        })}
      </div>
    </section>
  );
}
