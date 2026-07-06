/** VSYC-26 NavBar — matches ui_kits/vsyc26/index.html nav pattern, with mobile burger menu */

'use client';

import { useState } from 'react';
import Image from 'next/image';

const SITE_HOME = 'https://dmvthrowers.club/vsyc26-register.html';

interface NavBarProps {
  activePage?: 'register' | 'upload' | 'confirm';
}

const NAV_LINKS = [
  { label: 'About',    href: 'https://dmvthrowers.club/vsyc26.html' },
  { label: 'Schedule', href: 'https://dmvthrowers.club/vsyc26-schedule.html' },
  { label: 'Register', href: SITE_HOME },
  { label: 'Sponsors', href: 'https://dmvthrowers.club/vsyc26-sponsors.html' },
  { label: 'Venue',    href: 'https://dmvthrowers.club/vsyc26-venue.html' },
];

const ACTION_LINKS = [
  { label: '← Event Info',     href: SITE_HOME,   variant: 'gold' as const },
  { label: 'Portal Access',    href: '/portal',   variant: 'outline' as const },
  { label: 'Music Upload',     href: '/player',   variant: 'red' as const },
];

const actionClasses: Record<'gold' | 'outline' | 'red', string> = {
  gold:    'bg-gold text-navy-deep',
  outline: 'bg-transparent text-gold border border-gold',
  red:     'bg-red text-white',
};

export default function NavBar({ activePage }: NavBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

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
          SPONSOR VSYC-26 →
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
          <div className="hidden lg:flex items-center gap-5">
            {ACTION_LINKS.map(link => (
              <a
                key={link.label}
                href={link.href}
                className={`font-condensed text-xs font-extrabold tracking-caps uppercase no-underline px-3 py-1.5 ${actionClasses[link.variant]}`}
              >
                {link.label}
              </a>
            ))}

            {NAV_LINKS.filter(l => l.label !== 'Register').map(link => (
              <a
                key={link.label}
                href={link.href}
                className="font-condensed text-xs font-bold tracking-caps text-text-muted no-underline py-1.5 border-b-2 border-transparent uppercase hover:text-gold hover:border-gold transition-colors"
              >
                {link.label}
              </a>
            ))}

            {activePage === 'register' && (
              <span className="font-condensed text-xs font-bold tracking-caps text-gold py-1.5 border-b-2 border-gold uppercase">
                REGISTER
              </span>
            )}
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
          </div>
        )}
      </nav>
    </>
  );
}
