/**
 * iGEM Game Gallery API.
 *
 * This Worker exists for one reason: the Airtable token must never reach a
 * browser. GitHub Pages serves static files, so anything the frontend knows is
 * public. The token lives here as a Wrangler secret, and the browser talks to
 * these four routes instead:
 *
 *   POST /submit             create a submission (public)
 *   GET  /approved           list approved games (public, no emails)
 *   GET  /admin/submissions  list everything (admin secret required)
 *   POST /admin/status       set a record's status (admin secret required)
 *
 * The Worker is also the trust boundary. The browser is assumed hostile: every
 * field is re-validated here, the verification code is generated here, and file
 * URLs are checked to be our own Cloudinary account's — otherwise anyone could
 * POST arbitrary URLs and have the gallery render them.
 */

/** Airtable column names. Case-sensitive, must match the base exactly. */
const FIELD = {
  teamName: 'Team Name',
  email: 'Email',
  instagram: 'Instagram',
  mainImage: 'Main Image URL',
  secondaryImages: 'Secondary Images',
  rulesPdf: 'Rules PDF URL',
  code: 'Verification Code',
  status: 'Status',
};

const VALID_STATUSES = ['Pending', 'Approved', 'Rejected'];

const MAX_SECONDARY_IMAGES = 3;
const MAX_TEAM_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254; // RFC 5321 limit on a forward path
const MAX_URL_LENGTH = 500;

const AIRTABLE_TIMEOUT_MS = 20_000;

/**
 * Crockford Base32: the full alphabet minus I, L, O and U.
 *
 * Ambiguous glyphs are gone, so a code read aloud or retyped from an email
 * can't be garbled (0/O, 1/I/L). It is exactly 32 characters, which divides 256
 * evenly — so `byte % 32` draws uniformly, with none of the modulo bias a
 * 36-character alphabet would introduce.
 */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generate a random verification code.
 *
 * crypto.getRandomValues rather than Math.random: these codes identify
 * ownership of a submission, so they must not be predictable from timing.
 *
 * @param {number} [length=8] 8 chars over a 32-char alphabet ≈ 1.1 trillion codes.
 */
function generateVerificationCode(length = 8) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let code = '';
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

// --- HTTP plumbing ---------------------------------------------------------

/**
 * Resolve the CORS origin to echo back.
 *
 * We never reply `*`. The admin routes are authenticated by a header, and a
 * wildcard would let any page on the internet drive them using a secret its
 * user had already entered elsewhere.
 *
 * @returns {string|null} the origin to allow, or null to omit CORS headers
 */
function resolveOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;

  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);

  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(origin) {
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
    'Access-Control-Max-Age': '86400',
    // Caches must not serve one origin's CORS response to another.
    Vary: 'Origin',
  };
}

function json(body, { status = 200, origin = null } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
    },
  });
}

/** Thrown by handlers to produce a specific status; anything else becomes a 500. */
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// --- Validation ------------------------------------------------------------

/**
 * Compare two secrets without leaking their content through timing.
 *
 * Length is still observable (an early return on mismatched length), which is
 * fine — the secret's length is not the secret.
 */
function secretsMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

function requireAdmin(request, env) {
  if (!env.ADMIN_SECRET) {
    throw new ApiError(500, 'Admin access is not configured on the server.');
  }
  if (!secretsMatch(request.headers.get('X-Admin-Secret'), env.ADMIN_SECRET)) {
    throw new ApiError(401, 'Invalid admin credentials.');
  }
}

function requireString(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, `${label} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ApiError(400, `${label} is too long (max ${maxLength} characters).`);
  }
  return trimmed;
}

/**
 * Accept only HTTPS URLs served by our own Cloudinary account.
 *
 * Without this the endpoint is an open content-injection hole: the gallery
 * renders whatever URL it is handed, so an attacker could point image and PDF
 * fields at any host they control. Pinning the cloud name means the file had to
 * pass through our upload preset first.
 */
function requireCloudinaryUrl(value, label, env) {
  const raw = requireString(value, label, MAX_URL_LENGTH);

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(400, `${label} is not a valid URL.`);
  }

  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) {
    throw new ApiError(500, 'CLOUDINARY_CLOUD_NAME is not configured on the server.');
  }

  const expectedPrefix = `/${cloudName}/`;
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'res.cloudinary.com' ||
    !url.pathname.startsWith(expectedPrefix)
  ) {
    throw new ApiError(400, `${label} must be a file uploaded through this form.`);
  }

  return url.toString();
}

/** Deliberately permissive — the real proof an address works is the email arriving. */
function requireEmail(value) {
  const email = requireString(value, 'Email', MAX_EMAIL_LENGTH);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'Email format is invalid.');
  }
  return email;
}

function optionalInstagram(value) {
  if (value == null || value === '') return null;

  const raw = requireString(value, 'Instagram link', MAX_URL_LENGTH);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(400, 'Instagram link must be a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiError(400, 'Instagram link must start with http:// or https://.');
  }
  return url.toString();
}

// --- Airtable --------------------------------------------------------------

/**
 * Call the Airtable REST API with the server-held token.
 *
 * @returns {Promise<any>} the parsed response body
 * @throws {ApiError} with a message safe to show a user — Airtable's own error
 *   text can name fields and base structure, so it is logged, not forwarded.
 */
async function airtableFetch(env, path, init = {}) {
  for (const name of ['AIRTABLE_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_TABLE_ID']) {
    if (!env[name]) {
      throw new ApiError(500, `${name} is not configured on the server.`);
    }
  }

  const url = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_TABLE_ID}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AIRTABLE_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: controller.signal,
    });
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new ApiError(504, 'Airtable took too long to respond. Please try again.');
    }
    console.error('[airtable] network failure:', cause);
    throw new ApiError(502, 'Could not reach Airtable.');
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    // Full detail to the Worker log, a generic message to the caller.
    console.error('[airtable] error', response.status, JSON.stringify(payload));

    if (response.status === 429) {
      throw new ApiError(429, 'Too many requests right now. Wait a few seconds and try again.');
    }
    throw new ApiError(502, 'Airtable rejected the request. The admin has been notified via logs.');
  }

  return payload;
}

/**
 * Fetch every record matching a filter, following Airtable's pagination.
 *
 * The cap is a safety valve, not a real limit: this beta expects tens of rows,
 * and an unbounded loop against a paginating API is how a Worker hits its CPU
 * limit if something upstream misbehaves.
 */
async function airtableList(env, { filterByFormula = null, maxPages = 10 } = {}) {
  const records = [];
  let offset;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ pageSize: '100' });
    if (filterByFormula) params.set('filterByFormula', filterByFormula);
    if (offset) params.set('offset', offset);

    const payload = await airtableFetch(env, `?${params}`);
    records.push(...(payload?.records ?? []));

    offset = payload?.offset;
    if (!offset) break;
  }

  return records;
}

/** Secondary image URLs are stored as a JSON array in a long-text field. */
function parseSecondaryImages(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
  } catch {
    // A hand-edited cell in the Airtable UI shouldn't break the whole gallery.
    console.warn('[airtable] unparseable Secondary Images cell:', value);
    return [];
  }
}

/** Shape sent to the public gallery. Note what is absent: email, code. */
function toPublicGame(record) {
  const fields = record.fields ?? {};
  return {
    id: record.id,
    teamName: fields[FIELD.teamName] ?? '',
    instagram: fields[FIELD.instagram] ?? null,
    mainImageUrl: fields[FIELD.mainImage] ?? null,
    secondaryImageUrls: parseSecondaryImages(fields[FIELD.secondaryImages]),
    rulesPdfUrl: fields[FIELD.rulesPdf] ?? null,
    createdTime: record.createdTime,
  };
}

/** Shape sent to the admin dashboard — everything needed to make a decision. */
function toAdminSubmission(record) {
  const fields = record.fields ?? {};
  return {
    ...toPublicGame(record),
    email: fields[FIELD.email] ?? '',
    verificationCode: fields[FIELD.code] ?? '',
    status: fields[FIELD.status] ?? 'Pending',
  };
}

// --- Route handlers --------------------------------------------------------

async function handleSubmit(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body must be JSON.');
  }

  const secondaryInput = body.secondaryImageUrls;
  if (!Array.isArray(secondaryInput) || secondaryInput.length === 0) {
    throw new ApiError(400, 'At least one additional image is required.');
  }
  if (secondaryInput.length > MAX_SECONDARY_IMAGES) {
    throw new ApiError(400, `At most ${MAX_SECONDARY_IMAGES} additional images are allowed.`);
  }

  const teamName = requireString(body.teamName, 'Team name', MAX_TEAM_NAME_LENGTH);
  const email = requireEmail(body.email);
  const instagram = optionalInstagram(body.instagram);
  const mainImageUrl = requireCloudinaryUrl(body.mainImageUrl, 'Main image', env);
  const secondaryImageUrls = secondaryInput.map((url, i) =>
    requireCloudinaryUrl(url, `Additional image ${i + 1}`, env)
  );
  const rulesPdfUrl = requireCloudinaryUrl(body.rulesPdfUrl, 'Rules PDF', env);

  // Generated here, not in the browser: a client-chosen code could collide with
  // another team's on purpose.
  const verificationCode = generateVerificationCode();

  // "Submitted At" is deliberately absent: it is a Created time field, which
  // Airtable computes itself and rejects as unknown if you try to write it.
  const fields = {
    [FIELD.teamName]: teamName,
    [FIELD.email]: email,
    [FIELD.mainImage]: mainImageUrl,
    [FIELD.secondaryImages]: JSON.stringify(secondaryImageUrls),
    [FIELD.rulesPdf]: rulesPdfUrl,
    [FIELD.code]: verificationCode,
    [FIELD.status]: 'Pending',
  };

  // Airtable's URL field rejects an empty string, so omit rather than blank it.
  if (instagram) {
    fields[FIELD.instagram] = instagram;
  }

  // typecast stays off. With it on, a Status that doesn't match an existing
  // option gets silently added to the field's option list — a schema change
  // nobody asked for. Off, a mismatch is a loud error you fix once in the base.
  const payload = await airtableFetch(env, '', {
    method: 'POST',
    body: JSON.stringify({ fields }),
  });

  if (!payload?.id) {
    throw new ApiError(502, 'Airtable accepted the record but returned no record ID.');
  }

  console.info(`[submit] created ${payload.id} for "${teamName}"`);
  return { success: true, verificationCode, recordId: payload.id };
}

async function handleApproved(request, env) {
  const records = await airtableList(env, {
    filterByFormula: `{${FIELD.status}} = "Approved"`,
  });

  // Newest first — a team that just got approved should see itself at the top.
  const games = records
    .map(toPublicGame)
    .filter(game => game.mainImageUrl)
    .sort((a, b) => (b.createdTime ?? '').localeCompare(a.createdTime ?? ''));

  return { games };
}

async function handleAdminSubmissions(request, env) {
  requireAdmin(request, env);

  const status = new URL(request.url).searchParams.get('status');
  if (status && !VALID_STATUSES.includes(status)) {
    throw new ApiError(400, `Status must be one of: ${VALID_STATUSES.join(', ')}.`);
  }

  // Interpolation is safe here only because `status` came from the allowlist above.
  const records = await airtableList(env, {
    filterByFormula: status ? `{${FIELD.status}} = "${status}"` : null,
  });

  const submissions = records
    .map(toAdminSubmission)
    .sort((a, b) => (b.createdTime ?? '').localeCompare(a.createdTime ?? ''));

  return { submissions };
}

async function handleAdminStatus(request, env) {
  requireAdmin(request, env);

  const body = await request.json().catch(() => null);
  const recordId = body?.recordId;
  const status = body?.status;

  // Airtable record IDs are "rec" + 14 alphanumerics; checking the shape keeps
  // junk out of the request path.
  if (typeof recordId !== 'string' || !/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
    throw new ApiError(400, 'A valid recordId is required.');
  }
  if (!VALID_STATUSES.includes(status)) {
    throw new ApiError(400, `Status must be one of: ${VALID_STATUSES.join(', ')}.`);
  }

  const payload = await airtableFetch(env, `/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { [FIELD.status]: status } }),
  });

  console.info(`[admin] ${recordId} -> ${status}`);
  return { success: true, recordId, status: payload?.fields?.[FIELD.status] ?? status };
}

// --- Entry point -----------------------------------------------------------

const ROUTES = [
  { method: 'POST', path: '/submit', handler: handleSubmit },
  { method: 'GET', path: '/approved', handler: handleApproved },
  { method: 'GET', path: '/admin/submissions', handler: handleAdminSubmissions },
  { method: 'POST', path: '/admin/status', handler: handleAdminStatus },
];

export default {
  async fetch(request, env) {
    const origin = resolveOrigin(request, env);
    const url = new URL(request.url);

    // Trailing slashes are a common hand-typed variant; treat them as the same route.
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      // No CORS headers means no matching origin, which the browser reads as a
      // refusal — exactly what we want for an unlisted site.
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (path === '/' || path === '/health') {
      return json({ ok: true, service: 'igem-gallery-api' }, { origin });
    }

    const route = ROUTES.find(entry => entry.path === path);
    if (!route) {
      return json({ error: 'Not found.' }, { status: 404, origin });
    }
    if (route.method !== request.method) {
      return json({ error: 'Method not allowed.' }, { status: 405, origin });
    }

    try {
      const result = await route.handler(request, env);
      return json(result, { origin });
    } catch (error) {
      if (error instanceof ApiError) {
        return json({ error: error.message }, { status: error.status, origin });
      }
      // Never surface an unexpected error's message: it can contain internals.
      console.error('[worker] unhandled error:', error);
      return json({ error: 'Something went wrong. Please try again.' }, { status: 500, origin });
    }
  },
};
