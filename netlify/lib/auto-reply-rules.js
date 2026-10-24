// The safety rules: decides whether an auto-reply is allowed.
// The AI only sorts the enquiry - this file makes the final yes/no,
// so the rules are fixed and can't be talked round by what someone types.

const ALLOWED = ['divorce_finance', 'contact_residence', 'cohabitation_property'];

function decide({ ai, alreadyReplied, ipCount }) {
  if (alreadyReplied) return { send: false, why: 'already auto-replied to this email in last 30 days' };
  if (ipCount >= 3) return { send: false, why: 'visitor reached 3 auto-replies today' };
  if (!ai) return { send: false, why: 'no AI result' };
  if (ai.spam === true) return { send: false, why: 'spam' };
  if (ai.complaint === true) return { send: false, why: 'complaint - needs a person' };
  if (ai.existing_client === true) return { send: false, why: 'existing client - needs a person' };
  if (ai.urgent === true) return { send: false, why: 'urgent - needs a person' };
  // Domestic abuse cases DO get the email (Michael's decision, Oct 2026), unless urgent.
  if (ai.is_new_enquiry !== true) return { send: false, why: 'not a new enquiry' };
  if (!ALLOWED.includes(ai.category)) return { send: false, why: `type "${ai.category}" is not one of the 3 auto-reply types` };
  return { send: true, why: `new ${ai.category} enquiry` };
}

module.exports = { decide, ALLOWED };

