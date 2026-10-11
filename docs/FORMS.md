# Forms on our own system

Simple public forms (contact, a report, a request) that live in your own database, with no outside form service.
Build plan 5.1. You describe a form in `contest.config.ts`; the app gives it a page, validation, a saved record,
a notice to you, and a screen for staff to read and handle the answers.

## Add a form

In `contest.config.ts`, add to `contest.forms`:

```ts
forms: [
  {
    id: 'contact',                       // lowercase letters, numbers, dashes; the page is /forms/contact
    title: 'Contact the organizers',
    intro: 'Questions about the contest? We read every message.',
    enabled: true,
    fields: [
      { id: 'name', label: 'Your name', type: 'text', required: true },
      { id: 'email', label: 'Email', type: 'email', required: true },
      { id: 'topic', label: 'About', type: 'select', options: ['Registration', 'Sponsoring', 'Volunteering', 'Other'] },
      { id: 'message', label: 'Message', type: 'longtext', required: true },
    ],
  },
],
```

Then apply migration `0061` (`vsyc_form_submissions`) once. An empty list (the default) turns the feature off: `/forms/<id>`
answers "closed" and nothing is stored.

**Field types:** `text`, `longtext`, `email`, `phone`, `url`, `number`, `select`, `multiselect` (both need `options`, at least
two), `checkbox`. Each field can have `required`, `help` (a line under it) and `max` (most characters for text, defaults 200
and 4000). Field ids are the keys in the saved answers, so do not rename one after you have collected answers.

`npm test` checks the forms in the config (unique ids, valid types, options where needed).

## What happens when someone sends it

1. The page loads the form from `/api/forms/<id>`, so the fields shown are the fields checked.
2. On send, the API drops bots (a hidden honeypot field answers "sent" and saves nothing; a limit of 5 per network per hour; no
   CAPTCHA service, no analytics). The IP is used for the limit only and is never saved.
3. The answers are checked against the field list, cleaned (trimmed, empty optional values dropped), and saved as one row.
4. You get a notice by email to `FORMS_NOTICE_EMAIL`, else `ADMIN_ALERT_EMAIL`, else the contact address. **The notice never
   includes the answers** (some forms hold sensitive details); it says a form was filled in and links to the review screen.

## Reading the answers

`/forms-review` (also in the staff menu as "Form answers") lists answers newest first. Filter by form and status (`new`, `read`,
`handled`, `dismissed`), add a private note, and change the status. It needs the `forms.review` capability, which **Admin** holds and
an admin can grant to chosen staff with the **Form answers reader** role (see `docs/ROLES.md`). Answers are not cached, and the page is not indexed by search engines.

## Before you collect anything sensitive

- Decide who may read the answers: admins always can; grant the **Form answers reader** role to anyone else who should.
- Decide how long to keep them. There is no deletion job yet; answers stay until someone deletes the rows (see
  `docs/SEASON_ARCHIVE.md`).
- Forms are not listed in the sitemap and are not indexed, but anyone with the link can send one.

## Not built yet

- Moving the sponsor form (`/sponsor`) onto this system. It has tier slots, saved settings and a conversion step, so it stays as
  it is for now; a plain contact form is the first user of the engine.
- Confidential conduct reports (plan P2): who receives them, skipping anyone named in a report, acknowledgements and response
  times. These need the owner's decision on the conduct team (build plan 0.7); the engine and review screen are the base.
- A deletion job, file uploads, replies from the review screen, and CSV export.

## In VA-States

Ships with `forms: []`, so nothing is public. Until the roles screens are ported (see `docs/ROLES.md`), only admins read answers at `/forms-review`; granting the Form answers reader role to other staff needs the grants screen. Migration 0061 creates `vsyc_form_submissions`.
