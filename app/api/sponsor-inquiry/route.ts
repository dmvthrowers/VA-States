import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { inquiryRow, inquirySchema } from '@/lib/sponsor-inquiry';
import { loadTierAvailability } from '@/lib/sponsor-availability';
import { loadSponsorSettings } from '@/lib/sponsor-settings-server';
import { sendSponsorInquiryNoticeEmail, sendSponsorInquiryReceivedEmail } from '@/lib/email';

/** GET /api/sponsor-inquiry: what the form shows (saved settings, else config) with tiers, price and slots left (counts only). */
export const GET = withErrorHandling(async (requestId) => {
  const { settings } = await loadSponsorSettings();
  const tiers = await loadTierAvailability(settings.tiers);
  return NextResponse.json({ enabled: settings.enabled, intro: settings.intro, tiers, otherChoices: settings.otherChoices, contactMethods: settings.contactMethods, paymentMethods: settings.paymentMethods, heardFrom: settings.heardFrom }, { headers: { 'x-request-id': requestId, 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } });
});

/**
 * POST /api/sponsor-inquiry
 *
 * Public, unauthenticated "Want to sponsor?" form (docs/HUB_ROADMAP.md). No CAPTCHA service and no
 * analytics: a honeypot, a per-IP rate limit and validation against the saved sponsor form settings. The row goes to
 * vsyc_sponsor_inquiries (never straight into the sponsor pipeline); staff convert or dismiss it.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const { settings } = await loadSponsorSettings();
  if (!settings.enabled) return apiError('not_found', 'Sponsor inquiries are not open.', requestId);

  // Real sponsors send one; a few retries after a typo are fine, a script is not.
  const allowed = await checkRateLimit(getClientIp(req.headers), 'sponsor-inquiry', 5, 60);
  if (!allowed) {
    return apiError('rate_limited', 'Too many submissions from this network. Try again later.', requestId, { 'Retry-After': '3600' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = inquirySchema(settings).safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Check the form and try again.', requestId);
  }
  const d = parsed.data;

  // Honeypot: look successful so a bot doesn't retry.
  if (d._hp) return NextResponse.json({ ok: true }, { status: 201, headers: { 'x-request-id': requestId } });

  // A full tier can't be asked for; the form already disables it, this covers a page that was open a while.
  const tierState = (await loadTierAvailability(settings.tiers)).find((t) => t.id === d.tier);
  if (tierState?.full) {
    return apiError('conflict', `${tierState.label} is full. Pick another tier, or choose "Not sure yet" and tell us what you have in mind.`, requestId);
  }

  const { data, error } = await createAdminClient().from('vsyc_sponsor_inquiries').insert(inquiryRow(d)).select('id').single();
  if (error || !data) {
    console.error('[sponsor-inquiry] insert error:', error);
    return apiError('upstream_error', 'We could not save that. Please try again, or email us.', requestId);
  }

  // Email is best effort: the inquiry is already saved, and the review screen shows it either way.
  const tier = settings.tiers.find((t) => t.id === d.tier)?.label
    ?? settings.otherChoices.find((c) => c.id === d.tier)?.label
    ?? d.tier;
  const yn = (v: boolean | undefined) => (v === undefined ? 'no answer' : v ? 'yes' : 'no');
  const lines = [
    `Brand: ${d.brand_name}`,
    `Interested in: ${tier}`,
    `Email: ${d.email}${d.phone ? `   Phone: ${d.phone}` : ''}`,
    d.contact_method ? `Prefers: ${d.contact_method}` : '',
    d.payment_method ? `Would like to pay by: ${d.payment_method}` : '',
    d.website ? `Website: ${d.website}` : '',
    `Vendor table: ${yn(d.vendor_table)}   Division sponsorship: ${yn(d.division_sponsor)}   In-kind product: ${yn(d.in_kind)}`,
    d.notes ? `Note: ${d.notes}` : '',
  ].filter(Boolean);
  await Promise.allSettled([
    sendSponsorInquiryNoticeEmail({ brandName: d.brand_name, contactName: `${d.first_name} ${d.last_name}`, lines }, { dedupeKey: `sponsor-inquiry-notice-${data.id}` }),
    sendSponsorInquiryReceivedEmail({ to: d.email, firstName: d.first_name, brandName: d.brand_name }, { dedupeKey: `sponsor-inquiry-received-${data.id}` }),
  ]);

  return NextResponse.json({ ok: true }, { status: 201, headers: { 'x-request-id': requestId } });
});
