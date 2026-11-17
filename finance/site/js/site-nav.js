/**
 * Mobile navigation toggle for the public site.
 *
 * The landing page wires this from `application.js`; the content pages (about,
 * recovery, rates, contact, legal, error) have no wizard, so they load this
 * module directly. Both paths call `initMobileNav()`, which is idempotent, so
 * the menu is wired exactly once per page.
 *
 * Behaviour expected of a disclosure menu:
 *   - `aria-expanded` tracks the open state;
 *   - Escape closes it and returns focus to the button;
 *   - a click outside closes it;
 *   - the page behind it does not scroll;
 *   - Tab is trapped inside the open menu, so keyboard focus cannot wander
 *     into content the menu is covering.
 */

// Must match the `@media (max-width: 1140px)` block in site.css that reveals
// `.nav-toggle` and turns `.main-nav` into an overlay. If this query is
// narrower than the CSS breakpoint, a viewport inside the gap keeps the menu
// open while the desktop row returns, so `setOpen(false)` never runs and the
// `body { overflow: hidden }` scroll lock is left stuck on.
const MOBILE_QUERY = '(max-width: 1140px)';

export function initMobileNav() {
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('mainNav');
  if (!toggle || !nav || nav.dataset.navWired === 'true') return;
  nav.dataset.navWired = 'true';

  let open = false;

  const focusables = () => [toggle, ...nav.querySelectorAll('a[href]')];

  function onKeydown(event) {
    if (event.key === 'Escape') {
      setOpen(false);
      toggle.focus();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onOutsideClick(event) {
    const target = event.target;
    if (nav.contains(target) || toggle.contains(target)) return;
    setOpen(false);
  }

  function setOpen(next) {
    open = next;
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    // Lock the page behind the menu so a swipe does not scroll the content
    // under the overlay.
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      document.addEventListener('keydown', onKeydown);
      document.addEventListener('click', onOutsideClick);
      const first = nav.querySelector('a[href]');
      if (first) first.focus();
    } else {
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('click', onOutsideClick);
    }
  }

  toggle.addEventListener('click', () => setOpen(!open));

  // Choosing a link closes the menu so the target is visible.
  nav.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) setOpen(false);
  });

  // Leaving the collapsed layout (e.g. rotating a tablet) drops the menu state,
  // so the desktop row never sits behind a stale overlay.
  const mq = window.matchMedia(MOBILE_QUERY);
  const onBreakpoint = (event) => {
    if (!event.matches && open) setOpen(false);
  };
  if (mq.addEventListener) mq.addEventListener('change', onBreakpoint);
  else if (mq.addListener) mq.addListener(onBreakpoint);
}

// Self-initialise on the content pages that load this module directly.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMobileNav);
} else {
  initMobileNav();
}
