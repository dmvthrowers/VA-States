'use client';

import { useCallback, useEffect, useState } from 'react';
import BracketStaffGate from '@/components/BracketStaffGate';
import { MODULES, MODULE_STATUSES, type ModuleDef, type ModuleId } from '@/lib/modules';

interface Item {
  id: string;
  title: string;
  body: string | null;
  status: string;
  position: number;
  qty: number | null;
  link: string | null;
}

const field: React.CSSProperties = { background: '#0d1428', color: '#fff', border: '1px solid var(--navy-border)', padding: '0.4rem', fontSize: '0.85rem' };
const btn = (gold = false): React.CSSProperties => ({
  background: gold ? 'var(--gold)' : 'transparent', color: gold ? 'var(--navy-deep)' : '#fff',
  border: `1px solid ${gold ? 'var(--gold)' : 'var(--navy-border)'}`, padding: '0.4rem 0.8rem',
  fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
});

function Sheet({ module, token }: { module: ModuleId; token: string }) {
  const def: ModuleDef = MODULES[module];
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/modules/${module}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) { setMsg({ ok: false, text: 'Could not load the list. Reload and try again.' }); return; }
    setItems(((await res.json()) as { items: Item[] }).items);
  }, [module, token]);
  useEffect(() => { load(); }, [load]);

  async function send(method: 'POST' | 'PATCH' | 'DELETE', id: string | null, body?: unknown) {
    setMsg(null);
    const res = await fetch(id ? `/api/staff/modules/${module}/${id}` : `/api/staff/modules/${module}`, { method, headers: auth, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      const j = await res.json().catch(() => null) as { error?: { message?: string } } | null;
      setMsg({ ok: false, text: j?.error?.message ?? 'That did not save. Try again.' });
      return false;
    }
    await load();
    return true;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await send('POST', null, { title })) setTitle('');
  }

  return (
    <div>
      <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', margin: '0 0 0.25rem' }}>{def.label}</h1>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 1rem', fontSize: '0.85rem' }}>{def.blurb}</p>
      <p role="status" aria-live="polite" style={{ margin: '0 0 1rem', fontSize: '0.85rem', minHeight: '1.2rem', color: msg ? (msg.ok ? 'var(--gold-light)' : '#ff6b6b') : 'transparent' }}>{msg?.text ?? ''}</p>

      <form onSubmit={add} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <label htmlFor="new-item" style={{ position: 'absolute', left: '-9999px' }}>New {def.item.toLowerCase()}</label>
        <input id="new-item" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`New ${def.item.toLowerCase()}`} required maxLength={160} style={{ ...field, minWidth: 280 }} />
        <button type="submit" style={btn(true)}>Add</button>
      </form>

      {items.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Nothing here yet.</p>}

      <div style={{ display: 'grid', gap: '0.6rem' }}>
        {items.map((it) => (
          <section key={it.id} style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '0.8rem 1rem', opacity: it.status === 'done' ? 0.65 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              <strong style={{ color: '#fff', textDecoration: it.status === 'done' ? 'line-through' : 'none' }}>{it.title}</strong>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {def.useQty && (
                  <>
                    <label htmlFor={`q-${it.id}`} style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Left</label>
                    <input
                      id={`q-${it.id}`} type="number" min={0} defaultValue={it.qty ?? 0} style={{ ...field, width: 80 }}
                      onBlur={(e) => { const n = Math.floor(Number(e.target.value)); if (Number.isFinite(n) && n >= 0 && n !== it.qty) send('PATCH', it.id, { qty: n }); }}
                    />
                  </>
                )}
                <label htmlFor={`s-${it.id}`} style={{ position: 'absolute', left: '-9999px' }}>Status of {it.title}</label>
                <select id={`s-${it.id}`} value={it.status} onChange={(e) => send('PATCH', it.id, { status: e.target.value })} style={field}>
                  {MODULE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button type="button" style={btn()} onClick={() => { const b = window.prompt('Notes', it.body ?? ''); if (b !== null) send('PATCH', it.id, { body: b }); }}>Notes</button>
                {def.useLink && (
                  <button type="button" style={btn()} onClick={() => { const l = window.prompt('Link to the files (https://…)', it.link ?? ''); if (l !== null) send('PATCH', it.id, { link: l }); }}>Link</button>
                )}
                <button type="button" style={btn()} onClick={() => { if (window.confirm(`Delete "${it.title}"?`)) send('DELETE', it.id); }}>Delete</button>
              </div>
            </div>
            {it.body && <p style={{ color: 'var(--text-body)', fontSize: '0.85rem', margin: '0.5rem 0 0', whiteSpace: 'pre-wrap' }}>{it.body}</p>}
            {it.link && <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem' }}><a href={it.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-light)' }}>Open files ↗</a></p>}
          </section>
        ))}
      </div>
    </div>
  );
}

/** One run-sheet page: staff sign-in, then the list. `roles` also lets admin and the module's own role in. */
export default function ModuleBoard({ module, roles }: { module: ModuleId; roles: string[] }) {
  return (
    <BracketStaffGate title={MODULES[module].label} roles={roles} landmark={false}>
      {({ token }) => <Sheet module={module} token={token} />}
    </BracketStaffGate>
  );
}
