# File Safety and Virus Scanning

The marketplace lets a client and a freelancer exchange files without leaving
the site. Every file goes through a **browser safety scan** before it is
uploaded and again on the downloaded bytes before the other party receives it.

The scan runs locally in the browser. No file, file name or file hash is sent to
an external scanning service.

## What the scanner checks

| Check | Result |
| --- | --- |
| File extension and reported MIME type | Only the marketplace's allow-list is accepted. |
| File signature (magic bytes) | The content must match the extension: PDF, PNG, JPEG, GIF, WebP, ZIP/Office, OLE or text. |
| Double extension | `invoice.exe.pdf` and similar names are blocked. |
| EICAR test file | The standard antivirus test signature is blocked. |
| Executable signature | Windows PE, ELF and Mach-O headers are blocked. |
| PDF active content | `/JavaScript`, `/Launch`, `/EmbeddedFile`, `/OpenAction` and `/AA` are blocked. |
| ZIP / Office contents | Entries with executable or script extensions, and `vbaProject.bin` macros, are blocked. |
| SHA-256 | A fingerprint is calculated for diagnostics; it is not sent anywhere. |

A file with a `clean` result is uploaded or downloaded. A file with
`infected`, `suspicious` or `error` is stopped, and the panel explains why.

## What the scanner does not do

This is a **safety check, not a full antivirus engine**. It cannot detect a
zero-day exploit, a malicious document that has no known marker, or malware
hidden inside an otherwise valid PDF or ZIP. A browser cannot run ClamAV or
VirusTotal reliably without sending the file to a server.

The previous implementation called an external `scanFile` endpoint. That
endpoint was not part of this repository, was out of credits, and could not
write a verdict back because the `file_transfers` table has no scan columns.
The download path then waited forever for a `clean` status. That dependency has
been removed. The in-site scanner now always produces a verdict, so upload and
download do not depend on a third-party service.

## Why the website itself does not need a scan before opening

The public site is static HTML, CSS and JavaScript served by GitHub Pages. A
browser does not execute an uploaded file just because the page is open. The
risk is in the file a user chooses to upload or download, which is why the scan
runs at those two points.

## Server-side hardening

The browser scan can be bypassed by calling the Storage API directly. The
database schema therefore adds a second gate:

- The `job-attachments` bucket is private.
- The bucket has a 25 MB object limit.
- The bucket accepts only the MIME types used by the page.
- Storage and `file_transfers` policies allow only the project owner, the
  freelancer on an active or completed contract, and admins to read files.
- Only the owner, an active-contract freelancer, a live proposer, or an admin
  may upload. A completed contract is read-only.

Apply the latest migration to an existing project:

```text
supabase/migrations/20261126000000_harden_file_transfers.sql
```

Re-running `docs/marketplace-schema.sql` on a fresh project includes the same
settings.

## Optional real antivirus service

If the deployment needs an actual antivirus verdict, add a server-side scanner
behind a Supabase Edge Function or another trusted backend:

1. Keep the scanner API key in Supabase secrets. Never put it in a public file.
2. Send the stored object to ClamAV or VirusTotal from the server, not from the
   visitor's browser.
3. Store the verdict and report URL in new `file_transfers` columns, for
   example `scan_status`, `scan_detail`, `scan_report_url` and
   `scan_checked_at`.
4. Gate the download on `scan_status = 'clean'` and keep the browser scan as a
   fast pre-check.
5. Add the new columns and their RLS rules to `docs/marketplace-schema.sql` and
   a migration before wiring the client.

Until that service exists, the panel says **"Safety scan"**, not
"VirusTotal clean". That wording is deliberate.

## Test cases

The browser scan was checked with these files:

| File | Expected |
| --- | --- |
| `eicar.txt` with the EICAR signature | Blocked as `infected`. |
| `danger.pdf` with `/OpenAction` and `/JavaScript` | Blocked as `suspicious`. |
| `invoice.exe.pdf` with valid PDF bytes | Blocked by the double-extension rule. |
| `evil.zip` containing `payload.exe` | Blocked as `suspicious`. |
| `clean.pdf` | Uploaded. |
| `clean.zip` containing only `readme.txt` | Uploaded. |

The end-to-end local flow was also checked with two accounts:

1. Client signs in and uploads `client-brief.txt`.
2. Freelancer is hired on the project, opens the same project and downloads the
   file.
3. Freelancer uploads `worker-reply.txt`.
4. Client reopens the project and downloads the reply.

Both downloads passed the safety scan and produced the expected file names.
