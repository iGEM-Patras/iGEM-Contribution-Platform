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
 *   GET  /decide             preview an approve/reject from the admin email
 *   POST /decide             commit that decision (signed link required)
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
  approveUrl: 'Approve URL',
  rejectUrl: 'Reject URL',
  decidedAt: 'Decided At',
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

// --- Decision links --------------------------------------------------------

/**
 * The approve/reject links in the admin email carry their own authorisation.
 *
 * ADMIN_SECRET deliberately does NOT appear in these URLs. An email lands in a
 * mailbox, a spam filter, a browser history and a proxy log; a bearer secret in
 * a query string leaks into all four at once, and it would grant access to
 * every route, not one row. Instead each link carries an HMAC that is valid for
 * exactly one record and one action, and proves nothing else.
 */
const DECISION_ACTIONS = { approve: 'Approved', reject: 'Rejected' };

/** 24 bytes of base64url ≈ 192 bits — far past guessing, still a short URL. */
const DECISION_TOKEN_LENGTH = 32;

function base64Url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signDecision(recordId, action, env) {
  if (!env.DECISION_SECRET) {
    throw new ApiError(500, 'DECISION_SECRET is not configured on the server.');
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.DECISION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Both fields are inside the signed message, so a token minted for "reject"
  // cannot be replayed as "approve" by editing the query string.
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${recordId}:${action}`)
  );

  return base64Url(signature).slice(0, DECISION_TOKEN_LENGTH);
}

/**
 * Build the absolute approve/reject URLs for a record.
 *
 * The origin comes from the incoming request rather than configuration: it is
 * by definition the hostname the caller reached us on, so it stays correct
 * across workers.dev, a custom domain and `wrangler dev` with no extra setting
 * to forget.
 */
async function decisionLinks(recordId, request, env) {
  const origin = new URL(request.url).origin;

  const build = async action => {
    const token = await signDecision(recordId, action, env);
    return `${origin}/decide?record=${recordId}&action=${action}&token=${token}`;
  };

  const [approve, reject] = await Promise.all([build('approve'), build('reject')]);
  return { approve, reject };
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

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Team names are attacker-supplied and get rendered on the decision pages. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => HTML_ESCAPES[char]);
}

/**
 * The decision pages are opened by a human clicking a link in an email, so they
 * are HTML rather than JSON.
 *
 * `no-referrer` matters: without it, any link the page later renders would ship
 * the decision token to that third party in the Referer header.
 */
function html(body, { status = 200 } = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
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
    decidedAt: fields[FIELD.decidedAt] ?? null,
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

  // The signed decision links are written back onto the row so that the tools
  // downstream — Zapier's email, or an Airtable automation — can simply insert
  // two fields. Neither can compute an HMAC, and neither should ever be handed
  // the secret that would let it.
  //
  // This is a second round-trip that can fail on its own. If it does, the
  // submission itself is still valid and the team has their code, so we log and
  // move on rather than showing them an error for a problem they cannot act on.
  // /admin/submissions regenerates the same links on demand for recovery.
  try {
    const links = await decisionLinks(payload.id, request, env);
    await airtableFetch(env, `/${payload.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: { [FIELD.approveUrl]: links.approve, [FIELD.rejectUrl]: links.reject },
      }),
    });
  } catch (cause) {
    console.error(`[submit] could not attach decision links to ${payload.id}:`, cause);
  }

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

  // Links are derived, never read from the row: rows created before this
  // feature existed have empty URL cells, and a rotated DECISION_SECRET
  // invalidates whatever was stored. Signing on read means this endpoint is
  // always the authoritative way to recover a working link.
  const submissions = await Promise.all(
    records
      .sort((a, b) => (b.createdTime ?? '').localeCompare(a.createdTime ?? ''))
      .map(async record => ({
        ...toAdminSubmission(record),
        decisionLinks: await decisionLinks(record.id, request, env),
      }))
  );

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

// --- Decision pages --------------------------------------------------------

const PAGE_STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; padding: 24px;
    font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f4f4f7; color: #1c1c22;
  }
  .card {
    background: #fff; border-radius: 14px; padding: 32px; max-width: 520px; width: 100%;
    box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 12px 32px rgba(0,0,0,.08);
  }
  h1 { margin: 0 0 4px; font-size: 21px; letter-spacing: -.01em; }
  p { margin: 0 0 16px; color: #55555f; }
  dl { margin: 0 0 24px; display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 14px; }
  dt { color: #77777f; }
  dd { margin: 0; font-weight: 600; word-break: break-word; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .06em; }
  button {
    width: 100%; padding: 13px 20px; border: 0; border-radius: 9px; cursor: pointer;
    font-size: 15px; font-weight: 650; color: #fff;
  }
  .approve { background: #17803d; } .reject { background: #b4212a; }
  .badge {
    display: inline-block; padding: 3px 10px; border-radius: 999px;
    font-size: 13px; font-weight: 650;
  }
  .ok { background: #e7f6ec; color: #17803d; } .no { background: #fdeaec; color: #b4212a; }
  .muted { font-size: 13px; color: #88888f; margin: 20px 0 0; }
  @media (prefers-color-scheme: dark) {
    body { background: #16161a; color: #f2f2f5; }
    .card { background: #1f1f25; box-shadow: none; }
    p { color: #a0a0aa; } dt { color: #88888f; }
    .ok { background: #123322; color: #6ee7a0; } .no { background: #3a1519; color: #ff9ba4; }
  }
`;

function decisionPage(title, inner, { status = 200 } = {}) {
  return html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head>` +
      `<body><main class="card">${inner}</main></body></html>`,
    { status }
  );
}

/**
 * Read and authenticate the three query/form parameters every decision carries.
 *
 * @throws {ApiError} on a malformed or unsigned request
 */
async function readDecisionParams(source, env) {
  const recordId = source.get('record') ?? '';
  const action = source.get('action') ?? '';
  const token = source.get('token') ?? '';

  if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
    throw new ApiError(400, 'This link is malformed — no valid submission in it.');
  }
  if (!Object.hasOwn(DECISION_ACTIONS, action)) {
    throw new ApiError(400, 'This link is malformed — unknown action.');
  }
  if (!secretsMatch(token, await signDecision(recordId, action, env))) {
    throw new ApiError(403, 'This link is not valid. It may have been altered in transit.');
  }

  return { recordId, action, status: DECISION_ACTIONS[action] };
}

/**
 * Step one of two: show what is about to happen and ask for a click.
 *
 * This page deliberately changes nothing. Corporate mail scanners (Outlook Safe
 * Links, and most university filters) fetch every URL in an incoming message to
 * check it, so a GET that approved a submission would fire itself before anyone
 * read the email. The state change lives behind the POST below, which scanners
 * do not issue.
 */
async function handleDecideGet(request, env) {
  const url = new URL(request.url);

  const decision = await readDecisionParams(url.searchParams, env);
  const record = await airtableFetch(env, `/${decision.recordId}`);
  const fields = record?.fields ?? {};
  const current = fields[FIELD.status] ?? 'Pending';
  const isApprove = decision.action === 'approve';

  const already =
    current === decision.status
      ? `<p>Heads up: this submission is <strong>already ${escapeHtml(current)}</strong>.
         Confirming again is harmless.</p>`
      : '';

  return decisionPage(
    `${isApprove ? 'Approve' : 'Reject'} — ${fields[FIELD.teamName] ?? 'submission'}`,
    `<h1>${isApprove ? 'Approve' : 'Reject'} this submission?</h1>
     <p>Confirm below to set the status to <strong>${escapeHtml(decision.status)}</strong>.</p>
     ${already}
     <dl>
       <dt>Team</dt><dd>${escapeHtml(fields[FIELD.teamName] ?? '—')}</dd>
       <dt>Email</dt><dd>${escapeHtml(fields[FIELD.email] ?? '—')}</dd>
       <dt>Code</dt><dd><code>${escapeHtml(fields[FIELD.code] ?? '—')}</code></dd>
       <dt>Status now</dt><dd>${escapeHtml(current)}</dd>
     </dl>
     <form method="POST" action="/decide">
       <input type="hidden" name="record" value="${escapeHtml(decision.recordId)}">
       <input type="hidden" name="action" value="${escapeHtml(decision.action)}">
       <input type="hidden" name="token" value="${escapeHtml(url.searchParams.get('token'))}">
       <button class="${isApprove ? 'approve' : 'reject'}" type="submit">
         Yes, mark as ${escapeHtml(decision.status)}
       </button>
     </form>
     <p class="muted">Nothing has changed yet. Close this tab to cancel.</p>`
  );
}

/** Step two: the click actually landed, so write the status. */
async function handleDecidePost(request, env) {
  const form = await request.formData().catch(() => new FormData());

  const decision = await readDecisionParams(form, env);

  const payload = await airtableFetch(env, `/${decision.recordId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: {
        [FIELD.status]: decision.status,
        [FIELD.decidedAt]: new Date().toISOString(),
      },
    }),
  });

  const fields = payload?.fields ?? {};
  const isApprove = decision.action === 'approve';
  console.info(`[decide] ${decision.recordId} -> ${decision.status} via email link`);

  return decisionPage(
    `${decision.status} — ${fields[FIELD.teamName] ?? 'submission'}`,
    `<h1>Done</h1>
     <p><strong>${escapeHtml(fields[FIELD.teamName] ?? 'The submission')}</strong> is now
        <span class="badge ${isApprove ? 'ok' : 'no'}">${escapeHtml(decision.status)}</span></p>
     <dl>
       <dt>Code</dt><dd><code>${escapeHtml(fields[FIELD.code] ?? '—')}</code></dd>
       <dt>Decided</dt><dd>${escapeHtml(new Date().toUTCString())}</dd>
     </dl>
     <p class="muted">${
       isApprove
         ? 'It will appear in the public gallery on the next load.'
         : 'It stays hidden from the public gallery.'
     } You can close this tab.</p>`
  );
}

// --- Entry point -----------------------------------------------------------

const ROUTES = [
  { method: 'POST', path: '/submit', handler: handleSubmit },
  { method: 'GET', path: '/approved', handler: handleApproved },
  { method: 'GET', path: '/admin/submissions', handler: handleAdminSubmissions },
  { method: 'POST', path: '/admin/status', handler: handleAdminStatus },
  // Two methods, one path: GET previews the decision, POST commits it. Both are
  // opened by a person in a browser, so their errors must render as pages —
  // an admin who clicks Approve and gets a wall of JSON has no idea what to do.
  { method: 'GET', path: '/decide', handler: handleDecideGet, rendersHtml: true },
  { method: 'POST', path: '/decide', handler: handleDecidePost, rendersHtml: true },
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

    // Matched in two stages so that /decide, which answers on both GET and
    // POST, still produces a 405 rather than a 404 on any third method.
    const onPath = ROUTES.filter(entry => entry.path === path);
    if (onPath.length === 0) {
      return json({ error: 'Not found.' }, { status: 404, origin });
    }
    const route = onPath.find(entry => entry.method === request.method);
    if (!route) {
      return json({ error: 'Method not allowed.' }, { status: 405, origin });
    }

    try {
      const result = await route.handler(request, env);
      // The decision pages build their own HTML Response; everything else
      // returns a plain object for the JSON API.
      return result instanceof Response ? result : json(result, { origin });
    } catch (error) {
      const known = error instanceof ApiError;
      if (!known) {
        // Never surface an unexpected error's message: it can contain internals.
        console.error('[worker] unhandled error:', error);
      }
      const status = known ? error.status : 500;
      const message = known ? error.message : 'Something went wrong. Please try again.';

      if (route.rendersHtml) {
        return decisionPage(
          'Could not complete',
          `<h1>Could not complete this</h1><p>${escapeHtml(message)}</p>
           <p class="muted">Nothing was changed. You can set the status by hand in Airtable,
           or open the link again in a few minutes.</p>`,
          { status }
        );
      }
      return json({ error: message }, { status, origin });
    }
  },
};
