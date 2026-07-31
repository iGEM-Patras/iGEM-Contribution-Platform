/**
 * Cloudinary uploads via unsigned upload presets.
 *
 * Unsigned presets are the one credential that is safe to ship in a static
 * frontend: the preset name grants upload-only access, never read or delete.
 * Lock the preset down in the Cloudinary dashboard (max file size, allowed
 * formats, moderation) — that is where the real limits live, not here.
 */

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

// Cloudinary can be slow on large files over a poor connection; fail loudly
// rather than leaving the button spinning forever.
const UPLOAD_TIMEOUT_MS = 60_000;

const formatBytes = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

/**
 * Upload one file and return its permanent HTTPS URL.
 *
 * @param {File} file
 * @param {{ resourceType?: 'image' | 'raw' | 'auto' }} [options]
 *   `image` for pictures, `raw` for the rules PDF. Sending a PDF as `image`
 *   makes Cloudinary treat it as a rasterisable document, which then falls
 *   under the "PDF and ZIP delivery" security restriction that is OFF by
 *   default on new accounts. `raw` sidesteps that entirely.
 * @returns {Promise<string>} the `secure_url` of the stored file
 * @throws {Error} with a message suitable for showing to the user
 */
export async function uploadToCloudinary(file, { resourceType = 'auto' } = {}) {
  if (!file) {
    throw new Error('No file was provided to upload.');
  }
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      'Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and ' +
      'VITE_CLOUDINARY_UPLOAD_PRESET in .env, then restart the dev server.'
    );
  }

  // Re-check size here as well as in the form: this module is the last gate
  // before the network, and callers may not have validated.
  const isPdf = file.type === 'application/pdf';
  const limit = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (file.size > limit) {
    throw new Error(
      `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(limit)}.`
    );
  }

  const body = new FormData();
  body.append('file', file);
  body.append('upload_preset', UPLOAD_PRESET);

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      body,
      signal: controller.signal,
    });
  } catch (cause) {
    // fetch only rejects on network failure or abort — never on HTTP status.
    if (controller.signal.aborted) {
      throw new Error(`Uploading ${file.name} timed out. Check your connection and try again.`, { cause });
    }
    // Keep the original for the console; CORS and DNS failures are
    // indistinguishable from the message alone.
    console.error('[cloudinary] network failure:', cause);
    throw new Error(`Could not reach Cloudinary while uploading ${file.name}.`, { cause });
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = payload?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`Cloudinary rejected ${file.name}: ${detail}`);
  }
  if (!payload?.secure_url) {
    throw new Error(`Cloudinary accepted ${file.name} but returned no URL.`);
  }

  console.info(`[cloudinary] uploaded ${file.name} →`, payload.secure_url);
  return payload.secure_url;
}
