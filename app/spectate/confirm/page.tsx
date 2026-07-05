'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';

function ConfirmContent() {
  const params = useSearchParams();
  const id = params.get('id');

  return (
    <main id="main-content" className="max-w-2xl mx-auto px-4 py-16 text-center">
      <span className="inline-block bg-gold text-navy-deep text-xs font-black tracking-widest px-3 py-1 mb-4">VSYC-26</span>
      <h1 className="font-display font-black text-4xl text-gold mb-4">You&apos;re on the list!</h1>
      <p className="text-text-body mb-8">
        Check your email for a confirmation and a calendar invite (.ics) for September 19, 2026 at
        Dulles Town Center, Sterling, VA.
      </p>
      {id && (
        <p className="text-xs text-text-muted mb-8">
          RSVP ID: <span className="font-mono text-gold">{id.slice(0, 8).toUpperCase()}</span>
        </p>
      )}
      <div className="border border-navy-border bg-navy p-6 text-left text-sm text-text-body">
        <p className="mb-2"><strong className="text-white">All ages, all levels, always free.</strong></p>
        <p>Loaners are provided if you want to try throwing while you&apos;re there. No need to bring anything.</p>
      </div>
      <a
        href="https://dmvthrowers.club/vsyc26-schedule.html"
        className="inline-block mt-8 text-xs font-black tracking-caps text-gold hover:text-gold-light"
      >
        → VIEW THE FULL SCHEDULE
      </a>
    </main>
  );
}

export default function SpectateConfirmPage() {
  return (
    <>
      <NavBar />
      <Suspense fallback={
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
        </div>
      }>
        <ConfirmContent />
      </Suspense>
      <Footer />
    </>
  );
}
