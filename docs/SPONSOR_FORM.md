# Sponsor inquiry form

The public "Want to sponsor?" form at `/sponsor`, and how its answers reach the sponsor pipeline at `/sponsors`.
It replaces a hosted form service, so inquiries live in your own database. Design background:
[`HUB_ROADMAP.md`](HUB_ROADMAP.md) ("Sponsor inquiry form").

## How it works

1. A sponsor opens `/sponsor`. Each tier shows its price and, if it has a cap, how many slots are left (`3 of 4 left`,
   or `Full`, which can't be chosen).
2. They send the form. The API checks it against your config, drops bots (a hidden honeypot field and a per-IP rate
   limit; no CAPTCHA service, no analytics), and saves it to `vsyc_sponsor_inquiries`.
3. You get a notice email (to `SPONSOR_NOTICE_EMAIL`, else `ADMIN_ALERT_EMAIL`, else the contact address). The sender gets
   a plain confirmation.
4. On `/sponsors`, an admin sees **New inquiries** and presses **Add as prospect** (creates a
   sponsor at status *prospect* with the details copied into its notes; no money is counted) or **Dismiss**.
5. Money is counted only when you move a sponsor to *committed* or *paid*. **Slots left** counts sponsors at that tier who
   are committed or paid, so a hopeful prospect never takes a slot.

Payment is **not** collected on the form. Sponsors say how they would like to pay (PayPal, Venmo, check, bank transfer,
or not sure) and you send an invoice or link after review, so they can pay whichever way is easiest.

## Set it up

- Edit `contest.sponsors` in `contest.config.ts`: tiers (label, price text, optional `slots`), other choices, contact
  methods, payment methods, "heard about us" options, and the intro. `enabled: false` hides the form.
- Set `SPONSOR_NOTICE_EMAIL` (see `docs/SETUP.md`) and the usual Resend variables.
- Apply migrations `0048` (`vsyc_sponsor_inquiries`) and `0049` (`vsyc_sponsor_form`, the saved settings).
- Link to `/sponsor` from your site. Nothing else is needed on the site: it is a normal page of this app.
- Reviewing inquiries needs an admin account here (this app has no organizer role yet; the registration template does).

## Questions and ideas

Things the current version does not decide, so you can. Each is small to add once you have an answer.

**Tiers and slots**
1. Are next year's tiers, prices and caps the same as this year's? They live in config, so changing them is a one-line edit.
2. First come, first served: two inquiries for the last slot are both accepted by the form, and you decide by the time
   they arrived (the review list is newest first; the time is stored). Do you want the form to hold a slot for a few days
   after an inquiry, or only when you mark it committed (today's behavior)?
3. Tables: the package counts tables toward a total (10) and prices them differently by tier and for hobby clubs. Today
   the form only asks "interested in a vendor table?". Should it ask for a table add-on and "are you a hobby club?", with
   a cap on tables left, like tiers?
4. Division sponsorship is offered to the top tiers only. Should "interested in sponsoring a division?" appear only for
   those tiers, and ask which division?

**What to ask**
5. Brand team players (free entry for top tiers): ask for names now, or after they commit?
6. Logo: today it is a link. A real upload (vector or high-resolution PNG) needs storage; on a free tier that is a budget
   decision. Link-only plus "send the final file to [address]" costs nothing.
7. Permission to show their name and logo publicly (a checkbox), and an option to be listed anonymously.
8. Shipping product from outside the country (customs, lead time): several brands in an outreach list are abroad. Ask
   "shipping from outside the US?" and show the shipping deadline.
9. Have they sponsored before (so returning sponsors are recognized and can be prioritized)?
10. Competitor conflicts: a naming sponsor and a competing retailer at a lower tier. Do you want a "category" field
    (retailer, maker, local business) so you can spot conflicts?

**Money and paperwork**
11. Is the organizer a registered nonprofit? That decides whether receipts and in-kind acknowledgement letters are
    wanted, and whether the wording says "donation" or "sponsorship".
12. The sponsor package says sponsorships are final (no refunds) and payment is due within 14 days of the invoice. Show
    both on the form and in the confirmation email?
13. Invoices are sent by hand today. A later step is an invoice number and due date on the sponsor row, with a reminder
    when one is overdue. Worth it, or is a reminder on the pipeline enough?

**Running it**
14. What reply time should the confirmation promise ("within a few days")? Better to promise less and beat it.
15. How long to keep dismissed inquiries (suggest 90 days, then delete) and converted contacts (until the season
    archive). The deletion job is not built yet.
16. Cold outreach: a contact list of brands is better kept in the pipeline as *prospects* than in a document, but do not
    send cold email through the app's outbox (it is for people who asked to hear from you, and it has a daily cap).
    Send outreach from the club inbox and log it on the sponsor row.
17. More than one event: when events become a first-class thing, a sponsor of a whole season is different from a
    sponsor of one contest, and tiers differ per event.

## Not built yet

Logo upload, deliverable checklists pre-filled by tier, table add-on with a cap, CSV import of old submissions, the
deletion job for dismissed inquiries, and invoice tracking.
