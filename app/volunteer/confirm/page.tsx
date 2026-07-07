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
      <h1 className="font-display font-black text-4xl text-gold mb-4">Thanks for volunteering!</h1>
      <p className="text-text-body mb-8">
        Your application is in and marked pending review. Check your email for a confirmation — the
        event organizer will follow up to confirm your role and shift before September 19, 2026.
      </p>
      {id && (
        <p className="text-xs text-text-muted mb-8">
          Application ID: <span className="font-mono text-gold">{id.slice(0, 8).toUpperCase()}</span>
        </p>
      )}
      <div className="border border-navy-border bg-navy p-6 text-left text-sm text-text-body">
        <p className="mb-2"><strong className="text-white">Role assignments are the organizer&apos;s call.</strong></p>
        <p>Your final role may differ from your top choice, especially for roles that fill up fast. Nothing is confirmed until you hear back.</p>
        <p className="mt-3"><strong className="text-gold-light">Once confirmed, you&apos;ll get a follow-up email with a one-time code for 50% off your own VSYC-26 competitor entry fee.</strong></p>
      </div>
      <a
        href="/volunteer/roles"
        className="inline-block mt-6 text-xs font-black tracking-caps text-gold hover:text-gold-light"
      >
        → SEE ALL VOLUNTEER ROLES
      </a>
      <a
        href="https://dmvthrowers.club/vsyc26-schedule.html"
        className="inline-block mt-8 text-xs font-black tracking-caps text-gold hover:text-gold-light"
      >
        → VIEW THE FULL SCHEDULE
      </a>
    </main>
  );
}

export default function VolunteerConfirmPage() {
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
