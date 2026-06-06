'use client';

import { useState, useEffect, useCallback } from 'react';

const DIVISIONS = ['1A', 'X', 'SBJ'] as const;
type Division = typeof DIVISIONS[number];
type TimePref = 'no_pref' | 'early' | 'late' | 'conflict' | null;

interface ScheduledRow {
  position: number;
  status: string;
  registration_id: string;
  display_name: string;
  city: string | null;
  state: string | null;
  performance_time_pref: TimePref;
  scheduling_notes: string | null;
  music_filename: string | null;
  paid: boolean;
}

interface UnscheduledRow {
  registration_id: string;
  display_name: string;
  city: string | null;
  state: string | null;
  performance_time_pref: TimePref;
  scheduling_notes: string | null;
  music_filename: string | null;
  paid: boolean;
}

interface AdminRunOrderData {
  division: Division;
  ordered: ScheduledRow[];
  unscheduled: UnscheduledRow[];
}

const PREF_LABELS: Record<string, string> = {
  no_pref: '',
  early: '↑ Early',
  late: '↓ Late',
  conflict: '⚠ Conflict',
};

const PREF_COLORS: Record<string, string> = {
  early: 'var(--gold)',
  late: 'var(--text-muted)',
  conflict: '#ff6b6b',
};

export default function AdminRunOrderPage() {
  const [division, setDivision] = useState<Division>('1A');
  const [data, setData] = useState<AdminRunOrderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [advanceMsg, setAdvanceMsg] = useState<string | null>(null);

  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  const fetchData = useCallback(async (div: Division) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/run-order?division=${div}`);
      if (res.ok) {
        const json: AdminRunOrderData = await res.json();
        setData(json);
        setOrderedIds(json.ordered.map((r) => r.registration_id));
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(division); }, [division, fetchData]);

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...orderedIds];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setOrderedIds(next);
  }

  function moveDown(idx: number) {
    if (idx === orderedIds.length - 1) return;
    const next = [...orderedIds];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setOrderedIds(next);
  }

  function removeFromOrder(id: string) {
    setOrderedIds(orderedIds.filter((x) => x !== id));
  }

  function addToOrder(id: string) {
    if (!orderedIds.includes(id)) setOrderedIds([...orderedIds, id]);
  }

  /** Auto-sort: no_pref/unset first (randomized within), early first, late last, conflict to back */
  function autoSort() {
    if (!data) return;
    const regMap = new Map<string, ScheduledRow | UnscheduledRow>();
    [...(data.ordered), ...(data.unscheduled)].forEach((r) => regMap.set(r.registration_id, r));

    const allIds = [...orderedIds, ...(data.unscheduled.filter((u) => u.paid).map((u) => u.registration_id))];
    const unique = [...new Set(allIds)];

    const bucket = (id: string): number => {
      const pref = regMap.get(id)?.performance_time_pref;
      if (pref === 'conflict') return 3;
      if (pref === 'late') return 2;
      if (pref === 'early') return 0;
      return 1; // no_pref
    };

    unique.sort((a, b) => {
      const diff = bucket(a) - bucket(b);
      if (diff !== 0) return diff;
      // Within same bucket, preserve existing relative order
      const ia = unique.indexOf(a);
      const ib = unique.indexOf(b);
      return ia - ib;
    });

    setOrderedIds(unique);
  }

  async function saveOrder() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/admin/run-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ division, registration_ids: orderedIds }),
      });
      const json = await res.json();
      if (res.ok) {
        setSaveMsg({ ok: true, text: `Saved ${json.count} competitors.` });
        fetchData(division);
      } else {
        setSaveMsg({ ok: false, text: json.error?.message ?? 'Save failed.' });
      }
    } catch {
      setSaveMsg({ ok: false, text: 'Network error.' });
    }
    setSaving(false);
  }

  async function handleAdvance() {
    setAdvancing(true);
    setAdvanceMsg(null);
    try {
      const res = await fetch('/api/admin/run-order/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ division }),
      });
      const json = await res.json();
      if (res.ok) {
        setAdvanceMsg(json.division_complete ? 'Division complete!' : `Now performing: ${json.now_performing ?? '—'}`);
        fetchData(division);
      } else {
        setAdvanceMsg(json.error?.message ?? 'Advance failed.');
      }
    } catch {
      setAdvanceMsg('Network error.');
    }
    setAdvancing(false);
  }

  async function handleReset() {
    if (!confirm(`Reset all statuses in ${division} to 'upcoming'?`)) return;
    await fetch('/api/admin/run-order/advance', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ division }),
    });
    fetchData(division);
  }

  const regMap = new Map<string, ScheduledRow | UnscheduledRow>();
  [...(data?.ordered ?? []), ...(data?.unscheduled ?? [])].forEach((r) => regMap.set(r.registration_id, r));

  const unscheduledPaid = (data?.unscheduled ?? []).filter((u) => u.paid && !orderedIds.includes(u.registration_id));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.5rem', margin: 0 }}>
          Run Order Builder
        </h1>
        <nav style={{ display: 'flex', gap: '0.5rem' }}>
          {DIVISIONS.map((div) => (
            <button
              key={div}
              onClick={() => { setDivision(div); setData(null); setSaveMsg(null); setAdvanceMsg(null); }}
              style={{
                background: division === div ? 'var(--gold)' : 'transparent',
                color: division === div ? 'var(--navy-deep)' : 'var(--text-body)',
                border: '1px solid',
                borderColor: division === div ? 'var(--gold)' : 'var(--navy-border)',
                padding: '0.4rem 1rem',
                fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.05em', cursor: 'pointer',
              }}
            >
              {div}
            </button>
          ))}
        </nav>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {!loading && data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '2rem', alignItems: 'start' }}>
          {/* Left: ordered list */}
          <div>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--text-muted)' }}>
                {orderedIds.length} in order
              </span>
              <button onClick={autoSort} style={{ background: 'transparent', border: '1px solid var(--navy-border)', color: 'var(--text-body)', padding: '0.3rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em' }}>
                Auto-sort by pref
              </button>
              <button onClick={saveOrder} disabled={saving} style={{ background: saving ? 'var(--navy-border)' : 'var(--gold)', color: saving ? 'var(--text-muted)' : 'var(--navy-deep)', border: 'none', padding: '0.4rem 1rem', fontSize: '0.8rem', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', letterSpacing: '0.05em' }}>
                {saving ? 'Saving…' : 'Save Order'}
              </button>
              {saveMsg && <span style={{ fontSize: '0.8rem', color: saveMsg.ok ? '#7fff7f' : '#ff6b6b', fontWeight: 700 }}>{saveMsg.text}</span>}
            </div>

            <div style={{ border: '1px solid var(--navy-border)', minHeight: 80 }}>
              {orderedIds.length === 0 && (
                <div style={{ padding: '1.5rem', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.85rem' }}>
                  No competitors in order. Add from the right panel or use Auto-sort.
                </div>
              )}
              {orderedIds.map((id, i) => {
                const reg = regMap.get(id);
                if (!reg) return null;
                const pref = reg.performance_time_pref;
                const currentStatus = data.ordered.find((r) => r.registration_id === id)?.status;
                return (
                  <div
                    key={id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.6rem 0.75rem',
                      borderBottom: i < orderedIds.length - 1 ? '1px solid var(--navy-border)' : 'none',
                      background: currentStatus === 'performing' ? '#1a1400' : currentStatus === 'done' ? 'transparent' : 'var(--navy)',
                      opacity: currentStatus === 'done' ? 0.5 : 1,
                    }}
                  >
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', width: '1.5rem', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>{reg.display_name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {[reg.city, reg.state].filter(Boolean).join(', ')}
                        {pref && pref !== 'no_pref' && (
                          <span style={{ marginLeft: '0.5rem', color: PREF_COLORS[pref] ?? 'var(--text-muted)', fontWeight: 700 }}>
                            {PREF_LABELS[pref]}
                          </span>
                        )}
                        {reg.scheduling_notes && (
                          <span style={{ marginLeft: '0.4rem', color: 'var(--text-muted)' }}>— {reg.scheduling_notes}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                      {currentStatus !== 'performing' && currentStatus !== 'done' && (
                        <>
                          <button onClick={() => moveUp(i)} disabled={i === 0} title="Move up" style={{ background: 'transparent', border: '1px solid var(--navy-border)', color: i === 0 ? 'var(--navy-border)' : 'var(--text-body)', width: 24, height: 24, cursor: i === 0 ? 'default' : 'pointer', fontSize: '0.7rem' }}>▲</button>
                          <button onClick={() => moveDown(i)} disabled={i === orderedIds.length - 1} title="Move down" style={{ background: 'transparent', border: '1px solid var(--navy-border)', color: i === orderedIds.length - 1 ? 'var(--navy-border)' : 'var(--text-body)', width: 24, height: 24, cursor: i === orderedIds.length - 1 ? 'default' : 'pointer', fontSize: '0.7rem' }}>▼</button>
                          <button onClick={() => removeFromOrder(id)} title="Remove" style={{ background: 'transparent', border: '1px solid var(--navy-border)', color: '#ff6b6b', width: 24, height: 24, cursor: 'pointer', fontSize: '0.7rem' }}>✕</button>
                        </>
                      )}
                      {currentStatus === 'performing' && <span style={{ fontSize: '0.65rem', color: 'var(--gold)', fontWeight: 800 }}>▶ NOW</span>}
                      {currentStatus === 'done' && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Advance controls */}
            <div style={{ marginTop: '1.5rem', background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '0.6rem', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--text-muted)' }}>DAY-OF CONTROLS</div>
              <button
                onClick={handleAdvance}
                disabled={advancing}
                style={{ background: advancing ? 'var(--navy-border)' : 'var(--red)', color: '#fff', border: 'none', padding: '0.5rem 1.25rem', fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.08em', cursor: advancing ? 'not-allowed' : 'pointer' }}
              >
                {advancing ? 'Working…' : '▶ ADVANCE'}
              </button>
              <button
                onClick={handleReset}
                style={{ background: 'transparent', border: '1px solid var(--navy-border)', color: 'var(--text-muted)', padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}
              >
                Reset
              </button>
              {advanceMsg && <span style={{ fontSize: '0.8rem', color: 'var(--text-body)', fontWeight: 700 }}>{advanceMsg}</span>}
            </div>
          </div>

          {/* Right: unscheduled */}
          <aside>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              UNSCHEDULED ({unscheduledPaid.length})
            </div>
            <div style={{ border: '1px solid var(--navy-border)', maxHeight: 500, overflowY: 'auto' }}>
              {unscheduledPaid.length === 0 ? (
                <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>All paid competitors scheduled.</div>
              ) : (
                unscheduledPaid.map((u, i) => (
                  <div
                    key={u.registration_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.6rem 0.75rem',
                      borderBottom: i < unscheduledPaid.length - 1 ? '1px solid var(--navy-border)' : 'none',
                      background: 'var(--navy)',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.85rem' }}>{u.display_name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {u.performance_time_pref && u.performance_time_pref !== 'no_pref' && (
                          <span style={{ color: PREF_COLORS[u.performance_time_pref] ?? 'var(--text-muted)', fontWeight: 700, marginRight: '0.4rem' }}>
                            {PREF_LABELS[u.performance_time_pref]}
                          </span>
                        )}
                        {u.scheduling_notes && <span>{u.scheduling_notes}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => addToOrder(u.registration_id)}
                      title="Add to order"
                      style={{ background: 'transparent', border: '1px solid var(--navy-border)', color: 'var(--gold)', width: 24, height: 24, cursor: 'pointer', fontSize: '0.7rem', flexShrink: 0 }}
                    >
                      +
                    </button>
                  </div>
                ))
              )}
            </div>
            {(data.unscheduled ?? []).filter((u) => !u.paid).length > 0 && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {(data.unscheduled ?? []).filter((u) => !u.paid).length} unpaid registrant(s) hidden.
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
