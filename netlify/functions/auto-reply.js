// AI AUTO-REPLY FOR WEBSITE ENQUIRIES
// ------------------------------------
// The contact form calls this quietly in the background when someone clicks
// "Send enquiry". The normal enquiry email to the office still goes out as
// before; this is extra.
//
// What it does, in plain English:
//   1. Reads the whole enquiry (name, chosen service, message).
//   2. Asks the firm's Azure OpenAI to sort it into a type and flag anything
//      that needs a person (urgent, complaint, existing client, spam).
//      Domestic abuse is noted in the log but does not stop the email.
//   3. ONLY if it is a clear NEW enquiry about
//        - divorce / finances, or
//        - contact / residence, or
//        - unmarried couples splitting property
//      and nothing is flagged, it emails the legal aid links from
//      info@tflaw.co.uk. Everything else gets no auto-reply, so staff deal
//      with it as they do now.
//   4. Never replies to the same email address twice in 30 days, and limits
//      each visitor (IP address) to 3 auto-replies a day, to stop misuse.
//   5. Keeps a record of every decision (viewable at /.netlify/functions/auto-reply-log).
//
// TEST MODE: unless the Netlify setting AUTO_REPLY_MODE is set to "live",
// the reply goes to AUTO_REPLY_TEST_TO (info@tflaw.co.uk by default)
// instead of the enquirer, so you can check it works first.

const { getStore, connectLambda } = require('@netlify/blobs');
const { decide } = require('../lib/auto-reply-rules');
const { buildEmail } = require('../lib/auto-reply-email');

const FROM_MAILBOX = process.env.AUTO_REPLY_FROM || 'info@tflaw.co.uk';
const TEST_TO = process.env.AUTO_REPLY_TEST_TO || 'info@tflaw.co.uk';
const CC = process.env.AUTO_REPLY_CC || 'forms@tflaw.co.uk'; // hidden copy (BCC) on every auto-reply
const LIVE = (process.env.AUTO_REPLY_MODE || '').toLowerCase() === 'live';
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

const SYSTEM_PROMPT = `You sort website enquiries for Thompson Family Law, a Scottish legal-aid family law firm.
Read the WHOLE enquiry before deciding. Do not guess from the chosen service alone.
Reply with JSON only, in exactly this shape:
{
  "category": "divorce_finance" | "contact_residence" | "cohabitation_property" | "other",
  "is_new_enquiry": true/false,
  "existing_client": true/false,
  "complaint": true/false,
  "urgent": true/false,
  "domestic_abuse": true/false,
  "spam": true/false,
  "reason": "one short sentence"
}
Definitions:
- divorce_finance: divorce, separation of married people/civil partners, financial provision, pensions, matrimonial home, defending a divorce.
- contact_residence: who a child lives with or sees (contact, residence, parental rights, grandparent contact, relocation of a child, specific issue orders about a child).
- cohabitation_property: unmarried couples splitting up and dividing a house, money or property (including section 28 cohabitation claims).
- other: anything else (wills/inheritance, eviction, criminal, property purchase, business, general questions, spam).
- existing_client: the person already has a case or contact with this firm (chasing an update, "I contacted you before", asking for an email address to send documents, naming a solicitor handling their case, withdrawing a case).
- complaint: unhappy with this firm's service.
- urgent: social work involvement, children removed, Children's Hearing, a child taken out of someone's care, court papers already served on them, a court date/hearing coming up, a deadline, a house being sold now, serious illness, risk of harm, or the person says it is urgent.
- domestic_abuse: any mention of domestic abuse, coercive control, violence, police involvement or Women's Aid.
- spam: marketing, investment offers, promo codes, links, nonsense, or requests unrelated to a law firm.
- is_new_enquiry: true only if this is a genuine person asking the firm to take on a new matter.`;

async function classify(enquiry) {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
  const key = process.env.AZURE_OPENAI_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5-mini';
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';
  if (!endpoint || !key) throw new Error('Azure OpenAI settings missing');

  const userText =
    `Name: ${enquiry.name}\nService chosen on form: ${enquiry.service}\n` +
    `Message:\n${enquiry.message}`;

  const res = await fetch(
    `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': key },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userText },
        ],
        response_format: { type: 'json_object' },
      }),
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Azure OpenAI error ${res.status}: ${text.slice(0, 300)}`);
  const content = JSON.parse(text).choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

async function graphToken() {
  const tenant = process.env.GRAPH_TENANT_ID;
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GRAPH_CLIENT_ID,
      client_secret: process.env.GRAPH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Could not sign in to Microsoft 365: ' + JSON.stringify(data).slice(0, 300));
  return data.access_token;
}

async function sendEmail(to, email) {
  const token = await graphToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(FROM_MAILBOX)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: email.subject,
        body: { contentType: 'HTML', content: email.html },
        toRecipients: [{ emailAddress: { address: to } }],
        bccRecipients: CC ? [{ emailAddress: { address: CC } }] : [], // hidden copy
      },
      saveToSentItems: true, // so staff can see it in info@'s Sent Items
    }),
  });
  if (!res.ok) throw new Error(`Email send failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

function json(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

exports.handler = async (event) => {
  connectLambda(event); // lets this function use Netlify's built-in storage
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  let enquiry;
  try {
    const b = JSON.parse(event.body || '{}');
    enquiry = {
      name: String(b.name || '').slice(0, 200).trim(),
      email: String(b.email || '').slice(0, 200).trim().toLowerCase(),
      service: String(b.service || '').slice(0, 100),
      message: String(b.message || '').slice(0, 8000).trim(),
    };
  } catch (e) {
    return json(400, { error: 'Invalid request' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(enquiry.email) || !enquiry.message) {
    return json(200, { sent: false, reason: 'missing or invalid email/message' });
  }

  const ip = event.headers['x-nf-client-connection-ip'] || 'unknown';
  const store = getStore('auto-reply');
  const now = Date.now();
  const logKey = `log/${new Date(now).toISOString()}-${Math.random().toString(36).slice(2, 7)}`;
  const record = { at: new Date(now).toISOString(), ip, name: enquiry.name, email: enquiry.email, service: enquiry.service, live: LIVE };

  try {
    // Misuse limits (checked before spending anything on the AI)
    const lastSent = await store.get(`sent/${enquiry.email}`, { type: 'json' });
    const alreadyReplied = !!(lastSent && now - lastSent.at < THIRTY_DAYS);
    const today = new Date(now).toISOString().slice(0, 10);
    const ipCount = (await store.get(`ip/${today}/${ip}`, { type: 'json' })) || 0;

    let ai = null;
    if (!alreadyReplied && ipCount < 3) ai = await classify(enquiry);

    const decision = decide({ ai, alreadyReplied, ipCount });
    record.ai = ai;
    record.decision = decision;

    if (decision.send) {
      const to = LIVE ? enquiry.email : TEST_TO;
      await sendEmail(to, buildEmail({ name: enquiry.name, testFor: LIVE ? null : enquiry }));
      record.sentTo = to;
      if (LIVE) await store.setJSON(`sent/${enquiry.email}`, { at: now });
      await store.setJSON(`ip/${today}/${ip}`, ipCount + 1);
    }
    await store.setJSON(logKey, record);
    return json(200, { sent: decision.send });
  } catch (err) {
    // Any failure = no auto-reply. The office still gets the enquiry as normal.
    console.log('auto-reply error:', err.message);
    record.error = err.message;
    try { await store.setJSON(logKey, record); } catch (e) {}
    return json(200, { sent: false, reason: 'error' });
  }
};

