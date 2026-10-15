# Gym Membership System

A simple gym management web app: members, plans, subscriptions, payments,
a check-in desk, a dashboard, and an audit log — with role-based access
(Owner / Staff / Member).

## Stack
- **Backend:** Node.js + Express
- **Storage:** a small JSON file (`data/db.json`, created automatically on first run) — no database server to install, no native modules to compile
- **Frontend:** plain HTML/CSS/JavaScript (Bootstrap 5 + Font Awesome + Chart.js via CDN) — no build step, no framework

## Setup

You need [Node.js](https://nodejs.org) installed (LTS version, 18+).

```bash
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

## Default login
- Username: `admin`
- Password: `admin123`

This account is seeded automatically the first time the server runs.

## Loading demo data (recommended for a viva/demo)
Instead of typing test data by hand, run the seed script once:

```bash
# stop the server first (Ctrl+C) if it's running
node seed.js
npm start
```

This wipes `data/db.json` and rebuilds it with 8 members, 4 plans, 9 subscriptions
spread across every status (Active / Expired / Cancelled), payments including a
partial balance and a refund, and check-in history for the last 7 days
(including one member currently checked in). It also creates a Staff account
and two Member portal logins so you can demo all three roles:

- Owner: `admin` / `admin123`
- Staff: `staff1` / `staff123`
- Member: `GM-0001` / `9000000001` (or `GM-0002` / `9000000002`)

## Notes
- All data lives in `data/db.json`. Delete that file (with the server stopped)
  to reset the app back to a blank state with just the admin account.
- "Forgot password" isn't wired to real email in this build (that needs an
  SMTP/email service, not worth the setup for a local demo) — the admin can
  edit `data/db.json` directly, or the user can just sign up again.
- To change the app's port, set the `PORT` environment variable before
  `npm start` (defaults to 3000).

## What's intentionally simplified
This covers the core of a gym management system, not the full feature set:
freeze/hold on memberships, class scheduling, a leads/CRM pipeline, expense
tracking, and automated email reminders were left out to keep this buildable
and debuggable in one sitting. The code is structured (gate → validate →
write → log, price snapshot on sale, derived outstanding) so any of those
could be added without restructuring what's here.
