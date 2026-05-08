'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { formatCents } from '@/lib/pricing';

interface ConfirmData {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  divisions: string[];
  fee_cents: number;
  music_upload_url: string;
  music_deadline: string;
  paid: boolean;
}

export default function ConfirmPage() {
  const params = useSearchParams();
  const id = params.get('id');

  const [data, setData] = useState<ConfirmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setError('Missing registration ID.'); setLoading(false); return; }
    fetch(`/api/confirm?id=${encodeURIComponent(id)}`)
      .then(r => r.ok ? r.json() : r.json().then((e: { message?: string }) => Promise.reject(e.message ?? 'Not found')))
      .then((d: ConfirmData) => { setData(d); setLoading(false); })
      .catch((e: string) => { setError(e); setLoading(false); });
  }, [id]);

  const musicNeedsUpload = data && data.divisions.some(d => ['1A', '2A', '3A', '4A', '5A'].includes(d));
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
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
              <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '2rem', margin: '0 0 0.5rem' }}>
                You&rsquo;re registered!
              </h1>
              <p style={{ color: 'var(--text-body)', margin: 0 }}>
                {data.first_name} {data.last_name} · Confirmation #{data.id.slice(0, 8).toUpperCase()}
              </p>
            </div>

            {/* Payment block */}
            {data.fee_cents > 0 && !data.paid && (
              <section aria-labelledby="payment-heading" style={{ background: 'var(--navy)', border: '2px solid var(--gold)', padding: '2rem', marginBottom: '2rem' }}>
                <h2 id="payment-heading" style={{ color: 'var(--gold)', fontFamily: "'Playfair Display', serif", margin: '0 0 1rem', fontSize: '1.3rem' }}>
                  Step 1 — Pay your entry fee
                </h2>
                <p style={{ color: 'var(--text-body)', marginTop: 0 }}>
                  Your spot is held for <strong style={{ color: '#fff' }}>72 hours</strong>. Send{' '}
                  <strong style={{ color: 'var(--gold)' }}>${formatCents(data.fee_cents)}</strong> via one of the options below and include the note:
                </p>
                <code style={{ display: 'block', background: '#0d1428', padding: '0.75rem 1rem', color: 'var(--gold-light)', fontFamily: 'monospace', marginBottom: '1.5rem', letterSpacing: '0.05em' }}>
                  VSYC26-{data.last_name.toUpperCase()}-{data.first_name.toUpperCase()}
                </code>
                <ul style={{ color: 'var(--text-body)', paddingLeft: '1.25rem', margin: 0, lineHeight: 2 }}>
                  <li><strong style={{ color: '#fff' }}>Venmo:</strong> @DMVThrow</li>
                  <li><strong style={{ color: '#fff' }}>PayPal:</strong> paypal.biz/Dmvthrowers</li>
                  <li><strong style={{ color: '#fff' }}>Check:</strong> payable to <em>DMV Throwers</em></li>
                </ul>
              </section>
            )}

            {data.fee_cents === 0 && (
              <section style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1.5rem', marginBottom: '2rem' }}>
                <p style={{ color: '#7fff7f', margin: 0 }}>
                  ✓ Comp code applied — no payment required.
                </p>
              </section>
            )}

            {/* Music upload block */}
            {musicNeedsUpload && (
              <section aria-labelledby="music-heading" style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '2rem', marginBottom: '2rem' }}>
                <h2 id="music-heading" style={{ color: '#fff', fontFamily: "'Playfair Display', serif", margin: '0 0 1rem', fontSize: '1.3rem' }}>
                  Step 2 — Upload your music
                </h2>
                <p style={{ color: 'var(--text-body)', marginTop: 0 }}>
                  Music must be submitted by <strong style={{ color: '#fff' }}>{deadlineLabel}</strong>.
                  Use the secure link below — it&apos;s unique to your registration.
                </p>
                <a
                  href={data.music_upload_url}
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
              </section>
            )}

            {/* Email reminder */}
            <section style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1.5rem', marginBottom: '2rem' }}>
              <p style={{ color: 'var(--text-body)', margin: 0 }}>
                A confirmation email has been sent to <strong style={{ color: '#fff' }}>{data.email}</strong>.
                Check your spam folder if you don&apos;t see it within a few minutes.
              </p>
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
                <dd style={{ margin: 0 }}>{data.divisions.join(', ')}</dd>
              </dl>
              <p style={{ color: 'var(--text-body)', fontSize: '0.85rem', marginTop: '1.5rem' }}>
                Questions? Email{' '}
                <a href="mailto:dmvthrowers@gmail.com" style={{ color: 'var(--gold-light)' }}>
                  dmvthrowers@gmail.com
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
