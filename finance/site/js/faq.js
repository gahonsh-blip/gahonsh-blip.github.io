/**
 * FAQ accordion for the public content pages.
 *
 * Each `.faq-q` button toggles the `.faq-a` panel named by its `aria-controls`,
 * and keeps `aria-expanded` in step so the state is announced correctly. The
 * landing page has its own copy of this inside `application.js`; content pages
 * load this module instead of the whole wizard.
 */

document.querySelectorAll('.faq-q').forEach((button) => {
  button.addEventListener('click', () => {
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    if (!panel) return;
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
    panel.hidden = open;
  });
});
