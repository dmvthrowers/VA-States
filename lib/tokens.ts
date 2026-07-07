/** Edge-compatible random token generator (Web Crypto API). */
export function generateToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Excludes ambiguous characters (0/O, 1/I/L) since this is meant to be typed
// by a human at checkout, not just machine-compared.
const READABLE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Short human-typeable random code (e.g. for comp codes). Not for secrets. */
export function generateReadableCode(length = 8): string {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => READABLE_CHARSET[b % READABLE_CHARSET.length]).join('');
}

/** Constant-time string comparison to prevent timing attacks. */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
