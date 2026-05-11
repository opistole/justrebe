# Design Spec: /feedback Landing Page

**Date:** 2026-05-11  
**Status:** Approved

---

## Purpose

A standalone landing page at `feedback.html` for invited users to explore the ReBe app and complete a feedback survey. It is not linked from the site navigation and will not appear in any nav menus.

---

## Page Structure

- File: `feedback.html` in the project root
- Not added to `header.html` nav or any other page
- Loads the shared footer (`footer.html`) via `loadComponent`
- Uses a minimal inline header (logo only, no nav links) instead of the shared `header.html`
- Same fonts (Inter via Google Fonts), colors, and button styles as the rest of the site

---

## Hero Section

- Background: `#034E64` (site primary teal)
- Content: ReBe logo (links to `index.html`) centered or left-aligned
- Headline: "We would love your feedback."
- No navigation links, no hamburger menu

---

## Content Card Section

- Background: `#F2EDE8` (site cream)
- Card: white (`#fff`), centered, max-width ~700px, rounded corners, padding

### Card contents (in order):

1. **Intro paragraph** (verbatim copy):
   > Thank you for taking the time to explore the ReBe app and share your thoughts. Your perspective at this stage would be incredibly meaningful, and your insights will directly shape what ReBe becomes.

2. **Deadline notice:**
   > Please complete the below steps by end of day on **May 28, 2026**, as the process will close then.

3. **Section label:** "Here's what we need from you."

4. **Step 1 card:**
   - Label: "Step 1"
   - Text: "Explore the app, moving through all sections."
   - Button: "Explore the App →" (teal, `btn-teal` style)
   - Link: `https://rebe-intro.vercel.app` — opens in new tab

5. **Step 2 card:**
   - Label: "Step 2"
   - Text: "As soon as you have finished exploring the app, complete the feedback survey. (It will take you 10 minutes at the most!)"
   - Button: "Take the Survey →" (gold, `btn-gold` style)
   - Link: `https://docs.google.com/forms/d/e/1FAIpQLScaBeBH6Bom3BoHfD1TOiU_d07mIqZm3InqmW3hA-tY8RWajw/viewform` — opens in new tab

6. **Closing thank-you line:**
   > Thank you so much for considering being part of this.

7. **Contact line:**
   > If you have any issues with the process or questions, please reach out to Rachel Cline at [rachel@paraco.org](mailto:rachel@paraco.org)

---

## Buttons

| Button | Style | Destination |
|--------|-------|-------------|
| Explore the App → | Teal pill (`#034E64`) | `https://rebe-intro.vercel.app` (new tab) |
| Take the Survey → | Gold pill (`#FEB909`) | Google Form URL (new tab) |

---

## Out of Scope

- No form on this page (survey is external)
- No analytics or tracking beyond what already exists site-wide
- No changes to `header.html` or any other existing page
