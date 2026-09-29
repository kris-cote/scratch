# BeyondCode Deploy — Replit Deep Certification Fixture

Purpose-built Git-backed Replit migration fixture.

This app is intentionally small but stateful so BeyondCode Deploy can prove a real Replit-hosted source boundary and then migrate it to portable infrastructure.

Reference state after first boot:
- 2 synthetic users
- 2 profiles
- 2 role rows
- 5 projects
- 15 tasks
- 3 activity events
- 0 automation runs
- SQLite database with explicit schema
- admin/member authorization
- idempotent daily overdue scan
- health and migration-readiness endpoints

The fixture is certification-only and contains no real personal data.

## Run

npm install
npm start

The app listens on PORT (default 3000).

## Certification scope

The migration must preserve or deliberately transition:
- application source
- database schema and records
- user identities
- profiles and roles
- authorization behavior
- audit history
- scheduled/background behavior
- configuration names
- runtime health/readiness

The fixture's built-in credentials are synthetic test credentials only and must never be reused outside this isolated certification app.
