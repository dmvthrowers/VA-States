import { Resend } from 'resend';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not set');
  return new Resend(key);
}

const FROM = `${process.env.RESEND_FROM_NAME ?? 'VSYC-26 Registration'} <${process.env.RESEND_FROM_EMAIL ?? 'vastateyoyocontest@dmvthrowers.club'}>`;
const REPLY_TO = process.env.RESEND_REPLY_TO ?? 'dmvthrowers@gmail.com';

export type EmailResult = { ok: true } | { ok: false; error: string };

interface ConfirmationParams {
  to: string;
  firstName: string;
  lastName: string;
  divisions: string[];
  feeCents: number;
  isComp: boolean;
  confirmUrl: string;
  musicUploadUrl: string;
  registrationId: string;
}

export async function sendConfirmationEmail(p: ConfirmationParams): Promise<EmailResult> {
  try {
    const resend = getResend();
    const fee = p.isComp ? 'FREE (comp pass)' : `$${(p.feeCents / 100).toFixed(2)}`;
    const { error } = await resend.emails.send({
      from: FROM,
      to: p.to,
      replyTo: REPLY_TO,
      subject: `VSYC-26 Registration Received — ${p.firstName}, here's what's next`,
      html: buildConfirmationHtml(p, fee),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

interface MusicReceivedParams {
  to: string;
  firstName: string;
  filename: string;
  division: string;
}

export async function sendMusicReceivedEmail(p: MusicReceivedParams): Promise<EmailResult> {
  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: FROM,
      to: p.to,
      replyTo: REPLY_TO,
      subject: `Music received for VSYC-26 — ${p.firstName}`,
      html: buildMusicReceivedHtml(p),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

interface PaymentReminderParams {
  to: string;
  firstName: string;
  feeCents: number;
  registrationId: string;
}

export async function sendPaymentReminderEmail(p: PaymentReminderParams): Promise<EmailResult> {
  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: FROM,
      to: p.to,
      replyTo: REPLY_TO,
      subject: `VSYC-26 Payment Reminder — ${p.firstName}`,
      html: buildPaymentReminderHtml(p),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── HTML builders ───────────────────────────────────────────────────────────

/** Escape registrant-supplied values before interpolating into email HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emailWrap(body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0d1428;font-family:Montserrat,system-ui,sans-serif;color:#c8d0e0;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;">
  <div style="border-top:4px solid #C9A84C;background:#1a2744;padding:32px;">
    <div style="font-size:0.6rem;letter-spacing:0.2em;font-weight:800;color:#C9A84C;margin-bottom:8px;">VSYC-26 · VIRGINIA STATE YO-YO CONTEST 2026</div>
    ${body}
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #2a3a5a;font-size:0.72rem;color:#3a4a6a;">
      Questions? Reply to this email or contact <a href="mailto:dmvthrowers@gmail.com" style="color:#C9A84C;">dmvthrowers@gmail.com</a><br/>
      September 19, 2026 · Dulles Town Center · Sterling, VA
    </div>
  </div>
</div></body></html>`;
}

function buildConfirmationHtml(p: ConfirmationParams, fee: string): string {
  const first = esc(p.firstName);
  const last = esc(p.lastName);
  return emailWrap(`
    <h1 style="font-family:Georgia,serif;font-size:1.6rem;color:#C9A84C;margin:0 0 8px;">Registration Received</h1>
    <p style="font-size:0.9rem;margin:0 0 24px;">Hey ${first} — you're in. Here's everything you need.</p>
    <div style="background:#0d1428;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.6rem;letter-spacing:0.16em;color:#C9A84C;font-weight:800;margin-bottom:12px;">YOUR REGISTRATION</div>
      <div style="font-size:0.85rem;margin-bottom:6px;"><strong style="color:#fff;">Name:</strong> ${first} ${last}</div>
      <div style="font-size:0.85rem;margin-bottom:6px;"><strong style="color:#fff;">Division(s):</strong> ${esc(p.divisions.join(', '))}</div>
      <div style="font-size:0.85rem;margin-bottom:6px;"><strong style="color:#fff;">Entry fee:</strong> ${fee}</div>
      <div style="font-size:0.85rem;"><strong style="color:#fff;">ID:</strong> ${p.registrationId.slice(0, 8).toUpperCase()}</div>
    </div>
    ${!p.isComp ? `
    <div style="background:#0d1428;border-left:4px solid #C8102E;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.6rem;letter-spacing:0.16em;color:#C8102E;font-weight:800;margin-bottom:12px;">PAYMENT REQUIRED</div>
      <p style="font-size:0.85rem;margin:0 0 12px;">Send <strong style="color:#fff;">${fee}</strong> to one of the following. Include your name and "VSYC26" in the note.</p>
      <div style="font-size:0.85rem;margin-bottom:4px;">💸 <strong style="color:#fff;">Venmo:</strong> @DMVThrow</div>
      <div style="font-size:0.85rem;margin-bottom:4px;">💳 <strong style="color:#fff;">PayPal:</strong> paypal.biz/Dmvthrowers</div>
      <div style="font-size:0.85rem;">📬 <strong style="color:#fff;">Check payable to:</strong> DMV Throwers</div>
    </div>` : ''}
    <div style="background:#0d1428;border-left:4px solid #C9A84C;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.6rem;letter-spacing:0.16em;color:#C9A84C;font-weight:800;margin-bottom:12px;">MUSIC UPLOAD</div>
      <p style="font-size:0.85rem;margin:0 0 12px;">Upload your music using the secure link below. <strong style="color:#fff;">Deadline: September 12, 2026.</strong></p>
      <a href="${p.musicUploadUrl}" style="display:inline-block;background:#C9A84C;color:#0d1428;font-weight:800;font-size:0.78rem;letter-spacing:0.1em;padding:12px 24px;text-decoration:none;">UPLOAD MUSIC →</a>
      <p style="font-size:0.75rem;margin:12px 0 0;color:#6a7a9a;">Format: DIVISION_LastName_FirstName.mp3 — the system will rename it automatically.</p>
    </div>
    <a href="${p.confirmUrl}" style="display:inline-block;background:#1a2744;border:1px solid #2a3a5a;color:#C9A84C;font-size:0.78rem;font-weight:700;letter-spacing:0.1em;padding:10px 20px;text-decoration:none;margin-top:4px;">VIEW YOUR REGISTRATION →</a>
  `);
}

function buildMusicReceivedHtml(p: MusicReceivedParams): string {
  return emailWrap(`
    <h1 style="font-family:Georgia,serif;font-size:1.6rem;color:#C9A84C;margin:0 0 8px;">Music Received</h1>
    <p style="font-size:0.9rem;margin:0 0 24px;">Got it, ${esc(p.firstName)}. Your music is in.</p>
    <div style="background:#0d1428;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.85rem;margin-bottom:6px;"><strong style="color:#fff;">Division:</strong> ${esc(p.division)}</div>
      <div style="font-size:0.85rem;"><strong style="color:#fff;">File saved as:</strong> <span style="font-family:monospace;color:#C9A84C;">${esc(p.filename)}</span></div>
    </div>
    <p style="font-size:0.82rem;color:#6a7a9a;">Music deadline was September 12, 2026. You're all set. See you at Dulles Town Center on September 19.</p>
  `);
}

function buildPaymentReminderHtml(p: PaymentReminderParams): string {
  const fee = `$${(p.feeCents / 100).toFixed(2)}`;
  return emailWrap(`
    <h1 style="font-family:Georgia,serif;font-size:1.6rem;color:#C9A84C;margin:0 0 8px;">Payment Reminder</h1>
    <p style="font-size:0.9rem;margin:0 0 24px;">Hey ${esc(p.firstName)} — we haven't received your VSYC-26 entry payment yet.</p>
    <div style="background:#0d1428;border-left:4px solid #C8102E;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.85rem;margin-bottom:6px;"><strong style="color:#fff;">Amount due:</strong> ${fee}</div>
      <div style="font-size:0.85rem;margin-bottom:4px;">💸 <strong style="color:#fff;">Venmo:</strong> @DMVThrow</div>
      <div style="font-size:0.85rem;margin-bottom:4px;">💳 <strong style="color:#fff;">PayPal:</strong> paypal.biz/Dmvthrowers</div>
      <div style="font-size:0.85rem;">📬 <strong style="color:#fff;">Check:</strong> DMV Throwers</div>
    </div>
    <p style="font-size:0.82rem;color:#6a7a9a;">Registration closes September 13. Unpaid registrations may be released after that date. Questions? Reply to this email.</p>
  `);
}
