// Internal link: a real <a href> that navigates with the History API on a plain
// left click, so middle-click, long-press and "open in new tab" still work.
export default function Link({ href, ...rest }) {
  function onClick(e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    window.history.pushState(null, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo(0, 0);
  }
  return <a href={href} onClick={onClick} {...rest} />;
}
