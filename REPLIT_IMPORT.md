# Replit import handoff — BeyondCode Deploy deep-cert fixture

Use this exact immutable Git-backed fixture for the Replit source-boundary certification.

Repository: kris-cote/scratch
Branch: certification/replit-deep-fixture-v1
Validated commit: 110821ec5fc2bf9f74a71d90885418ec0a4494a2
GitHub Actions run: 36505494606 (passed)

## Import

1. Open Replit's Import page.
2. Choose GitHub.
3. Select repository kris-cote/scratch.
4. Select branch certification/replit-deep-fixture-v1.
5. Import without asking Replit Agent to rewrite or modify the code.
6. Start the app. The included .replit file uses npm start.
7. Leave the app in its initial seeded state until BeyondCode runs the source-state certification.

## Expected initial source state

- users: 2
- profiles: 2
- user_roles: 2
- projects: 5
- tasks: 15
- activity_events: 3
- automation_runs: 0

The fixture includes:
- email/password auth for two synthetic users
- admin/member roles
- member delete denial / admin delete permission
- project/task CRUD
- append-only audit events
- health endpoint
- migration-readiness endpoint
- idempotent daily overdue scan scheduled with node-cron
- explicit SQLite schema
- Dockerfile for portable target deployment

Do not add real data or real credentials. This app is an isolated migration-certification fixture.
