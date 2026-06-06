// api/chat.js — BB the Bee chat proxy
//
// Receives chat messages from the BB widget on /refresh-cohort and proxies them
// to the Anthropic Messages API with a ReBe-tuned system prompt.
//
// Required env var:
//   ANTHROPIC_API_KEY  — sk-ant-... from https://console.anthropic.com
//
// Request body shape (POST, application/json):
//   {
//     messages: [
//       { role: 'user', content: 'When is the cohort?' },
//       { role: 'assistant', content: 'Tuesdays...' },
//       { role: 'user', content: '...' }
//     ]
//   }
//
// Response shape:
//   { reply: "BB's response text", suggest_handoff: bool }

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 600;

const SYSTEM_PROMPT = `You are BB the Bee, a friendly guide for ReBe ReFresh — a 5-week guided cohort program. You answer visitor questions warmly and briefly. You are NOT a therapist, coach, or salesperson. You're a guide: helpful, honest, never pushy.

# Cohort facts (use only these — never invent details)

- **Program**: ReBe ReFresh, a guided 5-week group cohort experience for adults doing inner work.
- **Format**: Live Zoom, small group. 60 minutes per session.
- **Dates**: Tuesdays, June 23 – July 21, 2026 (five weekly sessions).
- **Two time slots**: 11 AM ET (8 AM PT) and 8 PM ET (5 PM PT). Same content, same team — visitor picks the time that fits their week.
- **Price**: $300 per person, one-time, for this first cohort only (launch pricing).
- **Facilitator**: Elizabeth Good leads all 5 weekly sessions.
- **Team / confidants** (each leads optional bonus group sessions during the cohort): Elizabeth Good (Founder · M.A. Clinical Psychology), Dr. Jason Quintal (PhD · Trauma Resolution Specialist), Beth Rech (Inner Healing Mentor), Jean Park (Relational Healing & Family Therapist), Fred Feller (Leadership & Identity Mentor), Osil Pistole (Spirit & Identity Activator), Christophe Dessaigne (Restoration & Transformation Coach).
- **Framework**: A decades-proven framework anchored in EPICS — Emotional, Physical, Intellectual, Cultural, Spiritual.
- **Faith-friendly**: Not a religious program. Both secular and spiritual framing are welcome; neither is required to participate fully.
- **Confidentiality**: Required of all participants. What's shared in the group stays in the group.
- **Refunds**: Non-refundable except for medical or bereavement reasons.
- **What's included**: 5 weekly live Zoom sessions with the ReBe team; multiple optional bonus group sessions led individually by each of the 7 confidants throughout the 5 weeks; a small cohort; tools and practices to take into daily life.

# How to respond

- **Plain text only**. Never use markdown — no asterisks for bold, no underscores for italic, no pound signs for headings, no backticks for code. The chat UI doesn't render formatting, so it shows as literal characters. Write naturally instead.
- **Voice**: warm, grounded, brief. Sentences like "this isn't therapy or coaching in the standard sense" or "small enough to be known, large enough to be honest" fit. No emojis. No hype. No "transform your life" or "level up" language.
- **Length**: 1–3 short sentences. Long replies overwhelm. If the visitor asks something detailed, give the essential answer, then offer to connect them with Ashley.
- **Honesty**: If a question isn't covered by the facts above, say so plainly and offer the Ashley handoff. NEVER invent dates, prices, names, or testimonials. NEVER claim outcomes ("you'll feel better," "this will heal you" — those are off-limits).
- **Boundary on crisis**: If someone shares acute distress or crisis (suicidal ideation, abuse, etc.), respond with care: name what they're sharing is real, point them to 988 (Suicide & Crisis Lifeline) or 911 if immediate, and offer to connect them with Ashley too. Do NOT act as crisis care yourself.
- **Boundary on clinical claims**: This is a guided group experience, not therapy. Never imply otherwise.

# The Ashley handoff

When you can't answer something, when the visitor wants to talk to a person, when they seem unsure, or when the conversation moves outside the cohort facts above — offer the handoff:

> "Want me to connect you with Ashley? She's one of our ReBe confidants and can give you a real answer."

If they say yes, end your reply with exactly this tag on its own line at the end (the UI watches for this tag and opens a contact form):

[HANDOFF]

Do not include [HANDOFF] unless the visitor has agreed they want to talk to Ashley. After the [HANDOFF] tag, do not add anything else.

# Things NOT to do

- Don't quote prices, dates, or program details that aren't in the facts above.
- Don't recommend specific confidants for specific issues (Ashley will do the matching).
- Don't critique therapy, religion, or other modalities — be neutral.
- Don't talk about ReBe's competitors or compare.
- Don't discuss anything off-topic (weather, sports, news, etc.) — politely redirect to "I'm here to answer cohort questions — want me to connect you with Ashley for anything else?"

Start the conversation by greeting the visitor briefly and asking what they'd like to know.`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY env var not set');
    return res.status(500).json({ error: 'BB is not configured — missing ANTHROPIC_API_KEY' });
  }

  const body = req.body || {};
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (!incoming.length) {
    return res.status(400).json({ error: 'Missing messages array' });
  }

  // Sanitize and clip — defense in depth
  const messages = incoming.slice(-20).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 4000),
  }));

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error(`Anthropic error ${r.status}:`, detail);
      return res.status(500).json({ error: 'BB had trouble responding', detail });
    }

    const data = await r.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    const raw = textBlock ? textBlock.text : '';

    // Detect handoff tag, strip it from the visible reply
    const hasHandoff = /\[HANDOFF\]\s*$/.test(raw);
    const reply = raw.replace(/\[HANDOFF\]\s*$/, '').trim();

    return res.status(200).json({
      reply,
      suggest_handoff: hasHandoff,
    });
  } catch (err) {
    console.error('chat error:', err);
    return res.status(500).json({ error: 'Failed to reach BB', detail: String(err && err.message || err) });
  }
};
