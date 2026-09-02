// This runs quietly on Netlify's servers whenever someone submits the contact form.
// It checks the email and phone, looks up the visitor's IP, saves a record via
// Netlify's own Forms feature, then forwards everything to Shelley (CC Michael).

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const params = new URLSearchParams(event.body);
  const name = params.get('name') || '';
  const email = params.get('email') || '';
  const phone = params.get('phone') || '';
  const service = params.get('service') || '';
  const message = params.get('message') || '';

  const ip = event.headers['x-nf-client-connection-ip'] || 'unknown';

  const EMAIL_KEY = process.env.ABSTRACT_EMAIL_API_KEY;
  const PHONE_KEY = process.env.ABSTRACT_PHONE_API_KEY;
  const IP_KEY = process.env.ABSTRACT_IP_API_KEY;

  const [emailResult, phoneResult, ipResult] = await Promise.all([
    fetch(`https://emailreputation.abstractapi.com/v1/?api_key=${EMAIL_KEY}&email=${encodeURIComponent(email)}`)
      .then(r => r.json()).catch(() => null),
    fetch(`https://phoneintelligence.abstractapi.com/v1/?api_key=${PHONE_KEY}&phone=${encodeURIComponent(phone)}`)
      .then(r => r.json()).catch(() => null),
    fetch(`https://ip-intelligence.abstractapi.com/v1/?api_key=${IP_KEY}&ip_address=${encodeURIComponent(ip)}`)
      .then(r => r.json()).catch(() => null),
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

  // Log it via Netlify's own built-in Forms feature (viewable in the Netlify dashboard,
  // and it records the submitter's IP automatically too, as a backup to our own check).
  try {
    const logBody = new URLSearchParams({
      'form-name': 'enquiry-log',
      name, email, phone, service, message,
      ip, email_check: emailSummary, phone_check: phoneSummary, ip_check: ipSummary,
    });
    await fetch('https://tfamlaw.co.uk/contact-us.html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: logBody.toString(),
    });
  } catch (err) {
    console.error('Logging to Netlify Forms failed:', err);
  }

  // Forward the enquiry, with the checks added, to Shelley (CC Michael) via FormSubmit.
  // Note: FormSubmit checks where a submission came from as a spam guard. A normal
  // browser sends that automatically; our server-side call doesn't, so we tell it
  // explicitly with _url - and we check the actual response so failures show in logs.
  const forwardBody = new URLSearchParams({
    name, email, phone, service, message,
    'Visitor IP': ip,
    'Email check': emailSummary,
    'Phone check': phoneSummary,
    'IP check': ipSummary,
    _subject: 'New enquiry from tfamlaw.co.uk',
    _cc: 'michael@tflaw.co.uk',
    _template: 'table',
    _captcha: 'false',
    _url: 'https://tfamlaw.co.uk/contact-us.html',
  });

  try {
    const forwardResponse = await fetch('https://formsubmit.co/shelley@tflaw.co.uk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://tfamlaw.co.uk/contact-us.html',
      },
      body: forwardBody.toString(),
    });
    const responseText = await forwardResponse.text();
    console.log('FormSubmit response status:', forwardResponse.status);
    console.log('FormSubmit response body:', responseText.slice(0, 500));
    if (!forwardResponse.ok) {
      console.error('FormSubmit rejected the submission - see status/body above.');
    }
  } catch (err) {
    console.error('Forwarding email failed (network error):', err);
  }

  return {
    statusCode: 302,
    headers: { Location: '/contact-us.html?sent=true' },
    body: '',
  };
};
