/**
 * An in-app link for the hash router (see utils/router.js).
 *
 * It renders a real anchor, so middle-click, ctrl-click, "open in new tab" and
 * "copy link address" all behave the way people expect — which is the whole
 * reason not to hand-roll this as a button with an onClick.
 */
export default function Link({ to, children, ...rest }) {
  return (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  );
}
