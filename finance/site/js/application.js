/**
 * Gahonsh Finance — public multi-step loan application.
 *
 * Drives Personal Info -> Loan Details -> Review -> Submission. The catalogue,
 * every EMI figure and the final submission come from the real backend through
 * the LoanApi seam (see api.js); local validation only gates obviously-invalid
 * input before a round trip, and the server revalidates everything on submit.
 */

import {
  LOAN_CATEGORIES,
  EMPLOYMENT_STATUSES,
  LOAN_PURPOSES,
  getCategoryById,
  normalizePhone,
  calculateEmi,
  evaluateQuote,
  makeIdempotencyKey,
  LoanApi,
  ApiError,
} from './api.js';
import { initMobileNav } from './site-nav.js';

const STEPS = ['personal', 'loan', 'review', 'submission'];
const STEP_TITLES = {
  personal: 'Personal Info',
  loan: 'Loan Details',
  review: 'Review',
  submission: 'Submission',
};

/* ------------------------------------------------------------- helpers -- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Indian digit grouping, e.g. 150000 -> 1,50,000 */
function formatInr(value) {
  const n = Number(value) || 0;
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return '';
  }
}

/* --------------------------------------------------------------- state -- */

const state = {
  stepIndex: 0,
  /** Furthest step the user has legitimately reached (guards stepper jumps). */
  highestStep: 0,
  submitting: false,
  submitted: null,
  /**
   * Stable idempotency key for the current submission attempt. Generated once
   * when the user first submits and reused across retries, so a double-click or
   * a resubmission after a dropped response returns the original application
   * rather than creating a second one. Cleared only after a confirmed success.
   */
  submissionKey: null,
  /** Latest server-authoritative quote, or null while unavailable. */
  serverQuote: null,
  /** Catalogue came from the API, or from the offline fallback. */
  catalogueSource: 'fallback',
  data: {
    fullName: '',
    email: '',
    phone: '',
    categoryId: '',
    amount: '',
    tenureMonths: '',
    purpose: '',
    purposeOther: '',
    employmentStatus: '',
    employerName: '',
    monthlyIncome: '',
    consent: false,
  },
};

const category = () => getCategoryById(state.data.categoryId);

/* ---------------------------------------------------------- validation -- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[6-9]\d{9}$/;

/**
 * Field validators. Each returns an error string, or null when valid.
 * Amount and tenure limits are validated against the selected category.
 */
const validators = {
  fullName: (v) => {
    const s = String(v).trim();
    if (!s) return 'Please enter your full name.';
    if (s.length < 3) return 'Name must be at least 3 characters.';
    if (!/[A-Za-z]/.test(s)) return 'Name must contain letters.';
    return null;
  },
  email: (v) => {
    const s = String(v).trim();
    if (!s) return 'Please enter your email address.';
    if (!EMAIL_RE.test(s)) return 'Enter a valid email, e.g. name@example.com';
    return null;
  },
  phone: (v) => {
    const s = normalizePhone(v);
    if (!s) return 'Please enter your mobile number.';
    if (!PHONE_RE.test(s)) return 'Enter a valid 10-digit mobile number.';
    return null;
  },
  categoryId: (v) => (v ? null : 'Please choose a loan type.'),
  amount: (v) => {
    const n = Number(v);
    const c = category();
    if (!v) return 'Please enter the loan amount.';
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return 'Enter a whole-rupee amount.';
    if (c) {
      if (n < c.minAmount) return `Minimum for ${c.name} is ${formatInr(c.minAmount)}.`;
      if (n > c.maxAmount) return `Maximum for ${c.name} is ${formatInr(c.maxAmount)}.`;
    }
    return null;
  },
  tenureMonths: (v) => {
    const n = Number(v);
    const c = category();
    if (!v) return 'Please enter a tenure.';
    if (!Number.isInteger(n) || n <= 0) return 'Enter a whole number of months.';
    if (c) {
      if (n < c.minTenureMonths) return `Minimum tenure is ${c.minTenureMonths} months.`;
      if (n > c.maxTenureMonths) return `Maximum tenure is ${c.maxTenureMonths} months.`;
    }
    return null;
  },
  purpose: (v) => (v ? null : 'Please select a loan purpose.'),
  purposeOther: (v) => {
    if (state.data.purpose !== 'OTHER') return null;
    return String(v).trim() ? null : 'Please describe the loan purpose.';
  },
  employmentStatus: (v) => (v ? null : 'Please select your employment status.'),
  monthlyIncome: (v) => {
    // Required by the API for everyone except students and retired applicants,
    // where an absent income is accepted. Keep the two rules aligned so a field
    // the client accepts is not rejected server-side.
    if (v === '' || v === null || v === undefined) {
      return incomeOptional() ? null : 'Please enter your monthly income.';
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return 'Enter a valid monthly income.';
    return null;
  },
  consent: (v) => (v ? null : 'Please accept the declarations to continue.'),
};

/** True when monthly income may be omitted for the selected employment status. */
function incomeOptional() {
  return state.data.employmentStatus === 'STUDENT'
    || state.data.employmentStatus === 'RETIRED';
}

/** Reflects the income exemption in the field's required marker and hint. */
function syncIncomeRequirement() {
  const marker = $('#req-monthlyIncome');
  const hint = $('#hint-income');
  const optional = incomeOptional();
  if (marker) marker.hidden = optional;
  if (hint) {
    hint.textContent = optional
      ? 'Not required for your employment status, but it helps us assess your application.'
      : 'Used to assess affordability. Not required for students or retired applicants.';
  }
  const input = fieldInput('monthlyIncome');
  if (input) input.setAttribute('aria-required', optional ? 'false' : 'true');
}

/** Fields validated per step, in focus order. */
const STEP_FIELDS = {
  personal: ['fullName', 'email', 'phone'],
  loan: ['categoryId', 'amount', 'tenureMonths', 'purpose', 'purposeOther', 'employmentStatus', 'employerName', 'monthlyIncome'],
  review: ['consent'],
  submission: [],
};

/** Every field the form can surface an error on. */
const STEP_FIELDS_ALL = Object.values(STEP_FIELDS).flat();

/**
 * Server field names that differ from the form's input names. The API speaks in
 * domain terms (`productId`); the markup uses `categoryId`.
 */
const SERVER_FIELD_ALIASES = { productId: 'categoryId', purposeDetail: 'purposeOther' };

/**
 * Translates an API `fields` map into form field names, dropping anything the
 * form has no input for.
 */
function normalizeServerFields(fields) {
  const out = {};
  Object.keys(fields).forEach((name) => {
    const mapped = SERVER_FIELD_ALIASES[name] || name;
    if (STEP_FIELDS_ALL.includes(mapped)) out[mapped] = fields[name];
  });
  return out;
}

function fieldInput(name) {
  return $(`[name="${name}"]`, $('#applyForm')) || null;
}

function setFieldError(name, message) {
  const input = fieldInput(name);
  const errorEl = $(`[data-error-for="${name}"]`);
  if (input) {
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  if (errorEl) {
    if (message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    } else {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
  }
}

/** Validate one field, reflect the result in the DOM, and return validity. */
function validateField(name) {
  const input = fieldInput(name);
  const raw = input ? (input.type === 'checkbox' ? input.checked : input.value) : undefined;
  const message = validators[name] ? validators[name](raw) : null;
  setFieldError(name, message);
  return !message;
}

function validateStep(step) {
  const names = STEP_FIELDS[step] || [];
  let firstInvalid = null;
  names.forEach((name) => {
    if (!validateField(name) && !firstInvalid) firstInvalid = name;
  });
  return firstInvalid;
}

function clearErrors() {
  Object.keys(validators).forEach((name) => setFieldError(name, null));
}

/* ---------------------------------------------------------- rendering -- */

function renderStepper() {
  $$('.step').forEach((el) => {
    const idx = Number(el.dataset.stepIndex);
    const isActive = idx === state.stepIndex;
    const isDone = idx < state.stepIndex
      || (state.submitted && idx <= state.stepIndex);

    el.classList.toggle('is-active', isActive);
    el.classList.toggle('is-done', isDone && !isActive);
    el.classList.toggle('is-clickable', idx <= state.highestStep && !isActive);

    el.setAttribute('aria-current', isActive ? 'step' : 'false');
    // The accessible name is the visible label; the step number and completion
    // state live in an `sr-only` status span so the visible text is contained in
    // the accessible name (WCAG 2.5.3 "Label in Name"). Setting an `aria-label`
    // that omits the visible label is what axe flags as a mismatch.
    const status = $('.step-status', el);
    if (status) {
      status.textContent = `Step ${idx + 1} of ${STEPS.length}`
        + (isDone && !isActive ? ' (completed)' : '');
    }
    // Steps stay focusable so screen-reader users can read the whole progress
    // trail; `aria-disabled` marks the ones that cannot be jumped to yet.
    const canJump = idx <= state.highestStep && !isActive;
    el.setAttribute('aria-disabled', canJump ? 'false' : 'true');

    const marker = $('.step-marker', el);
    if (marker) marker.innerHTML = isDone && !isActive ? checkIcon() : String(idx + 1);
  });

  const fill = $('#progressFill');
  if (fill) {
    const pct = state.stepIndex === 0
      ? 1 / STEPS.length * 100
      : (state.stepIndex + 1) / STEPS.length * 100;
    fill.style.width = `${pct}%`;
  }
}

function checkIcon() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    + 'stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M20 6 9 17l-5-5"/></svg>';
}

function showStep(index, options = {}) {
  state.stepIndex = Math.max(0, Math.min(index, STEPS.length - 1));
  state.highestStep = Math.max(state.highestStep, state.stepIndex);

  STEPS.forEach((step, i) => {
    const panel = $(`#panel-${step}`);
    if (panel) panel.hidden = i !== state.stepIndex;
  });

  if (STEPS[state.stepIndex] === 'loan') {
    updateAmountBounds();
    updateEstimate();
  }
  if (STEPS[state.stepIndex] === 'review') {
    renderReview();
    updateEstimate();
  }

  renderStepper();
  updateStepCounter();
  updateActions();

  // Move focus to the panel heading so screen readers announce the change.
  // Skipped on the initial render, where stealing focus would displace the
  // skip link as the first tab stop.
  const panel = $(`#panel-${STEPS[state.stepIndex]}`);
  const heading = panel ? $('h3', panel) : null;
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    if (!options.silent) heading.focus({ preventScroll: true });
  }

  const card = $('#applyCard');
  if (card && state.stepIndex > 0 && !options.silent) {
    const top = card.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top, behavior: 'smooth' });
  }
}

function updateStepCounter() {
  const counter = $('#stepCounter');
  if (counter) {
    counter.textContent = `Step ${state.stepIndex + 1} of ${STEPS.length} · ${STEP_TITLES[STEPS[state.stepIndex]]}`;
  }
}

/** Show/hide Back, Continue and Submit according to the active step. */
function updateActions() {
  const step = STEPS[state.stepIndex];
  const isSubmission = step === 'submission';

  const backBtn = $('#backBtn');
  const nextBtn = $('#nextBtn');
  const submitBtn = $('#submitBtn');
  const actions = $('#formActions');
  const counter = $('#stepCounter');

  if (actions) actions.hidden = isSubmission;
  if (counter) counter.hidden = isSubmission;

  if (backBtn) backBtn.hidden = state.stepIndex === 0 || isSubmission;
  if (nextBtn) nextBtn.hidden = step === 'review' || isSubmission;
  if (submitBtn) submitBtn.hidden = step !== 'review';

  // Continue on the review step is replaced by Submit; the label reflects the
  // remaining work so the primary action is never ambiguous.
  if (nextBtn && !nextBtn.hidden) {
    nextBtn.textContent = step === 'personal' ? 'Continue to loan details'
      : step === 'loan' ? 'Continue to review'
      : 'Continue';
  }
}

/** Apply the selected category's min/max to amount + tenure inputs. */
function updateAmountBounds() {
  const c = category();
  const amountInput = fieldInput('amount');
  const tenureInput = fieldInput('tenureMonths');
  const amountHint = $('[data-hint-for="amount"]');
  const tenureHint = $('[data-hint-for="tenureMonths"]');
  const range = $('#amountRange');

  if (!c) {
    if (amountHint) amountHint.textContent = 'Select a loan type to see the eligible range.';
    if (tenureHint) tenureHint.textContent = 'Select a loan type to see the eligible tenure.';
    return;
  }

  if (amountInput) {
    amountInput.min = String(c.minAmount);
    amountInput.max = String(c.maxAmount);
    amountInput.step = '1000';
  }
  if (tenureInput) {
    tenureInput.min = String(c.minTenureMonths);
    tenureInput.max = String(c.maxTenureMonths);
  }
  if (range) {
    range.min = String(c.minAmount);
    range.max = String(c.maxAmount);
    range.step = '1000';
    const current = Number(state.data.amount) || c.minAmount;
    range.value = String(Math.min(Math.max(current, c.minAmount), c.maxAmount));
  }
  if (amountHint) {
    amountHint.textContent = `${c.name}: ${formatInr(c.minAmount)} – ${formatInr(c.maxAmount)} · indicative rate ${c.indicativeRate} p.a.`;
  }
  if (tenureHint) {
    tenureHint.textContent = `${c.minTenureMonths} – ${c.maxTenureMonths} months available.`;
  }
}

function updateEstimate() {
  const out = $('#estimateValue');
  const note = $('#estimateNote');
  if (!out) return;

  const c = category();
  // Only quote a figure once both inputs are valid for the selected product.
  // Showing an EMI for an out-of-range or negative amount would misrepresent
  // what the customer could actually borrow.
  const quote = evaluateQuote({
    category: c,
    amount: state.data.amount,
    tenureMonths: state.data.tenureMonths,
  });

  if (!quote.ok) {
    state.serverQuote = null;
    out.textContent = '—';
    if (note) note.textContent = quote.reason;
    return;
  }

  const months = Number(state.data.tenureMonths);
  const amount = Number(state.data.amount);

  // Render the best figure available immediately: the server's authoritative
  // quote when we already have one for these exact inputs, otherwise a local
  // indicative estimate. `requestServerQuote` replaces it shortly after.
  const priced = state.serverQuote;
  const matches = priced
    && priced.productId === c.id
    && priced.amount === amount
    && priced.tenureMonths === months;

  const rate = matches ? priced.annualRatePercent : parseFloat(c.indicativeRate);
  const { emi, totalPayable, totalInterest } = matches
    ? { emi: priced.emi, totalPayable: priced.totalPayable, totalInterest: priced.totalInterest }
    : calculateEmi(amount, rate, months);

  out.textContent = `${formatInr(Math.round(emi))} / month`;
  if (note) {
    const prefix = matches ? 'Indicative only' : 'Indicative estimate';
    note.textContent = `${prefix} at ${rate.toFixed(2)}% p.a. — ${months} instalments, total payable ${formatInr(Math.round(totalPayable))} (interest ${formatInr(Math.round(totalInterest))}). Not a sanction or offer.`;
  }
}

/** Pending debounce handle for the server-side quote request. */
let quoteTimer = null;
/** Guards against an out-of-order response overwriting a newer quote. */
let quoteSeq = 0;

/**
 * Asks the backend to price the current inputs. The server is the authority on
 * the rate, so this is what the customer ultimately sees; `updateEstimate`
 * renders an indicative figure in the meantime.
 */
function requestServerQuote() {
  if (quoteTimer) clearTimeout(quoteTimer);

  const c = category();
  if (!c || !evaluateQuote({
    category: c,
    amount: state.data.amount,
    tenureMonths: state.data.tenureMonths,
  }).ok) {
    state.serverQuote = null;
    return;
  }

  const amount = Number(state.data.amount);
  const months = Number(state.data.tenureMonths);
  const seq = (quoteSeq += 1);

  quoteTimer = setTimeout(async () => {
    try {
      const result = await LoanApi.quote({
        productId: c.id,
        amount,
        tenureMonths: months,
      });
      // A slower earlier request must not clobber a newer quote.
      if (seq !== quoteSeq) return;
      state.serverQuote = result;
      updateEstimate();
    } catch {
      // The local indicative figure stays on screen; the server reprices on
      // submit, so a failed quote request is not worth interrupting the user.
      if (seq !== quoteSeq) return;
      state.serverQuote = null;
    }
  }, 350);
}

function renderReview() {
  const d = state.data;
  const c = category();
  const purposeLabel = LOAN_PURPOSES.find((p) => p.value === d.purpose);
  const employmentLabel = EMPLOYMENT_STATUSES.find((e) => e.value === d.employmentStatus);

  const rows = (pairs) => pairs
    .map(([k, v]) => `<div class="review-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v || '—')}</dd></div>`)
    .join('');

  const personal = $('#reviewPersonal');
  if (personal) {
    // The input renders a static +91 prefix, so the value may already carry a
    // country code the customer typed. Normalise before re-adding the prefix to
    // avoid showing "+91 +91 ...".
    const phone = normalizePhone(d.phone);
    personal.innerHTML = rows([
      ['Full name', d.fullName],
      ['Email', d.email],
      ['Mobile', phone ? `+91 ${phone}` : ''],
    ]);
  }

  const loan = $('#reviewLoan');
  if (loan) {
    loan.innerHTML = rows([
      ['Loan type', c ? c.name : ''],
      ['Amount requested', d.amount ? formatInr(Number(d.amount)) : ''],
      ['Tenure', d.tenureMonths ? `${d.tenureMonths} months` : ''],
      ['Purpose', purposeLabel
        ? (d.purpose === 'OTHER' && d.purposeOther ? `${purposeLabel.label}: ${d.purposeOther}` : purposeLabel.label)
        : ''],
      ['Employment', employmentLabel ? employmentLabel.label : ''],
      ['Employer / business', d.employerName],
      ['Monthly income', d.monthlyIncome ? formatInr(Number(d.monthlyIncome)) : 'Not provided'],
      ['Estimated instalment', estimatedEmiLabel()],
    ]);
  }
}

/** Indicative instalment for the review screen, preferring the server quote. */
function estimatedEmiLabel() {
  const c = category();
  if (!c) return '';
  if (!evaluateQuote({
    category: c,
    amount: state.data.amount,
    tenureMonths: state.data.tenureMonths,
  }).ok) {
    return '';
  }

  const amount = Number(state.data.amount);
  const months = Number(state.data.tenureMonths);
  const priced = state.serverQuote;
  const matches = priced
    && priced.productId === c.id
    && priced.amount === amount
    && priced.tenureMonths === months;

  const emi = matches
    ? priced.emi
    : calculateEmi(amount, parseFloat(c.indicativeRate), months).emi;

  return `${formatInr(Math.round(emi))} / month (indicative)`;
}

/* ------------------------------------------------------- step actions -- */

function next() {
  const step = STEPS[state.stepIndex];
  const firstInvalid = validateStep(step);

  if (firstInvalid) {
    const input = fieldInput(firstInvalid);
    if (input) input.focus();
    announceError('Please correct the highlighted fields before continuing.');
    return;
  }

  clearAlert('formAlert');
  if (state.stepIndex < STEPS.length - 1) showStep(state.stepIndex + 1);
}

function back() {
  clearAlert('formAlert');
  if (state.stepIndex > 0) showStep(state.stepIndex - 1);
}

/* ---------------------------------------------------------------- submit -- */

async function handleSubmit(event) {
  event.preventDefault();
  if (state.submitting) return;

  // Enter in a text field triggers implicit submission. On the earlier steps
  // that should advance the wizard, not attempt a final submission.
  if (STEPS[state.stepIndex] !== 'review') {
    if (state.stepIndex < STEPS.length - 1) next();
    return;
  }

  // Re-validate every step before the irreversible action.
  for (const step of ['personal', 'loan', 'review']) {
    const bad = validateStep(step);
    if (bad) {
      showStep(STEPS.indexOf(step));
      const input = fieldInput(bad);
      if (input) input.focus();
      announceError('Some details still need attention. Please review the highlighted fields.');
      return;
    }
  }

  const submitBtn = $('#submitBtn');
  state.submitting = true;
  setSubmitting(true);
  clearAlert('formAlert');

  try {
    // One stable key per attempt: generated before the first send and reused on
    // retry, so a double-click or a resubmission after a lost response returns
    // the original application instead of creating a duplicate.
    if (!state.submissionKey) state.submissionKey = makeIdempotencyKey();

    const payload = {
      fullName: state.data.fullName.trim(),
      email: state.data.email.trim(),
      phone: normalizePhone(state.data.phone),
      productId: state.data.categoryId,
      amount: Number(state.data.amount),
      tenureMonths: Number(state.data.tenureMonths),
      purpose: state.data.purpose,
      purposeDetail: state.data.purpose === 'OTHER' ? state.data.purposeOther.trim() : '',
      employmentStatus: state.data.employmentStatus,
      employerName: state.data.employerName.trim(),
      monthlyIncome: state.data.monthlyIncome === '' ? null : Number(state.data.monthlyIncome),
      consent: state.data.consent,
    };

    const result = await LoanApi.submitApplication(payload, state.submissionKey);
    state.submitted = result;
    // The attempt is finished; a later application form should get a new key.
    state.submissionKey = null;
    renderSuccess(result);
    showStep(3);
  } catch (err) {
    // The server is the authority on validation. When it returns per-field
    // errors, map them onto the matching inputs and send the user back to the
    // step that owns the problem rather than showing a generic failure.
    if (err instanceof ApiError && err.fields && Object.keys(err.fields).length > 0) {
      applyServerFieldErrors(err.fields);
      // The idempotency key is kept: the request may have been rejected before
      // any row was written, and reusing the key keeps a retry safe either way.
    } else if (err instanceof ApiError && err.code === 'ACCOUNT_EXISTS') {
      setFieldError('email', err.message);
      showStep(0);
      const input = fieldInput('email');
      if (input) input.focus();
      announceError(err.message);
    } else {
      announceError(
        err instanceof ApiError
          ? err.message
          : 'We could not submit your application right now. Please try again in a moment.',
      );
    }

    const alert = $('#formAlert');
    if (alert && !alert.hidden) alert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } finally {
    state.submitting = false;
    setSubmitting(false);
  }
}

/**
 * Maps the API's per-field validation messages onto the form, jumps to the
 * earliest affected step, and focuses the first offending input.
 */
function applyServerFieldErrors(fields) {
  const known = normalizeServerFields(fields);
  const names = Object.keys(known);
  if (names.length === 0) {
    announceError('Some details could not be processed. Please review your entries and try again.');
    return;
  }

  clearErrors();
  names.forEach((name) => setFieldError(name, known[name]));

  // Jump to the earliest step that contains an error.
  const stepsInOrder = ['personal', 'loan', 'review'];
  const target = stepsInOrder.find((step) => (STEP_FIELDS[step] || []).some((f) => names.includes(f)));
  if (target) showStep(STEPS.indexOf(target));

  const first = fieldInput(names[0]);
  if (first) first.focus();
  announceError('Some details were not accepted. Please review the highlighted fields.');
}

function setSubmitting(isSubmitting) {
  const btn = $('#submitBtn');
  if (!btn) return;
  btn.disabled = isSubmitting;
  btn.setAttribute('aria-busy', isSubmitting ? 'true' : 'false');
  btn.innerHTML = isSubmitting
    ? '<span class="spinner" aria-hidden="true"></span> Submitting…'
    : 'Submit application';
}

function renderSuccess(result) {
  const ref = $('#refValue');
  if (ref) ref.textContent = result.reference;
  const when = $('#successWhen');
  if (when) when.textContent = formatDate(result.submittedAt);
  const name = $('#successName');
  if (name) name.textContent = state.data.fullName.trim() || 'there';
  const summary = $('#successSummary');
  const c = category();
  if (summary) {
    summary.textContent = `${formatInr(Number(state.data.amount))} · ${c ? c.name : 'Loan'} · ${state.data.tenureMonths} months`;
  }
}

/* --------------------------------------------------------------- alerts -- */

function announceError(message) {
  const alert = $('#formAlert');
  if (!alert) return;
  $('#formAlertText').textContent = message;
  alert.hidden = false;
}

function clearAlert(id) {
  const alert = document.getElementById(id);
  if (alert) alert.hidden = true;
}

/* ------------------------------------------------------------ bootstrap -- */

function populateStaticOptions() {
  const purposeSelect = fieldInput('purpose');
  if (purposeSelect) {
    purposeSelect.innerHTML = '<option value="">Select a purpose…</option>'
      + LOAN_PURPOSES.map((p) => `<option value="${p.value}">${escapeHtml(p.label)}</option>`).join('');
  }

  const employmentGroup = $('#employmentChips');
  if (employmentGroup) {
    employmentGroup.innerHTML = EMPLOYMENT_STATUSES.map((e) => `
      <button type="button" class="chip" role="radio" aria-checked="false"
              data-employment="${e.value}">${escapeHtml(e.label)}</button>`).join('');
  }

  const categorySelect = fieldInput('categoryId');
  if (categorySelect) {
    categorySelect.innerHTML = '<option value="">Select a loan type…</option>'
      + LOAN_CATEGORIES.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} — from ${escapeHtml(c.indicativeRate)} p.a.</option>`).join('');
  }
}

function renderCategoryCards() {
  const grid = $('#categoryGrid');
  if (!grid) return;
  grid.innerHTML = LOAN_CATEGORIES.map((c) => `
    <button type="button" class="cat-card" data-category="${c.id}">
      <span class="cat-icon" aria-hidden="true">${categoryIcon(c.id)}</span>
      <h3><span class="sr-only">Apply for a </span>${escapeHtml(c.name)}</h3>
      <p>${escapeHtml(c.blurb)}</p>
      <span class="cat-meta">
        <span class="cat-rate">${escapeHtml(c.indicativeRate)} p.a.</span>
        <span class="cat-range">${escapeHtml(c.rangeLabel)}</span>
      </span>
    </button>`).join('');
}

function categoryIcon(id) {
  // Product ids are server-owned (`prod_pub_personal`), so match on the trailing
  // keyword rather than the full id, falling back to the personal-loan glyph.
  // Glyphs come from the shared sprite so the site and the portals share one set.
  const symbols = {
    personal: 'gf-user',
    business: 'gf-briefcase',
    agri: 'gf-leaf',
    education: 'gf-graduation-cap',
    vehicle: 'gf-car',
    gold: 'gf-wallet',
  };
  const key = Object.keys(symbols).find((k) => String(id).toLowerCase().includes(k)) || 'personal';
  return `<svg width="22" height="22" aria-hidden="true"><use href="/finance/shared/icons.svg#${symbols[key]}"></use></svg>`;
}

function selectCategory(id) {
  const select = fieldInput('categoryId');
  if (select) select.value = id;
  state.data.categoryId = id;

  const c = getCategoryById(id);
  if (c) {
    const amount = fieldInput('amount');
    const tenure = fieldInput('tenureMonths');
    // Prefill only when the user has not already entered a valid value.
    if (amount && (!amount.value || Number(amount.value) < c.minAmount || Number(amount.value) > c.maxAmount)) {
      amount.value = String(Math.min(Math.max(Number(amount.value) || c.minAmount, c.minAmount), c.maxAmount));
      state.data.amount = amount.value;
    }
    if (tenure && (!tenure.value || Number(tenure.value) < c.minTenureMonths || Number(tenure.value) > c.maxTenureMonths)) {
      const suggested = Math.min(Math.max(Number(tenure.value) || c.minTenureMonths, c.minTenureMonths), c.maxTenureMonths);
      tenure.value = String(suggested);
      state.data.tenureMonths = String(suggested);
    }
  }

  // Jump straight into the application, pre-selecting the chosen product.
  state.highestStep = Math.max(state.highestStep, 1);
  showStep(1);
  validateField('categoryId');
  updateAmountBounds();
  state.serverQuote = null;
  updateEstimate();
  requestServerQuote();

  const card = $('#applyCard');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function wireEvents() {
  const form = $('#applyForm');
  if (!form) return;

  // Keep state in sync and clear errors as the user corrects them.
  form.addEventListener('input', (e) => {
    const el = e.target;
    const name = el.name;
    if (!name || !(name in state.data)) return;
    state.data[name] = el.type === 'checkbox' ? el.checked : el.value;
    if (el.getAttribute('aria-invalid') === 'true') validateField(name);
    if (name === 'amount' || name === 'tenureMonths') {
      updateEstimate();
      requestServerQuote();
    }
    // Whether income is required depends on employment status, so re-check it
    // as soon as the user supplies a value.
    if (name === 'monthlyIncome' && String(el.value).trim() !== '') validateField('monthlyIncome');
  });

  form.addEventListener('change', (e) => {
    const el = e.target;
    const name = el.name;
    if (name === 'purpose') {
      state.data.purpose = el.value;
      const otherWrap = $('#purposeOtherWrap');
      if (otherWrap) otherWrap.hidden = el.value !== 'OTHER';
      validateField('purpose');
    }
    if (name === 'categoryId') {
      state.data.categoryId = el.value;
      state.serverQuote = null;
      updateAmountBounds();
      updateEstimate();
      requestServerQuote();
    }
  });

  form.addEventListener('submit', handleSubmit);

  $('#nextBtn')?.addEventListener('click', next);
  $('#backBtn')?.addEventListener('click', back);
  $('#editPersonalBtn')?.addEventListener('click', () => showStep(0));
  $('#editLoanBtn')?.addEventListener('click', () => showStep(1));
  $('#startOverBtn')?.addEventListener('click', () => window.location.reload());

  // Stepper jumps to already-visited steps.
  $$('.step').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = Number(el.dataset.stepIndex);
      if (idx <= state.highestStep && idx !== state.stepIndex && !state.submitted) showStep(idx);
    });
  });

  // Employment chips behave as a radio group.
  const group = $('#employmentChips');
  if (group) {
    group.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-employment]');
      if (!chip) return;
      const value = chip.dataset.employment;
      state.data.employmentStatus = value;
      $$('[data-employment]', group).forEach((c) => {
        const on = c === chip;
        c.setAttribute('aria-checked', on ? 'true' : 'false');
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const hidden = fieldInput('employmentStatus');
      if (hidden) hidden.value = value;
      setFieldError('employmentStatus', null);
      // Students and retired applicants may omit income, so both the required
      // marker and the validation rule change with employment status.
      syncIncomeRequirement();
      validateField('monthlyIncome');
    });

    group.addEventListener('keydown', (e) => {
      const chips = $$('[data-employment]', group);
      const i = chips.indexOf(document.activeElement);
      if (i === -1) return;
      let nextIdx = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIdx = (i + 1) % chips.length;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIdx = (i - 1 + chips.length) % chips.length;
      if (nextIdx === null) return;
      e.preventDefault();
      chips[nextIdx].focus();
    });
  }

  // Amount slider mirrors the numeric input.
  const range = $('#amountRange');
  const amountInput = fieldInput('amount');
  if (range && amountInput) {
    range.addEventListener('input', () => {
      amountInput.value = range.value;
      state.data.amount = range.value;
      updateEstimate();
      if (amountInput.getAttribute('aria-invalid') === 'true') validateField('amount');
    });
    amountInput.addEventListener('input', () => {
      const c = category();
      if (c) {
        const clamped = Math.min(Math.max(Number(amountInput.value) || c.minAmount, c.minAmount), c.maxAmount);
        range.value = String(clamped);
      }
    });
  }

  // Category cards on the landing page.
  const grid = $('#categoryGrid');
  if (grid) {
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('[data-category]');
      if (card) selectCategory(card.dataset.category);
    });
  }

  // Mobile nav (shared with the content pages; the module is idempotent).
  initMobileNav();

  // FAQ accordion
  $$('.faq-q').forEach((btn) => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      const answer = document.getElementById(btn.getAttribute('aria-controls'));
      if (answer) answer.hidden = expanded;
    });
  });
}

function init() {
  populateStaticOptions();
  renderCategoryCards();
  wireEvents();
  syncIncomeRequirement();
  showStep(0, { silent: true });

  // The catalogue comes from the backend, which owns product names, amount
  // bounds, tenor ranges and rates. The static fallback already rendered, so
  // this only refreshes it once the real data arrives.
  LoanApi.getLoanProducts().then(({ source, error }) => {
    state.catalogueSource = source;
    if (source !== 'api') {
      setCatalogueNotice(error);
      return;
    }
    // Re-render against the authoritative catalogue, preserving any selection.
    populateStaticOptions();
    renderCategoryCards();
    if (state.data.categoryId) {
      const select = fieldInput('categoryId');
      if (select) select.value = state.data.categoryId;
      // A product that is no longer offered would leave a stale selection.
      if (!getCategoryById(state.data.categoryId)) {
        state.data.categoryId = '';
        if (select) select.value = '';
        state.serverQuote = null;
      } else {
        updateAmountBounds();
        updateEstimate();
      }
    }
  });
}

/**
 * Tells the visitor when the catalogue could not be loaded from the server, so
 * the indicative figures on screen are not mistaken for live offers.
 */
function setCatalogueNotice(error) {
  const alert = $('#formAlert');
  const text = $('#formAlertText');
  if (!alert || !text || !error) return;
  text.textContent = 'We could not load the latest rates, so the figures shown are indicative. Your application will still be priced on submission.';
  alert.hidden = false;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
