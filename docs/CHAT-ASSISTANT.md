# Chat Assistant (Guided Tasks)

`chat-widget.js` is the site-wide assistant. It answers questions from a curated
knowledge base and runs guided tasks against the same `GahonshDB` services the
page forms use. It is browser-only: no API key, no external LLM and no
per-message cost.

## What it can do

| Task | Who can use it | What it asks | Service call |
| :--- | :--- | :--- | :--- |
| **Post a job** | Client or admin | Title, category, scope, pricing model, fixed budget or hourly range, duration, experience level, optional skills | `Jobs.createJob()` |
| **Build / update profile** | Signed-in worker or client | Full name, professional title, location, skills and hourly rate (worker only), bio | `Profiles.updateMyProfile()` |
| **Upload resume** | Worker or admin | Opens the profile editor at the **Resume / CV (PDF)** section | `Profiles.uploadResume()` (through the existing UI) |
| **Submit a proposal** | Worker or admin | Job link or ID, bid, delivery days, cover letter | `Proposals.submitProposal()` |
| **Quote** | Anyone | Name, email and one line about the work | `contact_messages` lead |
| **Questions** | Anyone | Services, prices, timelines, samples, payment, process, guarantees | Knowledge base |
| **Find work / Find talent / My portal** | Anyone | No input; returns the right links | — |

## Rules and safety

- Sign-in is required for profile, job, proposal and resume actions. The bot
  opens the normal auth modal and offers a **Continue** action afterwards.
- Role checks mirror the services: jobs need a client account, proposals need a
  worker account, resumes need a worker account.
- The bot never asks for a password, never handles payments and never approves
  accounts. It cannot bypass the site rules or RLS policies.
- Every value the user types is escaped with `escapeHtml()` before it reaches
  the chat log. The write itself goes through the same service and policy as the
  page form.
- The offline fallback works because the bot calls `GahonshDB`, which routes to
  `marketplace-local.js` when Supabase is unreachable.
- Task state is kept in memory only. Chat history is stored in `localStorage`;
  an unfinished task is not restored after a reload.
- The chat panel sits at `z-index: 99998`, below the auth and profile modals
  (`99999`), so those dialogs are never covered.

## Commands

Natural language works in English, Hindi or Hinglish. Examples:

- `post a job`, `job post karna hai`, `जॉब पोस्ट करो`
- `build my profile`, `mera profile update karo`, `प्रोफाइल बनाओ`
- `upload resume`, `resume upload`, `रिज्यूमे अपलोड`
- `submit a proposal`, `proposal bhejna hai`, `bid karna`
- `what can you do`, `kya kar sakta hai`, `मैं क्या कर सकता हूँ`
- `cancel`, `skip`, `yes`, `edit`

During a task, the next message is treated as the answer to the current step.
Type `cancel` to stop without saving, or tap **Cancel**. Use **Skip** for an
optional field, **Edit** to restart the questions and **Confirm** to save.

## Testing

Run `npm test` for the static checks (a11y, security, schema and the offline
engine). The guided flows need a browser:

1. Start the preview server with `npm run dev`.
2. When the Supabase project is unreachable, the marketplace uses the demo
   accounts: `aditya@freelancer.demo` / `demo1234` (worker) and
   `apex@client.demo` / `demo1234` (client).
3. Open the chat and run a task from the quick-action chips.

The security check scans `chat-widget.js` for unescaped values reaching
`innerHTML`, so keep user input behind `escapeHtml()` or set it with
`textContent`.

## Code map

- `chat-widget.js` — widget shell, knowledge base, task engine and service calls.
- `auth.js` — `GahonshAuthUI.ensureCurrentUser()`, `openAuthModal()` and
  `openProfileModal()` used by the bot.
- `supabase-client.js` / `marketplace-local.js` — the services the tasks call.
- `docs/marketplace-schema.sql` — the tables, policies and RPCs behind them.
