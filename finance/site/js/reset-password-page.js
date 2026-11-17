/**
 * Customer password reset for the public site.
 *
 * Three steps, all against the existing `/api/auth/password-reset/*` endpoints
 * (the same flow the staff portal uses): request a code, verify it for a
 * one-time reset token, then set a new password. The customer is returned to
 * the site sign-in page, never the admin portal.
 *
 * No inline script, so the page can keep the site's strict `script-src 'self'`
 * policy. Errors are read from the API's `error` string, never rendered as an
 * object.
 */

const $ = (id) => document.getElementById(id);
let email = '';
let resetToken = '';

function clearAlerts() {
  $('resetError').hidden = true;
  $('resetError').textContent = '';
  $('resetSuccess').hidden = true;
  $('resetSuccess').textContent = '';
}
function showError(message) {
  clearAlerts();
  $('resetError').textContent = message;
  $('resetError').hidden = false;
}
function showSuccess(message) {
  clearAlerts();
  $('resetSuccess').textContent = message;
  $('resetSuccess').hidden = false;
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.detail || 'Request failed. Please try again.');
  }
  return data;
}

$('requestForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearAlerts();
  email = $('email').value.trim();
  if (!email) { showError('Enter your e-mail address.'); return; }
  const button = $('requestButton');
  button.disabled = true;
  button.textContent = 'Sending…';
  try {
    const data = await post('/api/auth/password-reset/request', { email });
    // The API answers identically whether or not the address is registered, so
    // the page must not reveal which case it was.
    showSuccess('If that e-mail is registered, a reset code is on its way.');
    if (data.dev_code) $('devCodeHint').textContent = 'Development code: ' + data.dev_code;
    $('requestForm').hidden = true;
    $('verifyForm').hidden = false;
    $('code').focus();
  } catch (err) {
    showError(err.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Send reset code';
  }
});

$('verifyForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearAlerts();
  const code = $('code').value.trim();
  if (!/^\d{6}$/.test(code)) { showError('Enter the 6-digit code.'); return; }
  const button = $('verifyButton');
  button.disabled = true;
  button.textContent = 'Verifying…';
  try {
    const data = await post('/api/auth/password-reset/verify', { email, code });
    resetToken = data.reset_token;
    showSuccess('Code verified. Choose a new password.');
    $('verifyForm').hidden = true;
    $('confirmForm').hidden = false;
    $('newPassword').focus();
  } catch (err) {
    showError(err.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Verify code';
  }
});

$('confirmForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearAlerts();
  const password = $('newPassword').value;
  const confirm = $('confirmPassword').value;
  if (password.length < 8) { showError('Use at least 8 characters.'); return; }
  if (password !== confirm) { showError('The two passwords do not match.'); return; }
  const button = $('confirmButton');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    await post('/api/auth/password-reset/confirm', { token: resetToken, password });
    $('confirmForm').hidden = true;
    showSuccess('Your password has been reset. You can now sign in.');
    setTimeout(() => { window.location.href = '/finance/site/signin.html'; }, 1500);
  } catch (err) {
    showError(err.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Set new password';
  }
});
