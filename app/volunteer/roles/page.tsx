import Link from 'next/link';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { getVolunteerRoleAvailability, type VolunteerRoleAvailability } from '@/lib/volunteer-availability';

export const dynamic = 'force-dynamic';

const CATEGORY_META: Record<string, { title: string; blurb: string }> = {
  core: {
    title: 'Core Roles',
    blurb: 'One person per role. May carry a small honorarium — these get a bit more scrutiny in review.',
  },
  judge: {
    title: 'Judges',
    blurb: 'Up to 9 judges total across all three roles below, shared as one pool. Goal: 3–4 judges per division panel plus a senior judge, so each panel can finish a division and then enjoy the rest of the contest.',
  },
  non_core: {
    title: 'Volunteer Roles',
    blurb: 'Up to 4 people per role. Registration Booth is our highest-priority support role.',
  },
  other: {
    title: 'Something Else?',
    blurb: 'No cap here — got a talent, act, or idea we didn\'t think of (magician, lunch-break band, whatever)? Tell us on the form.',
  },
};

function fillLabel(role: VolunteerRoleAvailability): string {
  if (role.group_key) {
    const count = role.group_confirmed_count ?? 0;
    const cap = role.group_max_capacity ?? 0;
    return `${count} / ${cap} confirmed (shared judge pool)`;
  }
  if (role.max_capacity != null) {
    return `${role.confirmed_count} / ${role.max_capacity} confirmed`;
  }
  return `${role.confirmed_count} confirmed`;
}

export default async function VolunteerRolesPage() {
  const roles = await getVolunteerRoleAvailability();
  const categories: Array<'core' | 'judge' | 'non_core' | 'other'> = ['core', 'judge', 'non_core', 'other'];

  return (
    <>
      <NavBar />
      <main id="main-content" className="max-w-4xl mx-auto px-4 py-10 space-y-10">
        <header>
          <span className="inline-block bg-gold text-navy-deep text-xs font-black tracking-widest px-3 py-1 mb-3">VSYC-26</span>
          <h1 className="font-display font-black text-4xl text-gold mb-2">Volunteer Roles & Availability</h1>
          <p className="text-sm text-text-body">
            Counts below reflect confirmed volunteers only — pending applications aren&apos;t counted, so a role
            showing &quot;FULL&quot; may still be worth applying to as a backup or for a future role.
          </p>
          <Link href="/volunteer" className="inline-block mt-4 text-xs font-black tracking-caps text-gold hover:text-gold-light">
            → Apply to volunteer
          </Link>
        </header>

        {categories.map((cat) => {
          const rolesInCat = roles.filter((r) => r.category === cat);
          if (rolesInCat.length === 0) return null;
          const meta = CATEGORY_META[cat];
          return (
            <section key={cat}>
              <div className="mb-4">
                <h2 className="font-display font-black text-2xl text-white">{meta.title}</h2>
                <p className="text-sm text-text-body mt-1">{meta.blurb}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {rolesInCat.map((role) => (
                  <div
                    key={role.role_key}
                    className={`border p-4 bg-navy ${role.is_priority ? 'border-gold' : 'border-navy-border'}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-display font-bold text-lg text-white">{role.label}</h3>
                      {role.is_priority && (
                        <span className="inline-block bg-gold text-navy-deep text-[0.6rem] font-black tracking-caps px-2 py-0.5 whitespace-nowrap">
                          PRIORITY
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-body mb-3">{role.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">{fillLabel(role)}</span>
                      <span
                        className={`text-[0.65rem] font-black tracking-caps px-2 py-0.5 ${
                          role.is_full ? 'bg-red/20 text-red' : 'bg-gold/20 text-gold-light'
                        }`}
                      >
                        {role.is_full ? 'FULL' : 'OPEN'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <div className="border border-navy-border bg-navy p-5 text-center">
          <p className="text-sm text-text-body mb-4">
            Ready to sign up? All ages, all levels, always free to volunteer.
          </p>
          <Link
            href="/volunteer"
            className="inline-block bg-gold text-navy-deep font-black tracking-caps px-5 py-3 text-xs"
          >
            APPLY TO VOLUNTEER →
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
