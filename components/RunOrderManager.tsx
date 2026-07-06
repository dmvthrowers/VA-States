'use client';

import { useCallback, useEffect, useState } from 'react';

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

/**
 * Shared drag-and-drop run order editor. Used inside the admin dashboard
 * (full "admin" role) and the DJ/audio portal (dj + audio_tech roles) —
 * both call the same bearer-token-authenticated /api/admin/run-order APIs,
 * which accept admin, dj, and audio_tech roles.
 */
export default function RunOrderManager({ token }: { token: string }) {
  const [division, setDivision] = useState<Division>('1A');
  const [data, setData] = useState<AdminRunOrderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [advanceMsg, setAdvanceMsg] = useState<string | null>(null);

  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [uploadStatus, setUploadStatus] = useState<Record<string, 'uploading' | 'done' | 'error'>>({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const fetchData = useCallback(async (div: Division) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/run-order?division=${div}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json: AdminRunOrderData = await res.json();
        setData(json);
        setOrderedIds(json.ordered.map((r) => r.registration_id));
      }
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchData(division); }, [division, fetchData]);

  function isLocked(id: string): boolean {
    const currentStatus = data?.ordered.find((r) => r.registration_id === id)?.status;
    return currentStatus === 'performing' || currentStatus === 'done';
  }

  function moveTo(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    const id = orderedIds[fromIdx];
    if (isLocked(id)) return;
    const next = [...orderedIds];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, id);
    setOrderedIds(next);
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    moveTo(idx, idx - 1);
  }

  function moveDown(idx: number) {
    if (idx === orderedIds.length - 1) return;
    moveTo(idx, idx + 1);
  }

  function removeFromOrder(id: string) {
    setOrderedIds(orderedIds.filter((x) => x !== id));
  }

  function addToOrder(id: string) {
    if (!orderedIds.includes(id)) setOrderedIds([...orderedIds, id]);
  }

  function handleDragStart(idx: number) {
    if (isLocked(orderedIds[idx])) return;
    setDragIndex(idx);
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIndex === null || isLocked(orderedIds[idx])) return;
    setDragOverIndex(idx);
  }

  function handleDrop(idx: number) {
    if (dragIndex === null) return;
    moveTo(dragIndex, idx);
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ division }),
    });
    fetchData(division);
  }

  async function handleMusicUpload(registration_id: string, file: File) {
    setUploadStatus((s) => ({ ...s, [registration_id]: 'uploading' }));
    try {
      const res = await fetch('/api/admin/music-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ registration_id, filename: file.name }),
      });
      if (!res.ok) { setUploadStatus((s) => ({ ...s, [registration_id]: 'error' })); return; }
      const { upload_url } = await res.json() as { upload_url: string };
      const up = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'audio/mpeg' },
        body: file,
      });
      if (!up.ok) { setUploadStatus((s) => ({ ...s, [registration_id]: 'error' })); return; }
      setUploadStatus((s) => ({ ...s, [registration_id]: 'done' }));
      fetchData(division);
    } catch {
      setUploadStatus((s) => ({ ...s, [registration_id]: 'error' }));
    }
  }

  const regMap = new Map<string, ScheduledRow | UnscheduledRow>();
  [...(data?.ordered ?? []), ...(data?.unscheduled ?? [])].forEach((r) => regMap.set(r.registration_id, r));

  const unscheduledPaid = (data?.unscheduled ?? []).filter((u) => u.paid && !orderedIds.includes(u.registration_id));

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h2 className="font-display text-2xl text-gold font-bold m-0">Run Order</h2>
        <nav className="flex gap-2">
          {DIVISIONS.map((div) => (
            <button
              key={div}
              type="button"
              onClick={() => { setDivision(div); setData(null); setSaveMsg(null); setAdvanceMsg(null); }}
              className={`px-4 py-1.5 text-xs font-black tracking-caps border ${
                division === div ? 'bg-gold text-navy-deep border-gold' : 'bg-transparent text-text-body border-navy-border'
              }`}
            >
              {div}
            </button>
          ))}
        </nav>
      </div>

      {loading && <p className="text-text-muted">Loading…</p>}

      {!loading && data && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8 items-start">
          {/* Left: ordered list */}
          <div>
            <div className="flex gap-3 mb-4 flex-wrap items-center">
              <span className="text-xs font-black tracking-caps text-text-muted">
                {orderedIds.length} in order — drag ⠿ to reorder
              </span>
              <button type="button" onClick={autoSort} className="border border-navy-border text-text-body px-3 py-1.5 text-xs font-bold tracking-caps">
                Auto-sort by pref
              </button>
              <button
                type="button"
                onClick={saveOrder}
                disabled={saving}
                className={`px-4 py-1.5 text-xs font-black tracking-caps ${saving ? 'bg-navy-border text-text-muted' : 'bg-gold text-navy-deep'}`}
              >
                {saving ? 'Saving…' : 'Save Order'}
              </button>
              {saveMsg && <span className={`text-sm font-bold ${saveMsg.ok ? 'text-[#7fff7f]' : 'text-[#ff6b6b]'}`}>{saveMsg.text}</span>}
            </div>

            <div className="border border-navy-border min-h-[80px]">
              {orderedIds.length === 0 && (
                <div className="p-6 text-text-muted text-center text-sm">
                  No competitors in order. Add from the right panel or use Auto-sort.
                </div>
              )}
              {orderedIds.map((id, i) => {
                const reg = regMap.get(id);
                if (!reg) return null;
                const pref = reg.performance_time_pref;
                const currentStatus = data.ordered.find((r) => r.registration_id === id)?.status;
                const locked = currentStatus === 'performing' || currentStatus === 'done';
                const isDragTarget = dragOverIndex === i && dragIndex !== null && dragIndex !== i;

                return (
                  <div
                    key={id}
                    draggable={!locked}
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 px-3 py-2.5 border-b border-navy-border last:border-b-0 ${
                      currentStatus === 'performing' ? 'bg-[#1a1400]' : currentStatus === 'done' ? 'bg-transparent opacity-50' : 'bg-navy'
                    } ${isDragTarget ? 'outline outline-2 outline-gold -outline-offset-2' : ''}`}
                  >
                    <span
                      className={`text-lg select-none flex-shrink-0 w-5 text-center ${locked ? 'text-navy-border cursor-not-allowed' : 'text-text-muted cursor-grab active:cursor-grabbing'}`}
                      title={locked ? 'Locked — already performing/done' : 'Drag to reorder'}
                    >
                      ⠿
                    </span>
                    <span className="text-xs text-text-muted w-6 text-right flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white text-sm">{reg.display_name}</div>
                      <div className="text-xs text-text-muted">
                        {[reg.city, reg.state].filter(Boolean).join(', ')}
                        {pref && pref !== 'no_pref' && (
                          <span className="ml-2 font-bold" style={{ color: PREF_COLORS[pref] ?? 'var(--text-muted)' }}>
                            {PREF_LABELS[pref]}
                          </span>
                        )}
                        {reg.scheduling_notes && <span className="ml-1.5 text-text-muted">— {reg.scheduling_notes}</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        {uploadStatus[id] === 'uploading' ? (
                          <span className="text-[0.6rem] text-gold">uploading…</span>
                        ) : uploadStatus[id] === 'done' ? (
                          <span className="text-[0.6rem] text-[#7fff7f]">uploaded OK</span>
                        ) : uploadStatus[id] === 'error' ? (
                          <span className="text-[0.6rem] text-[#ff6b6b]">upload failed</span>
                        ) : reg.music_filename ? (
                          <span className="text-[0.6rem] text-[#7fff7f]">&#9834; {reg.music_filename}</span>
                        ) : (
                          <span className="text-[0.6rem] text-text-muted">no music</span>
                        )}
                        <label className="cursor-pointer inline-block" title="Upload music">
                          <span className="text-[0.55rem] text-gold font-black px-1 border border-gold tracking-caps">
                            {uploadStatus[id] === 'uploading' ? '...' : 'UP'}
                          </span>
                          <input
                            type="file"
                            accept="audio/*,.mp3,.wav,.flac,.aiff,.m4a,.ogg"
                            className="hidden"
                            disabled={uploadStatus[id] === 'uploading'}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMusicUpload(id, f); e.target.value = ''; }}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {!locked && (
                        <>
                          <button type="button" onClick={() => moveUp(i)} disabled={i === 0} title="Move up" className={`border border-navy-border w-6 h-6 text-xs ${i === 0 ? 'text-navy-border' : 'text-text-body'}`}>▲</button>
                          <button type="button" onClick={() => moveDown(i)} disabled={i === orderedIds.length - 1} title="Move down" className={`border border-navy-border w-6 h-6 text-xs ${i === orderedIds.length - 1 ? 'text-navy-border' : 'text-text-body'}`}>▼</button>
                          <button type="button" onClick={() => removeFromOrder(id)} title="Remove" className="border border-navy-border w-6 h-6 text-xs text-[#ff6b6b]">✕</button>
                        </>
                      )}
                      {currentStatus === 'performing' && <span className="text-xs font-black text-gold">▶ NOW</span>}
                      {currentStatus === 'done' && <span className="text-xs text-text-muted">✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Advance controls */}
            <div className="mt-6 bg-navy border border-navy-border p-4 flex gap-3 items-center flex-wrap">
              <div className="text-xs font-black tracking-caps text-text-muted">DAY-OF CONTROLS</div>
              <button
                type="button"
                onClick={handleAdvance}
                disabled={advancing}
                className={`px-5 py-2 font-black text-xs tracking-caps text-white ${advancing ? 'bg-navy-border' : 'bg-red'}`}
              >
                {advancing ? 'Working…' : '▶ ADVANCE / SKIP'}
              </button>
              <button type="button" onClick={handleReset} className="border border-navy-border text-text-muted px-4 py-2 font-bold text-xs">
                Reset
              </button>
              {advanceMsg && <span className="text-sm text-text-body font-bold">{advanceMsg}</span>}
            </div>
          </div>

          {/* Right: unscheduled */}
          <aside>
            <div className="text-xs font-black tracking-caps text-text-muted mb-3">
              UNSCHEDULED ({unscheduledPaid.length})
            </div>
            <div className="border border-navy-border max-h-[500px] overflow-y-auto">
              {unscheduledPaid.length === 0 ? (
                <div className="p-4 text-text-muted text-sm">All paid competitors scheduled.</div>
              ) : (
                unscheduledPaid.map((u) => (
                  <div key={u.registration_id} className="flex items-center gap-2 px-3 py-2.5 border-b border-navy-border last:border-b-0 bg-navy">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white text-sm">{u.display_name}</div>
                      <div className="text-xs text-text-muted">
                        {u.performance_time_pref && u.performance_time_pref !== 'no_pref' && (
                          <span className="mr-1.5 font-bold" style={{ color: PREF_COLORS[u.performance_time_pref] ?? 'var(--text-muted)' }}>
                            {PREF_LABELS[u.performance_time_pref]}
                          </span>
                        )}
                        {u.scheduling_notes && <span>{u.scheduling_notes}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addToOrder(u.registration_id)}
                      title="Add to order"
                      className="border border-navy-border text-gold w-6 h-6 text-xs flex-shrink-0"
                    >
                      +
                    </button>
                  </div>
                ))
              )}
            </div>
            {(data.unscheduled ?? []).filter((u) => !u.paid).length > 0 && (
              <div className="mt-3 text-xs text-text-muted">
                {(data.unscheduled ?? []).filter((u) => !u.paid).length} unpaid registrant(s) hidden.
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
