/** VSYC-26 NavBar — matches ui_kits/vsyc26/index.html nav pattern, with mobile burger menu */

'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

const SITE_HOME = 'https://dmvthrowers.club/vsyc26-register.html';

interface NavBarProps {
  activePage?: 'register' | 'upload' | 'confirm';
}

// Always-visible desktop links — kept short on purpose so the bar doesn't get crowded.
// Mirrors the marketing site's core nav order (About/Schedule/Register/Sponsors/Venue).
const NAV_LINKS = [
  { label: 'About',    href: 'https://dmvthrowers.club/vsyc26.html' },
  { label: 'Schedule', href: 'https://dmvthrowers.club/vsyc26-schedule.html' },
  { label: 'Register', href: '/' },
  { label: 'Sponsors', href: 'https://dmvthrowers.club/vsyc26-sponsors.html' },
  { label: 'Venue',    href: 'https://dmvthrowers.club/vsyc26-venue.html' },
];

// Less-critical / reference links, tucked under a "More" dropdown on desktop so the
// primary bar stays uncluttered. Rules/FAQ exist on the marketing site; Directory/Results
// are app-only, DB-backed pages with no static-site equivalent.
const MORE_LINKS = [
  { label: 'Rules',     href: 'https://dmvthrowers.club/vsyc26-rules.html' },
  { label: 'FAQ',       href: 'https://dmvthrowers.club/vsyc26-faq.html' },
  { label: 'Volunteer', href: '/volunteer' },
  { label: 'Directory', href: '/directory' },
  { label: 'Results',   href: '/results' },
];

// Single action button on the main bar. "Event Info" was dropped because the brand
// logo already links to SITE_HOME (same destination, redundant button). "Music Upload"
// was dropped because /portal already lists it as a card — it doesn't need its own
// top-level slot too. This is the fix for the nav feeling squished: we went from 3
// buttons + 5 links + a dropdown down to 1 button + 5 links + a dropdown.
const ACTION_LINKS = [
  { label: 'Portal Access',    href: '/portal',   variant: 'outline' as const },
];

const actionClasses: Record<'gold' | 'outline' | 'red', string> = {
  gold:    'bg-gold text-navy-deep',
  outline: 'bg-transparent text-gold border border-gold',
  red:     'bg-red text-white',
};

export default function NavBar({ activePage }: NavBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [moreOpen]);

  return (
    <>
      {/* Top bar — gold strip matching UI kit #top-bar */}
      <div className="bg-gold px-3 py-1.5 flex justify-between items-center gap-3 flex-wrap md:px-6">
        <span className="font-condensed text-[0.62rem] md:text-[0.72rem] text-navy-deep tracking-caps font-extrabold uppercase">
          VSYC-26 · SEPT 19, 2026 · DULLES TOWN CENTER · STERLING VA
        </span>
        <a
          href="https://dmvthrowers.club/vsyc26-sponsors.html"
          className="font-condensed text-[0.62rem] md:text-[0.72rem] text-navy-deep font-extrabold tracking-caps uppercase underline whitespace-nowrap"
        >
          BECOME A SPONSOR →
        </a>
      </div>

      {/* Main nav */}
      <nav aria-label="Site navigation" className="bg-navy-deep border-b border-navy-border sticky top-0 z-[200]">
        <div className="max-w-[1100px] mx-auto flex items-center justify-between h-16 px-3 md:px-6">
          {/* Brand */}
          <a href={SITE_HOME} aria-label="VSYC-26 home" className="flex items-center gap-2 md:gap-3 no-underline min-w-0">
            <Image
              src="https://dmvthrowers.club/assets/images/vsyc26-va-logo-32.png"
              alt=""
              aria-hidden="true"
              width={34}
              height={34}
              className="object-contain flex-shrink-0"
            />
            <div className="min-w-0">
              <div className="font-display font-black text-sm md:text-base text-white leading-none truncate">
                VSYC-26
              </div>
              <div className="font-condensed text-[0.55rem] tracking-widest text-gold font-bold uppercase truncate">
                Virginia State Yo-Yo Contest
              </div>
            </div>
          </a>

          {/* Desktop links — hidden below lg */}
          <div className="hidden lg:flex items-center gap-6">
            {ACTION_LINKS.map(link => (
              <a
                key={link.label}
                href={link.href}
                className={`font-condensed text-xs font-extrabold tracking-caps uppercase no-underline px-4 py-1.5 whitespace-nowrap ${actionClasses[link.variant]}`}
              >
                {link.label}
              </a>
            ))}

            <div className="flex items-center gap-5">
              {NAV_LINKS.map(link => {
                const isActive = activePage === 'register' && link.label === 'Register';
                return (
                  <a
                    key={link.label}
                    href={link.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`font-condensed text-xs font-bold tracking-caps no-underline py-1.5 border-b-2 uppercase transition-colors whitespace-nowrap ${
                      isActive
                        ? 'text-gold border-gold'
                        : 'text-text-muted border-transparent hover:text-gold hover:border-gold'
                    }`}
                  >
                    {link.label}
                  </a>
                );
              })}

              {/* "More" dropdown — Rules/FAQ/Directory/Results, kept off the main bar */}
              <div className="relative" ref={moreRef}>
                <button
                  type="button"
                  onClick={() => setMoreOpen(o => !o)}
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-1 font-condensed text-xs font-bold tracking-caps uppercase py-1.5 border-b-2 border-transparent text-text-muted hover:text-gold hover:border-gold transition-colors"
                >
                  More
                  <span className={`inline-block transition-transform ${moreOpen ? 'rotate-180' : ''}`}>▾</span>
                </button>

                {moreOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 min-w-[160px] bg-navy-deep border border-navy-border shadow-lg py-1 z-[210]"
                  >
                    {MORE_LINKS.map(link => (
                      <a
                        key={link.label}
                        href={link.href}
                        role="menuitem"
                        onClick={() => setMoreOpen(false)}
                        className="block font-condensed text-xs font-bold tracking-caps uppercase text-text-muted no-underline px-4 py-2.5 hover:text-gold hover:bg-navy"
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Burger button — visible below lg */}
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="lg:hidden flex flex-col justify-center items-center gap-1.5 w-10 h-10 flex-shrink-0"
          >
            <span className={`block w-6 h-0.5 bg-gold transition-transform ${menuOpen ? 'translate-y-2 rotate-45' : ''}`} />
            <span className={`block w-6 h-0.5 bg-gold transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-6 h-0.5 bg-gold transition-transform ${menuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
          </button>
        </div>

        {/* Mobile dropdown panel */}
        {menuOpen && (
          <div id="mobile-nav-menu" className="lg:hidden border-t border-navy-border bg-navy-deep px-4 py-4 space-y-3">
            <div className="flex flex-col gap-2">
              {ACTION_LINKS.map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  className={`font-condensed text-xs font-extrabold tracking-caps uppercase no-underline px-3 py-2.5 text-center ${actionClasses[link.variant]}`}
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div className="border-t border-navy-border pt-3 flex flex-col gap-1">
              {NAV_LINKS.map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  className={`font-condensed text-sm font-bold tracking-caps no-underline uppercase py-2 ${
                    activePage === 'register' && link.label === 'Register' ? 'text-gold' : 'text-text-muted'
                  }`}
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div className="border-t border-navy-border pt-3 flex flex-col gap-1">
              <div className="font-condensed text-[0.65rem] tracking-caps uppercase text-text-muted/70 pb-1">More</div>
              {MORE_LINKS.map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  className="font-condensed text-sm font-bold tracking-caps no-underline uppercase py-2 text-text-muted"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </nav>
    </>
  );
}
