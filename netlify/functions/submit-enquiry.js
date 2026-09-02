// This runs quietly the moment someone clicks "Send enquiry" - it checks the
// email, phone, and visitor IP, and hands the results back to the browser.
// The browser then does the actual sending itself (see contact-us.html),
// because FormSubmit blocks requests that don't come from a real browser.

async function checkOne(label, url) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log(`${label} status:`, res.status);
    console.log(`${label} body:`, text.slice(0, 500));
    if (!res.ok) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      console.log(`${label} body was not valid JSON`);
      return null;
    }
  } catch (err) {
    console.log(`${label} network error:`, err.message);
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let email = '';
  let phone = '';
  try {
    const body = JSON.parse(event.body);
    email = body.email || '';
    phone = body.phone || '';
  } catch (err) {
    return { statusCode: 400, body: 'Invalid request' };
  }

  const ip = event.headers['x-nf-client-connection-ip'] || 'unknown';

  const EMAIL_KEY = process.env.ABSTRACT_EMAIL_API_KEY;
  const PHONE_KEY = process.env.ABSTRACT_PHONE_API_KEY;
  const IP_KEY = process.env.ABSTRACT_IP_API_KEY;

  console.log('Key presence - email:', !!EMAIL_KEY, 'phone:', !!PHONE_KEY, 'ip:', !!IP_KEY);

  const [emailResult, phoneResult, ipResult] = await Promise.all([
    checkOne('EMAIL', `https://emailreputation.abstractapi.com/v1/?api_key=${EMAIL_KEY}&email=${encodeURIComponent(email)}`),
    checkOne('PHONE', `https://phoneintelligence.abstractapi.com/v1/?api_key=${PHONE_KEY}&phone=${encodeURIComponent(phone)}`),
    checkOne('IP', `https://ip-intelligence.abstractapi.com/v1/?api_key=${IP_KEY}&ip_address=${encodeURIComponent(ip)}`),
  ]);

  const emailSummary = emailResult
    ? `${emailResult.email_deliverability?.status || 'unknown'}` +
      `${emailResult.email_quality?.is_disposable ? ' — DISPOSABLE/FAKE ADDRESS' : ''}` +
      `${emailResult.email_quality?.is_free_email ? ' (free provider e.g. Gmail)' : ''}`
    : 'could not check';

  const phoneSummary = phoneResult
    ? `${phoneResult.phone_validation?.is_valid ? 'valid number' : 'INVALID / LIKELY FAKE'}, ` +
      `${phoneResult.phone_carrier?.line_type || 'unknown type'}, carrier: ${phoneResult.phone_carrier?.name || 'unknown'}` +
      `${phoneResult.phone_risk?.is_disposable ? ' — DISPOSABLE NUMBER' : ''}`
    : 'could not check';

  const ipSummary = ipResult
    ? `${ipResult.location?.city || 'unknown city'}, ${ipResult.location?.country || 'unknown country'} — ` +
      `${ipResult.company?.name || ipResult.asn?.name || 'unknown provider'}` +
      `${ipResult.security?.is_vpn ? ' [VPN]' : ''}${ipResult.security?.is_proxy ? ' [PROXY]' : ''}${ipResult.security?.is_tor ? ' [TOR]' : ''}`
    : 'could not check';

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip, emailSummary, phoneSummary, ipSummary }),
  };
};
