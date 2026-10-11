'use client';

import { useEffect, useState } from 'react';
import BracketStaffGate from '@/components/BracketStaffGate';
import type { DoNotPhotograph } from '@/lib/media-consent';

/** Do-not-photograph list for the media team (master plan R11). */
function List({ token }: { token: string }) {
  const [data, setData] = useState<{ photo_consent: string; people: DoNotPhotograph[] } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/staff/media-consent', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('bad response'))))
      .then((json) => { if (live) setData(json); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [token]);

  return (
    <div>
      <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', margin: '0 0 0.25rem' }}>Do Not Photograph</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
        People who did not agree to the photo and video release. Keep them out of shots, streams and the recap. Minors&rsquo; choices are their guardian&rsquo;s.
      </p>
      {error && <p role="alert" style={{ color: '#ff6b6b' }}>The list didn&rsquo;t load. Refresh to try again.</p>}
      {!data && !error && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {data && data.photo_consent === 'required' && (
        <p style={{ color: 'var(--text-muted)' }}>The release is required to enter, so everyone has agreed.</p>
      )}
      {data && data.photo_consent !== 'required' && data.people.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>Nobody has opted out.</p>
      )}
      {data && data.people.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, border: '1px solid var(--navy-border)' }}>
          {data.people.map((p, i) => (
            <li key={`${p.name}-${i}`} style={{ padding: '0.7rem 1rem', borderTop: i ? '1px solid var(--navy-border)' : 'none' }}>
              <strong style={{ color: '#fff' }}>{p.name}</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                {' · '}{p.kind}{p.is_minor ? ' · minor' : ''}{p.divisions.length ? ` · ${p.divisions.join(', ')}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MediaConsentPage() {
  return (
    <BracketStaffGate title="Do Not Photograph" roles={['admin', 'media']}>
      {({ token }) => <List token={token} />}
    </BracketStaffGate>
  );
}
