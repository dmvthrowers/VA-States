'use client';

import { useEffect, useRef } from 'react';

// Cloudflare Turnstile widget. Renders nothing until
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. Tokens are single-use: change
// `resetKey` after every submit attempt to get a fresh one. Pass a stable
// `onToken` (a state setter) so the widget doesn't re-render each time.

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error('Turnstile script failed to load'));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export const turnstileEnabled = Boolean(SITE_KEY);

export function Turnstile({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string) => void;
  resetKey?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    const el = ref.current;
    let widgetId: string | undefined;
    let cancelled = false;
    onToken('');

    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetId = window.turnstile.render(el, {
          sitekey: SITE_KEY,
          size: 'flexible',
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        });
      })
      .catch((e) => console.error(e));

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [resetKey, onToken]);

  if (!SITE_KEY) return null;
  return <div ref={ref} />;
}
