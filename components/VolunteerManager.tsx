'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { VOLUNTEER_STATUSES, SHIFT_PREFERENCE_LABELS, type ShiftPreference, type VolunteerStatus } from '@/lib/volunteer-roles';

interface VolunteerRow {
  id: string;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  pronouns: string | null;
  is_18_or_older: boolean;
  parent_guardian_name: string | null;
  parent_guardian_email: string | null;
  parent_guardian_phone: string | null;
  role_choice_1: string;
  role_choice_2: string | null;
  shift_preference: ShiftPreference;
  experience_notes: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  photo_video_consent: boolean;
  status: VolunteerStatus;
  assigned_role: string | null;
  is_paid_role: boolean;
  honorarium_cents: number | null;
  admin_notes: string | null;
}

interface RoleRow {
  role_key: string;
  label: string;
  category: 'core' | 'judge' | 'non_core';
}

const STATUS_COLORS: Record<VolunteerStatus, string> = {
  pending: 'text-text-muted border-navy-border',
  confirmed: 'text-[#7fff7f] border-[#2a7a4a]',
  waitlisted: 'text-gold border-gold/50',
  declined: 'text-[#ff6b6b] border-[#7a2a2a]',
  withdrawn: 'text-text-muted border-navy-border',
};

export default function VolunteerManager({ token }: { token: string }) {
  const [volunteers, setVolunteers] = useState<VolunteerRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<VolunteerStatus | 'all'>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/volunteers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json: { volunteers: VolunteerRow[]; roles: RoleRow[] } = await res.json();
        setVolunteers(json.volunteers);
        setRoles(json.roles);
      }
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const roleLabel = (key: string | null) => roles.find((r) => r.role_key === key)?.label ?? key ?? '—';

  const filtered = useMemo(() => {
    return volunteers.filter((v) => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (roleFilter !== 'all') {
        const matches = v.role_choice_1 === roleFilter || v.role_choice_2 === roleFilter || v.assigned_role === roleFilter;
        if (!matches) return false;
      }
      return true;
    });
  }, [volunteers, statusFilter, roleFilter]);

  const stats = useMemo(() => ({
    total: volunteers.length,
    pending: volunteers.filter((v) => v.status === 'pending').length,
    confirmed: volunteers.filter((v) => v.status === 'confirmed').length,
  }), [volunteers]);

  async function saveVolunteer(id: string, patch: Partial<Pick<VolunteerRow, 'status' | 'assigned_role' | 'is_paid_role' | 'honorarium_cents' | 'admin_notes'>>) {
    setSavingId(id);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/admin/volunteers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (res.ok) {
        setVolunteers((prev) => prev.map((v) => (v.id === id ? { ...v, ...json.volunteer } : v)));
        setSaveMsg({ id, ok: true, text: 'Saved.' });
      } else {
        setSaveMsg({ id, ok: false, text: json.error?.message ?? 'Save failed.' });
      }
    } catch {
      setSaveMsg({ id, ok: false, text: 'Network error.' });
    }
    setSavingId(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h2 className="font-display text-2xl text-gold font-bold m-0">Volunteers</h2>
        <div className="flex gap-3 text-xs text-text-muted">
          <span><strong className="text-white">{stats.total}</strong> total</span>
          <span><strong className="text-gold">{stats.pending}</strong> pending</span>
          <span><strong className="text-[#7fff7f]">{stats.confirmed}</strong> confirmed</span>
        </div>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as VolunteerStatus | 'all')}
          className="bg-navy border border-navy-border text-white px-3 py-1.5 text-xs"
        >
          <option value="all">All statuses</option>
          {VOLUNTEER_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-navy border border-navy-border text-white px-3 py-1.5 text-xs"
        >
          <option value="all">All roles</option>
          {roles.map((r) => (
            <option key={r.role_key} value={r.role_key}>{r.label}</option>
          ))}
        </select>
        <button type="button" onClick={fetchData} className="border border-navy-border px-3 py-1.5 text-xs text-text-body hover:text-white">
          Refresh
        </button>
      </div>

      {loading && <p className="text-text-muted">Loading…</p>}

      {!loading && filtered.length === 0 && (
        <p className="text-text-muted text-sm">No volunteers match this filter.</p>
      )}

      <div className="border border-navy-border">
        {filtered.map((v) => {
          const expanded = expandedId === v.id;
          const msg = saveMsg?.id === v.id ? saveMsg : null;
          return (
            <div key={v.id} className="border-b border-navy-border last:border-b-0 bg-navy">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : v.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <span className={`text-[0.6rem] font-black tracking-caps px-2 py-0.5 border flex-shrink-0 ${STATUS_COLORS[v.status]}`}>
                  {v.status}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white text-sm">
                    {v.first_name} {v.last_name}
                    {!v.is_18_or_older && <span className="ml-2 text-[0.6rem] text-gold font-black">MINOR</span>}
                  </div>
                  <div className="text-xs text-text-muted">
                    {roleLabel(v.role_choice_1)}{v.role_choice_2 ? ` / ${roleLabel(v.role_choice_2)}` : ''}
                    {v.assigned_role && <span className="ml-2 text-gold-light">→ assigned: {roleLabel(v.assigned_role)}</span>}
                  </div>
                </div>
                <span className="text-xs text-text-muted flex-shrink-0">{expanded ? '▲' : '▾'}</span>
              </button>

              {expanded && (
                <div className="px-4 pb-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-text-body">
                    <div><strong className="text-white">Email:</strong> <a href={`mailto:${v.email}`} className="text-gold-light">{v.email}</a></div>
                    <div><strong className="text-white">Phone:</strong> <a href={`tel:${v.phone}`} className="text-gold-light">{v.phone}</a></div>
                    {v.pronouns && <div><strong className="text-white">Pronouns:</strong> {v.pronouns}</div>}
                    <div><strong className="text-white">Shift pref:</strong> {SHIFT_PREFERENCE_LABELS[v.shift_preference]}</div>
                    {!v.is_18_or_older && (
                      <>
                        <div><strong className="text-white">Guardian:</strong> {v.parent_guardian_name}</div>
                        <div><strong className="text-white">Guardian phone:</strong> {v.parent_guardian_phone}</div>
                        {v.parent_guardian_email && <div><strong className="text-white">Guardian email:</strong> {v.parent_guardian_email}</div>}
                      </>
                    )}
                    {v.emergency_contact_name && (
                      <div><strong className="text-white">Emergency contact:</strong> {v.emergency_contact_name} {v.emergency_contact_phone && `(${v.emergency_contact_phone})`}</div>
                    )}
                    <div><strong className="text-white">OK in photos/video:</strong> {v.photo_video_consent ? 'Yes' : 'No'}</div>
                  </div>

                  {v.experience_notes && (
                    <div className="text-xs text-text-body">
                      <strong className="text-white">Experience:</strong> {v.experience_notes}
                    </div>
                  )}

                  <div className="border-t border-navy-border pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block text-[0.65rem] font-black tracking-caps text-gold mb-1">Status</span>
                      <select
                        value={v.status}
                        onChange={(e) => saveVolunteer(v.id, { status: e.target.value as VolunteerStatus })}
                        className="w-full bg-navy-deep border border-navy-border text-white px-2 py-1.5 text-xs"
                      >
                        {VOLUNTEER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>

                    <label className="block">
                      <span className="block text-[0.65rem] font-black tracking-caps text-gold mb-1">Assigned role</span>
                      <select
                        value={v.assigned_role ?? ''}
                        onChange={(e) => saveVolunteer(v.id, { assigned_role: e.target.value || null })}
                        className="w-full bg-navy-deep border border-navy-border text-white px-2 py-1.5 text-xs"
                      >
                        <option value="">— Not assigned —</option>
                        {roles.map((r) => <option key={r.role_key} value={r.role_key}>{r.label}</option>)}
                      </select>
                    </label>

                    <label className="flex items-center gap-2 mt-2">
                      <input
                        type="checkbox"
                        checked={v.is_paid_role}
                        onChange={(e) => saveVolunteer(v.id, { is_paid_role: e.target.checked })}
                        className="w-4 h-4 accent-gold"
                      />
                      <span className="text-xs text-text-body">Paid role</span>
                    </label>

                    {v.is_paid_role && (
                      <label className="block">
                        <span className="block text-[0.65rem] font-black tracking-caps text-gold mb-1">Honorarium ($)</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          defaultValue={v.honorarium_cents != null ? (v.honorarium_cents / 100).toFixed(2) : ''}
                          onBlur={(e) => {
                            const dollars = parseFloat(e.target.value);
                            saveVolunteer(v.id, { honorarium_cents: Number.isFinite(dollars) ? Math.round(dollars * 100) : null });
                          }}
                          className="w-full bg-navy-deep border border-navy-border text-white px-2 py-1.5 text-xs"
                        />
                      </label>
                    )}

                    <label className="block sm:col-span-2">
                      <span className="block text-[0.65rem] font-black tracking-caps text-gold mb-1">Admin notes</span>
                      <textarea
                        defaultValue={v.admin_notes ?? ''}
                        rows={2}
                        onBlur={(e) => saveVolunteer(v.id, { admin_notes: e.target.value })}
                        className="w-full bg-navy-deep border border-navy-border text-white px-2 py-1.5 text-xs resize-none"
                      />
                    </label>
                  </div>

                  <div className="flex items-center gap-3">
                    {savingId === v.id && <span className="text-xs text-text-muted">Saving…</span>}
                    {msg && <span className={`text-xs font-bold ${msg.ok ? 'text-[#7fff7f]' : 'text-[#ff6b6b]'}`}>{msg.text}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
