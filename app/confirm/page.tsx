'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { formatCents } from '@/lib/pricing';
import { entryOf } from '@/lib/divisions-core';
import type { TeamSummary } from '@/lib/team-entries';
import { contest, divisionByCode, venueLine, longDate, shortMonthDay } from '@/contest.config';

/** "Pair", "Act"… for a team division. */
function teamLabel(code: string): string {
  const e = entryOf(divisionByCode(code));
  return e.type === 'team' ? e.label : 'Team';
}

/** A captain's join code, big, with a copy button and the text to send teammates. */
function JoinCodeCard({ team }: { team: TeamSummary }) {
  const [copied, setCopied] = useState<'code' | 'text' | null>(null);
  const label = teamLabel(team.division).toLowerCase();
  const division = divisionByCode(team.division)?.name ?? team.division;
  const share = `Join my ${label} "${team.name}" in ${division} at ${contest.shortName}: register at ${typeof window !== 'undefined' ? window.location.origin : ''}/ and enter join code ${team.join_code}.`;
  const copy = async (what: 'code' | 'text') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? team.join_code : share);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };
  const btn: React.CSSProperties = {
    background: 'transparent', border: '1px solid var(--gold)', color: 'var(--gold)', cursor: 'pointer',
    padding: '0.5rem 0.9rem', fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase',
  };
  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>JOIN CODE</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <code aria-label={`Join code ${team.join_code.split('').join(' ')}`} style={{ fontFamily: 'monospace', fontSize: '2.2rem', fontWeight: 800, letterSpacing: '0.25em', color: 'var(--gold)', background: 'var(--navy-deep)', border: '1px solid var(--navy-border)', padding: '0.4rem 0.9rem' }}>
          {team.join_code}
        </code>
        <button type="button" onClick={() => copy('code')} style={btn}>{copied === 'code' ? '✓ Copied' : 'Copy code'}</button>
        <button type="button" onClick={() => copy('text')} style={btn}>{copied === 'text' ? '✓ Copied' : 'Copy invite'}</button>
      </div>
      <p style={{ color: 'var(--text-body)', fontSize: '0.85rem', margin: '0.6rem 0 0' }}>
        Share code <strong style={{ color: '#fff' }}>{team.join_code}</strong> with your teammates so they can join when they register.
      </p>
      <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </div>
  );
}

/** A division's display name, plus picked style labels if the API sends them: "Name (Style A, Style B)". */
function divisionLabel(code: string, styles: Record<string, string[]> | undefined): string {
  const d = divisionByCode(code);
  const picked = (styles?.[code] ?? []).map((s) => d?.styles?.options.find((o) => o.code === s)?.label ?? s);
  return `${d?.name ?? code}${picked.length ? ` (${picked.join(', ')})` : ''}`;
}

interface ConfirmData {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  divisions: string[];
  /** Optional: style codes per division, if /api/confirm includes them */
  division_styles?: Record<string, string[]>;
  fee_cents: number;
  music_upload_url: string | null;
  music_deadline: string;
  paid: boolean;
  /** Teams they started (captain) or joined (member) */
  teams?: TeamSummary[];
}

function ConfirmContent() {
  const params = useSearchParams();
  const id = params.get('id');
  const canceled = params.get('canceled') === '1';
  // Stripe only redirects here with paid=1 after a successful payment. The
  // webhook can lag a few seconds (or longer), so poll until it's recorded
  // instead of showing a pay button that invites a second payment.
  const returnedFromStripe = params.get('paid') === '1';

  const [data, setData] = useState<ConfirmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'polling' | 'timeout' | null>(null);

  const payNow = async () => {
    if (!id) return;
    setPaying(true);
    setPayError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json() as { url?: string; error?: { message: string } };
      if (res.ok && json.url) {
        window.location.href = json.url;
        return;
      }
      setPayError(json.error?.message ?? 'Could not start secure payment. Please try again.');
    } catch {
      setPayError('Network error starting payment. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  useEffect(() => {
    if (!id) { setError('Missing registration ID.'); setLoading(false); return; }
    fetch(`/api/confirm?id=${encodeURIComponent(id)}`)
      .then(r => r.ok ? r.json() : r.json().then((e: { message?: string }) => Promise.reject(e.message ?? 'Not found')))
      .then((d: ConfirmData) => { setData(d); setLoading(false); })
      .catch((e: string) => { setError(e); setLoading(false); });
  }, [id]);

  const awaitingStripe = Boolean(returnedFromStripe && data && data.fee_cents > 0 && !data.paid);
  useEffect(() => {
    if (!awaitingStripe || !id) return;
    let cancelled = false;
    let tries = 0;
    setConfirming('polling');
    const poll = async () => {
      if (cancelled) return;
      tries += 1;
      try {
        const res = await fetch(`/api/checkout/status?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
        const json = await res.json() as { paid?: boolean };
        if (!cancelled && json.paid) {
          setData((d) => (d ? { ...d, paid: true } : d));
          setConfirming(null);
          return;
        }
      } catch {
        // Network blip: keep polling.
      }
      if (cancelled) return;
      if (tries >= 20) setConfirming('timeout'); // ~60 seconds
      else setTimeout(poll, 3000);
    };
    poll();
    return () => { cancelled = true; };
  }, [awaitingStripe, id]);

  const musicNeedsUpload = Boolean(data?.divisions.some(d => divisionByCode(d)?.music));
  const teams = data?.teams ?? [];
  /** $0 because they joined a team whose captain pays (not a comp code) */
  const captainPays = Boolean(data && data.fee_cents === 0 && teams.some(t => t.role === 'member'));
  const canUploadMusic = Boolean(data?.music_upload_url);
  const deadlineLabel = data?.music_deadline
    ? new Date(data.music_deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <>
      <NavBar />
      <main id="main-content" style={{ minHeight: '60vh', maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
        {loading && (
          <p style={{ color: 'var(--text-body)', textAlign: 'center' }}>Loading…</p>
        )}

        {error && (
          <div role="alert" style={{ background: '#2a1520', border: '1px solid var(--red)', borderRadius: 0, padding: '1.5rem', textAlign: 'center' }}>
            <p style={{ color: '#ff6b6b', margin: 0 }}>{error}</p>
          </div>
        )}

        {data && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
              <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '2rem', margin: '0 0 0.5rem' }}>
                You&rsquo;re registered!
              </h1>
              <p style={{ color: 'var(--text-body)', margin: 0 }}>
                {data.first_name} {data.last_name} · Confirmation #{data.id.slice(0, 8).toUpperCase()}
              </p>
            </div>

            {/* Step progress tracker */}
            <section aria-label="Registration progress" style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1.5rem', marginBottom: '2rem' }}>
              <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--gold)', marginBottom: '1rem' }}>YOUR CHECKLIST</div>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                  { done: true,  label: 'Registered',       sub: `Confirmation #${data.id.slice(0, 8).toUpperCase()}` },
                  { done: data.paid || data.fee_cents === 0, label: data.fee_cents === 0 ? (captainPays ? 'Payment — none (your captain pays)' : 'Payment — comp pass (FREE)') : `Pay entry fee (${formatCents(data.fee_cents)})`, sub: data.paid ? 'Received' : data.fee_cents === 0 ? 'No payment needed' : 'Complete secure Stripe checkout in portal' },
                  ...(musicNeedsUpload ? [{ done: false, label: 'Upload your music', sub: `Deadline: ${deadlineLabel} · upload in portal` }] : []),
                  { done: false, label: `See you ${shortMonthDay()}`,   sub: [venueLine, contest.doorsNote].filter(Boolean).join(' · ') },
                ].map(({ done, label, sub }, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <span style={{
                      width: '1.5rem', height: '1.5rem', flexShrink: 0,
                      background: done ? 'var(--gold)' : 'transparent',
                      border: done ? 'none' : '2px solid var(--navy-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem', fontWeight: 800,
                      color: done ? 'var(--navy-deep)' : 'var(--text-muted)',
                      marginTop: '0.1rem',
                    }}>
                      {done ? '✓' : i + 1}
                    </span>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: done ? '#fff' : 'var(--text-body)' }}>{label}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{sub}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* Back from Stripe, payment not recorded yet: confirm, never offer to pay again */}
            {awaitingStripe && (
              <section role="status" aria-live="polite" style={{ background: 'var(--navy)', border: '2px solid var(--gold)', padding: '2rem', marginBottom: '2rem' }}>
                <h2 style={{ color: 'var(--gold)', fontFamily: "'Playfair Display', serif", margin: '0 0 1rem', fontSize: '1.3rem' }}>
                  {confirming === 'timeout' ? 'Payment received by Stripe, still confirming' : 'Confirming your payment…'}
                </h2>
                <p style={{ color: 'var(--text-body)', margin: 0 }}>
                  {confirming === 'timeout'
                    ? "Stripe hasn't confirmed your payment to us yet. That's usually a short delay on their side. Don't pay again. We'll email you as soon as it clears, and this page will show it when you reload."
                    : "This usually takes a few seconds. Please don't pay again or close this page."}
                </p>
              </section>
            )}

            {/* Payment block */}
            {data.fee_cents > 0 && !data.paid && !awaitingStripe && (
              <section aria-labelledby="payment-heading" style={{ background: 'var(--navy)', border: '2px solid var(--gold)', padding: '2rem', marginBottom: '2rem' }}>
                <h2 id="payment-heading" style={{ color: 'var(--gold)', fontFamily: "'Playfair Display', serif", margin: '0 0 1rem', fontSize: '1.3rem' }}>
                  Step 1 — Pay your entry fee
                </h2>

                {canceled && (
                  <p role="status" style={{ color: '#ffb86b', marginTop: 0, fontSize: '0.85rem' }}>
                    Card payment was canceled — your spot is still held. You can try again below.
                  </p>
                )}

                {/* Primary: pay by card via Stripe */}
                <button
                  type="button"
                  onClick={payNow}
                  disabled={paying}
                  style={{
                    display: 'block', width: '100%', cursor: paying ? 'wait' : 'pointer',
                    background: 'var(--gold)', color: 'var(--navy-deep)', border: 'none',
                    padding: '0.9rem 1.5rem', fontWeight: 800, letterSpacing: '0.05em',
                    textTransform: 'uppercase', fontSize: '0.9rem', marginBottom: '0.75rem',
                  }}
                >
                  {paying ? 'Starting secure checkout…' : `Pay $${formatCents(data.fee_cents)} by card →`}
                </button>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 0, marginBottom: '1.5rem' }}>
                  Secure card payment powered by Stripe. Apple Pay &amp; Google Pay supported.
                </p>
                {payError && (
                  <p role="alert" style={{ color: '#ff6b6b', fontSize: '0.8rem', marginTop: '-1rem', marginBottom: '1.25rem' }}>{payError}</p>
                )}

                <p style={{ color: 'var(--text-body)', marginTop: 0 }}>
                  Online payments are processed in this portal via Stripe. Your spot is held for <strong style={{ color: '#fff' }}>72 hours</strong> while payment is pending.
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 0 }}>
                  Day-of alternatives may be available at the registration desk on event day.
                </p>
              </section>
            )}

            {data.fee_cents === 0 && (
              <section style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1.5rem', marginBottom: '2rem' }}>
                <p style={{ color: '#7fff7f', margin: 0 }}>
                  {captainPays ? '✓ No payment needed — your captain\u2019s entry covers your team.' : '✓ Comp code applied — no payment required.'}
                </p>
              </section>
            )}

            {/* Teams: role, and the join code to share for captains */}
            {teams.length > 0 && (
              <section aria-labelledby="teams-heading" style={{ background: 'var(--navy)', border: '1px solid var(--gold)', padding: '2rem', marginBottom: '2rem' }}>
                <h2 id="teams-heading" style={{ color: 'var(--gold)', fontFamily: "'Playfair Display', serif", margin: '0 0 1rem', fontSize: '1.3rem' }}>
                  Your {teams.length === 1 ? teamLabel(teams[0].division).toLowerCase() : 'teams'}
                </h2>
                {teams.map((t, i) => (
                  <div key={t.division} style={{ paddingTop: i ? '1.25rem' : 0, marginTop: i ? '1.25rem' : 0, borderTop: i ? '1px solid var(--navy-border)' : 'none' }}>
                    <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', fontWeight: 800, color: 'var(--text-muted)' }}>
                      {(divisionByCode(t.division)?.name ?? t.division).toUpperCase()} · {teamLabel(t.division).toUpperCase()}
                    </div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem', marginTop: '0.2rem', overflowWrap: 'anywhere' }}>
                      {t.name}{' '}
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-deep)', background: 'var(--gold)', padding: '0.1rem 0.45rem', verticalAlign: 'middle' }}>
                        {t.role === 'captain' ? 'CAPTAIN' : 'MEMBER'}
                      </span>
                    </div>
                    {t.role === 'captain'
                      ? <JoinCodeCard team={t} />
                      : <p style={{ color: 'var(--text-body)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>You&rsquo;re on the {teamLabel(t.division).toLowerCase()}. Your captain&rsquo;s registration stands for the {teamLabel(t.division).toLowerCase()} in the run order and results.</p>}
                  </div>
                ))}
              </section>
            )}

            {/* Music upload block */}
            {musicNeedsUpload && canUploadMusic && (
              <section aria-labelledby="music-heading" style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '2rem', marginBottom: '2rem' }}>
                <h2 id="music-heading" style={{ color: '#fff', fontFamily: "'Playfair Display', serif", margin: '0 0 1rem', fontSize: '1.3rem' }}>
                  Step 2 — Upload your music
                </h2>
                <p style={{ color: 'var(--text-body)', marginTop: 0 }}>
                  Music must be submitted by <strong style={{ color: '#fff' }}>{deadlineLabel}</strong>.
                  Use the secure link below — it&apos;s unique to your registration.
                </p>
                <a
                  href={data.music_upload_url!}
                  style={{
                    display: 'inline-block',
                    background: 'var(--gold)',
                    color: 'var(--navy-deep)',
                    padding: '0.75rem 1.5rem',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    fontSize: '0.85rem',
                    textDecoration: 'none',
                  }}
                >
                  Upload Music →
                </a>
                <p style={{ color: 'var(--text-body)', fontSize: '0.8rem', marginTop: '1rem', marginBottom: 0 }}>
                  Accepted formats: MP3, WAV, AIFF, M4A · Max 128 MB
                </p>
                <p style={{ color: 'var(--text-body)', fontSize: '0.8rem', marginTop: '0.5rem', marginBottom: 0 }}>
                  Music must be appropriate for all audiences — <strong style={{ color: '#fff' }}>inappropriate music results in disqualification</strong>. Full Music Selection Rules are on the upload page.
                </p>
              </section>
            )}

            {musicNeedsUpload && !canUploadMusic && (
              <section aria-labelledby="music-heading" style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '2rem', marginBottom: '2rem' }}>
                <h2 id="music-heading" style={{ color: '#fff', fontFamily: "'Playfair Display', serif", margin: '0 0 1rem', fontSize: '1.3rem' }}>
                  Step 2 - Upload your music
                </h2>
                <p style={{ color: 'var(--text-body)', margin: 0 }}>
                  Music upload unlocks in this portal after payment is received. Deadline: <strong style={{ color: '#fff' }}>{deadlineLabel}</strong>.
                </p>
                <p style={{ color: 'var(--text-body)', fontSize: '0.8rem', marginTop: '0.75rem', marginBottom: 0 }}>
                  Start picking your track now: it must be appropriate for all audiences — <strong style={{ color: '#fff' }}>inappropriate music results in disqualification</strong>. Full Music Selection Rules are on the upload page.
                </p>
              </section>
            )}

            {/* Email reminder */}
            <section style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1.5rem', marginBottom: '2rem' }}>
              <p style={{ color: 'var(--text-body)', margin: 0 }}>
                A confirmation email has been sent to <strong style={{ color: '#fff' }}>{data.email}</strong>.
                Check your spam folder if you don&apos;t see it within a few minutes.
              </p>
              <a
                href="/player"
                style={{
                  display: 'inline-block',
                  marginTop: '0.85rem',
                  fontFamily: 'var(--font-condensed)',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase' as const,
                  color: 'var(--gold)',
                  textDecoration: 'none',
                }}
              >
                Manage registration in competitor portal →
              </a>
            </section>

            {/* Event details */}
            <section style={{ borderTop: '1px solid var(--navy-border)', paddingTop: '2rem' }}>
              <h2 style={{ color: 'var(--gold)', fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', margin: '0 0 1rem' }}>
                Event Details
              </h2>
              <dl style={{ color: 'var(--text-body)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1.5rem', margin: 0 }}>
                <dt style={{ fontWeight: 700, color: '#fff' }}>Date</dt>
                <dd style={{ margin: 0 }}>September 19, 2026</dd>
                <dt style={{ fontWeight: 700, color: '#fff' }}>Venue</dt>
                <dd style={{ margin: 0 }}>Dulles Town Center · Sterling, VA</dd>
                <dt style={{ fontWeight: 700, color: '#fff' }}>Divisions</dt>
                <dd style={{ margin: 0 }}>{data.divisions.map((d) => divisionLabel(d, data.division_styles)).join(', ')}</dd>
              </dl>
              <p style={{ color: 'var(--text-body)', fontSize: '0.85rem', marginTop: '1.5rem' }}>
                Questions? Email{' '}
                <a href="mailto:contact@dmvthrowers.club" style={{ color: 'var(--gold-light)' }}>
                  contact@dmvthrowers.club
                </a>
              </p>
              <a
                href="https://dmvthrowers.club/vsyc26-register.html"
                style={{
                  display: 'inline-block',
                  marginTop: '1.5rem',
                  fontFamily: 'var(--font-condensed)',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase' as const,
                  color: 'var(--text-muted)',
                  textDecoration: 'none',
                  borderBottom: '1px solid var(--navy-border)',
                  paddingBottom: 2,
                }}
              >
                ← Back to VSYC-26 Event Page
              </a>
            </section>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Loading…</p>
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  );
}
