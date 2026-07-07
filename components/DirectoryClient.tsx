'use client';

import { useMemo, useState, type CSSProperties } from 'react';

export interface DirectorySocials {
  instagram?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
  other?: string | null;
}

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
  photo_url: string | null;
  socials: DirectorySocials | null;
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

function socialUrl(platform: 'instagram' | 'tiktok' | 'youtube' | 'other', value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const handle = trimmed.replace(/^@/, '');
  switch (platform) {
    case 'instagram': return `https://instagram.com/${handle}`;
    case 'tiktok':    return `https://tiktok.com/@${handle}`;
    case 'youtube':   return `https://youtube.com/@${handle}`;
    default:          return trimmed;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function Avatar({ name, photoUrl, size }: { name: string; photoUrl: string | null; size: number }) {
  const style: CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--navy-deep)',
    border: '1px solid var(--navy-border)',
    color: 'var(--gold)',
    fontWeight: 800,
    fontSize: size * 0.36,
    overflow: 'hidden',
  };

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" aria-hidden="true" style={{ ...style, objectFit: 'cover' }} />
    );
  }

  return <div style={style} aria-hidden="true">{initials(name)}</div>;
}

function SocialLinks({ socials }: { socials: DirectorySocials | null }) {
  if (!socials) return null;
  const entries: { key: 'instagram' | 'tiktok' | 'youtube' | 'other'; label: string }[] = [
    { key: 'instagram', label: 'Instagram' },
    { key: 'tiktok', label: 'TikTok' },
    { key: 'youtube', label: 'YouTube' },
    { key: 'other', label: 'Link' },
  ];
  const links: { key: 'instagram' | 'tiktok' | 'youtube' | 'other'; label: string; value: string }[] = [];
  for (const e of entries) {
    const value = socials[e.key];
    if (value && value.trim()) links.push({ ...e, value });
  }

  if (links.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.6rem' }}>
      {links.map((l) => (
        <a
          key={l.key}
          href={socialUrl(l.key, l.value)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            fontSize: '0.68rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '0.3rem 0.65rem',
            border: '1px solid var(--gold)',
            color: 'var(--gold)',
            textDecoration: 'none',
          }}
        >
          {l.label} ↗
        </a>
      ))}
    </div>
  );
}

export default function DirectoryClient({ profiles }: { profiles: DirectoryProfile[] }) {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [divisionFilter, setDivisionFilter] = useState<DivisionFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        {filtered.length} of {profiles.length} public profile{profiles.length === 1 ? '' : 's'} shown. Tap a row for the full profile.
      </p>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No profiles match your search.</p>
      ) : (
        <div style={{ border: '1px solid var(--navy-border)' }}>
          {filtered.map((p, i) => {
            const key = `${p.role}-${p.id}`;
            const isExpanded = expandedId === key;
            const hasSocials = p.socials && Object.values(p.socials).some((v) => v && v.trim());
            const hasExtra = Boolean(p.bio || hasSocials || p.photo_url);

            return (
              <div
                key={key}
                style={{
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--navy-border)' : 'none',
                  background: i % 2 === 0 ? 'var(--navy)' : 'transparent',
                }}
              >
                <button
                  type="button"
                  onClick={() => hasExtra && setExpandedId(isExpanded ? null : key)}
                  aria-expanded={isExpanded}
                  style={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: hasExtra ? 'pointer' : 'default',
                  }}
                >
                  <Avatar name={p.display_name} photoUrl={p.photo_url} size={36} />

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>{p.display_name}</span>
                      <span style={{ fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)' }}>
                        {roleLabel[p.role] ?? p.role}
                      </span>
                      {p.divisions && p.divisions.length > 0 && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>· {p.divisions.join(', ')}</span>
                      )}
                    </div>
                    {(p.city || p.state) && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {[p.city, p.state].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>

                  {hasExtra ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                      ▾
                    </span>
                  ) : <span />}
                </button>

                {isExpanded && (
                  <div style={{ padding: '0 1rem 1.1rem', display: 'flex', gap: '1rem' }}>
                    <Avatar name={p.display_name} photoUrl={p.photo_url} size={64} />
                    <div style={{ minWidth: 0 }}>
                      {p.pronouns && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>{p.pronouns}</div>}
                      {(p.team || p.club) && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--gold)', marginBottom: '0.3rem' }}>
                          {[p.team, p.club].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {p.bio && <p style={{ fontSize: '0.82rem', color: 'var(--text-body)', margin: '0.3rem 0 0' }}>{p.bio}</p>}
                      <SocialLinks socials={p.socials} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
