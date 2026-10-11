'use client';

import BracketStaffGate from '@/components/BracketStaffGate';
import BudgetManager from '@/components/BudgetManager';

export default function FinancePage() {
  return (
    <BracketStaffGate title="Finance" roles={['admin', 'finance']} landmark={false}>
      {({ token }) => (
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.6rem', margin: '0 0 1rem' }}>Finance</h1>
          <section className="border border-navy-border bg-navy p-4">
            <BudgetManager token={token} />
          </section>
        </div>
      )}
    </BracketStaffGate>
  );
}
