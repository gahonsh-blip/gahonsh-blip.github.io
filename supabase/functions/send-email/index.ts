// Sends the queued marketplace emails through Resend.
//
// Deploy:  supabase functions deploy send-email --no-verify-jwt
// Secrets: supabase secrets set RESEND_API_KEY=re_... EMAIL_DRAIN_SECRET=<random> \
//            EMAIL_FROM="Gahonsh <notifications@gahonsh.com>"
//
// Called once a minute by the `gahonsh-email-drain` pg_cron job (see
// supabase/migrations/20261201000000_add_email_outbox.sql). It can also be
// invoked by hand:
//   curl -X POST "$URL/functions/v1/send-email" -H "x-email-secret: $SECRET"
//
// The Resend key never leaves this function's environment. The caller proves
// itself with EMAIL_DRAIN_SECRET, which is why --no-verify-jwt is safe here:
// the shared secret is the gate, and the function refuses to run without one.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderHtml(subject: string, body: string, link: string | null): string {
    const safeBody = escapeHtml(body).replace(/\n/g, '<br>');
    const button = link
        ? `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#0ea5e9;color:#04101f;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open Gahonsh</a></p>`
        : '';
    return `<!doctype html><html><body style="margin:0;background:#f6f8fb;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#12233a">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5b6b80">Gahonsh Freelancing</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(subject)}</h1>
<p style="margin:0;font-size:15px;line-height:1.6">${safeBody}</p>
${button}
<p style="margin:24px 0 0;font-size:12px;color:#5b6b80">You receive this because your Gahonsh profile has email notifications on. Turn them off in your profile editor.</p>
</div></body></html>`;
}

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

    const expected = Deno.env.get('EMAIL_DRAIN_SECRET') || '';
    const presented = req.headers.get('x-email-secret') || '';
    // Refuse to run with no secret configured: an open sender would be an
    // abuse vector for anyone who learns the URL.
    if (!expected || presented !== expected) return json({ error: 'forbidden' }, 401);

    const resendKey = Deno.env.get('RESEND_API_KEY') || '';
    if (!resendKey) return json({ error: 'RESEND_API_KEY is not set on this function' }, 503);

    const from = Deno.env.get('EMAIL_FROM') || 'Gahonsh <notifications@gahonsh.com>';
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') || '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
        { auth: { persistSession: false } }
    );

    const { data: batch, error } = await supabase.rpc('claim_email_batch', { p_limit: 20 });
    if (error) return json({ error: error.message }, 500);

    const rows = (batch || []) as Array<{
        id: string; to_email: string; subject: string; body: string; link: string | null;
    }>;
    let sent = 0;
    const failures: Array<{ id: string; error: string }> = [];

    for (const row of rows) {
        try {
            const res = await fetch(RESEND_ENDPOINT, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${resendKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from,
                    to: [row.to_email],
                    subject: row.subject,
                    text: row.link ? `${row.body}\n\n${row.link}` : row.body,
                    html: renderHtml(row.subject, row.body, row.link)
                })
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload?.message || `Resend returned ${res.status}`);
            await supabase.rpc('settle_email', {
                p_id: row.id, p_ok: true, p_provider_id: payload?.id ?? null, p_error: null
            });
            sent += 1;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            failures.push({ id: row.id, error: message });
            await supabase.rpc('settle_email', {
                p_id: row.id, p_ok: false, p_provider_id: null, p_error: message
            });
        }
    }

    return json({ claimed: rows.length, sent, failed: failures.length, failures });
});
