/**
 * Gahonsh Finance — public loan application API seam.
 *
 * This module is the ONLY place the public site talks to the backend. It calls
 * the real Gahonsh Finance API backed by Cloudflare Worker + D1:
 *
 *   GET  /api/public/loan-products   -> LoanApi.getLoanProducts()
 *   POST /api/public/loan-quote      -> LoanApi.quote()
 *   POST /api/public/applications    -> LoanApi.submitApplication()
 *
 * The browser is never the authority on pricing. The catalogue (amount bounds,
 * tenor range, interest rate) and every EMI figure come from the server, which
 * computes them from the tenant's own `loan_products` and
 * `interest_rule_versions` rows.
 *
 * `FALLBACK_CATEGORIES`, `calculateEmi` and `evaluateQuote` remain in this
 * module for two reasons: they render a usable catalogue and estimate when the
 * network is unavailable, and they gate input locally so an obviously
 * out-of-range value can be flagged before a round trip. Whatever they produce
 * is indicative; the server revalidates and reprices everything on submit.
 */

/** Base path of the public API. Same-origin, so no credentials are needed. */
const API_BASE = '/api/public';

/**
 * Catalogue used only when `GET /api/public/loan-products` cannot be reached.
 * Ids mirror the seeded public products so a form filled from the fallback
 * still submits successfully once connectivity returns.
 */
export const FALLBACK_CATEGORIES = [
  {
    id: 'prod_pub_personal',
    name: 'Personal Loan',
    blurb: 'For weddings, travel, medical needs or any planned expense.',
    minAmount: 25000,
    maxAmount: 500000,
    minTenureMonths: 6,
    maxTenureMonths: 48,
    annualRatePercent: 11.5,
  },
  {
    id: 'prod_pub_business',
    name: 'Business Loan',
    blurb: 'Working capital to grow your shop, trading or services business.',
    minAmount: 50000,
    maxAmount: 1500000,
    minTenureMonths: 12,
    maxTenureMonths: 60,
    annualRatePercent: 13.25,
  },
  {
    id: 'prod_pub_agri',
    name: 'Agriculture Loan',
    blurb: 'Seasonal finance for seeds, equipment and crop-cycle expenses.',
    minAmount: 20000,
    maxAmount: 800000,
    minTenureMonths: 6,
    maxTenureMonths: 36,
    annualRatePercent: 9.75,
  },
  {
    id: 'prod_pub_education',
    name: 'Education Loan',
    blurb: 'Support for tuition, admission and study-related costs.',
    minAmount: 50000,
    maxAmount: 1200000,
    minTenureMonths: 12,
    maxTenureMonths: 72,
    annualRatePercent: 10.5,
  },
  {
    id: 'prod_pub_vehicle',
    name: 'Vehicle Loan',
    blurb: 'Two-wheeler and commercial vehicle finance at competitive rates.',
    minAmount: 40000,
    maxAmount: 1000000,
    minTenureMonths: 12,
    maxTenureMonths: 60,
    annualRatePercent: 10.25,
  },
  {
    id: 'prod_pub_gold',
    name: 'Gold Loan',
    blurb: 'Quick secured finance against eligible gold ornaments.',
    minAmount: 15000,
    maxAmount: 600000,
    minTenureMonths: 3,
    maxTenureMonths: 24,
    annualRatePercent: 9.25,
  },
];

/**
 * Resolves the presentational tagline for a server-owned product id.
 *
 * Product naming and pricing are server-owned; only the marketing sentence lives
 * here. Product ids are server-owned and tenant-scoped: the demo tenant uses
 * `prod_pub_personal`, while a tenant that self-heals its own catalogue gets a
 * suffixed id (`prod_pub_personal_1d503581`). An exact-key lookup would miss
 * every suffixed id and show the generic sentence on every card, so match on
 * the product slug instead — mirroring the glyph matcher in `application.js`.
 * An unknown product falls back to a generic sentence so a newly enabled product
 * still renders.
 */
export function productBlurb(id) {
  const needle = String(id ?? '').toLowerCase();
  const match = FALLBACK_CATEGORIES.find((c) => needle.includes(c.id.replace('prod_pub_', '')));
  return match ? match.blurb : 'Flexible finance from Gahonsh Finance.';
}

/** Compact INR label, e.g. 25000 -> ₹25,000 and 1500000 -> ₹15 L. */
function formatCompact(value) {
  const n = Number(value) || 0;
  if (n >= 10000000) return `₹${trimZero(n / 10000000)} Cr`;
  if (n >= 100000) return `₹${trimZero(n / 100000)} L`;
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function trimZero(n) {
  return String(Math.round(n * 100) / 100);
}

/** Adds the derived display fields the markup expects. */
function decorate(product) {
  const rate = Number(product.annualRatePercent) || 0;
  return {
    ...product,
    indicativeRate: `${rate.toFixed(2)}%`,
    rangeLabel: `${formatCompact(product.minAmount)} – ${formatCompact(product.maxAmount)}`,
  };
}

/**
 * Runtime catalogue. Starts as decorated fallback data and is replaced by the
 * server's response during bootstrap.
 */
export let LOAN_CATEGORIES = FALLBACK_CATEGORIES.map(decorate);

/** Replaces the runtime catalogue (called during bootstrap). */
export function setLoanCategories(products) {
  LOAN_CATEGORIES = products.map(decorate);
  return LOAN_CATEGORIES;
}

/** Employment status options used in step 2. Values match the API contract. */
export const EMPLOYMENT_STATUSES = [
  { value: 'SALARIED', label: 'Salaried' },
  { value: 'SELF_EMPLOYED', label: 'Self-employed' },
  { value: 'BUSINESS_OWNER', label: 'Business owner' },
  { value: 'FARMER', label: 'Farmer / Agriculture' },
  { value: 'RETIRED', label: 'Retired' },
  { value: 'STUDENT', label: 'Student' },
];

/**
 * Loan purpose options. Values match `PUBLIC_LOAN_PURPOSES` on the server; an
 * unlisted value is rejected by the API, so this list is the client's copy of a
 * server-owned enum.
 */
export const LOAN_PURPOSES = [
  { value: 'PERSONAL_EXPENSE', label: 'Personal expense' },
  { value: 'MEDICAL', label: 'Medical / Health' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'HOME_RENOVATION', label: 'Home renovation' },
  { value: 'BUSINESS_EXPANSION', label: 'Business expansion' },
  { value: 'WORKING_CAPITAL', label: 'Business working capital' },
  { value: 'EQUIPMENT_PURCHASE', label: 'Equipment purchase' },
  { value: 'AGRI_INPUTS', label: 'Agriculture / Farming inputs' },
  { value: 'VEHICLE_PURCHASE', label: 'Vehicle purchase' },
  { value: 'DEBT_CONSOLIDATION', label: 'Consolidate existing debt' },
  { value: 'OTHER', label: 'Other' },
];

export function getCategoryById(id) {
  return LOAN_CATEGORIES.find((c) => c.id === id) || null;
}

/** An error carrying the API's machine-readable code and per-field messages. */
export class ApiError extends Error {
  constructor(message, { code = 'REQUEST_FAILED', status = 0, fields = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

/**
 * Performs a JSON request against the public API.
 *
 * Always resolves with parsed JSON or rejects with an `ApiError`. Network
 * failures, timeouts and non-JSON bodies are normalised so callers only ever
 * handle one error shape.
 */
async function request(path, { method = 'GET', body, headers = {}, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    throw new ApiError(
      aborted
        ? 'The request took too long. Please check your connection and try again.'
        : 'We could not reach Gahonsh Finance. Please check your connection and try again.',
      { code: aborted ? 'TIMEOUT' : 'NETWORK_ERROR' },
    );
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    // The API mixes error envelopes: the uniform
    // `{ success:false, error:{ code, message } }` object, the older
    // `{ error: "message" }` string, and the route handlers' `{ detail }`.
    // Reading `payload.error` directly and handing it to `Error` would put an
    // *object* into `message`, so a page that renders `err.message` showed
    // "[object Object]" for any validation failure.
    const envelope = payload && payload.error;
    const message = (envelope && typeof envelope === 'object' && envelope.message)
      || (typeof envelope === 'string' && envelope)
      || (payload && payload.detail)
      || 'Something went wrong. Please try again.';
    throw new ApiError(message, {
      code: (envelope && typeof envelope === 'object' && envelope.code)
        || (payload && payload.code)
        || `HTTP_${response.status}`,
      status: response.status,
      fields: (payload && payload.fields) || null,
    });
  }

  return payload;
}

/**
 * Canonicalises an Indian mobile number to its bare 10 digits, matching the
 * server. Accepts `+91 98765 00445`, `098765 00445` and `9876500445` alike so a
 * customer who types a country code is not told their own number is invalid.
 *
 * Lives here rather than in the view so the number sent to the API and the
 * number shown back on the review screen are canonicalised by one rule.
 */
export function normalizePhone(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

/**
 * Standard amortising instalment.
 *
 * Indicative only. Used to render an estimate immediately and when the network
 * is unavailable — the figure shown once the server responds, and the figure
 * stored with the application, both come from the server's exact minor-unit
 * engine.
 */
export function calculateEmi(principal, annualRatePercent, months) {
  const p = Number(principal) || 0;
  const n = Number(months) || 0;
  const annual = Number(annualRatePercent) || 0;
  if (p <= 0 || n <= 0) return { emi: 0, totalInterest: 0, totalPayable: 0 };
  // A negative or non-finite rate has no amortising solution, and the formula
  // would silently return a total payable *below* the principal (negative
  // interest). Refuse it rather than show a figure that cannot be true.
  if (!Number.isFinite(annual) || annual < 0) return { emi: 0, totalInterest: 0, totalPayable: 0 };
  if (annual === 0) return { emi: p / n, totalInterest: 0, totalPayable: p };

  const r = annual / (12 * 100);
  const factor = Math.pow(1 + r, n);
  const emi = (p * r * factor) / (factor - 1);
  const totalPayable = emi * n;
  return { emi, totalInterest: totalPayable - p, totalPayable };
}

/**
 * Decide whether an indicative quote may be shown for the given inputs.
 *
 * A quote is only honest when both the amount and the tenure are whole,
 * in-range values for the selected product. Callers must not display an EMI
 * when this returns `ok: false` — quoting a figure for an out-of-range or
 * negative amount would misrepresent what the customer could borrow.
 *
 * @returns {{ok: boolean, reason: string}} `reason` is customer-facing and
 *   only meaningful when `ok` is false.
 */
export function evaluateQuote({ category, amount, tenureMonths }) {
  if (!category) return { ok: false, reason: 'Select a loan type to see an estimate.' };
  if (amount === '' || amount === null || amount === undefined
    || tenureMonths === '' || tenureMonths === null || tenureMonths === undefined) {
    return { ok: false, reason: 'Enter an amount and tenure to see an estimate.' };
  }

  const a = Number(amount);
  const t = Number(tenureMonths);
  if (!Number.isFinite(a) || !Number.isInteger(a) || a <= 0) {
    return { ok: false, reason: 'Enter a valid whole-rupee amount.' };
  }
  if (!Number.isFinite(t) || !Number.isInteger(t) || t <= 0) {
    return { ok: false, reason: 'Enter a whole number of months.' };
  }
  if (a < category.minAmount || a > category.maxAmount) {
    return {
      ok: false,
      reason: `${category.name} accepts ${category.minAmount} to ${category.maxAmount}.`,
    };
  }
  if (t < category.minTenureMonths || t > category.maxTenureMonths) {
    return {
      ok: false,
      reason: `${category.name} accepts ${category.minTenureMonths} to ${category.maxTenureMonths} months.`,
    };
  }
  return { ok: true, reason: '' };
}

/**
 * A fresh idempotency key for one submission attempt.
 *
 * Held in memory for the life of the attempt and replayed on retry, so a
 * double-click or a resubmission after a dropped response returns the original
 * application instead of creating a second one.
 */
export function makeIdempotencyKey() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * The live platform configuration, shared across every page.
 *
 * `brand_profile`, `platform_mode` and `compliance_note` are the three
 * dashboard settings; this is the seam that carries them to the browser so the
 * site is not hard-coded. The in-memory copy is a same-page cache so the
 * header, footer and disclaimer agree without three requests.
 */
export const FALLBACK_CONFIG = {
  brand: {
    brandName: 'Gahonsh Finance',
    brandMark: 'GF',
    tagline: 'Loans made straightforward',
    legalName: 'Gahonsh Finance',
    supportPhone: '',
    supportEmail: '',
    supportHours: '',
    currency: 'INR',
  },
  mode: 'DEMO',
  locale: 'en-IN',
  complianceNote: 'Development build. This is a demonstration environment and is not a licensed bank or public lending service.',
  features: { public_site: true, notifications: true, client_intake: true },
};

let cachedConfig = null;

export const LoanApi = {
  /**
   * Fetches the live brand, mode, compliance note and feature flags. Falls back
   * to the built-in defaults when the API is unreachable so the page still
   * renders (the fallback is a degraded path, not the happy path).
   *
   * @returns {Promise<typeof FALLBACK_CONFIG>}
   */
  async getPlatformConfig() {
    if (cachedConfig) return cachedConfig;
    try {
      const config = await request('/config');
      cachedConfig = { ...FALLBACK_CONFIG, ...config, brand: { ...FALLBACK_CONFIG.brand, ...(config && config.brand) } };
      return cachedConfig;
    } catch {
      cachedConfig = FALLBACK_CONFIG;
      return cachedConfig;
    }
  },

  /**
   * Fetches the publicly advertised loan catalogue and installs it as the
   * runtime catalogue.
   *
   * @returns {Promise<{products: Array, source: 'api'|'fallback', error?: ApiError}>}
   */
  async getLoanProducts() {
    try {
      const products = await request('/loan-products');
      if (!Array.isArray(products) || products.length === 0) {
        throw new ApiError('The loan catalogue is empty.', { code: 'EMPTY_CATALOGUE' });
      }
      const mapped = products.map((p) => ({
        id: p.id,
        name: p.name,
        blurb: productBlurb(p.id),
        minAmount: Number(p.minAmount),
        maxAmount: Number(p.maxAmount),
        minTenureMonths: Number(p.minTenureMonths),
        maxTenureMonths: Number(p.maxTenureMonths),
        annualRatePercent: Number(p.annualRatePercent),
      }));
      setLoanCategories(mapped);
      return { products: LOAN_CATEGORIES, source: 'api' };
    } catch (err) {
      // An offline visitor still gets a usable, clearly-indicative catalogue
      // rather than an empty page; the server remains the pricing authority at
      // submission time.
      const error = err instanceof ApiError ? err : new ApiError('Catalogue unavailable.');
      return { products: LOAN_CATEGORIES, source: 'fallback', error };
    }
  },

  /**
   * Server-authoritative indicative quote.
   *
   * @returns {Promise<{emi: number, totalPayable: number, totalInterest: number,
   *   annualRatePercent: number, tenureMonths: number, amount: number}>}
   * @throws {ApiError} with `fields` when the server rejects the inputs.
   */
  async quote({ productId, amount, tenureMonths }) {
    return request('/loan-quote', {
      method: 'POST',
      body: { productId, amount, tenureMonths },
    });
  },

  /**
   * Submits a completed application and creates a real, persisted loan
   * application on the backend.
   *
   * @param {object} payload Validated application data.
   * @param {string} idempotencyKey Stable key for this submission attempt.
   * @returns {Promise<{reference: string, status: string, submittedAt: string,
   *   productName: string, amount: number, tenureMonths: number}>}
   * @throws {ApiError} `code: 'VALIDATION_ERROR'` carries a `fields` map;
   *   `code: 'ACCOUNT_EXISTS'` means the email already has an account.
   */
  async submitApplication(payload, idempotencyKey) {
    return request('/applications', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: payload,
    });
  },

  /**
   * Creates a borrower account (no loan application, no KYC).
   *
   * The visitor chooses a password they know and then signs in to the customer
   * portal through the normal `/auth/login` path. The server fixes the tenant and
   * mints no session here.
   *
   * @param {object} payload `{ fullName, email, phone, password }`.
   * @returns {Promise<{email: string, fullName: string, customerId: string}>}
   * @throws {ApiError} `code: 'VALIDATION_ERROR'` carries a `fields` map;
   *   `code: 'ACCOUNT_EXISTS'` means the email already has an account.
   */
  async signup(payload) {
    return request('/signup', { method: 'POST', body: payload });
  },
};