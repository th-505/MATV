# GitHub-only maintenance reports

Owner decision: GitHub reports only temporarily. No SMTP integration or email sending is enabled. Do not publish the owner's email address.

The `Najd daily provider report` workflow runs daily at21:00 UTC (00:00 Saudi time), or manually through GitHub Actions. Scheduled runs use the default branch. Feature-branch pushes affecting the report are test runs.

Delivery surfaces: GitHub Actions run summary, a14-day sanitized artifact, and one open issue titled `Najd TV — تقرير القواشط اليومي`, updated each run. GitHub's own notification preferences control any notifications; the application does not send mail.

The provider analyzer currently checks homepage HTTP transport only. Its results do not certify search, episode indexing, identity matching or playback. Gemini receives only allowlisted provider IDs, connection status, HTTP status and redacted error categories. No user queries, media URLs, authorization headers or keys enter its prompt or the public report.

The existing primary and backup Gemini secrets are read only inside the diagnosis step. The client discovers a supported low-cost Flash model dynamically. Missing keys, quota errors or malformed output produce an explicit unavailable diagnosis while preserving measured provider results.

Model output is advisory. This reporting workflow executes no proposed code, patches or commands and applies zero repairs. Verified automatic configuration repair belongs to a separate, still-pending implementation with live checks and a restricted configuration schema.

Tests: `python -m unittest discover -s scripts -p 'test_najd_daily_report.py'`.
