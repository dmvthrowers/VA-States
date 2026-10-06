import { buildVsyc26Ics } from './ics';
import { enqueueEmails, queueEmail, type QueueOptions } from './outbox';
import { divisionByCode } from '@/contest.config';
import type { TeamSummary } from './team-entries';
import { joinDivisions, playerSlots } from './music';
import { slotsOf } from './music-config';

// Every send* function below renders its email and hands it to the outbox
// (lib/outbox.ts), which stores it, sends it right away when the daily budget
// allows, and retries it later otherwise.

export const FROM = `${process.env.RESEND_FROM_NAME ?? 'VSYC-26 Registration'} <${process.env.RESEND_FROM_EMAIL ?? 'vastateyoyocontest@dmvthrowers.club'}>`;
export const REPLY_TO = process.env.RESEND_REPLY_TO ?? 'contact@dmvthrowers.club';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';

/** `queued`: accepted but not sent yet (daily limit or a Resend hiccup); it goes out automatically. */
export type EmailResult = { ok: true; queued?: boolean } | { ok: false; error: string };

export interface RenderedEmail {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  text: string;
  /** content is base64 */
  attachments?: { filename: string; content: string }[];
}

/** One variant per template; stored as email_outbox.payload and rendered at send time. */
export type OutboxEmail =
  | { template: 'confirmation'; params: ConfirmationParams }
  | { template: 'music_received'; params: MusicReceivedParams }
  | { template: 'music_reminder'; params: MusicReminderParams }
  | { template: 'payment_reminder'; params: PaymentReminderParams }
  | { template: 'payment_received'; params: PaymentReceivedParams }
  | { template: 'spectator_confirmation'; params: SpectatorConfirmationParams }
  | { template: 'volunteer_confirmation'; params: VolunteerConfirmationParams }
  | { template: 'volunteer_confirmed'; params: VolunteerConfirmedParams }
  | { template: 'survey_invite'; params: SurveyInviteParams }
  | { template: 'admin_alert'; params: AdminAlertParams };

export function renderEmail(e: OutboxEmail): RenderedEmail {
  switch (e.template) {
    case 'confirmation': return renderConfirmation(e.params);
    case 'music_received': return renderMusicReceived(e.params);
    case 'music_reminder': return renderMusicReminder(e.params);
    case 'payment_reminder': return renderPaymentReminder(e.params);
    case 'payment_received': return renderPaymentReceived(e.params);
    case 'spectator_confirmation': return renderSpectatorConfirmation(e.params);
    case 'volunteer_confirmation': return renderVolunteerConfirmation(e.params);
    case 'volunteer_confirmed': return renderVolunteerConfirmed(e.params);
    case 'survey_invite': return renderSurveyInvite(e.params);
    case 'admin_alert': return renderAdminAlert(e.params);
  }
}

/** Escape registrant-supplied values before interpolating into email HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface ConfirmationParams {
  to: string;
  firstName: string;
  lastName: string;
  divisions: string[];
  feeCents: number;
  isComp: boolean;
  confirmUrl: string;
  musicUploadUrl?: string;
  registrationId: string;
  /** Set true when resending to a registrant who has already paid, so the email doesn't ask for payment again. */
  alreadyPaid?: boolean;
  /** Teams they started or joined; captains get their join code to share. */
  teams?: TeamSummary[];
}

/** ": one track for each of 1A Prelims, 1A Final and X Prelims" when a player has more than one track to upload. */
function musicSlotsNote(divisions: string[]): string {
  const slots = playerSlots(divisions, slotsOf);
  if (slots.length < 2) return '';
  const names = slots.map((s) => (s.labelled ? `${s.division} ${s.label}` : s.division));
  return `: one track for each of ${joinDivisions(names)}`;
}

/** "Pair", "Act"… for a team division (falls back to "team"). */
function teamLabel(division: string): string {
  const e = divisionByCode(division)?.entry;
  return e?.type === 'team' ? e.label : 'team';
}

/** One team line: "Doubles — Pair: Loop Twins (captain)". */
function teamLine(t: TeamSummary): string {
  return `${divisionByCode(t.division)?.name ?? t.division} — ${teamLabel(t.division)}: ${t.name} (${t.role === 'captain' ? 'captain' : 'member'})`;
}

const shareSentence = (code: string) => `Share code ${code} with your teammates so they can join when they register.`;

export async function sendConfirmationEmail(p: ConfirmationParams, opts?: QueueOptions): Promise<EmailResult> {
  return queueEmail({ template: 'confirmation', params: p }, opts);
}

function renderConfirmation(p: ConfirmationParams): RenderedEmail {
  const joinedFree = p.feeCents === 0 && !p.isComp && (p.teams ?? []).some((t) => t.role === 'member');
  const fee = p.isComp ? 'FREE (comp pass)' : joinedFree ? '$0.00 (your captain pays the entry)' : `$${(p.feeCents / 100).toFixed(2)}`;
  const ics = buildVsyc26Ics({
    uid: `competitor-${p.registrationId}`,
    summary: 'VSYC-26 — You are competing!',
  });
  return {
    to: p.to,
    subject: `VSYC-26 Registration Received — ${p.firstName}, here's what's next`,
    html: buildConfirmationHtml(p, fee),
    text: buildConfirmationText(p, fee),
    attachments: [
      { filename: 'VSYC-26.ics', content: Buffer.from(ics, 'utf-8').toString('base64') },
    ],
  };
}

interface MusicReceivedParams {
  to: string;
  firstName: string;
  filename: string;
  division: string;
  /** "Prelims", "Battle music"... when the division has more than one track */
  slotLabel?: string;
}

export async function sendMusicReceivedEmail(p: MusicReceivedParams, opts?: QueueOptions): Promise<EmailResult> {
  return queueEmail({ template: 'music_received', params: p }, opts);
}

function renderMusicReceived(p: MusicReceivedParams): RenderedEmail {
  return {
    to: p.to,
    subject: `Music received for VSYC-26 — ${p.firstName}`,
    html: buildMusicReceivedHtml(p),
    text: buildMusicReceivedText(p),
  };
}

export interface MusicReminderParams {
  to: string;
  /** Parent or guardian of a minor */
  cc?: string[];
  firstName: string;
  /** The tracks still missing, e.g. { division: '1A', label: 'Prelims', labelled: true } */
  missing: { division: string; label: string; labelled: boolean }[];
  uploadUrl: string;
  deadlineLabel: string;
  /** Say that an empty slot gets a lo-fi track (only when the lo-fi pool exists) */
  lofiFallback: boolean;
}

function renderMusicReminder(p: MusicReminderParams): RenderedEmail {
  const names = p.missing.map((m) => `${divisionByCode(m.division)?.name ?? m.division}${m.labelled ? ` · ${m.label}` : ''}`);
  const list = joinDivisions(p.missing.map((m) => (m.labelled ? `${m.division} ${m.label}` : m.division)));
  const fallback = p.lofiFallback
    ? 'If a slot is still empty at the deadline, a lo-fi track plays instead.'
    : 'If a slot is still empty at the deadline, we cannot play music for it.';
  return {
    to: p.to,
    ...(p.cc?.length ? { cc: p.cc } : {}),
    subject: `Music reminder for VSYC-26 — ${p.firstName}, ${list} still needs a track`,
    html: emailWrap(`
    <h1 style="font-family:Georgia,serif;font-size:1.6rem;color:#C9A84C;margin:0 0 8px;">Music Reminder</h1>
    <p style="font-size:0.9rem;margin:0 0 24px;">Hey ${esc(p.firstName)} — we don't have music for ${esc(list)} yet.</p>
    <div style="background:#0d1428;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.6rem;letter-spacing:0.16em;color:#C9A84C;font-weight:800;margin-bottom:12px;">STILL NEEDED</div>
      ${names.map((n) => `<div style="font-size:0.85rem;margin-bottom:6px;color:#fff;">${esc(n)}</div>`).join('')}
      <div style="font-size:0.85rem;margin-top:12px;"><strong style="color:#fff;">Deadline:</strong> ${esc(p.deadlineLabel)}</div>
      <a href="${p.uploadUrl}" style="display:inline-block;background:#C9A84C;color:#0d1428;font-weight:800;font-size:0.78rem;letter-spacing:0.1em;padding:12px 24px;text-decoration:none;margin-top:12px;">UPLOAD MUSIC →</a>
    </div>
    <p style="font-size:0.82rem;color:#6a7a9a;">You upload one track for each slot below. ${esc(fallback)}</p>
  `),
    text: [
      `Music Reminder — VSYC-26`,
      ``,
      `Hey ${p.firstName} — we don't have music for ${list} yet.`,
      ``,
      `Still needed: ${names.join('; ')}`,
      `Deadline: ${p.deadlineLabel}`,
      `Upload: ${p.uploadUrl}`,
      ``,
      `You upload one track for each slot below. ${fallback}`,
      ``,
      `Questions? Reply to this email or contact contact@dmvthrowers.club`,
    ].join('\n'),
  };
}

interface PaymentReminderParams {
  to: string;
  firstName: string;
  feeCents: number;
  registrationId: string;
  confirmUrl: string;
}

export async function sendPaymentReminderEmail(p: PaymentReminderParams, opts?: QueueOptions): Promise<EmailResult> {
  return queueEmail({ template: 'payment_reminder', params: p }, { priority: 2, ...opts });
}

function renderPaymentReminder(p: PaymentReminderParams): RenderedEmail {
  return {
    to: p.to,
    subject: `VSYC-26 Payment Reminder — ${p.firstName}`,
    html: buildPaymentReminderHtml(p),
    text: buildPaymentReminderText(p),
  };
}

interface SpectatorConfirmationParams {
  to: string;
  firstName: string;
  spectatorId: string;
  isPublic: boolean;
  portalUrl?: string;
}

export async function sendSpectatorConfirmationEmail(p: SpectatorConfirmationParams, opts?: QueueOptions): Promise<EmailResult> {
  return queueEmail({ template: 'spectator_confirmation', params: p }, opts);
}

function renderSpectatorConfirmation(p: SpectatorConfirmationParams): RenderedEmail {
  const ics = buildVsyc26Ics({
    uid: `spectator-${p.spectatorId}`,
    summary: 'VSYC-26 — Virginia State Yo-Yo Contest (Spectator RSVP)',
  });
  return {
    to: p.to,
    subject: `You're on the list for VSYC-26, ${p.firstName}!`,
    html: buildSpectatorConfirmationHtml(p),
    text: buildSpectatorConfirmationText(p),
    attachments: [
      { filename: 'VSYC-26.ics', content: Buffer.from(ics, 'utf-8').toString('base64') },
    ],
  };
}

interface VolunteerConfirmationParams {
  to: string;
  firstName: string;
  volunteerId: string;
  roleChoice1Label: string;
  roleChoice2Label?: string;
  otherRoleDescription?: string;
}

export async function sendVolunteerConfirmationEmail(p: VolunteerConfirmationParams, opts?: QueueOptions): Promise<EmailResult> {
  return queueEmail({ template: 'volunteer_confirmation', params: p }, opts);
}

function renderVolunteerConfirmation(p: VolunteerConfirmationParams): RenderedEmail {
  return {
    to: p.to,
    subject: `Volunteer application received — VSYC-26, ${p.firstName}`,
    html: buildVolunteerConfirmationHtml(p),
    text: buildVolunteerConfirmationText(p),
  };
}

interface PaymentReceivedParams {
  to: string;
  firstName: string;
  amountCents: number;
  registrationId: string;
  confirmUrl: string;
}

/** Sent once per registration when Stripe confirms payment (dedupe key payment:<id>). */
export async function sendPaymentReceivedEmail(p: PaymentReceivedParams, opts?: QueueOptions): Promise<EmailResult> {
  return queueEmail({ template: 'payment_received', params: p }, opts);
}

function renderPaymentReceived(p: PaymentReceivedParams): RenderedEmail {
  const amount = `$${(p.amountCents / 100).toFixed(2)}`;
  return {
    to: p.to,
    subject: `Payment received for VSYC-26 — you're all set, ${p.firstName}`,
    html: emailWrap(`
      <h1 style="font-family:Georgia,serif;font-size:1.6rem;color:#C9A84C;margin:0 0 8px;">Payment received</h1>
      <p style="font-size:0.9rem;margin:0 0 24px;">Thanks, ${esc(p.firstName)}. We received your ${amount} VSYC-26 entry payment. You don't need to pay again.</p>
      <a href="${esc(p.confirmUrl)}" style="display:inline-block;background:#C9A84C;color:#0d1428;font-weight:800;font-size:0.78rem;letter-spacing:0.1em;padding:10px 20px;text-decoration:none;">VIEW YOUR REGISTRATION →</a>
      <p style="font-size:0.75rem;color:#6a7a9a;margin:16px 0 0;">Registration ID: ${esc(p.registrationId)}</p>
    `),
    text: [
      `Payment received — VSYC-26`,
      ``,
      `Thanks, ${p.firstName}. We received your ${amount} VSYC-26 entry payment. You don't need to pay again.`,
      ``,
      `View your registration: ${p.confirmUrl}`,
      `Registration ID: ${p.registrationId}`,
      ``,
      `Questions? Reply to this email or contact contact@dmvthrowers.club`,
    ].join('\n'),
  };
}

interface AdminAlertParams {
  subject: string;
  /** Plain-text lines; rendered one per paragraph. */
  lines: string[];
}

/** Organizer alert, e.g. a duplicate payment that needs a refund decision. */
export async function sendAdminAlertEmail(p: AdminAlertParams, opts?: QueueOptions): Promise<EmailResult> {
  return queueEmail({ template: 'admin_alert', params: p }, { priority: 1, ...opts });
}

function renderAdminAlert(p: AdminAlertParams): RenderedEmail {
  return {
    to: process.env.ADMIN_ALERT_EMAIL || 'contact@dmvthrowers.club',
    subject: `[VSYC admin] ${p.subject}`,
    html: emailWrap(`
      <h1 style="font-family:Georgia,serif;font-size:1.4rem;color:#C9A84C;margin:0 0 16px;">${esc(p.subject)}</h1>
      ${p.lines.map((l) => `<p style="font-size:0.85rem;margin:0 0 10px;">${esc(l)}</p>`).join('')}
      <a href="${BASE_URL}/admin-dashboard" style="display:inline-block;background:#C9A84C;color:#0d1428;font-weight:800;font-size:0.78rem;letter-spacing:0.1em;padding:10px 20px;text-decoration:none;margin-top:8px;">OPEN ADMIN DASHBOARD →</a>
    `),
    text: [p.subject, '', ...p.lines, '', `Admin dashboard: ${BASE_URL}/admin-dashboard`].join('\n'),
  };
}

// ─── HTML builders ───────────────────────────────────────────────────────────

function emailWrap(body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0d1428;font-family:Montserrat,system-ui,sans-serif;color:#c8d0e0;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;">
  <div style="border-top:4px solid #C9A84C;background:#1a2744;padding:32px;">
    <div style="font-size:0.6rem;letter-spacing:0.2em;font-weight:800;color:#C9A84C;margin-bottom:8px;">VSYC-26 · VIRGINIA STATE YO-YO CONTEST 2026</div>
    ${body}
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #2a3a5a;font-size:0.72rem;color:#3a4a6a;">
      Questions? Reply to this email or contact <a href="mailto:contact@dmvthrowers.club" style="color:#C9A84C;">contact@dmvthrowers.club</a><br/>
      September 19, 2026 · Dulles Town Center · Sterling, VA
    </div>
  </div>
</div></body></html>`;
}

function buildConfirmationHtml(p: ConfirmationParams, fee: string): string {
  return emailWrap(`
    <h1 style="font-family:Georgia,serif;font-size:1.6rem;color:#C9A84C;margin:0 0 8px;">Registration Received</h1>
    <p style="font-size:0.9rem;margin:0 0 24px;">Hey ${esc(p.firstName)} — you're in. Here's everything you need.</p>
    <div style="background:#0d1428;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.6rem;letter-spacing:0.16em;color:#C9A84C;font-weight:800;margin-bottom:12px;">YOUR REGISTRATION</div>
      <div style="font-size:0.85rem;margin-bottom:6px;"><strong style="color:#fff;">Name:</strong> ${esc(p.firstName)} ${esc(p.lastName)}</div>
      <div style="font-size:0.85rem;margin-bottom:6px;"><strong style="color:#fff;">Division(s):</strong> ${esc(p.divisions.join(', '))}</div>
      <div style="font-size:0.85rem;margin-bottom:6px;"><strong style="color:#fff;">Entry fee:</strong> ${fee}</div>
      <div style="font-size:0.85rem;"><strong style="color:#fff;">ID:</strong> ${p.registrationId.slice(0, 8).toUpperCase()}</div>
    </div>
    ${p.teams?.length ? `
    <div style="background:#0d1428;border-left:4px solid #C9A84C;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.6rem;letter-spacing:0.16em;color:#C9A84C;font-weight:800;margin-bottom:12px;">YOUR TEAM${p.teams.length > 1 ? 'S' : ''}</div>
      ${p.teams.map((t) => `
      <div style="font-size:0.85rem;margin-bottom:8px;"><strong style="color:#fff;">${esc(teamLine(t))}</strong></div>
      ${t.role === 'captain' ? `
      <div style="font-family:'Courier New',monospace;font-size:1.4rem;font-weight:800;letter-spacing:0.2em;color:#C9A84C;margin:4px 0 6px;">${esc(t.join_code)}</div>
      <p style="font-size:0.78rem;margin:0 0 12px;color:#6a7a9a;">${esc(shareSentence(t.join_code))}</p>` : ''}`).join('')}
    </div>` : ''}
    ${!p.isComp && !p.alreadyPaid && p.feeCents > 0 ? `
    <div style="background:#0d1428;border-left:4px solid #C8102E;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.6rem;letter-spacing:0.16em;color:#C8102E;font-weight:800;margin-bottom:12px;">PAYMENT REQUIRED</div>
      <p style="font-size:0.85rem;margin:0 0 12px;">Complete your secure Stripe checkout for <strong style="color:#fff;">${fee}</strong> in your registration portal.</p>
      <a href="${p.confirmUrl}" style="display:inline-block;background:#C9A84C;color:#0d1428;font-weight:800;font-size:0.78rem;letter-spacing:0.1em;padding:12px 24px;text-decoration:none;">COMPLETE PAYMENT →</a>
      <p style="font-size:0.75rem;margin:12px 0 0;color:#6a7a9a;">Day-of alternatives may be available at the registration desk.</p>
    </div>` : ''}
    ${p.musicUploadUrl ? `
    <div style="background:#0d1428;border-left:4px solid #C9A84C;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.6rem;letter-spacing:0.16em;color:#C9A84C;font-weight:800;margin-bottom:12px;">MUSIC UPLOAD</div>
      <p style="font-size:0.85rem;margin:0 0 12px;">Upload your music using the secure link below${musicSlotsNote(p.divisions)}. <strong style="color:#fff;">Deadline: September 17, 2026.</strong></p>
      <a href="${p.musicUploadUrl}" style="display:inline-block;background:#C9A84C;color:#0d1428;font-weight:800;font-size:0.78rem;letter-spacing:0.1em;padding:12px 24px;text-decoration:none;">UPLOAD MUSIC →</a>
      <p style="font-size:0.75rem;margin:12px 0 0;color:#6a7a9a;">Format: DIVISION_LastName_FirstName.mp3 — the system will rename it automatically.</p>
      <p style="font-size:0.75rem;margin:8px 0 0;color:#6a7a9a;">Music must be appropriate for all audiences — no explicit language, sexual content, or glorification of violence. <strong style="color:#fff;">Inappropriate music results in disqualification.</strong> Full rules are on the upload page.</p>
    </div>
    ` : `
    <div style="background:#0d1428;border-left:4px solid #C9A84C;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.6rem;letter-spacing:0.16em;color:#C9A84C;font-weight:800;margin-bottom:12px;">MUSIC UPLOAD</div>
      <p style="font-size:0.85rem;margin:0;">Music upload unlocks in your registration portal after payment is received. <strong style="color:#fff;">Deadline: September 17, 2026.</strong></p>
      <p style="font-size:0.75rem;margin:8px 0 0;color:#6a7a9a;">Start picking your track now: it must be appropriate for all audiences — no explicit language, sexual content, or glorification of violence. <strong style="color:#fff;">Inappropriate music results in disqualification.</strong> Full rules are on the upload page.</p>
    </div>
    `}
    <p style="font-size:0.78rem;color:#6a7a9a;margin:0 0 16px;">📅 A calendar invite (VSYC-26.ics) is attached — add it to your calendar so you don't miss the day.</p>
    <a href="${p.confirmUrl}" style="display:inline-block;background:#1a2744;border:1px solid #2a3a5a;color:#C9A84C;font-size:0.78rem;font-weight:700;letter-spacing:0.1em;padding:10px 20px;text-decoration:none;margin-top:4px;">VIEW YOUR REGISTRATION →</a>
  `);
}

function buildConfirmationText(p: ConfirmationParams, fee: string): string {
  const lines = [
    `Registration Received — VSYC-26`,
    ``,
    `Hey ${p.firstName} — you're in. Here's everything you need.`,
    ``,
    `YOUR REGISTRATION`,
    `Name: ${p.firstName} ${p.lastName}`,
    `Division(s): ${p.divisions.join(', ')}`,
    `Entry fee: ${fee}`,
    `ID: ${p.registrationId.slice(0, 8).toUpperCase()}`,
    ``,
  ];
  if (p.teams?.length) {
    lines.push(`YOUR TEAM${p.teams.length > 1 ? 'S' : ''}`);
    for (const t of p.teams) {
      lines.push(teamLine(t));
      if (t.role === 'captain') lines.push(`Join code: ${t.join_code}`, shareSentence(t.join_code));
    }
    lines.push(``);
  }
  if (!p.isComp && !p.alreadyPaid && p.feeCents > 0) {
    lines.push(
      `PAYMENT REQUIRED`,
      `Complete your secure Stripe checkout for ${fee}: ${p.confirmUrl}`,
      `Day-of alternatives may be available at the registration desk.`,
      ``,
    );
  }
  if (p.musicUploadUrl) {
    lines.push(
      `MUSIC UPLOAD`,
      `Upload your music${musicSlotsNote(p.divisions)} (deadline September 17, 2026): ${p.musicUploadUrl}`,
      `Format: DIVISION_LastName_FirstName.mp3 — the system will rename it automatically.`,
      `Music must be appropriate for all audiences — no explicit language, sexual content, or glorification of violence. Inappropriate music results in disqualification.`,
      ``,
    );
  } else {
    lines.push(
      `MUSIC UPLOAD`,
      `Music upload unlocks in your registration portal after payment is received. Deadline: September 17, 2026.`,
      ``,
    );
  }
  lines.push(
    `A calendar invite (VSYC-26.ics) is attached.`,
    `View your registration: ${p.confirmUrl}`,
    ``,
    `Questions? Reply to this email or contact contact@dmvthrowers.club`,
    `September 19, 2026 · Dulles Town Center · Sterling, VA`,
  );
  return lines.join('\n');
}

function buildMusicReceivedHtml(p: MusicReceivedParams): string {
  return emailWrap(`
    <h1 style="font-family:Georgia,serif;font-size:1.6rem;color:#C9A84C;margin:0 0 8px;">Music Received</h1>
    <p style="font-size:0.9rem;margin:0 0 24px;">Got it, ${esc(p.firstName)}. Your music is in.</p>
    <div style="background:#0d1428;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.85rem;margin-bottom:6px;"><strong style="color:#fff;">Division:</strong> ${esc(p.division)}${p.slotLabel ? ` · ${esc(p.slotLabel)}` : ''}</div>
      <div style="font-size:0.85rem;"><strong style="color:#fff;">File saved as:</strong> <span style="font-family:monospace;color:#C9A84C;">${esc(p.filename)}</span></div>
    </div>
    <p style="font-size:0.82rem;color:#6a7a9a;">Music deadline was September 17, 2026. You're all set. See you at Dulles Town Center on September 19.</p>
  `);
}

function buildMusicReceivedText(p: MusicReceivedParams): string {
  return [
    `Music Received — VSYC-26`,
    ``,
    `Got it, ${p.firstName}. Your music is in.`,
    ``,
    `Division: ${p.division}${p.slotLabel ? ` · ${p.slotLabel}` : ''}`,
    `File saved as: ${p.filename}`,
    ``,
    `Music deadline was September 12, 2026. You're all set. See you at Dulles Town Center on September 19.`,
    ``,
    `Questions? Reply to this email or contact contact@dmvthrowers.club`,
    `September 19, 2026 · Dulles Town Center · Sterling, VA`,
  ].join('\n');
}

function buildPaymentReminderHtml(p: PaymentReminderParams): string {
  const fee = `$${(p.feeCents / 100).toFixed(2)}`;
  return emailWrap(`
    <h1 style="font-family:Georgia,serif;font-size:1.6rem;color:#C9A84C;margin:0 0 8px;">Payment Reminder</h1>
    <p style="font-size:0.9rem;margin:0 0 24px;">Hey ${esc(p.firstName)} — we haven't received your VSYC-26 entry payment yet.</p>
    <div style="background:#0d1428;border-left:4px solid #C8102E;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.85rem;margin-bottom:6px;"><strong style="color:#fff;">Amount due:</strong> ${fee}</div>
      <div style="font-size:0.85rem;margin-bottom:4px;">Complete secure payment in your registration portal (Stripe).</div>
      <a href="${p.confirmUrl}" style="display:inline-block;background:#C9A84C;color:#0d1428;font-weight:800;font-size:0.78rem;letter-spacing:0.1em;padding:10px 20px;text-decoration:none;margin-top:6px;">PAY NOW →</a>
      <p style="font-size:0.75rem;margin:10px 0 0;color:#6a7a9a;">Day-of alternatives may be available at the registration desk.</p>
    </div>
    <p style="font-size:0.82rem;color:#6a7a9a;">Registration closes September 17. Unpaid registrations may be released after that date. Questions? Reply to this email.</p>
  `);
}

function buildPaymentReminderText(p: PaymentReminderParams): string {
  const fee = `$${(p.feeCents / 100).toFixed(2)}`;
  return [
    `Payment Reminder — VSYC-26`,
    ``,
    `Hey ${p.firstName} — we haven't received your VSYC-26 entry payment yet.`,
    ``,
    `Amount due: ${fee}`,
    `Pay now: ${p.confirmUrl}`,
    `Day-of alternatives may be available at the registration desk.`,
    ``,
    `Registration closes September 12. Unpaid registrations may be released after that date. Questions? Reply to this email.`,
    ``,
    `Questions? Reply to this email or contact contact@dmvthrowers.club`,
    `September 19, 2026 · Dulles Town Center · Sterling, VA`,
  ].join('\n');
}

function buildSpectatorConfirmationHtml(p: SpectatorConfirmationParams): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';
  const portalUrl = p.portalUrl ?? `${baseUrl}/spectators/portal`;
  return emailWrap(`
    <h1 style="font-family:Georgia,serif;font-size:1.6rem;color:#C9A84C;margin:0 0 8px;">You're on the list!</h1>
    <p style="font-size:0.9rem;margin:0 0 24px;">Hey ${esc(p.firstName)} — see you at VSYC-26. Spectating is always free, all ages.</p>
    <div style="background:#0d1428;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.85rem;margin-bottom:6px;"><strong style="color:#fff;">Where:</strong> Dulles Town Center, Sterling, VA</div>
      <div style="font-size:0.85rem;margin-bottom:6px;"><strong style="color:#fff;">When:</strong> September 19, 2026</div>
      <div style="font-size:0.85rem;"><strong style="color:#fff;">Listed publicly:</strong> ${p.isPublic ? 'Yes — your profile will show on the site' : 'No — you\'re registered privately'}</div>
    </div>
    <div style="background:#0d1428;border-left:4px solid #C9A84C;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.6rem;letter-spacing:0.16em;color:#C9A84C;font-weight:800;margin-bottom:12px;">MANAGE YOUR RSVP</div>
      <p style="font-size:0.85rem;margin:0 0 12px;">Need to update your profile later? Use the spectator portal magic-link login.</p>
      <a href="${portalUrl}" style="display:inline-block;background:#C9A84C;color:#0d1428;font-weight:800;font-size:0.78rem;letter-spacing:0.1em;padding:10px 20px;text-decoration:none;margin-top:6px;">OPEN SPECTATOR PORTAL →</a>
    </div>
    <p style="font-size:0.78rem;color:#6a7a9a;margin:0 0 16px;">📅 A calendar invite (VSYC-26.ics) is attached — add it to your calendar so you don't miss the day.</p>
    <p style="font-size:0.82rem;color:#6a7a9a;">Full event details and schedule: <a href="https://dmvthrowers.club/vsyc26-schedule.html" style="color:#C9A84C;">dmvthrowers.club/vsyc26-schedule.html</a></p>
  `);
}

function buildSpectatorConfirmationText(p: SpectatorConfirmationParams): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';
  const portalUrl = p.portalUrl ?? `${baseUrl}/spectators/portal`;
  return [
    `You're on the list! — VSYC-26`,
    ``,
    `Hey ${p.firstName} — see you at VSYC-26. Spectating is always free, all ages.`,
    ``,
    `Where: Dulles Town Center, Sterling, VA`,
    `When: September 19, 2026`,
    `Listed publicly: ${p.isPublic ? 'Yes — your profile will show on the site' : "No — you're registered privately"}`,
    ``,
    `Manage your RSVP: ${portalUrl}`,
    ``,
    `A calendar invite (VSYC-26.ics) is attached.`,
    `Full event details and schedule: https://dmvthrowers.club/vsyc26-schedule.html`,
    ``,
    `Questions? Reply to this email or contact contact@dmvthrowers.club`,
  ].join('\n');
}

function buildVolunteerConfirmationHtml(p: VolunteerConfirmationParams): string {
  return emailWrap(`
    <h1 style="font-family:Georgia,serif;font-size:1.6rem;color:#C9A84C;margin:0 0 8px;">Thanks for volunteering!</h1>
    <p style="font-size:0.9rem;margin:0 0 24px;">Hey ${esc(p.firstName)} — your VSYC-26 volunteer application is in.</p>
    <div style="background:#0d1428;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.6rem;letter-spacing:0.16em;color:#C9A84C;font-weight:800;margin-bottom:12px;">YOUR APPLICATION</div>
      <div style="font-size:0.85rem;margin-bottom:6px;"><strong style="color:#fff;">1st choice:</strong> ${esc(p.roleChoice1Label)}</div>
      ${p.roleChoice2Label ? `<div style="font-size:0.85rem;margin-bottom:6px;"><strong style="color:#fff;">2nd choice:</strong> ${esc(p.roleChoice2Label)}</div>` : ''}
      ${p.otherRoleDescription ? `<div style="font-size:0.85rem;margin-bottom:6px;"><strong style="color:#fff;">Your idea:</strong> ${esc(p.otherRoleDescription)}</div>` : ''}
      <div style="font-size:0.85rem;"><strong style="color:#fff;">Status:</strong> Pending review</div>
    </div>
    <div style="background:#0d1428;border-left:4px solid #C9A84C;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.6rem;letter-spacing:0.16em;color:#C9A84C;font-weight:800;margin-bottom:12px;">WHAT HAPPENS NEXT</div>
      <p style="font-size:0.85rem;margin:0;">Role assignments are made by the event organizer based on need — your final role may differ from your top choice, and some roles fill up fast. We'll follow up by email to confirm your assignment and shift time before the event.</p>
    </div>
    <p style="font-size:0.82rem;color:#6a7a9a;margin:0 0 8px;">Once confirmed, you'll get a follow-up email with a code for 50% off your own VSYC-26 entry fee.</p>
    <p style="font-size:0.82rem;color:#6a7a9a;margin:0 0 8px;">Where: Dulles Town Center, Sterling, VA · When: September 19, 2026</p>
    <p style="font-size:0.78rem;color:#6a7a9a;">Questions in the meantime? Reply to this email — it goes straight to the organizer.</p>
  `);
}

function buildVolunteerConfirmationText(p: VolunteerConfirmationParams): string {
  const lines = [
    `Thanks for volunteering! — VSYC-26`,
    ``,
    `Hey ${p.firstName} — your VSYC-26 volunteer application is in.`,
    ``,
    `YOUR APPLICATION`,
    `1st choice: ${p.roleChoice1Label}`,
  ];
  if (p.roleChoice2Label) lines.push(`2nd choice: ${p.roleChoice2Label}`);
  if (p.otherRoleDescription) lines.push(`Your idea: ${p.otherRoleDescription}`);
  lines.push(
    `Status: Pending review`,
    ``,
    `WHAT HAPPENS NEXT`,
    `Role assignments are made by the event organizer based on need — your final role may differ from your top choice, and some roles fill up fast. We'll follow up by email to confirm your assignment and shift time before the event.`,
    ``,
    `Once confirmed, you'll get a follow-up email with a code for 50% off your own VSYC-26 entry fee.`,
    `Where: Dulles Town Center, Sterling, VA · When: September 19, 2026`,
    ``,
    `Questions in the meantime? Reply to this email — it goes straight to the organizer.`,
  );
  return lines.join('\n');
}

interface VolunteerConfirmedParams {
  to: string;
  firstName: string;
  assignedRoleLabel: string;
  compCode: string;
  discountPercent: number;
  shiftPreference?: string;
}

export async function sendVolunteerConfirmedEmail(p: VolunteerConfirmedParams, opts?: QueueOptions): Promise<EmailResult> {
  return queueEmail({ template: 'volunteer_confirmed', params: p }, opts);
}

function renderVolunteerConfirmed(p: VolunteerConfirmedParams): RenderedEmail {
  return {
    to: p.to,
    subject: `You're confirmed for VSYC-26, ${p.firstName} — plus your discount code`,
    html: buildVolunteerConfirmedHtml(p),
    text: buildVolunteerConfirmedText(p),
  };
}

function buildVolunteerConfirmedHtml(p: VolunteerConfirmedParams): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';
  return emailWrap(`
    <h1 style="font-family:Georgia,serif;font-size:1.6rem;color:#C9A84C;margin:0 0 8px;">You're confirmed!</h1>
    <p style="font-size:0.9rem;margin:0 0 24px;">Hey ${esc(p.firstName)} — you're locked in as <strong style="color:#fff;">${esc(p.assignedRoleLabel)}</strong> for VSYC-26.${p.shiftPreference ? ` We'll follow up with your exact shift time.` : ''}</p>
    <div style="background:#0d1428;border-left:4px solid #C9A84C;padding:20px;margin-bottom:16px;">
      <div style="font-size:0.6rem;letter-spacing:0.16em;color:#C9A84C;font-weight:800;margin-bottom:12px;">YOUR ${p.discountPercent}% OFF CODE</div>
      <p style="font-size:0.85rem;margin:0 0 12px;">As a thank-you, here's a one-time code for ${p.discountPercent}% off your own VSYC-26 competitor entry fee.</p>
      <div style="background:#1a2744;border:1px dashed #C9A84C;padding:14px 18px;text-align:center;margin-bottom:12px;">
        <span style="font-family:monospace;font-size:1.3rem;letter-spacing:0.1em;color:#C9A84C;font-weight:800;">${esc(p.compCode)}</span>
      </div>
      <p style="font-size:0.75rem;margin:0 0 12px;color:#6a7a9a;">Enter this code at checkout when you register to compete. One-time use, valid through event day.</p>
      <a href="${baseUrl}/" style="display:inline-block;background:#C9A84C;color:#0d1428;font-weight:800;font-size:0.78rem;letter-spacing:0.1em;padding:10px 20px;text-decoration:none;">REGISTER TO COMPETE →</a>
    </div>
    <p style="font-size:0.82rem;color:#6a7a9a;margin:0 0 8px;">Where: Dulles Town Center, Sterling, VA · When: September 19, 2026</p>
    <p style="font-size:0.78rem;color:#6a7a9a;">Questions about your role or shift? Reply to this email — it goes straight to the organizer.</p>
  `);
}

function buildVolunteerConfirmedText(p: VolunteerConfirmedParams): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';
  return [
    `You're confirmed! — VSYC-26`,
    ``,
    `Hey ${p.firstName} — you're locked in as ${p.assignedRoleLabel} for VSYC-26.${p.shiftPreference ? ` We'll follow up with your exact shift time.` : ''}`,
    ``,
    `YOUR ${p.discountPercent}% OFF CODE`,
    `As a thank-you, here's a one-time code for ${p.discountPercent}% off your own VSYC-26 competitor entry fee.`,
    ``,
    `Code: ${p.compCode}`,
    `Enter this code at checkout when you register to compete. One-time use, valid through event day.`,
    `Register to compete: ${baseUrl}/`,
    ``,
    `Where: Dulles Town Center, Sterling, VA · When: September 19, 2026`,
    `Questions about your role or shift? Reply to this email — it goes straight to the organizer.`,
  ].join('\n');
}

// ─── Post-event survey invites ───────────────────────────────────────────────

export interface SurveyInviteRecipient {
  to: string;
  firstName: string;
  /** Colleagues copied on the same email (sponsor and vendor contacts). */
  cc?: string[];
}

interface SurveyInviteBatchParams {
  audienceLabel: string;
  surveyUrl: string;
  /** Optional audience-specific paragraph, e.g. the prize ask for winners. */
  extraLine?: string;
  recipients: SurveyInviteRecipient[];
  /** Admin preview: marks the subject so it can't be mistaken for a real send. */
  isTest?: boolean;
  /** Follow-up to an invite already sent: reminder subject and copy. */
  reminder?: boolean;
}

interface SurveyInviteParams extends SurveyInviteRecipient {
  audienceLabel: string;
  surveyUrl: string;
  extraLine?: string;
  isTest?: boolean;
  reminder?: boolean;
}

export interface SurveyInviteBatchResult {
  /** Sent during this request. */
  sent: number;
  /** Stored in the outbox; they go out as the daily email limit allows. */
  queued: number;
  failed: { email: string; error: string }[];
}

/**
 * Queues the survey link for each recipient, one email per person so nobody
 * sees anyone else's address. Invites are bulk email: the outbox sends them at
 * up to 2 a second within the daily limit shared with the YoYo Map, and
 * whatever doesn't fit today goes out after the 00:00 UTC reset. A test send
 * is priority 0 and goes out right away.
 */
export async function sendSurveyInviteBatch(p: SurveyInviteBatchParams): Promise<SurveyInviteBatchResult> {
  const emails: OutboxEmail[] = p.recipients.map((r) => ({
    template: 'survey_invite',
    params: {
      ...r,
      audienceLabel: p.audienceLabel,
      surveyUrl: p.surveyUrl,
      extraLine: p.extraLine,
      isTest: p.isTest,
      reminder: p.reminder,
    },
  }));

  if (p.isTest) {
    const result: SurveyInviteBatchResult = { sent: 0, queued: 0, failed: [] };
    for (const [i, email] of emails.entries()) {
      const r = await queueEmail(email, { priority: 0 });
      if (!r.ok) result.failed.push({ email: p.recipients[i].to, error: r.error });
      else if (r.queued) result.queued += 1;
      else result.sent += 1;
    }
    return result;
  }

  const { queued, failed } = await enqueueEmails(emails, { priority: 2 });
  return { sent: 0, queued, failed };
}

function renderSurveyInvite(p: SurveyInviteParams): RenderedEmail {
  return {
    to: p.to,
    ...(p.cc?.length ? { cc: p.cc } : {}),
    subject: `${p.isTest ? '[TEST] ' : ''}${p.reminder
      ? 'Still time: tell us what you thought of VSYC-26'
      : 'How was VSYC-26? A few minutes to shape VSYC-27'}`,
    html: p.reminder
      ? buildSurveyReminderHtml(p.firstName, p.surveyUrl)
      : buildSurveyInviteHtml(p.firstName, p.audienceLabel, p.surveyUrl, p.extraLine),
    text: p.reminder
      ? buildSurveyReminderText(p.firstName, p.surveyUrl)
      : buildSurveyInviteText(p.firstName, p.audienceLabel, p.surveyUrl, p.extraLine),
  };
}

function buildSurveyInviteHtml(firstName: string, audienceLabel: string, surveyUrl: string, extraLine?: string): string {
  const url = esc(surveyUrl);
  return emailWrap(`
    <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:1.6rem;color:#ffffff;margin:0 0 16px;">Thank you, ${esc(firstName)}.</h1>
    <p style="font-size:0.95rem;line-height:1.6;margin:0 0 16px;">VSYC-26 happened because of ${esc(audienceLabel)} like you. Now we want to hear how it went: what worked, what didn't, and what would bring you back.</p>
    ${extraLine ? `<p style="font-size:0.95rem;line-height:1.6;margin:0 0 16px;color:#e8c97a;">${esc(extraLine)}</p>` : ''}
    <p style="font-size:0.95rem;line-height:1.6;margin:0 0 24px;">It only takes a few minutes. Every answer goes straight into planning VSYC-27.</p>
    <a href="${url}" style="display:inline-block;background:#B80000;color:#ffffff;text-decoration:none;font-weight:800;letter-spacing:0.12em;font-size:0.8rem;padding:14px 28px;">TAKE THE SURVEY →</a>
    <p style="font-size:0.75rem;color:#8090b8;margin:24px 0 0;">Or paste this link: <a href="${url}" style="color:#C9A84C;">${url}</a></p>
    <p style="font-size:0.75rem;color:#8090b8;margin:16px 0 0;">VSYC-26 was brought to you by Goodles.</p>
  `);
}

function buildSurveyInviteText(firstName: string, audienceLabel: string, surveyUrl: string, extraLine?: string): string {
  return [
    `Thank you, ${firstName}.`,
    '',
    `VSYC-26 happened because of ${audienceLabel} like you. Now we want to hear how it went: what worked, what didn't, and what would bring you back.`,
    '',
    ...(extraLine ? [extraLine, ''] : []),
    'It only takes a few minutes. Every answer goes straight into planning VSYC-27.',
    '',
    `Take the survey: ${surveyUrl}`,
    '',
    'VSYC-26 was brought to you by Goodles.',
    'September 19, 2026 · Dulles Town Center · Sterling, VA',
  ].join('\n');
}

// Surveys are anonymous unless someone leaves their email, so a reminder can't
// fully skip people who already answered — the copy says so up front.
function buildSurveyReminderHtml(firstName: string, surveyUrl: string): string {
  const url = esc(surveyUrl);
  return emailWrap(`
    <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:1.6rem;color:#ffffff;margin:0 0 16px;">Still time, ${esc(firstName)}.</h1>
    <p style="font-size:0.95rem;line-height:1.6;margin:0 0 16px;">If you haven&rsquo;t filled out the VSYC-26 survey yet, we&rsquo;d love your thoughts. What worked, what didn&rsquo;t, and what would bring you back: every answer goes straight into planning VSYC-27, and into what we tell our sponsors and the venue.</p>
    <p style="font-size:0.95rem;line-height:1.6;margin:0 0 24px;">It takes a few minutes. Already done it? Thank you, and you can ignore this email.</p>
    <a href="${url}" style="display:inline-block;background:#B80000;color:#ffffff;text-decoration:none;font-weight:800;letter-spacing:0.12em;font-size:0.8rem;padding:14px 28px;">TAKE THE SURVEY →</a>
    <p style="font-size:0.75rem;color:#8090b8;margin:24px 0 0;">Or paste this link: <a href="${url}" style="color:#C9A84C;">${url}</a></p>
    <p style="font-size:0.75rem;color:#8090b8;margin:16px 0 0;">VSYC-26 was brought to you by Goodles.</p>
  `);
}

function buildSurveyReminderText(firstName: string, surveyUrl: string): string {
  return [
    `Still time, ${firstName}.`,
    '',
    "If you haven't filled out the VSYC-26 survey yet, we'd love your thoughts. What worked, what didn't, and what would bring you back: every answer goes straight into planning VSYC-27, and into what we tell our sponsors and the venue.",
    '',
    'It takes a few minutes. Already done it? Thank you, and you can ignore this email.',
    '',
    `Take the survey: ${surveyUrl}`,
    '',
    'VSYC-26 was brought to you by Goodles.',
    'September 19, 2026 · Dulles Town Center · Sterling, VA',
  ].join('\n');
}
