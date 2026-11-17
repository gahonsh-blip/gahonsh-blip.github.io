import {
  CompletionApi,
  rememberSecret,
  readSecret,
  forgetSecret,
  rememberToken,
  readToken as readStoredToken,
  forgetToken,
  rememberSetupToken,
  readSetupToken,
  forgetSetupToken,
} from '/finance/site/js/client-completion-api.js';

const el = (id) => document.getElementById(id);
let token = '';
let state = null;
let selfieDataUrl = '';
let mediaStream = null;
let secretAttempted = false;
let accountSetupToken = '';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'application/pdf'];

/** Reads the token from the URL fragment (never sent to the server). */
function readToken() {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  return params.get('token') || '';
}

/**
 * Drops the token from the address bar once it has been captured, so it is not
 * left in the browser's history or an accidental copy of the URL.
 */
function stripFragment() {
  if (!window.location.hash) return;
  try {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch {
    /* history may be unavailable; the fragment simply stays */
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showView(name) {
  for (const id of ['viewLoading', 'viewError', 'viewSecret', 'viewMain', 'viewSubmitted']) {
    el(id).hidden = id !== `view${name}`;
  }
}

function showError(title, message, ref) {
  el('errorTitle').textContent = title;
  el('errorMessage').textContent = message;
  el('errorRef').textContent = ref || '';
  showView('Error');
}

async function boot() {
  // Prefer a token from the fragment (a fresh open); fall back to the one
  // remembered for this tab so a reload does not dead-end the customer.
  token = readToken() || readStoredToken();
  if (!token) {
    showError(
      'This page needs a valid link',
      'Open the secure link that Gahonsh Finance sent you, or ask us for a new one.'
    );
    return;
  }
  // The fragment has served its purpose; keep it out of the address bar and
  // history. Persist the token for the tab so a reload resumes the session.
  rememberToken(token);
  stripFragment();
  accountSetupToken = readSetupToken();
  await loadState();
}

async function loadState() {
  showView('Loading');
  try {
    state = await CompletionApi.openSession(token);
    secretAttempted = false;
    render();
  } catch (err) {
    if (err.status === 401) {
      el('secretInput').value = readSecret();
      el('secretError').hidden = !secretAttempted;
      if (secretAttempted) el('secretError').textContent = 'That code was not recognised. Please check it and try again.';
      showView('Secret');
      return;
    }
    if (err.status === 410) {
      // The link is gone; stop retrying it on the next reload.
      forgetToken();
      showError('This link is no longer active', err.message);
      return;
    }
    if (err.status === 404) {
      forgetToken();
      showError('This link is not valid', 'The link may be incomplete or already replaced. Please ask Gahonsh Finance for a new one.');
      return;
    }
    showError('Something went wrong', err.message || 'Please try again in a moment.');
  }
}

function fieldTag(field) {
  if (field.state === 'LOCKED') return '<span class="cc-tag cc-tag-locked">Provided by Gahonsh</span>';
  if (field.state === 'COMPLETE') return '<span class="cc-tag cc-tag-done">Saved</span>';
  if (field.state === 'INVALID') return '<span class="cc-tag cc-tag-invalid">Needs correction</span>';
  return '<span class="cc-tag cc-tag-pending">Action required</span>';
}

function renderField(field) {
  const required = field.required ? '<span class="req" aria-hidden="true">*</span>' : '';
  if (!field.editable) {
    return `<div class="cc-field">
      <label>${escapeHtml(field.label)} ${required} ${fieldTag(field)}</label>
      <div class="cc-locked">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        <span>${escapeHtml(field.value || 'Not provided')}</span>
      </div>
    </div>`;
  }

  const id = `field-${field.key}`;
  const invalid = field.invalid ? ' aria-invalid="true"' : '';
  let control;
  if (field.inputType === 'select') {
    control = `<select class="select" id="${id}"${invalid}>
      <option value="">Select…</option>
      ${(field.options || []).map((o) => `<option value="${o}"${field.value === o ? ' selected' : ''}>${o}</option>`).join('')}
    </select>`;
  } else if (field.inputType === 'textarea') {
    control = `<textarea class="textarea" id="${id}"${field.maxLength ? ` maxlength="${field.maxLength}"` : ''}${invalid}>${escapeHtml(field.value || '')}</textarea>`;
  } else {
    const type = field.inputType === 'number' ? 'number' : field.inputType === 'tel' ? 'tel' : 'text';
    const step = field.inputType === 'number' ? ' step="0.01" min="0"' : '';
    control = `<input class="input" id="${id}" type="${type}"${step}${field.maxLength ? ` maxlength="${field.maxLength}"` : ''} value="${escapeHtml(field.value || '')}"${invalid}>`;
  }
  const error = field.error ? `<div class="field-error" role="alert">${escapeHtml(field.error)}</div>` : '';
  const hint = field.help ? `<div class="hint">${escapeHtml(field.help)}</div>` : '';
  return `<div class="cc-field">
    <label for="${id}">${escapeHtml(field.label)} ${required} ${fieldTag(field)}</label>
    ${control}${hint}${error}
  </div>`;
}

function render() {
  el('clientName').textContent = state.customerName || 'there';
  el('refLabel').textContent = `Reference ${state.reference}`;
  el('expiryLabel').textContent = `Link valid until ${new Date(state.expiresAt).toLocaleString('en-IN')}`;

  if (state.completionStatus === 'SUBMITTED') {
    renderSubmitted();
    showView('Submitted');
    return;
  }

  el('sections').innerHTML = state.sections.map((section) => `
    <h3 style="font-size:0.95rem;text-transform:uppercase;letter-spacing:.05em;color:var(--c-muted);margin:18px 0 10px;">
      ${escapeHtml(section.label)}
    </h3>
    ${section.fields.map(renderField).join('')}
  `).join('');

  renderKyc();
  renderMobile();
  renderDocuments();
  renderReview();
  renderChecklist();

  const percent = state.progress ? state.progress.percent : 0;
  el('progressFill').style.width = `${percent}%`;
  el('progressLabel').textContent = `${percent}% complete`;

  showView('Main');
}

/**
 * The post-submission screen. Distinguishes "awaiting review" from a decision,
 * and offers the one-time password setup when the server says it is available.
 */
function renderSubmitted() {
  el('submittedRef').textContent = `Reference ${state.reference}`;
  el('submittedAt').textContent = state.completedAt ? `Submitted ${new Date(state.completedAt).toLocaleString('en-IN')}` : '';

  const review = state.review || { status: 'SUBMITTED' };
  const box = el('reviewStatusBox');
  box.hidden = false;
  if (review.status === 'APPROVED') {
    el('submittedIcon').textContent = '🎉';
    el('submittedTitle').textContent = 'Your file has been approved';
    el('submittedMessage').textContent = 'Gahonsh Finance has reviewed and approved your submission.';
    box.className = 'alert alert--success';
    box.innerHTML = '<p>Review complete: approved.</p>';
  } else if (review.status === 'REJECTED') {
    el('submittedIcon').textContent = '⚠️';
    el('submittedTitle').textContent = 'Your file needs attention';
    el('submittedMessage').textContent = 'Gahonsh Finance has reviewed your submission and could not approve it.';
    box.className = 'alert alert--error';
    box.innerHTML = `<p>Review outcome: not approved.</p>${review.note ? `<p>${escapeHtml(review.note)}</p>` : ''}`;
  } else {
    el('submittedIcon').textContent = '✅';
    el('submittedTitle').textContent = 'Thank you — your file is submitted';
    el('submittedMessage').textContent =
      'Gahonsh Finance has received your information, KYC and documents. A member of our team will review your file and contact you if anything further is needed.';
    box.className = 'alert alert--info';
    box.innerHTML = '<p>Your file is awaiting review by Gahonsh Finance.</p>';
  }

  // The password setup is offered only when the server issued a usable token
  // and the account is not already configured.
  const account = state.account || {};
  el('accountSetup').hidden = !account.setupAvailable || !accountSetupToken;
  if (!el('accountSetup').hidden) {
    el('accountEmail').value = account.email || '';
  }
  // An account that is already set up cannot use the setup form again, so point
  // the customer at the real sign-in page instead of leaving a dead card.
  el('accountSignin').hidden = !account.configured;
}

function renderKyc() {
  const verified = state.kyc && state.kyc.verified;
  el('kycDone').hidden = !verified;
  el('kycForm').hidden = verified;
  if (verified) {
    el('kycDoneDetail').textContent = state.kyc.maskedId
      ? `Verified against ${state.kyc.maskedId}${state.kyc.score ? ` (match ${state.kyc.score}%)` : ''}.`
      : 'Your identity has been verified.';
  }

  // PAN is a separate provider check, so it has its own state. It is offered
  // alongside Aadhaar rather than replacing it.
  const pan = state.pan || { verified: false };
  el('panDone').hidden = !pan.verified;
  el('panForm').hidden = Boolean(pan.verified);
  if (pan.verified) {
    el('panDoneDetail').textContent = pan.maskedId
      ? `Verified against ${pan.maskedId}.`
      : 'Your PAN has been verified.';
  } else if (state.customerName && !el('panName').value) {
    // The name is already on file, so offer it instead of asking again.
    el('panName').value = state.customerName;
  }
}

function renderMobile() {
  const mobile = state.mobile || { verified: false };
  el('otpDone').hidden = !mobile.verified;
  el('otpForm').hidden = Boolean(mobile.verified);
  if (mobile.verified) {
    el('otpDoneDetail').textContent = mobile.maskedPhone
      ? `Verified ${mobile.maskedPhone}.`
      : 'Your mobile number has been verified.';
    return;
  }
  // The number is already on file, so show it instead of asking the customer
  // to retype it. When Gahonsh locked that number, the customer must verify
  // exactly it, so the field is read-only; otherwise it stays correctable.
  const phoneField = state.sections
    .flatMap((s) => s.fields)
    .find((f) => f.key === 'phone');
  const phoneInput = el('otpPhone');
  if (phoneInput && !phoneInput.value && mobile.phone) {
    phoneInput.value = mobile.phone;
    if (phoneField && phoneField.state === 'LOCKED') {
      phoneInput.readOnly = true;
      el('otpPhoneHint').textContent = 'This number is on your file and cannot be changed here.';
    } else {
      el('otpPhoneHint').textContent = 'This is the number on your file. Change it only if it is out of date.';
    }
  }
}

function renderDocuments() {
  el('documentList').innerHTML = state.requiredDocuments.map((req) => {
    const uploaded = state.documents.find((d) => d.documentType === req.type);
    return `<div class="cc-doc" data-type="${escapeHtml(req.type)}">
      <div class="cc-doc-head">
        <div>
          <div class="cc-doc-title">${escapeHtml(req.label)} ${uploaded ? '<span class="cc-tag cc-tag-done">Uploaded</span>' : '<span class="cc-tag cc-tag-pending">Action required</span>'}</div>
          <div class="hint">${escapeHtml(req.help)}</div>
        </div>
        ${uploaded ? `<button class="btn btn-outline btn-sm" type="button" data-download="${escapeHtml(uploaded.id)}">View</button>` : ''}
      </div>
      ${uploaded ? `<div class="cc-ref">${escapeHtml(uploaded.fileName)} · ${Math.round(uploaded.fileSize / 1024)} KB</div>` : ''}
      <div class="cc-upload-row" style="margin-top:10px;">
        <input type="file" accept="image/jpeg,image/png,application/pdf" aria-label="Choose a file for ${escapeHtml(req.label)}">
        <button class="btn btn-outline btn-sm" type="button" data-upload="${escapeHtml(req.type)}">${uploaded ? 'Replace' : 'Upload'}</button>
      </div>
      <div class="cc-up-track" hidden><div class="cc-up-fill"></div></div>
      <div class="field-error" hidden role="alert"></div>
    </div>`;
  }).join('');
}

function reviewRow(label, value) {
  const row = document.createElement('div');
  row.className = 'review-row';
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  row.append(dt, dd);
  return row;
}

function renderReview() {
  const kyc = state.kyc || {};
  const pan = state.pan || {};
  const mobile = state.mobile || {};
  const body = el('reviewBody');
  body.textContent = '';

  const dl = document.createElement('dl');
  state.sections.flatMap((s) => s.fields).forEach((f) => {
    dl.append(reviewRow(f.label, f.value || 'Not provided'));
  });
  body.append(dl);

  const heading = document.createElement('h3');
  heading.style.cssText = 'font-size:0.95rem;margin:16px 0 8px;color:var(--c-muted);text-transform:uppercase;letter-spacing:.05em;';
  heading.textContent = 'Checks';
  body.append(heading);

  const kycDl = document.createElement('dl');
  kycDl.append(reviewRow('Identity (Aadhaar)', kyc.verified ? `Verified${kyc.maskedId ? ` · ${kyc.maskedId}` : ''}` : 'Not verified'));
  kycDl.append(reviewRow('PAN', pan.verified ? `Verified${pan.maskedId ? ` · ${pan.maskedId}` : ''}` : 'Not verified'));
  kycDl.append(reviewRow('Mobile', mobile.verified ? `Verified${mobile.maskedPhone ? ` · ${mobile.maskedPhone}` : ''}` : 'Not verified'));
  kycDl.append(reviewRow('Documents', `${state.documents.length} uploaded`));
  body.append(kycDl);
}

function renderChecklist() {
  const p = state.progress;
  const items = [
    { ok: p.pendingFields === 0, label: `Information complete (${p.completedFields}/${p.totalFields} fields)` },
    { ok: p.kycVerified, label: 'Identity verification (Aadhaar + selfie)' },
    { ok: Boolean(state.pan && state.pan.verified), label: 'PAN verification' },
    { ok: Boolean(p.mobileVerified), label: 'Mobile number verification' },
    { ok: p.documentsProvided === p.documentsRequired, label: `Documents uploaded (${p.documentsProvided}/${p.documentsRequired})` },
  ];
  el('checklist').innerHTML = items.map((i) =>
    `<li><span class="${i.ok ? 'cc-ok' : 'cc-no'}">${i.ok ? '✓' : '•'}</span><span>${escapeHtml(i.label)}</span></li>`
  ).join('');
  el('submitBtn').disabled = !state.canSubmit;
  el('submitBtn').textContent = state.canSubmit ? 'Submit my file' : 'Complete all items to submit';
}

function collectFields() {
  const fields = {};
  for (const section of state.sections) {
    for (const field of section.fields) {
      if (!field.editable) continue;
      const input = el(`field-${field.key}`);
      if (input) fields[field.key] = input.value;
    }
  }
  return fields;
}

el('saveFieldsBtn').addEventListener('click', async () => {
  el('saveStatus').hidden = false;
  el('saveFieldsBtn').disabled = true;
  try {
    state = await CompletionApi.saveFields(token, collectFields());
    render();
    showBanner('success', 'Your information has been saved.');
  } catch (err) {
    if (err.fields) {
      // Re-render so the server's per-field messages appear next to the inputs.
      for (const section of state.sections) {
        for (const field of section.fields) {
          if (err.fields[field.key]) {
            field.invalid = true;
            field.error = err.fields[field.key];
          }
        }
      }
      render();
    }
    showBanner('error', err.message || 'We could not save your information.');
  } finally {
    el('saveStatus').hidden = true;
    el('saveFieldsBtn').disabled = false;
  }
});

function showBanner(kind, message) {
  const banner = el('banner');
  banner.hidden = false;
  banner.className = `alert alert--${kind}`;
  banner.innerHTML = `<p>${escapeHtml(message)}</p>`;
  banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---- KYC -------------------------------------------------------------

el('cameraStart').addEventListener('click', async () => {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    const video = el('kycVideo');
    video.srcObject = mediaStream;
    video.hidden = false;
    await video.play();
    el('cameraStart').hidden = true;
    el('cameraCapture').hidden = false;
  } catch {
    el('selfieHint').textContent = 'Camera unavailable. Please upload a photo from your device instead.';
  }
});

el('cameraCapture').addEventListener('click', () => {
  const video = el('kycVideo');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 320;
  canvas.height = video.videoHeight || 320;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  selfieDataUrl = canvas.toDataURL('image/jpeg', 0.85);
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  video.hidden = true;
  el('cameraCapture').hidden = true;
  el('cameraStart').hidden = false;
  const preview = el('kycPreview');
  preview.src = selfieDataUrl;
  preview.hidden = false;
});

el('kycSelfieFile').addEventListener('change', (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    el('selfieHint').textContent = 'Please choose an image file for your selfie.';
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    el('selfieHint').textContent = 'That image is too large. Please choose one under 5 MB.';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    selfieDataUrl = String(reader.result);
    const preview = el('kycPreview');
    preview.src = selfieDataUrl;
    preview.hidden = false;
    el('selfieHint').textContent = 'Selfie ready. Press "Verify my identity".';
  };
  reader.readAsDataURL(file);
});

el('kycSubmit').addEventListener('click', async () => {
  el('kycError').hidden = true;
  const aadhaar = el('kycAadhaar').value.replace(/\D/g, '');
  if (!/^\d{12}$/.test(aadhaar)) {
    el('kycError').hidden = false;
    el('kycError').textContent = 'Please enter your 12-digit Aadhaar number.';
    return;
  }
  if (!selfieDataUrl) {
    el('kycError').hidden = false;
    el('kycError').textContent = 'Please take or upload a selfie first.';
    return;
  }
  if (!el('kycConsent').checked) {
    el('kycError').hidden = false;
    el('kycError').textContent = 'Please confirm your consent before verifying your identity.';
    return;
  }
  const button = el('kycSubmit');
  button.disabled = true;
  button.textContent = 'Verifying…';
  try {
    await CompletionApi.verifyKyc(token, aadhaar, selfieDataUrl, {
      granted: true,
      version: 'v1-2024-09',
    });
    state = await CompletionApi.openSession(token);
    render();
    showBanner('success', 'Your identity has been verified.');
  } catch (err) {
    el('kycError').hidden = false;
    el('kycError').textContent = err.message || 'Verification failed. Please try again.';
  } finally {
    button.disabled = false;
    button.textContent = 'Verify my identity';
  }
});

el('panSubmit').addEventListener('click', async () => {
  el('panError').hidden = true;
  const pan = el('panNumber').value.trim().toUpperCase();
  const name = el('panName').value.trim();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    el('panError').hidden = false;
    el('panError').textContent = 'Please enter your 10-character PAN (for example ABCDE1234F).';
    return;
  }
  if (!name) {
    el('panError').hidden = false;
    el('panError').textContent = 'Please enter the name exactly as printed on your PAN card.';
    return;
  }
  if (!el('panConsent').checked) {
    el('panError').hidden = false;
    el('panError').textContent = 'Please confirm your consent before verifying your PAN.';
    return;
  }
  const button = el('panSubmit');
  button.disabled = true;
  button.textContent = 'Verifying…';
  try {
    await CompletionApi.verifyPan(token, pan, name, { granted: true, version: 'v1-2024-09' });
    state = await CompletionApi.openSession(token);
    render();
    showBanner('success', 'Your PAN has been verified.');
  } catch (err) {
    el('panError').hidden = false;
    el('panError').textContent = err.message || 'Verification failed. Please try again.';
  } finally {
    button.disabled = false;
    button.textContent = 'Verify my PAN';
  }
});

// ---- Mobile OTP ------------------------------------------------------

el('otpSend').addEventListener('click', async () => {
  el('otpError').hidden = true;
  const phone = el('otpPhone').value.replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(phone)) {
    el('otpError').hidden = false;
    el('otpError').textContent = 'Enter a valid 10-digit mobile number.';
    return;
  }
  const button = el('otpSend');
  button.disabled = true;
  button.textContent = 'Sending…';
  try {
    const result = await CompletionApi.sendOtp(token, phone);
    el('otpCodeWrap').hidden = false;
    el('otpVerify').hidden = false;
    el('otpCodeHint').textContent = result.isMock && result.devCode
      ? `Demo mode: your code is ${result.devCode}`
      : `We sent a code to ${result.maskedPhone || phone}. It expires in a few minutes.`;
    el('otpCode').focus();
  } catch (err) {
    el('otpError').hidden = false;
    el('otpError').textContent = err.message || 'We could not send a code. Please try again.';
  } finally {
    button.disabled = false;
    button.textContent = 'Send code';
  }
});

el('otpVerify').addEventListener('click', async () => {
  el('otpError').hidden = true;
  const phone = el('otpPhone').value.replace(/\D/g, '');
  const code = el('otpCode').value.trim();
  if (!/^\d{6}$/.test(code)) {
    el('otpError').hidden = false;
    el('otpError').textContent = 'Enter the 6-digit code we sent you.';
    return;
  }
  const button = el('otpVerify');
  button.disabled = true;
  button.textContent = 'Confirming…';
  try {
    await CompletionApi.verifyOtp(token, phone, code);
    state = await CompletionApi.openSession(token);
    render();
    showBanner('success', 'Your mobile number has been verified.');
  } catch (err) {
    el('otpError').hidden = false;
    el('otpError').textContent = err.message || 'That code could not be confirmed. Please try again.';
  } finally {
    button.disabled = false;
    button.textContent = 'Confirm code';
  }
});

// ---- Documents -------------------------------------------------------

el('documentList').addEventListener('click', async (event) => {
  const downloadBtn = event.target.closest('[data-download]');
  if (downloadBtn) {
    await downloadDocument(downloadBtn.getAttribute('data-download'));
    return;
  }
  const button = event.target.closest('[data-upload]');
  if (!button) return;
  const card = button.closest('.cc-doc');
  const documentType = button.getAttribute('data-upload');
  const input = card.querySelector('input[type=file]');
  const file = input.files && input.files[0];
  const errorBox = card.querySelector('.field-error');
  const track = card.querySelector('.cc-up-track');
  const fill = card.querySelector('.cc-up-fill');
  errorBox.hidden = true;

  if (!file) {
    errorBox.hidden = false;
    errorBox.textContent = 'Choose a file first.';
    return;
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    errorBox.hidden = false;
    errorBox.textContent = 'Upload a JPEG, PNG or PDF file.';
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    errorBox.hidden = false;
    errorBox.textContent = 'Files must be 5 MB or smaller.';
    return;
  }

  button.disabled = true;
  track.hidden = false;
  fill.style.width = '0%';
  try {
    const contentBase64 = await fileToBase64(file);
    await CompletionApi.uploadDocumentWithProgress(
      token,
      { documentType, fileName: file.name, contentBase64, mimeType: file.type },
      (percent) => { fill.style.width = `${percent}%`; }
    );
    state = await CompletionApi.openSession(token);
    render();
    showBanner('success', 'Document uploaded.');
  } catch (err) {
    errorBox.hidden = false;
    errorBox.textContent = err.message || 'The upload failed. Please try again.';
  } finally {
    button.disabled = false;
    track.hidden = true;
  }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}

async function downloadDocument(documentId) {
  try {
    const blob = await CompletionApi.downloadDocument(token, documentId);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    showBanner('error', err.message || 'The document could not be opened.');
  }
}

// ---- Submit ----------------------------------------------------------

el('submitBtn').addEventListener('click', async () => {
  el('submitError').hidden = true;
  const button = el('submitBtn');
  button.disabled = true;
  button.textContent = 'Submitting…';
  try {
    const result = await CompletionApi.submit(token);
    // Returned once; kept for this tab so a reload still offers password setup.
    if (result.accountSetupToken) {
      accountSetupToken = result.accountSetupToken;
      rememberSetupToken(result.accountSetupToken);
    }
    state = result.state || state;
    render();
  } catch (err) {
    el('submitError').hidden = false;
    el('submitError').textContent = err.message || 'We could not submit your file. Please try again.';
    button.disabled = false;
    button.textContent = 'Submit my file';
  }
});

el('accountSetupBtn').addEventListener('click', async () => {
  el('accountError').hidden = true;
  el('accountSuccess').hidden = true;
  const password = el('accountPassword').value;
  const confirm = el('accountPassword2').value;
  if (password.length < 8) {
    el('accountError').hidden = false;
    el('accountError').textContent = 'Choose a password of at least 8 characters.';
    return;
  }
  if (password !== confirm) {
    el('accountError').hidden = false;
    el('accountError').textContent = 'The two passwords do not match.';
    return;
  }
  if (!accountSetupToken) {
    el('accountError').hidden = false;
    el('accountError').textContent = 'This setup link is no longer available. Please ask Gahonsh Finance for help.';
    return;
  }
  const button = el('accountSetupBtn');
  button.disabled = true;
  button.textContent = 'Setting…';
  try {
    await CompletionApi.setupAccount(accountSetupToken, password);
    accountSetupToken = '';
    forgetSetupToken();
    el('accountSuccess').hidden = false;
    el('accountSuccess').textContent = 'Your password is set. You can now sign in to track your application.';
    el('accountSignin').hidden = false;
    el('accountSetupBtn').hidden = true;
    el('accountPassword').value = '';
    el('accountPassword2').value = '';
  } catch (err) {
    el('accountError').hidden = false;
    el('accountError').textContent = err.message || 'We could not set your password. Please try again.';
  } finally {
    button.disabled = false;
    button.textContent = 'Set my password';
  }
});

el('secretSubmit').addEventListener('click', async () => {
  const code = el('secretInput').value.trim();
  if (!code) {
    el('secretError').hidden = false;
    el('secretError').textContent = 'Enter the verification code from your message.';
    return;
  }
  rememberSecret(code);
  secretAttempted = true;
  await loadState();
  // The code is only kept for this tab; a rejected link clears it so a stale
  // value is not silently retried.
  if (!el('viewError').hidden) forgetSecret();
});

boot();
