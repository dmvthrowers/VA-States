'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import BracketView from '@/components/BracketView';
import BracketStaffGate from '@/components/BracketStaffGate';
import { competition } from '@/contest.config';

const BRACKET_DIVISIONS = competition.divisions.filter((d) => d.scoring.format === 'bracket');

function Battles({ token, name, signOut }: { token: string; name: string; signOut: () => void }) {
  const params = useSearchParams();
  const initial = BRACKET_DIVISIONS.find((d) => d.code === params.get('division'))?.code ?? BRACKET_DIVISIONS[0]?.code ?? '';
  const [division, setDivision] = useState(initial);
  const def = BRACKET_DIVISIONS.find((d) => d.code === division);
  const scoring = def?.scoring.format === 'bracket' ? def.scoring : null;

  const pick = (code: string) => {
    setDivision(code);
    window.history.replaceState(null, '', `/judge/battles?division=${encodeURIComponent(code)}`);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy-deep)' }}>
      <header style={{ background: 'var(--navy)', borderBottom: '2px solid var(--red)', padding: '0 1rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, flexWrap: 'wrap', gap: '0.5rem 1rem', padding: '0.5rem 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem 1.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontWeight: 700 }}>Battle Judging</span>
            <nav aria-label="Battle divisions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {BRACKET_DIVISIONS.map((d) => (
                <button key={d.code} type="button" title={d.name} aria-pressed={division === d.code} onClick={() => pick(d.code)}
                  style={{ background: division === d.code ? 'var(--red)' : 'transparent', color: '#fff', border: '1px solid', borderColor: division === d.code ? 'var(--red)' : 'var(--navy-border)', padding: '0.3rem 0.75rem', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.05em', cursor: 'pointer' }}>
                  {d.code}
                </button>
              ))}
            </nav>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <a href="/judge" style={{ color: 'var(--gold-light)' }}>Score sheets</a>
            <span>{name}</span>
            <button type="button" onClick={signOut} style={{ background: 'transparent', color: 'var(--text-body)', border: '1px solid var(--navy-border)', padding: '0.3rem 0.6rem', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main id="main-content" style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1rem' }}>
        {!def ? (
          <p style={{ color: 'var(--text-muted)' }}>This contest has no battle divisions.</p>
        ) : (
          <>
            <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#fff', fontSize: '1.4rem', margin: '0 0 0.25rem' }}>{def.name}</h1>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 1rem', fontSize: '0.85rem' }}>
              {scoring?.decidedBy === 'audience'
                ? 'This battle is decided by the audience poll. Follow along here; an admin enters the counts.'
                : 'Vote for the live battle. You can change your vote until an admin confirms the winner.'}
              {scoring?.matchFormat ? ` Format: ${scoring.matchFormat}.` : ''}
            </p>
            <BracketView key={def.code} division={def.code} token={token} mode="judge" pollMs={3000} />
          </>
        )}
      </main>
    </div>
  );
}

export default function JudgeBattlesPage() {
  return (
    <BracketStaffGate title="Battle Judging" roles={['judge', 'admin']}>
      {({ token, staff, signOut }) => (
        <Suspense fallback={null}>
          <Battles token={token} name={staff.display_name} signOut={signOut} />
        </Suspense>
      )}
    </BracketStaffGate>
  );
}
