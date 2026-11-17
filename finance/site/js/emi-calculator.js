/**
 * Standalone EMI calculator for the public content pages.
 *
 * The landing page runs its calculator inside the application wizard; this is
 * the same maths, extracted so a visitor can size a loan without starting an
 * application. It imports the shared helpers so the figure here and the figure
 * in the wizard come from one implementation.
 */
import {
  LoanApi,
  LOAN_CATEGORIES,
  getCategoryById,
  calculateEmi,
  evaluateQuote,
} from './api.js';

const el = (id) => document.getElementById(id);

const productSelect = el('calcProduct');
const amountInput = el('calcAmount');
const amountRange = el('calcAmountRange');
const tenureInput = el('calcTenure');
const tenureRange = el('calcTenureRange');
const rateInput = el('calcRate');
const errorEl = el('calcError');
const outEmi = el('calcEmi');
const outPrincipal = el('calcPrincipal');
const outInterest = el('calcInterest');
const outTotal = el('calcTotal');

if (productSelect && amountInput) {
  const money = new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  });

  const syncLimits = () => {
    const c = getCategoryById(productSelect.value);
    if (!c) return;
    for (const [input, range, min, max, step] of [
      [amountInput, amountRange, c.minAmount, c.maxAmount, 1000],
      [tenureInput, tenureRange, c.minTenureMonths, c.maxTenureMonths, 1],
    ]) {
      input.min = min;
      input.max = max;
      range.min = min;
      range.max = max;
      range.step = step;
    }
    rateInput.value = Number(c.annualRatePercent).toFixed(2);
    clampAndRender();
  };

  const clampAndRender = () => {
    const c = getCategoryById(productSelect.value);
    if (!c) return;

    let amount = Number(amountInput.value);
    let tenure = Number(tenureInput.value);
    if (!Number.isFinite(amount)) amount = c.minAmount;
    if (!Number.isFinite(tenure)) tenure = c.minTenureMonths;
    amount = Math.min(Math.max(Math.round(amount), c.minAmount), c.maxAmount);
    tenure = Math.min(Math.max(Math.round(tenure), c.minTenureMonths), c.maxTenureMonths);

    amountInput.value = amount;
    amountRange.value = amount;
    tenureInput.value = tenure;
    tenureRange.value = tenure;

    const rate = Number(rateInput.value) || 0;
    const verdict = evaluateQuote({ category: c, amount, tenureMonths: tenure });
    if (!verdict.ok) {
      errorEl.textContent = verdict.reason;
      outEmi.textContent = '—';
      outPrincipal.textContent = '—';
      outInterest.textContent = '—';
      outTotal.textContent = '—';
      return;
    }
    // The rate box is free-entry, so it can hold a value no lender could offer.
    // A negative rate would make the "total payable" fall below the principal,
    // which reads as a discount rather than a loan. Validate against the box's
    // own declared bounds so the constraint and the behaviour cannot drift.
    const rateMin = Number(rateInput.min) || 0;
    const rateMax = Number(rateInput.max) || 100;
    if (!Number.isFinite(rate) || rate < rateMin || rate > rateMax) {
      errorEl.textContent = `Enter an interest rate between ${rateMin}% and ${rateMax}%.`;
      outEmi.textContent = '—';
      outPrincipal.textContent = '—';
      outInterest.textContent = '—';
      outTotal.textContent = '—';
      return;
    }

    errorEl.textContent = '';
    const { emi, totalInterest, totalPayable } = calculateEmi(amount, rate, tenure);
    outEmi.textContent = money.format(Math.round(emi));
    outPrincipal.textContent = money.format(amount);
    outInterest.textContent = money.format(Math.round(totalInterest));
    outTotal.textContent = money.format(Math.round(totalPayable));
  };

  // Two-way binding: dragging the slider writes the number box and vice versa.
  amountRange.addEventListener('input', () => { amountInput.value = amountRange.value; clampAndRender(); });
  amountInput.addEventListener('input', () => { amountRange.value = amountInput.value; clampAndRender(); });
  tenureRange.addEventListener('input', () => { tenureInput.value = tenureRange.value; clampAndRender(); });
  tenureInput.addEventListener('input', () => { tenureRange.value = tenureInput.value; clampAndRender(); });
  rateInput.addEventListener('input', clampAndRender);
  productSelect.addEventListener('change', syncLimits);

  const render = () => {
    productSelect.innerHTML = LOAN_CATEGORIES
      .map((c) => `<option value="${c.id}">${c.name}</option>`)
      .join('');
    syncLimits();
  };

  render();

  // Replace the fallback catalogue with the live one once it loads, then
  // re-render so the limits and default rate match the server.
  LoanApi.getLoanProducts().then(({ source }) => {
    if (source === 'api') render();
  });
}
