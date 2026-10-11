'use client';

import BracketStaffGate from '@/components/BracketStaffGate';
import VolunteerManager from '@/components/VolunteerManager';

export default function VolunteersPage() {
  return (
    <BracketStaffGate title="Volunteers" roles={['admin', 'organizer']} landmark={false}>
      {({ token }) => (
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', margin: '0 0 1rem' }}>Volunteers</h1>
          <section className="border border-navy-border bg-navy p-4">
            <VolunteerManager token={token} />
          </section>
        </div>
      )}
    </BracketStaffGate>
  );
}
