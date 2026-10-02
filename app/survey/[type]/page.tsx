import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import SurveyForm from '@/components/SurveyForm';
import { SURVEYS, SURVEY_SOURCES, isSurveyType, type SurveySource } from '@/lib/surveys';

// Unlisted: reachable only by link (email, QR, live share). Not in the nav,
// sitemap, or search results.
export const metadata: Metadata = {
  title: 'Feedback',
  description: 'Tell us how VSYC-26 went. About 4 minutes.',
  robots: { index: false, follow: false },
};

export default async function SurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ src?: string; watch?: string }>;
}) {
  const { type } = await params;
  if (!isSurveyType(type)) notFound();

  const { src, watch } = await searchParams;
  const source: SurveySource = (SURVEY_SOURCES as readonly string[]).includes(src ?? '')
    ? (src as SurveySource)
    : 'direct';

  const def = SURVEYS[type];

  return (
    <>
      <NavBar />

      <div className="bg-navy-deep border-b border-navy-border py-12 px-6">
        <div className="max-w-2xl mx-auto">
          <span className="inline-block bg-gold text-navy-deep text-xs font-black tracking-widest px-3 py-1 mb-3">
            {def.eyebrow.toUpperCase()}
          </span>
          <h1 className="font-display font-black text-3xl sm:text-4xl text-gold mb-3">{def.title}</h1>
          <p className="text-xs tracking-widest text-white/70 font-semibold uppercase">
            VSYC-26 · Brought to you by Goodles · Sept 19, 2026 · Dulles Town Center
          </p>
          <p className="text-sm text-text-body mt-3">{def.intro}</p>
        </div>
      </div>

      <main id="main-content" className="max-w-2xl mx-auto px-4 py-10">
        <SurveyForm
          type={type}
          source={source}
          // ?watch=stream (e.g. from the YouTube description) opens the livestream path.
          initialAnswers={type === 'spectator' && watch === 'stream' ? { watch_mode: 'On the livestream only' } : {}}
        />
      </main>

      <Footer />
    </>
  );
}
