# Gym Manager — Member management

React (Vite) app for registering gym members. Runs entirely in the browser; no server needed.

## Features
- Registration form: name, phone, plan (Monthly / Quarterly / Half-yearly / Yearly), fee, start date
- Auto-generated member IDs: `GYM-001`, `GYM-002`, … `GYM-999`, then `GYM-1000` and on
- Phone numbers cleaned automatically (`098765 43210` → `+91 98765 43210`)
- Expiry calculated automatically with correct month-ends (31 Jan + 1 month = 28 Feb)
- Duplicate phone numbers blocked (in the form and during import)
- Bulk import from Excel (.xlsx / .xls / .csv) with a preview, error list and downloadable template
- WhatsApp consent checkbox
- Member list with search and Active / Expiring (≤7 days) / Expired status

## Run locally
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests for phone, date, ID, duplicate and import rules
```

## Deploy to Vercel
1. Push this folder to a GitHub repo.
2. In Vercel: **Add New → Project**, import the repo.
3. Vercel detects Vite automatically (build `npm run build`, output `dist`). Click **Deploy**.

## Login
The app is behind a login. Passwords are checked on the server (`api/login.js`, a Vercel
serverless function), never in React. A correct login sets a signed, httpOnly cookie; the app
asks `/api/me` on load and shows the login screen when there is no valid cookie.

### Creating accounts (Sign up page)
Accounts live in two environment variables, `AUTH_SECRET` and `AUTH_USERS`
(`owner:<hash>,frontdesk:<hash>`), because the app has no database yet.

**Locally (easiest):** run `npm run dev`, open the app and click **Create an account**. It saves
the account (password hashed, never stored in plain text) into `.env.local` and you can sign in
straight away. It also creates `AUTH_SECRET` the first time. Only requests from your own machine
can write to the file.

**On Vercel:** the deployed site can't change its own environment variables, so the Sign up page
shows the `username:hash` line instead. Add it to `AUTH_USERS` under
**Project → Settings → Environment Variables** (separate users with a comma) and redeploy.
The same line works for accounts you made locally — copy it from `.env.local`. Also set
`AUTH_SECRET` on Vercel (any long random string; `npm run hash-password -- --secret` makes one).

Prefer the command line? `npm run hash-password` asks for a password (hidden) and prints the hash.

To remove or change a user, edit `AUTH_USERS` and redeploy (removing a user signs them out).
Sessions last 7 days. Limits: accounts only become active on Vercel after someone adds them to
`AUTH_USERS` (no self-service sign-up on the live site, no password reset), and member data is
still stored per browser — the login protects the app, it doesn't sync data between devices.
When you want true self-service accounts and shared data, move to Supabase.

### Admins
The first account in `AUTH_USERS` is the **admin**; everyone else is **staff**. Only admins see the
**Settings** tab. To choose admins yourself, list them in `AUTH_ADMINS` (e.g. `owner,manager`).

## Backup setup (Google Sheets / OneDrive)
Admins open **Settings** and click **Connect Google** or **Connect Microsoft**. After that the app
copies all members to the sheet/file a moment after every add, import or delete. It is a **one-way
backup**: edits made in the sheet are not read back. The sign-in is saved in that admin's browser only.

Each service needs a free app registration once. These client ids are public (not secrets):

**Google Sheets**
1. [Google Cloud Console](https://console.cloud.google.com/) → create a project → **APIs & Services → Library** → enable **Google Sheets API**.
2. **OAuth consent screen** → External → add your own Google address under **Test users**.
3. **Credentials → Create credentials → OAuth client ID → Web application**. Under *Authorized JavaScript origins* add
   `http://localhost:5173` and your Vercel address (e.g. `https://your-app.vercel.app`).
4. Copy the client id into `VITE_GOOGLE_CLIENT_ID`.

While the consent screen is in *Testing* mode Google shows "this app isn't verified" — click **Advanced → Continue**.
That's expected for an app only you use.

**OneDrive (Excel)**
1. [Azure portal](https://portal.azure.com/) → **Microsoft Entra ID → App registrations → New registration**.
2. Supported account types: *Accounts in any organizational directory and personal Microsoft accounts*.
3. Redirect URI: platform **Single-page application**, value `http://localhost:5173`. After creating it, add your Vercel
   address under **Authentication** too.
4. Copy the **Application (client) ID** into `VITE_MICROSOFT_CLIENT_ID`. The default permissions (`User.Read`)
   are fine; the app asks for `Files.ReadWrite` when you connect.

Put both ids in `.env.local` (restart `npm run dev`) and in Vercel **Environment Variables**, then redeploy —
`VITE_` values are baked in when the site is built.

How it behaves:
- **Google** creates a new "Gym Manager Members" spreadsheet, or uses a sheet link you paste (its `Members` tab is
  replaced on every backup — the app asks first if that tab already exists). The sign-in lasts about an hour; after that
  the header shows **Reconnect backup** (one click). Changes made meanwhile are included in the next backup.
- **OneDrive** writes one `.xlsx` (default `Gym Manager/Members.xlsx`), replacing it each time. Microsoft renews the
  sign-in quietly, so reconnecting is rare.
- The sheet's columns match the Excel import template, so a backup can be re-imported with **Import from Excel**.
- Disconnecting stops backups; it never deletes your sheet or file.

## Storing members in Google Sheets
Members live in a **private Google Sheet**. The browser never talks to Google: it calls `/api/members`
(which needs your login), and that server code reads and writes the sheet using a Google *service
account* (a robot user that can only see sheets you share with it). Nothing is stored in the browser,
so every device and browser sees the same list.

One-time setup (about 5 minutes, free):
1. [Google Cloud Console](https://console.cloud.google.com/) → create a project → **APIs & Services → Library**
   → enable **Google Sheets API**.
2. **IAM & Admin → Service Accounts → Create service account** (any name, skip the optional steps).
3. Open it → **Keys → Add key → Create new key → JSON**. A file downloads. Keep it private; never commit it.
4. Create a new Google Sheet, click **Share**, paste the service account's email (the `client_email` in the
   JSON file) and give it **Editor** access.
5. Put three values in `.env.local` (restart `npm run dev`) **and** in Vercel → Settings → Environment Variables,
   then redeploy:
   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL=<client_email from the JSON>
   GOOGLE_PRIVATE_KEY="<private_key from the JSON, in double quotes, keeping the \n parts>"
   GOOGLE_SHEET_ID=<the sheet's link, or the id between /d/ and /edit>
   ```
   These are secrets, so they must **not** start with `VITE_`.

The app creates a `Members` tab with the header row on first use. You can open the sheet and read or fix
rows by hand (keep the **Member ID** column filled in, and don't insert rows above the header); changes
show up next time the page loads. Deleting a member deletes its row.

If the browser still holds members from the old localStorage version, a banner offers to upload them
to the sheet once.

Good to know: Google Sheets is not a real database. It is fine for one gym with a few hundred
members and a couple of staff, but two people saving at the exact same moment can briefly collide, and
every save takes about a second. If you outgrow it, replace `src/lib/storage.js` and `api/members.js`.

## Project layout
```
src/lib/members.js        all business rules (IDs, phone, expiry, validation, import)
src/lib/storage.js        load/save members
src/components/MemberForm.jsx
src/components/MemberList.jsx
src/components/BulkImport.jsx
src/components/Login.jsx, SignUp.jsx
src/components/Settings.jsx   admin-only: connect Google / OneDrive backup
src/lib/auth.js           browser side: session check, login, logout
src/lib/backup/           rows, Google + Microsoft sign-in and API calls, engine
src/lib/useBackup.js      auto-backup after every change
api/                      login, me, logout (Vercel functions) + _lib/auth.js
scripts/hash-password.mjs makes password hashes / AUTH_SECRET
test/members.test.mjs
test/auth.test.mjs, signup.test.mjs, backup.test.mjs
```
