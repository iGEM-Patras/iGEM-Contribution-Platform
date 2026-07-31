/**
 * Airtable record creation for game submissions.
 *
 * SECURITY: VITE_AIRTABLE_TOKEN is inlined into the production bundle by Vite
 * and is therefore readable by anyone who loads the deployed site. This module
 * is safe under `npm run dev`; see the deployment note in README.md before
 * shipping it to GitHub Pages.
 */

const TOKEN = import.meta.env.VITE_AIRTABLE_TOKEN;
const BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;
const TABLE_ID = import.meta.env.VITE_AIRTABLE_TABLE_ID;

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Crockford Base32: the full alphabet minus I, L, O and U.
 *
 * Two reasons for this set rather than A-Z0-9. Ambiguous glyphs are gone, so a
 * code read aloud or retyped from an email can't be garbled (0/O, 1/I/L). And
 * it is exactly 32 characters, which divides 256 evenly — so `byte % 32` draws
 * uniformly from it, with none of the modulo bias a 36-character alphabet
 * would introduce.
 */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generate a random alphanumeric verification code.
 *
 * Uses crypto.getRandomValues rather than Math.random: these codes gate
 * ownership of a submission, so they must not be predictable from timing.
 *
 * @param {number} [length=8] 8 chars over a 32-char alphabet ≈ 1.1 trillion codes.
 * @returns {string}
 */
export function generateVerificationCode(length = 8) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let code = '';
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

/** Turn an Airtable error response into something a human can act on. */
function describeAirtableError(status, payload) {
  const detail = payload?.error?.message ?? payload?.error?.type ?? `HTTP ${status}`;

  switch (status) {
    case 401:
      return 'Airtable rejected the token (401). Check VITE_AIRTABLE_TOKEN is a valid personal access token.';
    case 403:
      return 'Airtable denied access (403). The token needs the data.records:write scope AND explicit access to this base.';
    case 404:
      return 'Airtable base or table not found (404). Check VITE_AIRTABLE_BASE_ID (app...) and VITE_AIRTABLE_TABLE_ID (tbl...).';
    case 422:
      return `Airtable rejected the fields (422): ${detail}. Field names are case-sensitive and must match the table exactly.`;
    case 429:
      return 'Airtable rate limit hit (429). Wait a few seconds and try again.';
    default:
      return `Airtable error: ${detail}`;
  }
}

/**
 * Create one submission record.
 *
 * @param {{teamName: string, email: string, instagram: string}} formData
 * @param {{main: string, secondary: string[]}} imageUrls Cloudinary URLs
 * @param {string} pdfUrl Cloudinary URL of the rules PDF
 * @returns {Promise<{success: true, verificationCode: string, recordId: string}>}
 * @throws {Error} on any failure, with a message suitable for showing to the user
 */
export async function submitToAirtable(formData, imageUrls, pdfUrl) {
  if (!TOKEN || !BASE_ID || !TABLE_ID) {
    throw new Error(
      'Airtable is not configured. Set VITE_AIRTABLE_TOKEN, VITE_AIRTABLE_BASE_ID ' +
      'and VITE_AIRTABLE_TABLE_ID in .env, then restart the dev server.'
    );
  }

  const verificationCode = generateVerificationCode();

  // Keys must match the Airtable column names character for character.
  // "Submitted At" is deliberately absent: it is a Created time field, which
  // Airtable computes itself and rejects as unknown if you try to write it.
  const fields = {
    'Team Name': formData.teamName.trim(),
    'Email': formData.email.trim(),
    'Main Image URL': imageUrls.main,
    'Secondary Images': JSON.stringify(imageUrls.secondary ?? []),
    'Rules PDF URL': pdfUrl,
    'Verification Code': verificationCode,
    'Status': 'Pending',
  };

  // Airtable's URL field rejects an empty string, so omit rather than blank it.
  const instagram = formData.instagram?.trim();
  if (instagram) {
    fields['Instagram'] = instagram;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      // typecast is deliberately off. With it on, a "Pending" that doesn't
      // match an existing Status option gets silently added to the field's
      // option list — a schema change nobody asked for. Off, a mismatch is a
      // loud 422 that you fix once in the base.
      body: JSON.stringify({ fields }),
      signal: controller.signal,
    });
  } catch (cause) {
    if (controller.signal.aborted) {
      // The record may still have been created — see the retry caveat in README.
      throw new Error('Airtable request timed out. Check your connection and try again.', { cause });
    }
    console.error('[airtable] network failure:', cause);
    throw new Error('Could not reach Airtable. Check your connection.', { cause });
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(describeAirtableError(response.status, payload));
  }
  if (!payload?.id) {
    throw new Error('Airtable accepted the record but returned no record ID.');
  }

  console.info(`[airtable] created record ${payload.id} with code ${verificationCode}`);
  return { success: true, verificationCode, recordId: payload.id };
}
