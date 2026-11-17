import { SUPPORTED_LOCALES, translateText, translateTextPreservingWhitespace } from './site-locale.js';

const LOCALES = {
  en: { label: 'English', note: 'English' },
  hi: { label: 'हिन्दी', note: 'हिन्दी' },
};

const REGIONS = {
  in: { label: 'India', currency: 'INR ₹', lending: true },
  ae: { label: 'United Arab Emirates', currency: 'AED', lending: false },
  sg: { label: 'Singapore', currency: 'SGD', lending: false },
  gb: { label: 'United Kingdom', currency: 'GBP', lending: false },
};

const STORE_LANG = 'gf-locale';
const STORE_REGION = 'gf-region';
const textSources = new WeakMap();
const textRendered = new WeakMap();
const attributeSources = new WeakMap();
const attributeRendered = new WeakMap();
let titleSource = document.title;
let titleRendered = document.title;

function read(key, allowed, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Private mode or storage disabled: the preference simply does not persist. */
  }
}

const state = {
  lang: read(STORE_LANG, Object.keys(LOCALES), 'en'),
  region: read(STORE_REGION, Object.keys(REGIONS), 'in'),
};

function syncSelects(selector, value) {
  document.querySelectorAll(selector).forEach((el) => {
    if (!(el instanceof HTMLSelectElement)) return;
    if (selector === '[data-gf-lang]') {
      [...el.options].forEach((option) => {
        if (!SUPPORTED_LOCALES.includes(option.value)) option.remove();
      });
    }
    el.value = value;
  });
}

function translateNode(node) {
  const current = node.nodeValue ?? '';
  const source = textRendered.get(node) === current ? textSources.get(node) : current;
  textSources.set(node, source);

  const rendered = translateTextPreservingWhitespace(source, state.lang);
  textRendered.set(node, rendered);
  if (current !== rendered) node.nodeValue = rendered;
}

function translateAttribute(element, name) {
  const current = element.getAttribute(name);
  if (current === null) return;

  let sources = attributeSources.get(element);
  let renderedValues = attributeRendered.get(element);
  if (!sources) {
    sources = new Map();
    renderedValues = new Map();
    attributeSources.set(element, sources);
    attributeRendered.set(element, renderedValues);
  }

  const source = renderedValues.get(name) === current ? sources.get(name) : current;
  sources.set(name, source);
  const rendered = translateText(source, state.lang);
  renderedValues.set(name, rendered);
  if (current !== rendered) element.setAttribute(name, rendered);
}

const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP_SELECTOR = 'script, style, title, noscript, [data-i18n-ignore]';

function translateElement(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateNode(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.matches(SKIP_SELECTOR)) return;

  // Attributes on the element itself and on every descendant: a placeholder,
  // `aria-label`, `alt` or `title` is just as visible as body text, so leaving
  // the descendants untouched left English hints inside an otherwise translated
  // form.
  const elements = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  do {
    const element = elements.currentNode;
    if (!element.closest(SKIP_SELECTOR)) {
      for (const name of TRANSLATABLE_ATTRIBUTES) translateAttribute(element, name);
    }
  } while (elements.nextNode());

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement?.closest(SKIP_SELECTOR)) translateNode(node);
  }
}

function translatePage() {
  translateElement(document.body);
  translateElement(document.head);
  document.querySelectorAll('meta[name="description"], meta[property^="og:"], meta[name^="twitter:"]').forEach((meta) => {
    translateAttribute(meta, 'content');
  });

  if (document.title !== titleRendered && document.title !== titleSource) titleSource = document.title;
  titleRendered = translateText(titleSource, state.lang);
  if (document.title !== titleRendered) document.title = titleRendered;
}

function applyPreference() {
  const locale = LOCALES[state.lang] || LOCALES.en;
  const region = REGIONS[state.region] || REGIONS.in;
  const regionLabel = state.lang === 'hi'
    ? { in: 'भारत', ae: 'संयुक्त अरब अमीरात', sg: 'सिंगापुर', gb: 'यूनाइटेड किंगडम' }[state.region]
    : region.label;

  document.documentElement.lang = state.lang;
  syncSelects('[data-gf-lang]', state.lang);
  syncSelects('[data-gf-region]', state.region);
  translatePage();

  const note = document.querySelector('.util-bar__note');
  if (note) {
    note.textContent = state.lang === 'hi'
      ? region.lending
        ? `भारत में उधारकर्ताओं के लिए · केवल सांकेतिक आंकड़े (${region.currency})`
        : `${regionLabel} पूर्वावलोकन · ऋण सुविधा केवल भारत में उपलब्ध है (${region.currency})`
      : region.lending
        ? `Serving borrowers across India · Indicative figures only (${region.currency})`
        : `${region.label} preview · Lending is offered in India only (${region.currency})`;
  }

  // The footer note explains what the regional setting does; keep it honest
  // about the fact that only India is a live lending region.
  const footerNote = document.querySelector('.footer-note');
  if (footerNote) {
    footerNote.textContent = state.lang === 'hi'
      ? region.lending
        ? 'क्षेत्रीय सेटिंग से दिखाई जाने वाली मुद्रा और भाषा बदलती है। ऋण सुविधा केवल भारत में उपलब्ध है; अन्य क्षेत्र इस विकास संस्करण के पूर्वावलोकन हैं।'
        : `आप ${regionLabel} का पूर्वावलोकन देख रहे हैं। ऋण सुविधा केवल भारत में उपलब्ध है; यह क्षेत्र विकास संस्करण का पूर्वावलोकन है।`
      : region.lending
        ? 'Regional settings change the currency and language shown. Lending is offered in India only; other regions are previews for this development build.'
        : `You are viewing the ${region.label} preview. Lending is offered in India only; this region is a preview for the development build.`;
  }

  return locale;
}

function translateMutations(records) {
  for (const record of records) {
    if (record.type === 'characterData') translateNode(record.target);
    for (const node of record.addedNodes) translateElement(node);
  }
}

function bind() {
  document.querySelectorAll('[data-gf-lang]').forEach((el) => {
    el.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || !SUPPORTED_LOCALES.includes(target.value)) return;
      state.lang = target.value;
      write(STORE_LANG, state.lang);
      applyPreference();
    });
  });

  document.querySelectorAll('[data-gf-region]').forEach((el) => {
    el.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      state.region = target.value;
      write(STORE_REGION, state.region);
      applyPreference();
    });
  });

  if (document.body && typeof MutationObserver !== 'undefined') {
    new MutationObserver(translateMutations).observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
}

applyPreference();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bind);
} else {
  bind();
}

export { state as sitePreferences, LOCALES, REGIONS };
