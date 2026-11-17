const $ = (id) => document.getElementById(id);
let challengeToken = '';

function showError(message) {
  $('authError').textContent = message;
  $('authError').hidden = false;
}
function clearAlerts() {
  $('authError').hidden = true;
  $('authNotice').hidden = true;
}

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || d.detail || 'Sign in failed. Please try again.');
  return d;
}

function completeSignIn(data) {
  localStorage.setItem('token', data.token);
  if (data.user) {
    localStorage.setItem('userRole', data.user.role || 'CUSTOMER');
  }
  window.location.href = '/finance/customer/';
}

$('signinForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  clearAlerts();
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || !password) { showError('Enter your email and password.'); return; }
  const btn = $('signinButton');
  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const data = await post('/api/auth/login', { email, password });
    if (data.otp_required) {
      challengeToken = data.challenge_token;
      $('otpTarget').textContent = data.masked_email || 'your email';
      if (data.dev_code) $('devCodeHint').textContent = 'Development code: ' + data.dev_code;
      $('signinForm').hidden = true;
      $('otpForm').hidden = false;
      $('otpCode').focus();
      return;
    }
    completeSignIn(data);
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Sign in';
  }
});

$('otpForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  clearAlerts();
  const code = $('otpCode').value.trim();
  if (!code) { showError('Enter the code from your email.'); return; }
  const btn = $('otpButton');
  btn.disabled = true; btn.textContent = 'Verifying…';
  try {
    const data = await post('/api/auth/login/verify', { challenge_token: challengeToken, code });
    completeSignIn(data);
  } catch (err) {
    showError(err.message);
    btn.disabled = false; btn.textContent = 'Verify and sign in';
  }
});
