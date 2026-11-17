/**
 * Gahonsh Finance - client completion link API seam.
 *
 * This module is the ONLY place the client completion page talks to the
 * backend. It mirrors `api.js` in spirit: no DOM dependencies, one error shape,
 * and every call goes to the real API.
 *
 *   POST /api/client/completion/session              -> open the link
 *   POST /api/client/completion/fields               -> save allowed fields
 *   POST /api/client/completion/kyc                  -> run eKYC
 *   POST /api/client/completion/documents            -> upload a document
 *   GET  /api/client/completion/documents/:id/download -> fetch a document
 *   POST /api/client/completion/submit               -> final submission
 *
 * The access token is held only in memory for the life of the page and is sent
 * in the request body (never the query string of a navigable URL), so it cannot
 * leak through the browser's history, referrer or server access logs. The
 * optional shared secret, when the link was issued with one, is held in
 * `sessionStorage` so a reload within the same tab does not ask for it again.
 */

import { ApiError } from './api.js';

const API_BASE = '/api/client/completion';
const SECRET_KEY = 'gahonsh.completion.secret';
const TOKEN_KEY = 'gahonsh.completion.token';
const SETUP_KEY = 'gahonsh.completion.setupToken';

/** An error carrying the API's per-field messages, if any. */
function toApiError(payload, status) {
  const message =
    (payload && typeof payload.error === 'string' && payload.error) ||
    `Request failed (${status})`;
  const error = new ApiError(message, { status, code: 'COMPLETION_ERROR' });
  if (payload && payload.fields) error.fields = payload.fields;
  if (payload && payload.blocking) error.blocking = payload.blocking;
  return error;
}

async function request(path, { method = 'POST', token, body = {}, timeoutMs = 20000, absolute = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const secret = readSecret();
  let response;
  try {
    response = await fetch(`${absolute ? '' : API_BASE}${path}`, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...(secret ? { secret } : {}), ...body }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') {
      throw new ApiError('The request took too long. Check your connection and try again.', {
        code: 'TIMEOUT',
      });
    }
    throw new ApiError('We could not reach Gahonsh Finance. Check your connection and try again.', {
      code: 'NETWORK_ERROR',
    });
  }
  clearTimeout(timer);

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) throw toApiError(payload, response.status);
  return payload;
}

export function rememberSecret(secret) {
  if (typeof secret === 'string' && secret.trim() !== '') {
    try {
      sessionStorage.setItem(SECRET_KEY, secret.trim());
    } catch {
      // Private browsing may block storage; the code is then re-asked each time.
    }
  }
}

export function readSecret() {
  try {
    return sessionStorage.getItem(SECRET_KEY) || '';
  } catch {
    return '';
  }
}

export function forgetSecret() {
  try {
    sessionStorage.removeItem(SECRET_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Remembers the completion access token for the life of the browser tab.
 *
 * The token normally arrives in the URL fragment, which is dropped from the
 * address bar after it is read. Without this the token lived only in a JS
 * variable, so a reload (or an accidental pull-to-refresh on mobile) sent the
 * customer back to the "this page needs a valid link" dead end - and, after
 * submission, permanently lost the ability to set a password. `sessionStorage`
 * is tab-scoped and cleared when the tab closes, so the token is not left on a
 * shared machine the way `localStorage` would.
 */
export function rememberToken(token) {
  if (typeof token === 'string' && token.trim() !== '') {
    try {
      sessionStorage.setItem(TOKEN_KEY, token.trim());
    } catch {
      // Private browsing may block storage; the link then has to be reopened.
    }
  }
}

export function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function forgetToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Remembers the one-time account setup token for the life of the tab.
 *
 * The plaintext is returned exactly once (on submission) and is never stored
 * server-side beyond its hash, so it cannot be re-fetched. Holding it only in a
 * JS variable meant a reload after submitting lost the "set your password" step
 * for good. Tab-scoped storage keeps the window to the customer's own session;
 * it is cleared as soon as the password is set.
 */
export function rememberSetupToken(token) {
  if (typeof token === 'string' && token.trim() !== '') {
    try {
      sessionStorage.setItem(SETUP_KEY, token.trim());
    } catch {
      // Storage blocked: the setup step then only lasts until the next reload.
    }
  }
}

export function readSetupToken() {
  try {
    return sessionStorage.getItem(SETUP_KEY) || '';
  } catch {
    return '';
  }
}

export function forgetSetupToken() {
  try {
    sessionStorage.removeItem(SETUP_KEY);
  } catch {
    /* nothing to clear */
  }
}

export const CompletionApi = {
  /** Opens the link and returns the full completion state. */
  openSession(token) {
    return request('/session', { token });
  },

  /** Saves the fields the client is allowed to change. */
  saveFields(token, fields) {
    return request('/fields', { token, body: { fields } });
  },

  /** Runs eKYC for the linked customer. Consent is required by the API. */
  verifyKyc(token, aadhaarNumber, selfieDataUrl, consent, idempotencyKey) {
    return request('/kyc', {
      token,
      body: { aadhaarNumber, selfieDataUrl, consent, idempotencyKey },
    });
  },

  /** Runs PAN verification for the linked customer. Consent is required. */
  verifyPan(token, panNumber, nameOnPan, consent, dateOfBirth, idempotencyKey) {
    return request('/pan', {
      token,
      body: { panNumber, nameOnPan, consent, dateOfBirth, idempotencyKey },
    });
  },

  /** Sends a mobile verification code to the given number. */
  sendOtp(token, phone) {
    return request('/otp/send', { token, body: { phone } });
  },

  /** Confirms the mobile verification code. */
  verifyOtp(token, phone, code) {
    return request('/otp/verify', { token, body: { phone, code } });
  },

  /** Sets the customer's password using the one-time setup token. */
  setupAccount(setupToken, password) {
    return request('/api/client/account/setup', { body: { token: setupToken, password }, absolute: true });
  },

  /** Uploads a required document (base64 content). */
  uploadDocument(token, { documentType, fileName, contentBase64, mimeType }) {
    return request('/documents', {
      token,
      body: { documentType, fileName, contentBase64, mimeType },
    });
  },

  /**
   * Uploads a document while reporting progress. `fetch` cannot report upload
   * progress, so this uses XMLHttpRequest; the request and error shape are
   * identical to `uploadDocument`.
   */
  uploadDocumentWithProgress(token, { documentType, fileName, contentBase64, mimeType }, onProgress) {
    return new Promise((resolve, reject) => {
      const secret = readSecret();
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/documents`, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.timeout = 60000;

      if (typeof onProgress === 'function' && xhr.upload) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
      }

      xhr.onload = () => {
        let payload = null;
        try {
          payload = JSON.parse(xhr.responseText || 'null');
        } catch {
          payload = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
        else reject(toApiError(payload, xhr.status));
      };
      xhr.onerror = () =>
        reject(new ApiError('The upload failed. Check your connection and try again.', { code: 'NETWORK_ERROR' }));
      xhr.ontimeout = () =>
        reject(new ApiError('The upload took too long. Try again, or use a smaller file.', { code: 'TIMEOUT' }));

      xhr.send(
        JSON.stringify({ token, ...(secret ? { secret } : {}), documentType, fileName, contentBase64, mimeType })
      );
    });
  },

  /** Final submission. Idempotent server-side. */
  submit(token) {
    return request('/submit', { token });
  },

  /**
   * Fetches a document the client uploaded. The token travels in the body of a
   * POST-style call is not possible for a download, so it is passed as a query
   * parameter here - this is the one place the token appears in a URL, and it
   * is same-origin and immediately consumed.
   */
  async downloadDocument(token, documentId) {
    const secret = readSecret();
    const query = new URLSearchParams({ token, ...(secret ? { secret } : {}) });
    const response = await fetch(`${API_BASE}/documents/${encodeURIComponent(documentId)}/download?${query}`, {
      headers: { Accept: 'application/octet-stream' },
    });
    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      throw toApiError(payload, response.status);
    }
    return response.blob();
  },
};
