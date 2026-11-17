/**
 * Live platform branding for the customer-facing pages.
 *
 * The dashboard's three settings (brand_profile, platform_mode,
 * compliance_note) are applied to any element carrying a `data-gf` attribute,
 * so brand name, support details and the compliance disclaimer are managed in
 * one place instead of being hard coded into each page. The config itself comes
 * from `LoanApi.getPlatformConfig` in `api.js` (the single backend seam); the
 * static HTML keeps its Gahonsh Finance values as the fallback, so the page
 * still reads correctly before the fetch resolves (or if it fails).
 */

import { LoanApi, FALLBACK_CONFIG } from './api.js';

const DEFAULT_CONFIG = FALLBACK_CONFIG;

/** Applies a single config value to an element, treating empty values as absent. */
function applyValue(el, kind, value) {
  if (value === null || value === undefined || value === '') return;
  const text = String(value);
  switch (kind) {
    case 'title':
      document.title = text;
      break;
    case 'title-suffix':
      document.title = `${document.title} — ${text}`;
      break;
    case 'text':
      el.textContent = text;
      break;
    case 'phone':
      el.textContent = text;
      if (el.tagName === 'A') {
        el.setAttribute('href', `tel:${text.replace(/[^\d+]/g, '')}`);
      }
      break;
    case 'email':
      el.textContent = text;
      if (el.tagName === 'A') {
        el.setAttribute('href', `mailto:${text}`);
      }
      break;
    default:
      el.textContent = text;
  }
}

function applyConfigToDocument(config) {
  document.querySelectorAll('[data-gf]').forEach((el) => {
    const kind = el.getAttribute('data-gf');
    const field = el.getAttribute('data-gf-field') || kind;
    if (field in config.brand) applyValue(el, kind, config.brand[field]);
    else if (field === 'complianceNote') applyValue(el, 'text', config.complianceNote);
    else if (field === 'mode') applyValue(el, 'text', config.mode);
  });

  // Mode badge: a DEMO posture is always made visible to the visitor.
  document.querySelectorAll('[data-gf-mode-badge]').forEach((el) => {
    if (config.mode && config.mode !== 'LIVE') {
      el.hidden = false;
      el.textContent = 'Demo environment';
    } else {
      el.hidden = true;
    }
  });

  // Feature flag: hide the application form when the public site is closed.
  if (config.features && config.features.public_site === false) {
    document.querySelectorAll('[data-gf-public-site]').forEach((el) => { el.hidden = true; });
    const closed = document.querySelector('[data-gf-public-site-closed]');
    if (closed) closed.hidden = false;
  }
  // Footer copyright year. Kept here rather than in a per-page inline script so
  // every page can ship a strict `script-src 'self'` policy (no inline JS).
  setFooterYear();
}

/** Stamps the current year into the footer's `#footerYear`, if present. */
function setFooterYear() {
  const yearEl = document.getElementById('footerYear');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
}

/**
 * Fetches and applies the live platform configuration. Safe to call on any
 * page; failures leave the static fallback untouched.
 */
export async function applyPlatformBranding() {
  let config = DEFAULT_CONFIG;
  try {
    config = await LoanApi.getPlatformConfig();
  } catch {
    // Offline or API unavailable: keep the fallback branding.
  }
  publishConfig(config);
  applyConfigToDocument(config);
  return config;
}

/**
 * Publishes the resolved config on `window` and via a `gf:platform-config`
 * event so plain (non-module) portal scripts can format money and dates with
 * the same currency and locale the dashboard sets, instead of hard-coding them.
 */
function publishConfig(config) {
  if (typeof window === 'undefined') return;
  window.GF_PLATFORM = config;
  window.dispatchEvent(new CustomEvent('gf:platform-config', { detail: config }));
}

if (typeof document !== 'undefined') {
  setFooterYear();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPlatformBranding);
  } else {
    applyPlatformBranding();
  }
}
