import ModuleBoard from '@/components/ModuleBoard';

export default function Page() {
  return (
    <>
      <ModuleBoard module="media" roles={['admin', 'media']} />
      <p style={{ textAlign: 'center', fontSize: '0.85rem', margin: '1rem 0 2rem' }}>
        <a href="/media/consent" style={{ color: 'var(--gold-light)' }}>Do-not-photograph list</a>
      </p>
    </>
  );
}
