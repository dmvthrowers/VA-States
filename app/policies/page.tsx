import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';

export default function PoliciesPage() {
  return (
    <>
      <NavBar />

      <main id="main-content" className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <header className="space-y-3">
          <span className="inline-block bg-gold text-navy-deep text-xs font-black tracking-widest px-3 py-1">VSYC-26</span>
          <h1 className="font-display font-black text-4xl text-gold">Policies & Event Terms</h1>
          <p className="text-sm text-text-body">
            These policies apply to registration and participation for Virginia State Yo-Yo Contest 2026.
            Questions can be sent to{' '}
            <a href="mailto:dmvthrowers@gmail.com" className="text-gold hover:text-gold-light">dmvthrowers@gmail.com</a>.
          </p>
        </header>

        <section className="border border-navy-border bg-navy p-5 space-y-2">
          <h2 className="font-display font-black text-2xl text-white">Privacy & Data Use</h2>
          <p className="text-sm text-text-body">
            Registration data is used to run the event safely and efficiently, including bracket management,
            emergency contact readiness, payment reconciliation, and participant communications.
          </p>
          <p className="text-sm text-text-body">
            Public profile fields are optional for adults. Competitors under 18 are private by default.
            Emergency contacts and waiver records are retained for event operations and safety documentation.
          </p>
        </section>

        <section className="border border-navy-border bg-navy p-5 space-y-2">
          <h2 className="font-display font-black text-2xl text-white">Refund Policy</h2>
          <p className="text-sm text-text-body">
            Registration fees are generally non-refundable once payment is completed due to event planning,
            staffing, and venue costs. Exceptional situations can be reviewed case-by-case by the organizers.
          </p>
          <p className="text-sm text-text-body">
            To request a review, email{' '}
            <a href="mailto:dmvthrowers@gmail.com" className="text-gold hover:text-gold-light">dmvthrowers@gmail.com</a>{' '}
            with your registration name, division, and reason for the request.
          </p>
        </section>

        <section className="border border-navy-border bg-navy p-5 space-y-2">
          <h2 className="font-display font-black text-2xl text-white">Photo & Video Terms</h2>
          <p className="text-sm text-text-body">
            VSYC-26 includes photography, livestream, and event recap media. By attending, participants may
            appear in event media used for documentation and promotion by DMV Throwers.
          </p>
          <p className="text-sm text-text-body">
            Competitor registration requires explicit photo/video consent. If you have questions about media
            handling, contact organizers before event day.
          </p>
        </section>
      </main>

      <Footer />
    </>
  );
}