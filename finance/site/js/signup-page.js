import { LoanApi } from '/finance/site/js/api.js';

const $ = (id) => document.getElementById(id);

function showError(message) {
  $('signupError').textContent = message;
  $('signupError').hidden = false;
}
function clearAlerts() {
  $('signupError').hidden = true;
  $('signupSuccess').hidden = true;
}
function clearFieldErrors() {
  for (const id of ['fullNameErr', 'emailErr', 'phoneErr', 'passwordErr', 'password2Err']) {
    $(id).hidden = true;
    $(id).textContent = '';
  }
}
function setFieldError(field, message) {
  const map = {
    fullName: 'fullNameErr',
    email: 'emailErr',
    phone: 'phoneErr',
    password: 'passwordErr',
  };
  const id = map[field];
  if (id) { $(id).textContent = message; $(id).hidden = false; }
}

$('signupForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  clearAlerts();
  clearFieldErrors();

  const fullName = $('fullName').value.trim();
  const email = $('email').value.trim();
  const phone = $('phone').value.trim();
  const password = $('password').value;
  const password2 = $('password2').value;

  if (!fullName) { setFieldError('fullName', 'Enter your full name.'); return; }
  if (!email) { setFieldError('email', 'Enter your email address.'); return; }
  if (!phone) { setFieldError('phone', 'Enter your mobile number.'); return; }
  if (password.length < 8) { setFieldError('password', 'Use at least 8 characters.'); return; }
  if (password !== password2) {
    $('password2Err').textContent = 'The two passwords do not match.';
    $('password2Err').hidden = false;
    return;
  }

  const btn = $('signupButton');
  btn.disabled = true; btn.textContent = 'Creating account…';
  try {
    const result = await LoanApi.signup({ fullName, email, phone, password });
    $('signupForm').hidden = true;
    $('signupSuccess').textContent = 'Your account is ready. You can now sign in as ' + result.email + '.';
    $('signupSuccess').hidden = false;
    setTimeout(() => { window.location.href = '/finance/site/signin.html'; }, 1600);
  } catch (err) {
    if (err && err.code === 'VALIDATION_ERROR' && err.fields) {
      for (const [field, message] of Object.entries(err.fields)) setFieldError(field, message);
      showError('Please correct the highlighted fields.');
    } else if (err && err.code === 'ACCOUNT_EXISTS') {
      showError(err.message);
    } else {
      showError(err && err.message ? err.message : 'Could not create your account. Please try again.');
    }
    btn.disabled = false; btn.textContent = 'Create account';
  }
});
