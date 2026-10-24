// The wording of the auto-reply email. Edit the text here to change it.

const LEGAL_AID_FORM = 'https://slabuploadrev2.netlify.app/';
const TRANSFER_FORM = 'https://cvlatransfer.netlify.app/';

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildEmail({ name, testFor }) {
  const firstName = esc((name || '').split(/\s+/)[0]);
  const greeting = firstName ? `Dear ${firstName},` : 'Hello,';

  const testBanner = testFor
    ? `<div style="background:#fff3cd;border:1px solid #e0b100;padding:10px;margin-bottom:16px;font-family:Arial,sans-serif;font-size:13px">
        <strong>TEST MODE</strong> - in live mode this would have gone to ${esc(testFor.email)}
        (${esc(testFor.name)}). Their message:<br><em>${esc(testFor.message).replace(/\n/g, '<br>')}</em></div>`
    : '';

  const html = `${testBanner}<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">
<p>${greeting}</p>
<p>Thanks for your enquiry - it is likely we can assist you.</p>
<p>Please click the relevant link below so we can start the process of applying for, or transferring, legal aid.</p>
<p><strong>If you don't have legal aid granted at the moment</strong>, please click on
<a href="${LEGAL_AID_FORM}">Thompson Family Law - Legal Aid Declaration</a> and complete same. We will be in touch.</p>
<p><strong>If you have civil legal aid granted already</strong>, please click on this link
<a href="${TRANSFER_FORM}">Civil Legal Aid Transfer Declaration</a> and complete. Instructions will then follow.</p>
<p>Please be assured that we will not take action on your behalf without speaking to you first.</p>
<p>Thanks,<br>Thompson Family Law</p>
</div>`;

  return { subject: 'Your enquiry to Thompson Family Law', html };
}

module.exports = { buildEmail, LEGAL_AID_FORM, TRANSFER_FORM };

