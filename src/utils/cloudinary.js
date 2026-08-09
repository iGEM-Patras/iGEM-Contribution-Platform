/**
 * Delivery-time image transformations.
 *
 * Uploads arrive at whatever size the team's camera produced — up to the 5MB
 * cap the form enforces. Rendering those originals in a 400px card downloads
 * megabytes to draw a thumbnail. Cloudinary resizes and re-encodes on delivery
 * for free, so the fix is entirely in the URL: the same asset, asked for at the
 * size it will actually be displayed.
 *
 * Everything here is a pure string edit. A URL that isn't a Cloudinary image
 * (the raw PDF, or a hand-edited cell in Airtable) is returned untouched rather
 * than mangled into a 404.
 */

const UPLOAD_MARKER = '/image/upload/';

/**
 * `f_auto,q_auto` are the two that matter and belong on every variant: serve
 * WebP/AVIF where the browser accepts it, and let Cloudinary pick the quality
 * that is visually lossless for this particular image.
 */
const BASE = 'f_auto,q_auto';

/** Card hero: ~400px on screen, doubled so it stays sharp on retina displays. */
export const CARD_IMAGE = `${BASE},w_800`;

/** 64px thumbnail strip, cropped square to match the fixed-size buttons. */
export const THUMB_IMAGE = `${BASE},w_160,h_160,c_fill`;

/** Lightbox: big enough for a full-screen view without shipping the original. */
export const FULL_IMAGE = `${BASE},w_1600`;

/**
 * Insert a transformation into a Cloudinary image URL.
 *
 * @param {string} url an https://res.cloudinary.com/<cloud>/image/upload/... URL
 * @param {string} transform e.g. CARD_IMAGE
 * @returns {string} the transformed URL, or `url` unchanged if it isn't one
 */
export function cloudinaryImage(url, transform) {
  if (typeof url !== 'string') return url;

  const marker = url.indexOf(UPLOAD_MARKER);
  if (marker === -1) return url;

  const cut = marker + UPLOAD_MARKER.length;
  return `${url.slice(0, cut)}${transform}/${url.slice(cut)}`;
}
