'use client';

import { useState, useMemo } from 'react';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import type { Division } from '@/lib/pricing';
import { calculateFeePreview } from '@/lib/pricing';

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------
const REGISTER_URL = 'https://dmvthrowers.club/vsyc26-register.html';
const EARLY_BIRD_CUTOFF = new Date('2026-06-01T00:00:00-04:00');

interface DivisionInfo {
  id: Division;
  name: string;
  desc: string;
  baseCents: number;
  badge: string;
}

const DIVISIONS: DivisionInfo[] = [
  {
    id: '1A',
    name: '1A',
    desc: 'String Trick — single yo-yo on a single string. The most popular competitive style.',
    baseCents: 2500,
    badge: 'Open',
  },
  {
    id: 'X',
    name: 'X Division',
    desc: 'Multi-style division: 2A looping, 3A two-handed string, 4A offstring, 5A freehand.',
    baseCents: 2000,
    badge: 'Open',
  },
  {
    id: 'SBJ',
    name: 'Sport · Beginner · Junior',
    desc: 'For new competitors and youth players learning the competitive experience.',
    baseCents: 1500,
    badge: 'Entry Level',
  },
];

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function daysUntil(date: Date) {
  return Math.max(0, Math.floor((date.getTime() - Date.now()) / 86_400_000));
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------
export default function FeeCalculatorPage() {
  const [selected, setSelected] = useState<Set<Division>>(new Set());
  const [compCode, setCompCode] = useState('');
  const [compApplied, setCompApplied] = useState(false);
  const [compDiscountPercent, setCompDiscountPercent] = useState(0);
  const [codeError, setCodeError] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);

  const earlyBirdDays = daysUntil(EARLY_BIRD_CUTOFF);
  const isEarlyBird = earlyBirdDays > 0;

  const toggle = (id: Division) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    // Clear applied comp code if selections change
    if (compApplied) { setCompApplied(false); setCompDiscountPercent(0); setCodeError(''); }
  };

  const result = useMemo(() => calculateFeePreview(
    Array.from(selected),
    compDiscountPercent,
    new Date(),
    'online',
    EARLY_BIRD_CUTOFF,
  ), [selected, compDiscountPercent]);

  const applyCode = async () => {
    if (!compCode.trim()) return;
    setCodeLoading(true);
    setCodeError('');
    try {
      const r = await fetch(`/api/validate-code?code=${encodeURIComponent(compCode.trim())}`);
      const json = await r.json() as { valid?: boolean; discount_percent?: number; message?: string };
      if (json.valid) {
        setCompApplied(true);
        setCompDiscountPercent(json.discount_percent ?? 0);
        setCodeError('');
      } else {
        setCompApplied(false);
        setCompDiscountPercent(0);
        setCodeError(json.message ?? 'Invalid code');
      }
    } catch {
      setCompApplied(false);
      setCompDiscountPercent(0);
      setCodeError('Could not verify code. Try again.');
    } finally {
      setCodeLoading(false);
    }
  };

  const hasSelections = selected.size > 0;

  // Line items for breakdown
  const lineItems: Array<{ label: string; cents: number; strike?: boolean; green?: boolean }> = [];

  if (selected.size > 0) {
    const has1A = selected.has('1A');
    const hasX  = selected.has('X');

    if (result.combo_applied) {
      // Show original prices struck through, then combo line
      if (has1A) lineItems.push({ label: '1A', cents: 2500, strike: true });
      if (hasX)  lineItems.push({ label: 'X Division', cents: 2000, strike: true });
      lineItems.push({ label: '1A + X Combo', cents: 4000 });
      if (selected.has('SBJ')) lineItems.push({ label: 'Sport · Beginner · Junior', cents: 1500 });
    } else {
      for (const d of selected) {
        const info = DIVISIONS.find(x => x.id === d)!;
        lineItems.push({ label: info.name, cents: info.baseCents });
      }
    }

    if (result.early_bird_applied) {
      lineItems.push({ label: 'Early Bird Discount', cents: -500, green: true });
    }

    if (compApplied && result.comp_discount_percent > 0) {
      lineItems.push({
        label: `Comp Code Discount (${result.comp_discount_percent}%)`,
        cents: -(result.comp_base_fee_cents - result.fee_cents),
        green: true,
      });
    }
  }

  const subtotal = lineItems.reduce((s, l) => l.strike ? s : s + l.cents, 0);

  return (
    <>
      <NavBar />
      <main id="main-content">

        {/* ── Page hero (matches UI kit page header pattern) ── */}
        <div style={{
          background: 'var(--navy)',
          padding: '48px 24px 80px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div className="ds-dot-pattern" style={{ position: 'absolute', inset: 0 }} />
          <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
            <div className="ds-gold-tag">Entry Fees</div>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 'clamp(2.2rem, 5vw, 3.5rem)',
              color: 'var(--gold)',
              lineHeight: 1.05,
              marginBottom: 8,
            }}>
              Fee Calculator
            </h1>
            <p style={{
              fontFamily: 'var(--font-condensed)',
              fontSize: '0.7rem',
              letterSpacing: '0.16em',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
            }}>
              VSYC-26 · September 19, 2026 · Dulles Town Center
            </p>
          </div>
        </div>

        {/* ── Main content ── */}
        <div style={{ background: 'var(--navy)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px' }}>

            {/* Early bird banner */}
            {isEarlyBird && (
              <div style={{
                background: 'var(--navy-deep)',
                border: '1px solid var(--gold)',
                borderLeft: '4px solid var(--gold)',
                padding: '14px 20px',
                marginBottom: 40,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                flexWrap: 'wrap' as const,
              }}>
                <span style={{
                  fontFamily: 'var(--font-condensed)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.18em',
                  fontWeight: 800,
                  color: 'var(--gold)',
                  textTransform: 'uppercase' as const,
                }}>
                  Early Bird Active
                </span>
                <span style={{ color: 'var(--text-body)', fontSize: '0.88rem' }}>
                  Register before June 1, 2026 and save <strong style={{ color: 'var(--gold)' }}>$5</strong>.{' '}
                  <strong style={{ color: '#fff' }}>{earlyBirdDays} day{earlyBirdDays !== 1 ? 's' : ''}</strong> remaining.
                </span>
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 48,
              alignItems: 'start',
            }}>

              {/* LEFT — Division selector */}
              <div>
                <div className="ds-gold-tag">Select Divisions</div>
                <h2 style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 900,
                  fontSize: '2rem',
                  color: '#fff',
                  marginBottom: 8,
                }}>
                  What are you entering?
                </h2>
                <hr className="ds-divider-gold" />

                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12, marginBottom: 32 }}>
                  {DIVISIONS.map(div => {
                    const isOn = selected.has(div.id);
                    return (
                      <button
                        key={div.id}
                        type="button"
                        onClick={() => toggle(div.id)}
                        aria-pressed={isOn}
                        style={{
                          background: isOn ? 'var(--navy-deep)' : 'var(--navy)',
                          border: `1px solid ${isOn ? 'var(--gold)' : 'var(--navy-border)'}`,
                          borderTop: `3px solid ${isOn ? 'var(--gold)' : 'var(--navy-border)'}`,
                          padding: '22px 20px',
                          textAlign: 'left' as const,
                          cursor: 'pointer',
                          transition: 'border-color 0.15s, background 0.15s, transform 0.1s',
                          transform: isOn ? 'translateY(-1px)' : 'none',
                          width: '100%',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                          <div>
                            <div style={{
                              fontFamily: 'var(--font-display)',
                              fontWeight: 900,
                              fontSize: '1.4rem',
                              color: isOn ? 'var(--gold)' : '#fff',
                              marginBottom: 5,
                              lineHeight: 1,
                            }}>
                              {div.name}
                            </div>
                            <div style={{ fontSize: '0.83rem', color: 'var(--text-body)', lineHeight: 1.5 }}>
                              {div.desc}
                            </div>
                            <span style={{
                              display: 'inline-block',
                              background: isOn ? 'var(--gold)' : 'var(--navy-border)',
                              color: isOn ? 'var(--navy-deep)' : 'var(--text-muted)',
                              fontFamily: 'var(--font-condensed)',
                              fontSize: '0.62rem',
                              letterSpacing: '0.12em',
                              fontWeight: 700,
                              padding: '3px 10px',
                              marginTop: 10,
                              textTransform: 'uppercase' as const,
                            }}>
                              {div.badge}
                            </span>
                          </div>
                          <div style={{
                            fontFamily: 'var(--font-display)',
                            fontWeight: 700,
                            fontSize: '1.3rem',
                            color: isOn ? 'var(--gold)' : 'var(--text-muted)',
                            flexShrink: 0,
                            paddingTop: 2,
                          }}>
                            {fmt(div.baseCents)}
                          </div>
                        </div>

                        {/* Selected indicator */}
                        {isOn && (
                          <div style={{
                            marginTop: 12,
                            paddingTop: 12,
                            borderTop: '1px solid var(--navy-border)',
                            fontFamily: 'var(--font-condensed)',
                            fontSize: '0.65rem',
                            letterSpacing: '0.14em',
                            fontWeight: 800,
                            color: 'var(--gold)',
                            textTransform: 'uppercase' as const,
                          }}>
                            ✓ Selected — click to remove
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Combo callout */}
                {selected.has('1A') && selected.has('X') && (
                  <div style={{
                    background: 'var(--navy-deep)',
                    border: '1px solid var(--gold)',
                    borderLeft: '4px solid var(--gold)',
                    padding: '14px 18px',
                    marginBottom: 24,
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-condensed)',
                      fontSize: '0.62rem',
                      letterSpacing: '0.16em',
                      fontWeight: 800,
                      color: 'var(--gold)',
                      marginBottom: 4,
                      textTransform: 'uppercase' as const,
                    }}>
                      1A + X Combo Deal
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-body)', lineHeight: 1.5 }}>
                      Entering both 1A and X Division? You get the combo rate:{' '}
                      <strong style={{ color: '#fff' }}>$40 flat</strong> instead of $45 — saving you{' '}
                      <strong style={{ color: 'var(--gold)' }}>$5</strong>.
                    </div>
                  </div>
                )}

                {/* Comp code input */}
                <div style={{ marginTop: 8 }}>
                  <label style={{
                    display: 'block',
                    fontFamily: 'var(--font-condensed)',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase' as const,
                    color: 'var(--gold)',
                    marginBottom: 8,
                  }}>
                    Comp Code (optional)
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      value={compCode}
                      onChange={e => { setCompCode(e.target.value.toUpperCase()); setCompApplied(false); setCompDiscountPercent(0); setCodeError(''); }}
                      placeholder="e.g. VOLUNTEER26"
                      disabled={compApplied}
                      style={{
                        flex: 1,
                        background: 'var(--navy-deep)',
                        border: `2px solid ${compApplied ? 'var(--gold)' : codeError ? 'var(--red)' : 'var(--navy-border)'}`,
                        color: '#fff',
                        padding: '10px 14px',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.9rem',
                        letterSpacing: '0.08em',
                      }}
                    />
                    <button
                      type="button"
                      onClick={applyCode}
                      disabled={!compCode.trim() || compApplied || codeLoading}
                      className="ds-btn ds-btn-outline"
                      style={{ padding: '10px 18px', fontSize: '0.72rem', minHeight: 0 }}
                    >
                      {codeLoading ? '…' : compApplied ? '✓ Applied' : 'Apply'}
                    </button>
                  </div>
                  {codeError && (
                    <p style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: 6 }}>{codeError}</p>
                  )}
                  {compApplied && result.comp_discount_percent > 0 && (
                    <p style={{ color: '#6adb8a', fontSize: '0.78rem', marginTop: 6 }}>
                      ✓ Comp code applied — {result.comp_discount_percent === 100 ? 'your registration is free.' : `${result.comp_discount_percent}% off your registration.`}
                    </p>
                  )}
                </div>
              </div>

              {/* RIGHT — Pricing breakdown */}
              <div>
                <div className="ds-gold-tag">Your Total</div>
                <h2 style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 900,
                  fontSize: '2rem',
                  color: '#fff',
                  marginBottom: 8,
                }}>
                  Fee Breakdown
                </h2>
                <hr className="ds-divider-gold" />

                {/* Breakdown box */}
                <div className="ds-price-box" style={{ marginBottom: 16 }}>
                  {!hasSelections && !compApplied && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0, padding: '8px 0' }}>
                      Select a division on the left to see your fee.
                    </p>
                  )}

                  {compApplied && result.comp_discount_percent > 0 && (
                    <div className="ds-price-row">
                      <span className="ds-price-div">Comp code discount ({result.comp_discount_percent}%)</span>
                      <span className="ds-price-val ds-price-free">−{fmt(result.comp_base_fee_cents - result.fee_cents)}</span>
                    </div>
                  )}

                  {compApplied && result.is_comp && (
                    <div className="ds-price-row">
                      <span className="ds-price-div">Comp code applied</span>
                      <span className="ds-price-val ds-price-free">FREE</span>
                    </div>
                  )}

                  {lineItems.map((item, i) => (
                    <div key={i} className="ds-price-row">
                      <span className={`ds-price-div${item.strike ? ' ds-price-strike' : ''}`}>
                        {item.label}
                      </span>
                      <span
                        className={`ds-price-val${item.green ? ' ds-price-free' : ''}${item.strike ? ' ds-price-strike' : ''}`}
                        style={item.cents < 0 ? { color: '#6adb8a' } : {}}
                      >
                        {item.cents < 0 ? `−${fmt(-item.cents)}` : fmt(item.cents)}
                      </span>
                    </div>
                  ))}

                  {/* Divider + Total */}
                  {(hasSelections || compApplied) && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: 16,
                      marginTop: 4,
                      borderTop: `2px solid var(--navy-border)`,
                    }}>
                      <span style={{
                        fontFamily: 'var(--font-condensed)',
                        fontSize: '0.7rem',
                        letterSpacing: '0.16em',
                        fontWeight: 800,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase' as const,
                      }}>
                        Total
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 900,
                        fontSize: '2rem',
                        color: result.is_comp || subtotal === 0 ? '#6adb8a' : 'var(--gold)',
                        lineHeight: 1,
                      }}>
                        {result.is_comp ? 'FREE' : subtotal === 0 && hasSelections ? '$0.00' : fmt(subtotal)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Payment note */}
                {hasSelections && !result.is_comp && (
                  <div style={{
                    background: 'var(--navy-deep)',
                    border: '1px solid var(--navy-border)',
                    borderLeft: '4px solid var(--red)',
                    padding: '16px 18px',
                    marginBottom: 24,
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-condensed)',
                      fontSize: '0.62rem',
                      letterSpacing: '0.16em',
                      fontWeight: 800,
                      color: 'var(--red)',
                      marginBottom: 6,
                      textTransform: 'uppercase' as const,
                    }}>
                      Payment
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      Online registration payments are processed securely by <strong style={{ color: '#fff' }}>Stripe</strong> in the registration portal.
                      Day-of alternatives may be available at the registration desk.
                    </div>
                  </div>
                )}

                {/* Spectators note */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 0',
                  borderBottom: '1px solid var(--navy-border)',
                  marginBottom: 24,
                }}>
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-body)' }}>Spectators</span>
                  <span style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    color: '#6adb8a',
                  }}>
                    FREE
                  </span>
                </div>

                {/* CTA — back to registration on main site */}
                <a
                  href={REGISTER_URL}
                  className="ds-btn ds-btn-gold"
                  style={{ width: '100%', justifyContent: 'center', fontSize: '0.88rem', padding: '16px 24px' }}
                >
                  REGISTER TO COMPETE →
                </a>
                <p style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  textAlign: 'center' as const,
                  marginTop: 10,
                  fontFamily: 'var(--font-body)',
                }}>
                  Full registration at{' '}
                  <a href={REGISTER_URL} style={{ color: 'var(--gold-light)', textDecoration: 'none' }}>
                    dmvthrowers.club/vsyc26-register
                  </a>
                </p>

                {/* Full price list reference */}
                <div style={{ marginTop: 32 }}>
                  <div style={{
                    fontFamily: 'var(--font-condensed)',
                    fontSize: '0.62rem',
                    letterSpacing: '0.16em',
                    fontWeight: 800,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase' as const,
                    marginBottom: 12,
                  }}>
                    Full Price List
                  </div>
                  {DIVISIONS.map(d => (
                    <div key={d.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: '1px solid var(--navy-border)',
                      fontSize: '0.85rem',
                    }}>
                      <span style={{ color: 'var(--text-body)' }}>{d.name}</span>
                      <span style={{ color: '#fff', fontWeight: 600 }}>
                        {fmt(d.baseCents)}
                        {isEarlyBird && (
                          <span style={{ color: 'var(--gold)', fontSize: '0.72rem', marginLeft: 6 }}>
                            ({fmt(d.baseCents - 500)} early bird)
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-body)' }}>1A + X Combo</span>
                    <span style={{ color: '#fff', fontWeight: 600 }}>
                      $40.00
                      {isEarlyBird && (
                        <span style={{ color: 'var(--gold)', fontSize: '0.72rem', marginLeft: 6 }}>
                          ($35.00 early bird)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
