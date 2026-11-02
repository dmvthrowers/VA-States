import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { contest, longDate } from '@/contest.config';

/**
 * The page shown in place of a sign-up form once the season is archived (`seasonClosed()`): thanks for this
 * contest, links to its results and frozen record, and the next contest with whatever is known (TBD until set).
 */
export default function SeasonClosed({ title, activePage }: { title: string; activePage?: 'register' }) {
  const { next } = contest;
  return (
    <>
      <NavBar activePage={activePage} />
      <main id="main-content" className="max-w-3xl mx-auto px-4 py-16">
        <span className="inline-block bg-gold text-navy-deep text-xs font-black tracking-widest px-3 py-1 mb-3">{contest.shortName} ARCHIVE</span>
        <h1 className="font-display font-black text-4xl text-gold mb-4">{title}</h1>
        <p className="text-text-body leading-relaxed mb-3">
          Thank you to every competitor, volunteer and spectator who made {contest.shortName} happen on {longDate()}. The results are saved for good.
        </p>
        <div className="border border-gold/40 px-5 py-4 mb-6">
          <p className="text-gold text-xs font-black tracking-caps mb-2">{next.shortName} · COMING NEXT</p>
          <p className="text-text-body leading-relaxed">
            Date: <strong className="text-white">{next.date}</strong> · Venue: <strong className="text-white">{next.venue}</strong>.
            {' '}Sign-ups open here once they&rsquo;re set.
          </p>
        </div>
        <p className="text-text-body leading-relaxed mb-8">
          Questions? Email{' '}
          <a className="text-gold underline" href={`mailto:${contest.contactEmail}`}>{contest.contactEmail}</a>.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="/results" className="inline-block bg-gold text-navy-deep text-xs font-black tracking-caps px-5 py-3 hover:bg-gold-light transition-colors">SEE THE RESULTS →</a>
          <a href={contest.archive.url} className="inline-block border border-gold text-gold text-xs font-black tracking-caps px-5 py-3 hover:bg-gold hover:text-navy-deep transition-colors">FINAL STANDINGS →</a>
          <a href={next.url} className="inline-block border border-gold text-gold text-xs font-black tracking-caps px-5 py-3 hover:bg-gold hover:text-navy-deep transition-colors">{next.shortName.toUpperCase()} →</a>
        </div>
      </main>
      <Footer />
    </>
  );
}
