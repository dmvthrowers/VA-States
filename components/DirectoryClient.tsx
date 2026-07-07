'use client';

import { useMemo, useState } from 'react';

export interface DirectoryProfile {
  id: string;
  role: string;
  display_name: string;
  pronouns: string | null;
  city: string | null;
  state: string | null;
  club: string | null;
  team: string | null;
  bio: string | null;
  divisions: string[] | null;
}

const roleLabel: Record<string, string> = {
  competitor: 'Competitor',
  spectator: 'Spectator',
  judge: 'Judge',
  dj: 'DJ',
  audio_tech: 'Audio Tech',
  admin: 'Staff',
};

type RoleFilter = 'all' | 'competitor' | 'spectator' | 'staff';
type DivisionFilter = 'all' | '1A' | 'X' | 'SBJ';

const STAFF_ROLES = new Set(['judge', 'dj', 'audio_tech', 'admin']);

function matchesRoleFilter(role: string, filter: RoleFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'staff') return STAFF_ROLES.has(role);
  return role === filter;
}

export default function DirectoryClient({ profiles }: { profiles: DirectoryProfile[] }) {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [divisionFilter, setDivisionFilter] = useState<DivisionFilter>('all');

  const hasCompetitors = useMemo(() => profiles.some((p) => p.role === 'competitor'), [profiles]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return profiles.filter((p) => {
      if (!matchesRoleFilter(p.role, roleFilter)) return false;
      if (divisionFilter !== 'all') {
        if (p.role !== 'competitor') return false;
        if (!p.divisions || !p.divisions.includes(divisionFilter)) return false;
      }
      if (!q) return true;
      const hay = [p.display_name, p.city ?? '', p.state ?? '', p.club ?? '', p.team ?? '', p.bio ?? '', roleLabel[p.role] ?? p.role]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [profiles, query, roleFilter, divisionFilter]);

  const roleTabs: { key: RoleFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'competitor', label: 'Competitors' },
    { key: 'spectator', label: 'Spectators' },
    { key: 'staff', label: 'Judges & Staff' },
  ];

  const divisionTabs: { key: DivisionFilter; label: string }[] = [
    { key: 'all', label: 'All Divisions' },
    { key: '1A', label: '1A' },
    { key: 'X', label: 'X' },
    { key: 'SBJ', label: 'SBJ' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, city, team, or bio..."
          aria-label="Search directory"
          style={{
            width: '100%',
            background: 'var(--navy-deep)',
            border: '1px solid var(--navy-border)',
            padding: '0.65rem 0.85rem',
            fontSize: '0.9rem',
            color: '#fff',
          }}
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {roleTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setRoleFilter(tab.key);
                if (tab.key !== 'all' && tab.key !== 'competitor') setDivisionFilter('all');
              }}
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '0.45rem 0.85rem',
                border: '1px solid var(--navy-border)',
                background: roleFilter === tab.key ? 'var(--gold)' : 'transparent',
                color: roleFilter === tab.key ? 'var(--navy-deep)' : 'var(--text-body)',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {hasCompetitors && (roleFilter === 'all' || roleFilter === 'competitor') && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {divisionTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setDivisionFilter(tab.key)}
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '0.3rem 0.65rem',
                  border: '1px solid var(--navy-border)',
                  background: divisionFilter === tab.key ? 'var(--gold-light)' : 'transparent',
                  color: divisionFilter === tab.key ? 'var(--navy-deep)' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
        {filtered.length} of {profiles.length} public profile{profiles.length === 1 ? '' : 's'} shown.
      </p>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No profiles match your search.</p>
      ) : (
        <div style={{ border: '1px solid var(--navy-border)' }}>
          {filtered.map((p, i) => (
            <div
              key={`${p.role}-${p.id}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--navy-border)' : 'none',
                background: i % 2 === 0 ? 'var(--navy)' : 'transparent',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>{p.display_name}</span>
                  <span style={{ fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)' }}>
                    {roleLabel[p.role] ?? p.role}
                  </span>
                  {p.pronouns && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({p.pronouns})</span>}
                  {p.divisions && p.divisions.length > 0 && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>· {p.divisions.join(', ')}</span>
                  )}
                </div>
                {(p.team || p.club) && <div style={{ fontSize: '0.7rem', color: 'var(--gold)' }}>{[p.team, p.club].filter(Boolean).join(' · ')}</div>}
                {p.bio && <div style={{ fontSize: '0.75rem', color: 'var(--text-body)', marginTop: '0.2rem' }}>{p.bio}</div>}
              </div>
              {(p.city || p.state) && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{[p.city, p.state].filter(Boolean).join(', ')}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
