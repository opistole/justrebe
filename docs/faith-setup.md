# ReBe ReFresh for Churches / Faith Audience — Setup Notes

## What's live

Two new public pages built for the faith audience:

1. **`refresh-faith.html`** — the main landing page for churches and faith-friendly visitors. **6-Week Cohort, $497**. Faith-friendly language, not Christian teaching. Uses `audience_type='faith'`.
2. **`refresh-private.html`** — a separate sub-page for booking standalone **1:1 sessions with a Confidant, $197**. Linked from the top banner and a mid-page callout on `refresh-faith.html`.

5 confidants are listed on the private page (placeholder bios — edit when you have real copy):
- Jean Park
- Fred Feller
- Beth Reck
- Osil Pistole
- Elizabeth Good *(also Group Facilitator on the cohort page)*

Plus a "No preference — match me" option.

The page tone is **faith-friendly, not Christian teaching.** The actual program is secular; the page exists so it can be sent to churches comfortably.

---

## Files added / changed

- `refresh-faith.html` — the new faith landing page (cohort-focused, with 1:1 link)
- `refresh-private.html` — the new private 1:1 booking page (5 confidants + request form)
- `lib/confidant-form.js` — handler for the new 1:1 request form (the cohort form reuses `lib/refresh-form.js`)
- `docs/faith-setup.md` — this file

## Files NOT touched

- `header.html` — links to the new pages not added yet; ask Claude when you're ready

---

## Admin emails (who can log into the dashboard)

Two emails are seeded as admins on first setup (defined in `docs/superpowers/plans/2026-05-21-rebe-refresh-phase-1.md` Step 3.3):

- `o.pistole@justrebe.com` — Osil (project owner)
- `refresh@justrebe.com` — shared ReFresh inbox (also the visitor-facing contact on all the pages)

Either email can request a magic link at `/admin/login` and see all signups + confidant requests in the dashboard. To add a third admin later, insert their email directly via the Supabase Table Editor UI on the `admin_emails` table.

---

## Supabase work — run this once

### 0. Add the new columns to `refresh_signups` (needed for PayPal Checkout + referral codes + "Other" write-ins)

The new Smart Buttons flow auto-tags each paid signup with PayPal order ID + status, captures any referral code the visitor entered, and stores the "Other" write-in text when someone picks "Other" in the area dropdown. Run this in **Supabase SQL Editor**:

```sql
alter table public.refresh_signups
  add column if not exists paypal_order_id text,
  add column if not exists status text default 'pending',
  add column if not exists referral_code text,
  add column if not exists area_other text;
```

(The `confidant_requests` table already has `paypal_order_id` and `status` from the original create — only `referral_code` is new there.)



When you create the Supabase project, run these in **Supabase → SQL Editor**.

### 1. Update `audience_type` constraint to use the new naming (4 page audiences)

```sql
alter table public.refresh_signups
  drop constraint if exists refresh_signups_audience_type_check;

alter table public.refresh_signups
  add constraint refresh_signups_audience_type_check
  check (audience_type in ('groups', 'corporate', 'education', 'faith'));
```

| audience_type | Used by |
|---|---|
| `groups` | `refresh-groups.html` |
| `corporate` | `refresh-corporate.html` |
| `education` | `refresh-education.html` |
| `faith` | `refresh-faith.html` |

> **Note:** if you've already run the older schema with `('public', 'corporate', 'educator', 'church')`, the migration above will drop the old constraint and add the new one — but you'll also need a one-time data update:
>
> ```sql
> update public.refresh_signups set audience_type = 'groups' where audience_type = 'public';
> update public.refresh_signups set audience_type = 'education' where audience_type = 'educator';
> update public.refresh_signups set audience_type = 'faith' where audience_type = 'church';
> ```

### 2. New table for 1:1 confidant requests

```sql
create table public.confidant_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  preferred_confidant text not null,
  situation text not null,
  best_times text,
  paypal_order_id text,
  status text default 'pending',
  created_at timestamptz default now()
);

-- Row Level Security: anyone can submit, only logged-in admins can read.
alter table public.confidant_requests enable row level security;

create policy "Anyone can submit a confidant request"
  on public.confidant_requests for insert
  with check (true);

create policy "Admins can view confidant requests"
  on public.confidant_requests for select
  to authenticated
  using (auth.email() in (select email from public.admin_emails));

create policy "Admins can update confidant requests"
  on public.confidant_requests for update
  to authenticated
  using (auth.email() in (select email from public.admin_emails));
```

### 3. Drop your Supabase keys into the HTML

All five ReFresh pages (`refresh-groups`, `refresh-corporate`, `refresh-education`, `refresh-faith`, `refresh-private`) have these two lines near the bottom — replace them with the values from **Supabase → Settings → API**:

```html
var SUPABASE_URL = 'REPLACE_WITH_YOUR_SUPABASE_URL';
var SUPABASE_ANON_KEY = 'REPLACE_WITH_YOUR_SUPABASE_ANON_KEY';
```

---

## PayPal — switched to Smart Buttons / PayPal Checkout ✓

We switched from Hosted Buttons to **Smart Buttons (PayPal Checkout)** so payments auto-link to Supabase signups. Same client ID across all pages, amount + description configured per page in code:

| Page | Amount | Description sent to PayPal |
|---|---|---|
| `refresh-groups.html` | $497.00 | ReBe ReFresh · 6-Week Cohort |
| `refresh-corporate.html` | $1,297.00 | ReBe ReFresh · 6-Week Corporate Cohort |
| `refresh-education.html` | $497.00 | ReBe ReFresh · 6-Week Cohort (Education) |
| `refresh-faith.html` | $497.00 | ReBe ReFresh · 6-Week Cohort (Faith) |
| `refresh-private.html` | $197.00 | ReBe ReFresh · Private 1:1 Session |

**What auto-happens after payment:**
1. Buyer fills intake form → row saved to Supabase with `status='pending'`
2. Buyer clicks PayPal button (gold pill, vertical) → PayPal popup opens
3. Buyer pays in popup → popup closes
4. **Supabase row auto-updates** with `paypal_order_id` and `status='paid'`
5. Buyer is redirected to `thank-you.html?order=<order-id>`

The visitor's Supabase row ID is passed to PayPal as `custom_id`, so you can also see it inside the PayPal transaction details for cross-reference.

**Hosted Button IDs are no longer used.** The 3 button IDs you created earlier (`6CV7XALTRT3ES`, `U7T76FSE4WN9W`, `KDGWESTC95CJA`) can be deleted or left dormant in your PayPal dashboard — they're not referenced anywhere in the code.

---

## PayPal branding (configure in PayPal dashboard, optional)

You can't replace PayPal's checkout UI itself, but two things are customizable:

### 1. Your logo + brand color on the PayPal checkout

PayPal Business → **Settings → Account Settings → Business Information & Branding** → upload a logo (recommended: 190×60 px, transparent background) and pick a primary color. Now buyers see your brand at the top of the PayPal popup.

### 2. Popup mode

PayPal Smart Buttons open in a popup overlay by default. Buyers stay on your branded page → PayPal popup appears → they pay → popup closes → the JS redirects them to `thank-you.html`. They never visit a separate PayPal URL.

**Note on return URLs:** With Smart Buttons, the redirect to `thank-you.html` happens via JavaScript in the `onApprove` callback — NOT via a PayPal-side "return URL" setting. So you do not need to configure anything in the PayPal dashboard for the thank-you redirect to work. It already does.

---

## Referral codes

The intake form on **refresh-groups, refresh-education, and refresh-faith** has an optional "Referral code" field. The codes themselves live in `lib/refresh-codes.js`. Corporate and private 1:1 pages intentionally don't have a code field — they're flat-priced ($1,297 corporate, $197 per 1:1 session).

**To add a code:** open `lib/refresh-codes.js` and uncomment / add an entry inside `window.REBE_CODES`:

```js
window.REBE_CODES = {
  'CHURCH50':  { type: 'fixed',   value: 50 },   // $50 off
  'FRIEND10':  { type: 'percent', value: 10 },   // 10% off
  'PILOT100':  { type: 'fixed',   value: 100 },  // $100 off
};
```

- **type**: `'percent'` or `'fixed'`
- **value**: number — for percent it's 1–100; for fixed it's a dollar amount

When a visitor types a valid code:
- A green "✓ Code XXX applied — new total: $YYY" line appears above the PayPal button
- The PayPal charge auto-adjusts to the discounted amount
- The code lands in the visitor's Supabase row in the `referral_code` column

Codes are uppercased on validation, so visitors can type `church50`, `CHURCH50`, or `Church50` — all match.

When this cohort or campaign is over, just delete the entries (or set them to a different value).

---

## Cohort dates + waitlist

**Current cohort:** starts **June 16, 2026**. 6 sessions over 6 weeks (5 group + 1 private). Times: 11 AM ET or 8 PM ET.

This is displayed in:
- Hero subtitle on all 4 cohort pages
- FAQ first item (expanded by default) on all 4 cohort pages
- Thank-you page

**Waitlist:** The intake form on all 4 cohort pages now has a 4th readiness option: *"These dates don't work — add me to the waitlist."* When selected, the form saves the visitor's details with `readiness='waitlist'` and shows them a "You're on the list" confirmation instead of PayPal.

To update the cohort start date later, change "June 16, 2026" in 9 places (hero + FAQ on each of the 4 cohort pages, plus thank-you.html). Search `grep -rn "June 16" /Users/osilpistole/Desktop/justrebe/justrebe/` to find them all.

When the cohort fills or starts, you can either:
- Remove the "I'm ready" radio option from each form so only the waitlist option is available, OR
- Just let visitors keep enrolling and manually email the late ones to push them to the next cohort

(Tell Claude when you want to switch and I'll do it.)

---

## Demo mode

While the Supabase keys are still placeholders, both pages run in **demo mode**:

- Forms run their validation
- On submit, they show the post-submit view as if it had saved
- Nothing actually hits Supabase
- The post-submit shows a `demo-preview` ID

This is how you can screen-share to confidants for review without needing the backend live.

---

## Confidant bios + photos

The five confidant cards live on `refresh-private.html` (NOT on `refresh-faith.html`). Bios are placeholders marked `[Placeholder]`. When you have real bios, find them under the comment `<!-- ========== 03 CONFIDANTS ========== -->` and replace each `<p class="conf-bio">` block.

If you have headshots, drop them in `Images/` (e.g. `Images/jean-park.jpg`) and replace the initials `<div class="conf-photo" aria-hidden="true">JP</div>` with `<div class="conf-photo"><img src="Images/jean-park.jpg" alt="Jean Park"></div>`.

Elizabeth's card is already wired to her existing headshot at `Images/elizabeth-good.jpg`.

---

## Flow summary

**Cohort flow (refresh-faith.html):**
1. Visitor lands, sees the 6-Week Cohort as the main offer
2. Fills the intake form at the bottom of the page
3. Row saved to `refresh_signups` table with `audience_type='faith'`
4. Post-submit shows PayPal $497 button *(placeholder until product ID)*
5. After payment, the visitor is added to the next available cohort

**1:1 flow (refresh-private.html):**
1. Visitor arrives either via top banner on faith page, the mid-page callout, or directly
2. Browses confidant bios, clicks "Request a session" on the one they want
3. Form prefills with the chosen confidant
4. Submits → row saved to `confidant_requests` table
5. Sees post-submit view + PayPal $197 button *(placeholder)*
6. After payment, the chosen confidant reaches out within 48 hours to schedule

---

## What's deferred (Phase 2)

- Email notification when a 1:1 request comes in *(currently the admin dashboard is the only surface)*
- Calendly integration for direct booking instead of confidant-initiated email
- Real bios + headshots for each confidant
- Header link to the new pages
