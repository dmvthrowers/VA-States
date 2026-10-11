import ModuleBoard from '@/components/ModuleBoard';

export default function Page() {
  return (
    <>
      <ModuleBoard module="mc" roles={['admin', 'mc']} />
      <p style={{ textAlign: 'center', fontSize: '0.85rem', margin: '1rem 0 2rem' }}>
        <a href="/mc/cards" style={{ color: 'var(--gold-light)' }}>MC cards: one per competitor, in run order</a>
      </p>
    </>
  );
}
