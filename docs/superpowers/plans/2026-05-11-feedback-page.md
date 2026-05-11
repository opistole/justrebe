# Feedback Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `feedback.html` — a standalone, branded landing page that directs invited users to explore the ReBe app and complete a feedback survey.

**Architecture:** A single self-contained HTML file in the project root. It uses an inline minimal header (logo only, no nav) and loads the shared `footer.html` via the existing `loadComponent` JS pattern. All styles are inline in a `<style>` block, following the pattern used by every other page in this project.

**Tech Stack:** Plain HTML, CSS, JavaScript — no build tools, no frameworks. Same stack as every other page on the site.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `feedback.html` | The entire page — header, hero, content card, footer hook |
| No changes | `header.html` | Feedback page is NOT added to the nav |
| No changes | Any other file | Spec explicitly out of scope |

---

## Task 1: Create `feedback.html`

**Files:**
- Create: `feedback.html` (project root: `/Users/osilpistole/Desktop/justrebe/justrebe/feedback.html`)

This is one task because it's a single self-contained file. Complete it in steps below.

- [ ] **Step 1: Create the file with the full page HTML**

Create `/Users/osilpistole/Desktop/justrebe/justrebe/feedback.html` with exactly this content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,shrink-to-fit=no">
<title>Feedback · ReBe</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<link rel="icon" type="image/jpeg" href="ReBe_Favicon.jpg">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-behavior:smooth}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;background:#F2EDE8;color:#1A1A1A;overflow-x:hidden}

/* ── Minimal header ── */
.fb-header{background:#034E64;padding:0 48px;height:72px;display:flex;align-items:center;border-bottom:1px solid rgba(255,255,255,.12)}
.fb-logo img{height:52px;width:auto;display:block}
@media(max-width:600px){.fb-header{padding:0 20px}.fb-logo img{height:42px}}

/* ── Hero ── */
.fb-hero{background:#034E64;padding:56px 24px 64px;text-align:center}
.fb-hero h1{font-size:clamp(28px,4vw,46px);font-weight:900;color:#fff;letter-spacing:-.03em;line-height:1.1;max-width:600px;margin:0 auto}

/* ── Card section ── */
.fb-section{background:#F2EDE8;padding:64px 24px 96px}
.fb-card{background:#fff;border-radius:20px;max-width:700px;margin:0 auto;padding:48px 48px 40px;box-shadow:0 4px 32px rgba(0,0,0,.08)}
@media(max-width:600px){.fb-card{padding:32px 24px 28px}}

/* Intro text */
.fb-intro{font-size:17px;color:#444;line-height:1.8;margin-bottom:12px}
.fb-deadline{font-size:15px;color:#555;line-height:1.7;margin-bottom:32px}
.fb-deadline strong{color:#1A1A1A}

/* Steps heading */
.fb-steps-label{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#F06905;margin-bottom:20px}

/* Step cards */
.fb-steps{display:flex;flex-direction:column;gap:16px;margin-bottom:32px}
.fb-step{border:1px solid #eee;border-radius:14px;padding:24px 28px;display:flex;flex-direction:column;gap:14px}
.fb-step-num{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#034E64}
.fb-step-text{font-size:16px;color:#333;line-height:1.65}
@media(max-width:600px){.fb-step{padding:20px 18px}}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;border-radius:50px;font-size:16px;font-weight:700;letter-spacing:.02em;text-decoration:none;transition:all .3s ease;cursor:pointer;border:none;white-space:nowrap}
.btn-teal{background:#034E64;color:#fff;box-shadow:0 4px 18px rgba(3,78,100,.25)}
.btn-teal:hover{background:#023d4f;transform:translateY(-1px)}
.btn-gold{background:#FEB909;color:#1A1A1A;box-shadow:0 4px 18px rgba(254,185,9,.25)}
.btn-gold:hover{background:#e5a708;transform:translateY(-1px)}
@media(max-width:500px){.btn{width:100%;justify-content:center}}

/* Closing */
.fb-thanks{font-size:16px;color:#444;line-height:1.7;margin-bottom:16px}
.fb-contact{font-size:14px;color:#777;line-height:1.6}
.fb-contact a{color:#034E64;text-decoration:underline}
.fb-contact a:hover{color:#F06905}

/* Safari normalization */
@supports(hanging-punctuation:first){body{-webkit-text-stroke:0.3px}h1{-webkit-text-stroke:0.5px}.btn{font-size:17px}}
</style>
</head>
<body>

<!-- Minimal header: logo only, no nav -->
<header class="fb-header">
  <a href="index.html" class="fb-logo"><img src="Images/Logo.png" alt="ReBe"></a>
</header>

<!-- Hero -->
<section class="fb-hero">
  <h1>We would love your feedback.</h1>
</section>

<!-- Content card -->
<section class="fb-section">
  <div class="fb-card">

    <p class="fb-intro">Thank you for taking the time to explore the ReBe app and share your thoughts. Your perspective at this stage would be incredibly meaningful, and your insights will directly shape what ReBe becomes.</p>

    <p class="fb-deadline">Please complete the below steps by end of day on <strong>May 28, 2026</strong>, as the process will close then.</p>

    <div class="fb-steps-label">Here&rsquo;s what we need from you.</div>

    <div class="fb-steps">

      <div class="fb-step">
        <div class="fb-step-num">Step 1</div>
        <p class="fb-step-text">Explore the app, moving through all sections.</p>
        <a href="https://rebe-intro.vercel.app" target="_blank" rel="noopener" class="btn btn-teal">Explore the App &rarr;</a>
      </div>

      <div class="fb-step">
        <div class="fb-step-num">Step 2</div>
        <p class="fb-step-text">As soon as you have finished exploring the app, complete the feedback survey. (It will take you 10 minutes at the most!)</p>
        <a href="https://docs.google.com/forms/d/e/1FAIpQLScaBeBH6Bom3BoHfD1TOiU_d07mIqZm3InqmW3hA-tY8RWajw/viewform" target="_blank" rel="noopener" class="btn btn-gold">Take the Survey &rarr;</a>
      </div>

    </div>

    <p class="fb-thanks">Thank you so much for considering being part of this.</p>

    <p class="fb-contact">If you have any issues with the process or questions, please reach out to Rachel Cline at <a href="mailto:rachel@paraco.org">rachel@paraco.org</a></p>

  </div>
</section>

<div id="footer"></div>

<script>
  function loadComponent(id, file) {
    fetch(file).then(r => r.text()).then(h => document.getElementById(id).innerHTML = h);
  }
  loadComponent('footer', 'footer.html');
</script>

</body>
</html>
```

- [ ] **Step 2: Open the page in a browser and verify visually**

Open `feedback.html` directly in your browser (double-click the file, or drag it into a browser window). Confirm:

| Check | Expected |
|-------|----------|
| Header | Teal bar with ReBe logo — no nav links |
| Hero | Teal background, "We would love your feedback." headline |
| Card background | Cream (`#F2EDE8`) |
| Card | White, centered, readable |
| Intro paragraph | Present and readable |
| Deadline line | "May 28, 2026" in bold |
| "Here's what we need from you." | Orange uppercase label |
| Step 1 card | Teal "Explore the App →" button visible |
| Step 2 card | Gold "Take the Survey →" button visible |
| Closing text | "Thank you so much for considering being part of this." |
| Contact line | Rachel Cline / rachel@paraco.org as a mailto link |
| Footer | Loads with ReBe branding (may not load if opened as a local file — that's OK, it will work on Vercel) |

- [ ] **Step 3: Verify button links**

Click each button and confirm:
- "Explore the App →" opens `https://rebe-intro.vercel.app` in a new tab
- "Take the Survey →" opens the Google Form in a new tab

- [ ] **Step 4: Verify mobile layout**

In your browser, open DevTools (right-click → Inspect) and toggle the device toolbar (or resize the window to ~375px wide). Confirm:
- Buttons expand to full width
- Text is readable with no horizontal scroll
- Logo is visible in the header

- [ ] **Step 5: Confirm the page is NOT in the navigation**

Open `header.html` and confirm `feedback.html` does not appear anywhere in that file. No change is needed — this is just a confirmation step.

- [ ] **Step 6: Commit**

```bash
git add feedback.html
git commit -m "Add /feedback landing page for app review invitees"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered in plan |
|-----------------|-----------------|
| `feedback.html` in project root | ✅ Task 1 Step 1 |
| Not in navigation | ✅ Task 1 Step 5 confirmation |
| Loads shared footer | ✅ `loadComponent('footer', 'footer.html')` in HTML |
| Minimal header (logo only) | ✅ `.fb-header` with logo, no nav |
| Hero: teal background, "We would love your feedback." | ✅ `.fb-hero` section |
| Intro paragraph (verbatim) | ✅ In card HTML |
| Deadline: May 28, 2026 | ✅ `<strong>May 28, 2026</strong>` |
| "Here's what we need from you." label | ✅ `.fb-steps-label` |
| Step 1 card + teal button → rebe-intro.vercel.app | ✅ First `.fb-step` |
| Step 2 card + gold button → Google Form | ✅ Second `.fb-step` |
| Thank-you closing line | ✅ `.fb-thanks` |
| Contact: Rachel Cline / rachel@paraco.org | ✅ `.fb-contact` |
| Same fonts/colors/buttons as site | ✅ Inter font, `#034E64`, `#FEB909`, pill buttons |
| Mobile responsive | ✅ Media queries in `<style>` + Step 4 verification |

No gaps found.

**Placeholder scan:** No TBDs, no vague steps, all code is complete.

**Type consistency:** No functions defined across tasks — single-task plan, no cross-reference risk.
