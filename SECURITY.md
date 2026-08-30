# Security Policy

## 1. Supported Versions

The latest commit on the `main` branch of `gahonsh-blip/gahonsh-blip.github.io` is the supported production release served directly by GitHub Pages.

---

## 2. Reporting a Vulnerability

If you discover a security vulnerability, please report it privately to the site administrator rather than opening a public issue:

- **Email:** `gahonsh@gmail.com`
- **WhatsApp:** `+91 88251 83628`
- Please include the affected URL/component, vulnerability description, and reproduction steps.

---

## 3. Security Architecture & Threat Model

### 3.1 Client-Side Credentials & Supabase Keys
- **Public Anon Key Only:** The application strictly utilizes the Supabase `anon` public key in `supabase-config.js` or browser `localStorage`.
- **Zero Secrets in Repository:** The `service_role` secret key, database master passwords, and administrative tokens must **NEVER** be committed to Git or exposed to client-side code.
- **Row-Level Security (RLS):** All data access permissions, role boundaries (Client vs. Freelancer), and write restrictions are enforced at the PostgreSQL database level via RLS policies in `docs/marketplace-schema.sql`. Compromising client-side JavaScript cannot bypass PostgreSQL RLS.

### 3.2 Authentication & Session Management
- **Supabase Auth:** Leverages industry-standard JSON Web Tokens (JWT) signed and validated by Supabase Auth with secure cookie/localStorage storage.
- **Role Verification:** User roles (`client` or `freelancer`) are bound to `public.profiles` upon account creation and verified on database mutations.
- **Atomic Operations:** Critical operations (such as proposal acceptance and contract creation) are performed inside PostgreSQL RPC transactions (`accept_proposal_and_create_contract`) to prevent race conditions or partial writes.

### 3.3 Form & External Integrations Security
- **Formspree Inquiries:** Contact inquiries (`contact.html`) are transmitted over TLS/HTTPS directly to Formspree (`https://formspree.io/f/xzdqnoez`).
- **WhatsApp Deep Links:** All dynamic query strings (e.g. newsletter email, plan inquiries) are strictly validated and sanitized using `encodeURIComponent()` to mitigate URI injection risks.
- **Third-Party CDN Integrity:** External scripts and stylesheets are limited to trusted providers:
  - Font Awesome 6.4.0 (cdnjs)
  - Google Maps official embed iframe
  - Supabase JS SDK (CDN / bundled)

### 3.4 Fallback Demo Mode Security
- When live Supabase credentials are absent, the application operates in an interactive local demo sandbox (`MockDataEngine`). Demo data resides entirely in the user's local browser memory/localStorage and does not communicate with external servers.

---

## 4. Security Best Practices for Contributors

1. **Never commit secrets:** Do not add API keys, access tokens, or private customer records.
2. **Never disable RLS:** Do not create PostgreSQL tables without `ENABLE ROW LEVEL SECURITY;`.
3. **Prevent XSS:** Always sanitize and escape user-provided strings before rendering dynamic HTML elements.
4. **Enforce Touch-Target Ergonomics:** Maintain minimum 44px (recommended 48px) touch targets for interactive controls.
