/**
 * consent — personal data without consent never leaves a public page (EF-32, Bau 20).
 *
 * The rating page sent an e-mail although the consent box was not ticked; a guard tool was
 * to clear it minutes later (and that class of tool has not run before, EF-14). The public
 * client applies this to EVERY create, whatever the page's code does: without the tick the
 * personal fields are not sent. Generated from the metadata (entity → consent field, e-mail fields).
 */
export const CONSENT_PAIRS: Record<string, { consent: string; personal: string[] }> = {};

function ticked(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1';
}

/** The fields to send: the personal ones only with consent. */
export function withConsent(entity: string, fields: Record<string, unknown>): Record<string, unknown> {
  const pair = CONSENT_PAIRS[entity];
  if (!pair || ticked(fields[pair.consent])) return fields;
  const out = { ...fields };
  for (const k of pair.personal) delete out[k];
  return out;
}

/** True when the visitor typed personal data but did not tick the consent — a page shows a sentence. */
export function personalWithoutConsent(entity: string, fields: Record<string, unknown>): boolean {
  const pair = CONSENT_PAIRS[entity];
  if (!pair || ticked(fields[pair.consent])) return false;
  return pair.personal.some(k => typeof fields[k] === 'string' && String(fields[k]).trim() !== '');
}
