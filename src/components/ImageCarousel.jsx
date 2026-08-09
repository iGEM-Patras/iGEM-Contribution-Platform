import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CARD_IMAGE, FULL_IMAGE, THUMB_IMAGE, cloudinaryImage } from '../utils/cloudinary';

/** A tap that moves this far horizontally is a swipe, not a mis-aimed press. */
const SWIPE_THRESHOLD_PX = 50;

/**
 * The hero image plus a thumbnail strip, backed by a full-screen lightbox.
 *
 * The lightbox holds the main image *and* the secondary ones, so someone who
 * opens the hero can keep paging through the rest instead of closing it and
 * hunting for a thumbnail.
 *
 * @param {{ mainImage: string|null, images?: string[], teamName: string }} props
 */
export default function ImageCarousel({ mainImage, images = [], teamName }) {
  const all = [mainImage, ...images].filter(Boolean);

  // null when closed; otherwise the index into `all` being viewed.
  const [openIndex, setOpenIndex] = useState(null);
  // Only the hero gets a fallback: it is the card's whole visual content. A
  // broken 64px thumbnail is not worth tracking state for.
  const [heroBroken, setHeroBroken] = useState(false);

  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  // The button that opened the lightbox, so focus can go back where it was.
  const triggerRef = useRef(null);

  const isOpen = openIndex !== null;
  const count = all.length;

  const open = (index, event) => {
    triggerRef.current = event.currentTarget;
    setOpenIndex(index);
  };

  const close = () => setOpenIndex(null);

  // Wrap at both ends: the lightbox is a loop, so the last "next" returns to
  // the first image rather than dead-ending on a disabled button.
  const step = (delta) =>
    setOpenIndex(current => (current === null ? null : (current + delta + count) % count));

  useEffect(() => {
    if (!isOpen) return undefined;

    // Everything below is inlined or driven by state updaters so that this
    // effect's dependencies are stable. It must run exactly once per opening:
    // it moves focus, and re-running it would drag focus back to Close after
    // every click on Next.
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenIndex(null);
        return;
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        const delta = event.key === 'ArrowRight' ? 1 : -1;
        setOpenIndex(current => (current === null ? null : (current + delta + count) % count));
        return;
      }

      // Focus trap. Without it Tab walks out of the overlay and into the page
      // behind it, which is invisible to a sighted keyboard user and hopeless
      // with a screen reader.
      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll('button');
        if (!focusable?.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        const inside = dialogRef.current.contains(active);

        if (event.shiftKey && (!inside || active === first)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (!inside || active === last)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);

    // Without this the page behind the overlay scrolls under the user's finger.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    closeRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Returning focus to the thumbnail that was clicked keeps the tab order
      // where the user left it instead of dumping them at the top of the page.
      triggerRef.current?.focus();
    };
  }, [isOpen, count]);

  const touchStartX = useRef(null);
  const onTouchStart = (event) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };
  const onTouchEnd = (event) => {
    if (touchStartX.current === null) return;
    const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) > SWIPE_THRESHOLD_PX) step(delta < 0 ? 1 : -1);
  };

  if (count === 0) {
    return (
      <div className="aspect-[4/3] w-full bg-gray-100 flex items-center justify-center text-sm text-gray-400">
        No image provided
      </div>
    );
  }

  return (
    <>
      {/* Hero */}
      <button
        type="button"
        onClick={event => open(0, event)}
        className="group relative block w-full aspect-[4/3] overflow-hidden bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-purple-500"
        aria-label={`View images for ${teamName}`}
      >
        {heroBroken ? (
          <span className="flex h-full w-full items-center justify-center text-sm text-gray-400">
            Image unavailable
          </span>
        ) : (
          // object-contain, not cover: cover fills the frame by cropping, which
          // eats the edges of a wide game board or a tall poster.
          <img
            src={cloudinaryImage(all[0], CARD_IMAGE)}
            alt={`${teamName} — main game image`}
            loading="lazy"
            onError={() => setHeroBroken(true)}
            className="h-full w-full object-contain p-2 transition duration-300 group-hover:scale-[1.03]"
          />
        )}

        {count > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
            {count} photos
          </span>
        )}
      </button>

      {/* Thumbnails — the secondary images only; the hero is already above. */}
      {all.length > 1 && (
        <div className="flex gap-2 px-4 pt-4">
          {all.slice(1).map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={event => open(index + 1, event)}
              className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 hover:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              aria-label={`View image ${index + 2} of ${count} for ${teamName}`}
            >
              <img
                src={cloudinaryImage(url, THUMB_IMAGE)}
                alt={`${teamName} — image ${index + 2}`}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox. Portalled to <body> so the card's overflow-hidden and
          stacking context cannot clip it. */}
      {isOpen &&
        createPortal(
          <div
            ref={dialogRef}
            className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`${teamName} images`}
            onClick={close}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div className="flex items-center justify-between text-white">
              <p className="text-sm font-medium truncate pr-4">
                {teamName}
                <span className="ml-3 text-white/60">
                  {openIndex + 1} / {count}
                </span>
              </p>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                className="rounded-full p-2 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white"
                aria-label="Close image viewer"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Clicks inside the frame must not reach the backdrop's close. */}
            <div
              className="flex flex-1 items-center justify-center gap-2 sm:gap-4 min-h-0"
              onClick={event => event.stopPropagation()}
            >
              {count > 1 && (
                <button
                  type="button"
                  onClick={() => step(-1)}
                  className="shrink-0 rounded-full bg-white/10 p-2 sm:p-3 text-white hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white"
                  aria-label="Previous image"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}

              <img
                src={cloudinaryImage(all[openIndex], FULL_IMAGE)}
                alt={`${teamName} — image ${openIndex + 1} of ${count}`}
                className="max-h-full max-w-full rounded-lg object-contain"
              />

              {count > 1 && (
                <button
                  type="button"
                  onClick={() => step(1)}
                  className="shrink-0 rounded-full bg-white/10 p-2 sm:p-3 text-white hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white"
                  aria-label="Next image"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>

            <p className="pt-3 text-center text-xs text-white/50">
              Use the arrow keys or swipe to browse · Esc to close
            </p>
          </div>,
          document.body
        )}
    </>
  );
}
