'use client';

import { useCallback, useEffect, useState } from 'react';

interface Contact {
  id: string;
  audience: 'sponsor' | 'vendor';
  org: string;
  first_name: string;
  email: string;
  cc: string[];
}

const EMPTY = { audience: 'sponsor' as Contact['audience'], org: '', first_name: '', email: '', cc: '' };

/**
 * Sponsor and vendor contacts the survey invite and reminder emails go to.
 * Lives in the database (vsyc26_survey_contacts), not the repo, because the
 * repo is public. `onChange` lets the invite list refresh its counts.
 */
export default function SurveyContacts({ token, onChange }: { token: string; onChange: () => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/surveys/contacts', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setContacts(((await res.json()) as { contacts: Contact[] }).contacts);
    else setMsg('Could not load contacts.');
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/surveys/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          audience: form.audience,
          org: form.org,
          first_name: form.first_name,
          email: form.email,
          cc: form.cc.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error?.message ?? 'Could not add contact.');
      } else {
        setForm({ ...EMPTY, audience: form.audience });
        await load();
        onChange();
      }
    } catch {
      setMsg('Network error adding contact.');
    }
    setBusy(false);
  };

  const remove = async (c: Contact) => {
    if (!window.confirm(`Remove ${c.org} (${c.email}) from the ${c.audience} list?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/surveys/contacts?id=${encodeURIComponent(c.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) setMsg(((await res.json()) as { error?: { message?: string } }).error?.message ?? 'Could not remove contact.');
      await load();
      onChange();
    } catch {
      setMsg('Network error removing contact.');
    }
    setBusy(false);
  };

  const input = 'bg-navy-deep border border-navy-border px-2 py-1 text-xs text-white';

  return (
    <details className="mt-3 border-t border-navy-border pt-3">
      <summary className="cursor-pointer text-xs font-black tracking-caps text-gold">
        SPONSOR &amp; VENDOR CONTACTS · {contacts.length}
      </summary>
      <ul className="mt-2 space-y-1 text-xs text-text-body">
        {contacts.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="text-text-muted">{c.audience === 'sponsor' ? 'Sponsor' : 'Vendor'} · </span>
              {c.org} · {c.first_name} &lt;{c.email}&gt;
              {c.cc.length > 0 && <span className="text-text-muted"> · cc {c.cc.join(', ')}</span>}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(c)}
              className="text-text-muted hover:text-white disabled:opacity-40"
              aria-label={`Remove ${c.org}`}
            >
              REMOVE
            </button>
          </li>
        ))}
        {!contacts.length && <li className="text-text-muted">No sponsor or vendor contacts yet.</li>}
      </ul>
      <form onSubmit={(e) => void add(e)} className="mt-3 flex flex-wrap gap-2">
        <select
          value={form.audience}
          onChange={(e) => setForm({ ...form, audience: e.target.value as Contact['audience'] })}
          className={input}
          aria-label="Audience"
        >
          <option value="sponsor">Sponsor</option>
          <option value="vendor">Vendor</option>
        </select>
        <input required placeholder="Organization" value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })} className={input} aria-label="Organization" />
        <input required placeholder="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={input} aria-label="First name" />
        <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} aria-label="Email" />
        <input placeholder="Cc (comma-separated)" value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} className={input} aria-label="Cc" />
        <button type="submit" disabled={busy} className="border border-gold px-3 py-1 text-xs font-black tracking-caps text-gold hover:bg-gold hover:text-navy-deep disabled:opacity-40">
          ADD
        </button>
      </form>
      {msg && <p className="mt-2 text-xs text-gold">{msg}</p>}
      <p className="mt-2 text-xs text-text-muted">
        Invites to these contacts went out by hand from the contest Gmail on Sept 24, so the rows above show them as sent.
        Use REMIND for the follow-up. Anyone on cc gets the same email.
      </p>
    </details>
  );
}
