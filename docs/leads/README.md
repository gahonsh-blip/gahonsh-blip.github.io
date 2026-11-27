# Lead files: 100 clients, 100 freelancers

Two CSVs, built by a script from public listings, checked offline before every
commit. They answer one question: where is demand for what Gahonsh sells, and
who could deliver it?

| File | Rows | What a row is |
|------|------|----------------|
| `clients.csv` | 100 | A public hiring post for Excel, PDF, web or automation work |
| `freelancers.csv` | 100 | A public professional profile in one of those four areas |

Built 2026-11-27. Rebuild with `npm run leads:refresh`; validate with
`npm run test:leads`.

## What these files are not

- **Not contact lists.** No email address, phone number or private address
  appears in either file, and the builder never reads one. The check fails the
  build if an address-shaped string shows up in any cell.
- **Not a promise that a person is available, honest or still active.** A row
  records what a public page said on the build date.
- **Not permission to bulk-message anyone.** Public listing means the page is
  public, not that the person agreed to be emailed. Approach people through the
  platform they posted on, following its rules. Never cold-email a scraped
  address: none is here, and buying one elsewhere would defeat the point.
- **Not deduplicated across platforms.** The same person can be on two
  directories. Rows are unique by source URL.

## How a row was verified

`verification` states exactly how the row was seen, never more:

| Value | Meaning |
|-------|---------|
| `listing_page_fetched` | The builder fetched the listing page and read the entry from it |
| `api_record` | The row came from a documented API (GitHub, HN Algolia, Remote OK, WWR RSS) |
| `profile_page_fetched` | The profile itself was opened, not just the listing |

`checked_at` is the build date. Anything older than about 30 days should be
treated as stale: job posts close, profiles go quiet.

## Who is named, and who is not

Marketplaces usually hide the buyer. Rather than invent a name, the row says so.

`client_basis` / `name_basis`:

| Value | Meaning |
|-------|---------|
| `published_name` | The page printed a person or company name |
| `public_handle` | The page printed a handle or username, not a legal name |
| `url_handle` | The name is derived from the profile URL slug |
| `not_published` | The source hides it. The row still carries the post or profile URL |

Current mix:

| Clients (100) | | Freelancers (100) | |
|---|---|---|---|
| Hacker News | 43 | n8n Experts | 56 |
| Freelancer.com | 50 | freelancermap | 33 |
| We Work Remotely | 5 | GitHub | 11 |
| Remote OK | 2 | | |

Of the client rows, 50 name the buyer (`published_name` 7, `public_handle` 43);
the 50 Freelancer.com rows are posts whose buyer the platform hides. Of the
freelancer rows, 82 carry a name or handle and 18 carry a headline only.

## Columns

### clients.csv

| Column | Meaning |
|--------|---------|
| `id` | `C001`–`C100` |
| `client` | Buyer name, handle, or `Not published` |
| `client_basis` | How the name was obtained (table above) |
| `project_title` | The post's own title, trimmed |
| `skills` | Service keywords found in the post |
| `country` | As printed, or `See post` / `Remote` |
| `compensation` | Budget **only** when the post published one. A salary band is not a budget, so it stays in `notes` |
| `platform` | Where the post lives |
| `post_url` | The public post |
| `source_kind` | `public_job_post` |
| `verification` | How it was seen |
| `checked_at` | Build date |
| `notes` | What the row is and is not |

### freelancers.csv

| Column | Meaning |
|--------|---------|
| `id` | `F001`–`F100` |
| `name` | Published name, handle, or `Not published` |
| `name_basis` | How the name was obtained |
| `headline` | The profile's own headline |
| `skills` | Service keywords found in the headline |
| `country` | As printed, or `Not published` |
| `platform` | Where the profile lives |
| `profile_url` | The public profile |
| `source_kind` | `marketplace_profile` or `public_dev_profile` |
| `verification` | How it was seen |
| `checked_at` | Build date |
| `notes` | What the row is and is not |

## How to use them

1. **Read the post before writing to anyone.** The title and URL are the whole
   evidence. A row with `client_basis=not_published` still tells you the work
   exists and what it pays.
2. **Match by service.** `skills` uses the same vocabulary as the Services page,
   so a row with `excel` is a lead for Excel Automation, not for a logo.
3. **For freelancers, invite, do not pitch.** A profile is a candidate for
   `find-talent.html`; the profile URL is the reference to check before
   onboarding.
4. **Refresh before a campaign.** `npm run leads:refresh` re-reads every source
   and rewrites both files. If a source is down, that source contributes
   nothing and the run warns when a list falls short of 100.

## Sources

| Source | What it gives | Access |
|--------|---------------|--------|
| n8n Experts | AI automation specialists | Public directory HTML |
| freelancermap | European IT freelancers, with country | Public search HTML |
| GitHub | Developers whose public bio names a skill | Public REST API |
| Freelancer.com | Open projects across the four services | Public listing HTML |
| Hacker News | "Seeking freelancer" posts, with the poster's handle | Public Algolia API |
| Remote OK | Remote roles at named companies | Public JSON API |
| We Work Remotely | Roles at named companies | Public RSS |

Upwork and Fiverr were checked and refused anonymous requests, so they are not
sources. Do not add a source that needs a login: the build must run without
credentials beyond an optional `GITHUB_TOKEN` for rate limits.
