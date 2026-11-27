# Chat Assistant (Guided Tasks & Audits)

`chat-widget.js` is the site-wide assistant. It answers questions from a curated
knowledge base, runs guided tasks against the same `GahonshDB` services the page
forms use, and audits a profile or a job post with a deterministic score. It is
browser-only: no API key, no external LLM and no per-message cost.

## What it can do

| Task | Who can use it | What it asks / checks | Service call |
| :--- | :--- | :--- | :--- |
| **Post a job** | Client or admin | Title, category, scope, pricing model, fixed budget or hourly range, duration, experience level, optional skills; the review scores the draft before publishing | `Jobs.createJob()` |
| **Build / update profile** | Signed-in worker or client | Full name, professional title, location, skills and hourly rate (worker only), bio | `Profiles.updateMyProfile()` |
| **Profile check** | Signed-in worker or client | Scores name, title, location, skills, hourly rate, bio and resume; lists warnings and gaps | `Profiles.getMyProfile()` |
| **Fix my profile** | Signed-in worker or client | Asks only the gaps found by the profile check, then re-audits the saved profile | `Profiles.updateMyProfile()` |
| **Job post check** | Client or admin | Scores title, category, scope, budget, duration, experience level and required skills; lists gaps | `Jobs.getMyJobs()` |
| **Improve this job** | Client or admin | Asks only the gaps found by the job check, then re-audits the saved job | `Jobs.updateJob()` |
| **Upload resume** | Worker or admin | Reports the file already on record (name, size, date) with **View** and **Replace**, or opens the editor, watches for the upload and re-audits when it lands | `Profiles.uploadResume()` through the editor, then `Profiles.getMyProfile()` |
| **Submit a proposal** | Worker or admin | Job link or ID, bid, delivery days, cover letter | `Proposals.submitProposal()` |
| **Quote** | Anyone | Name, email and one line about the work | `contact_messages` lead |
| **Questions** | Anyone | Services, prices, timelines, samples, payment, process, guarantees | Knowledge base |
| **Find work / Find talent / My portal** | Anyone | No input; returns the right links | — |

### The resume step

A browser cannot type a file path into a chat box, so the bot does not pretend
to. It opens the profile editor, then polls `getMyProfile()` every 2.5 s for
three minutes and compares `resume_updated_at`. When the value changes it
confirms the file (name, size, date) and re-runs the check, so the score moves
from 90 to 100 in front of the member. The watch starts **before**
`openProfileModal()` is awaited: that promise settles when the editor closes,
so awaiting it first would only start the watch after the upload.

If a file is already on record, the step says so and offers **View my resume**
(a signed URL in a new tab, opened before the await so the popup is not
blocked), **Upload resume** to replace it, and **Check my profile**.

### The draft job check

Before a job is published, `renderTaskSummary()` scores the draft with
`auditJob(draftJobFromTask())` — the same rubric as a saved post — and prints
`Draft check: N/100` with the weak items. Publishing is not blocked; the check
tells the client what a freelancer would find thin.

## How the audit scores work

The audit is deterministic and runs in the browser. It never calls an LLM.

- **Profile (worker):** name 10, title 20, location 10, skills 20, hourly rate
  15, bio 15, resume 10. **Profile (client):** name 20, title 25, location 15,
  company / about 40; a client profile has no resume item.
- **Job post:** title 15, category 5, scope 30, budget 15, duration 10,
  experience level 10, required skills 15.
- A `warn` item earns half its weight (for example, a generic job title or a
  very short bio). A `missing` item earns zero. The score is
  `earned / possible`, rounded to 0-100.
- Resume status is only scored when the data says it is known. An older
  deployment without `has_resume` cannot be guessed, so the item is omitted
  from the denominator instead of being counted as a failure.
- Generic titles ("Freelance Specialist", "Developer") are flagged. A specific
  role and speciality ("Senior Excel Automation Specialist") passes.
- A job scope under 120 characters is a gap. A longer scope that names the
  deliverable, tools and success criteria scores.
- The audit shows **Fix my profile** / **Improve this job** only when a fixable
  gap exists, and **Upload resume** when the resume is the remaining gap.

## Rules and safety

- Sign-in is required for profile, job, proposal and resume actions. The bot
  opens the normal auth modal and offers a **Continue** action afterwards.
- **Self-only reads.** Every check reads the signed-in account: the profile
  audit uses `Profiles.getMyProfile()`, the job audit uses `Jobs.getMyJobs()`.
  No code path accepts a user id, an email or a name from the message, and
  `asksAboutSomeoneElse()` refuses a question aimed at another member before
  intent routing runs. A refused question names the in-site message thread as
  the right way to reach that person.
- Role checks mirror the services: jobs and job checks need a client or admin
  account, proposals and resumes need a worker or admin account.
- The bot never asks for a password, never handles payments and never approves
  accounts. It cannot bypass the site rules or RLS policies.
- Every value the user or database supplies is escaped with `escapeHtml()`
  before it reaches the chat log. The write itself goes through the same
  service and policy as the page form.
- Signing out, or switching to another account, clears the visible chat and the
  stored `gc_hist` history. An in-flight audit or save is tied to the account
  that started it with `chatEpoch`, so a late response cannot show the previous
  user's profile or job in the cleared chat.
- The offline fallback works because the bot calls `GahonshDB`, which routes to
  `marketplace-local.js` when Supabase is unreachable.
- Task state is kept in memory only. Chat history is stored in `localStorage`;
  an unfinished task is not restored after a reload, and auth changes clear it.
- The chat panel sits at `z-index: 99998`, below the auth and profile modals
  (`99999`), so those dialogs are never covered.
- A job can be selected for a check by its number, title, a job ID, or a link.
  `extractJobId()` accepts UUIDs, `job-*` IDs and the demo `demo-job-*` IDs used
  by the offline engine.

## Commands

Natural language works in English, Hindi or Hinglish. Examples:

- `post a job`, `job post karna hai`, `जॉब पोस्ट करो`
- `build my profile`, `mera profile update karo`, `प्रोफाइल बनाओ`
- `check my profile`, `profile check karo`, `प्रोफाइल चेक करो`
- `mera profile kitna set hai`, `profile set hua hai ya nahi`, `mera profile report do`,
  `प्रोफाइल कितना सेट है` — the status phrasings. These used to start the
  profile wizard because `mera profile` was one of its keywords; they now run
  the check.
- `check my job post`, `job post check`, `मेरा job post चेक करो`,
  `mere project me kya kami hai`, `project posting me kya kami hai`,
  `प्रोजेक्ट में क्या कमी है` — clients ask about a "project" or a "posting".
- `fix my profile`, `profile fix`, `प्रोफाइल ठीक करो`
- `improve this job`, `job fix`, `job post ठीक करो`
- `upload resume`, `resume upload`, `रिज्यूमे अपलोड`
- `submit a proposal`, `proposal bhejna hai`, `bid karna`
- `what can you do`, `kya kar sakta hai`, `मैं क्या कर सकता हूँ`
- `cancel`, `skip`, `yes`, `edit`

During a task, the next message is treated as the answer to the current step.
Every step carries three buttons: **Continue** accepts what is there (the text
in the box, else the value already saved) and moves on, **Skip** leaves this
field alone, and **Cancel** stops the task. A required field that is still
empty shows only Continue and Cancel, because skipping it could never save.
**Edit** restarts the questions and **Confirm** saves.
Devanagari is matched after preserving combining marks, so `प्रोफाइल` and
similar words work.

## Notifications and email

A proposal writes a `notifications` row for the client in both engines (the
`notify_on_proposal_change` trigger on Supabase, `pushNotification()` offline).
`notification-bell.js` puts a 48 px bell with the unread count on every page for
a signed-in member, and links to `marketplace-dashboard.html#notifications`.

Email is the studio's Formspree form, because the site has no mail server.
`GahonshAlerts.proposalSubmitted()` posts the project title, the bid, the
delivery time and the job link to the studio inbox. It sends no member email,
phone or resume, it is fire-and-forget, and it fires from both the page form
(`assets/js/job-details-flow.js`) and the chat. **Automatic email to the client
still needs a mail provider**; until one is configured, the client is notified
in the portal and the studio is notified by email.

## Testing

Run `npm test` for the static checks (a11y, security, schema, the offline
engine, the page content and the chat router). `npm run test:chat` loads the
real keyword table and the real scorer from `chat-widget.js` and asserts that
each phrasing reaches the intended intent, that the privacy guard blocks
third-party questions, and that a step always offers Continue, Skip and Cancel.

The guided flows and audits also need a browser:

1. Start the preview server with `npm run dev`.
2. When the Supabase project is unreachable, the marketplace uses the demo
   accounts: `aditya@freelancer.demo` / `demo1234` (worker) and
   `apex@client.demo` / `demo1234` (client).
3. Open the chat and run a task from the quick-action chips. The demo job
   `demo-job-1` is a useful link for the proposal and job-check flows.
4. Check the audit in light mode and at a 390 px viewport: the warning and
   missing colours must stay readable and the chips must keep a 48 px target.

`npm run test:chat` also asserts the asset wiring (every page with the chat
loads the bell exactly once), that the resume step keeps its force flag and its
watcher, that the summary scores the draft, and that both proposal paths raise
the alert.

The security check scans `chat-widget.js` for unescaped values reaching
`innerHTML`, so keep user input behind `escapeHtml()` or set it with
`textContent`.

## Code map

- `chat-widget.js` — widget shell, knowledge base, audit engine
  (`auditProfile`, `auditJob`, `auditScore`), guided flows
  (`startProfileAudit`, `startJobAudit`, `startProfileFix`, `startJobFix`),
  job picker, `extractJobId` and the auth-change guard (`chatEpoch`).
- `auth.js` — `GahonshAuthUI.ensureCurrentUser()`, `openAuthModal()` and
  `openProfileModal()` used by the bot.
- `supabase-client.js` / `marketplace-local.js` — the services the tasks call,
  including `Jobs.updateJob()` for the job-fix flow.
- `docs/marketplace-schema.sql` — the tables, policies and RPCs behind them.
- `docs/BUG_REPORT.md` — the audit and the bugs fixed in this pass.
