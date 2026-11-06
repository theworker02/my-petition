<div align="center">
  <img src="public/icon.svg" width="78" alt="My Petition logo">

  # My Petition
  **Your voice. Your impact.**

  A beautifully designed platform for petitions, community proposals, and public opinion polls.

  [![CI](https://github.com/theworker02/my-petition/actions/workflows/ci.yml/badge.svg)](https://github.com/theworker02/my-petition/actions/workflows/ci.yml)
  ![Stage](https://img.shields.io/badge/release-1.0.0--rc.1-6c52f6)
  ![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20TypeScript-3c338c)
  ![Runtime](https://img.shields.io/badge/runtime-Cloudflare%20Workers-f48120)

  **[Getting started](#quick-start) · [How to use](#how-to-use-my-petition) · [Screenshots](#screenshots) · [Deployment](#deploy-to-cloudflare)**
</div>

> [!IMPORTANT]
> **My Petition is a 1.0.0 release candidate, not yet a confirmed live production deployment or legally certified signature service.** The application is built to run on Cloudflare Workers + D1 and has a gated production workflow. A site operator must supply live Cloudflare, Turnstile and email configuration, run end-to-end launch checks, and approve final policies before public release. Guest responses are voluntary online participation, not a representative survey or a binding election.

## Screenshots

Screenshots below are captured automatically from the **running React application** with a **local, synthetic demo dataset**—not from a design mockup and not from live public submissions. They are refreshed by the [UI screenshots workflow](.github/workflows/screenshots.yml).

### Home and discovery

![My Petition homepage — desktop](docs/screenshots/home-desktop.png)

![Explore petitions — desktop](docs/screenshots/explore-desktop.png)

### Proposal details and creation

| Proposal page | Create a petition |
|---|---|
| <img src="docs/screenshots/petition-detail-desktop.png" alt="Detailed petition page with voting, signatures, and participant information" width="590"> | <img src="docs/screenshots/create-petition-desktop.png" alt="Create petition form and preview" width="590"> |

### Mobile experience

<p align="center"><img src="docs/screenshots/petition-detail-mobile.png" alt="My Petition responsive mobile proposal page" width="330"></p>

## What is My Petition?

My Petition lets communities discuss a clear question, record support and opposition, and optionally collect electronic signatures. It combines a responsive participation experience with transparent, auditable workflows.

- **No registration for participation.** Create a petition, vote, comment, or start email verification for an e-signature as a guest. Cloudflare Turnstile challenges protect guest posting and participation when production is configured. A guest cookie associates activity with the current browser; clearing cookies or changing devices may make that activity inaccessible.
- **Optional account to save petitions.** Create an account or log in to build a personal saved collection. Accounts do not automatically merge prior guest activity.
- **Petitions and polls.** Petition pages have a separate opt-in electronic signing experience. Poll pages collect support or opposition.
- **Optional name display.** Guest voters choose whether to show a display name; comments always show a chosen public name. Names in ordinary votes can be hidden, but vote storage is **not cryptographically anonymous**.
- **Tamper-evident electronic signatures.** Verify an email address, enter a legal name, explicitly consent to the petition, and receive a private JSON receipt. New records include a timestamp, petition fingerprint, protected metadata and a server-held HMAC integrity seal. Anyone with the unpredictable receipt ID can check integrity without seeing the signer name or email. This is **not independent identity verification or legal certification**.
- **Local participation controls.** Creators can limit votes and signatures to independently approved local participants. Locality claims begin as *pending*, and a moderator must separately verify eligibility using documented evidence.
- **Share, embed, and follow.** Copy links, use the browser share sheet, copy iframe embed markup, receive in-app notifications, or save petitions with an account.
- **Community safety.** Report proposals or comments for review; an allowlisted, email-verified moderator may review reports and hide content.

### How the platform works

| Feature | Guest, no account | Registered account | Additional requirement |
|---|---|---|---|
| Browse proposals and results | Yes | Yes | None |
| Create petitions or polls | Yes | Yes | Public creator display name for guests |
| Vote support / oppose | Yes | Yes | Verified local eligibility when enabled |
| Comment | Yes | Yes | Public display name |
| Electronically sign petitions | Yes | Yes | Verified email, full name and explicit consent |
| Save a petition | No | Yes | Sign in |
| Receive in-app activity notifications | Guest session | Yes | An active session |
| Moderation dashboard | No | Eligible moderator | Verified email on allowlist |

## How to use My Petition

### 1. Browse or explore a proposal

Open the homepage and select **Explore petitions**. Browse the proposal cards or filter by topic and search by title, description, or location. Each card shows support and oppose counts; they come from stored responses, not fabricated live statistics.

### 2. Create a petition or poll

Select **Create petition**. If you are not signed in, supply a public creator display name. Add a descriptive question (12–140 characters), explain the context (60–10,000 characters), select **Petition** or **Public poll**, and choose the category. A location label and closing date are optional.

If the proposal requires independently verified local voters, enable that option and supply the relevant city/town and state/region. Click **Publish proposal**. Keep the browser's guest cookie if you want to manage the proposal later.

### 3. Vote on a proposal

Open the proposal. Select **I support this** or **I oppose this**. You can choose whether your display name appears next to your position; anonymous display is the default. Click **Submit my vote**. A browser guest session or account ties the response to a participant record and lets that participant update the vote while the proposal is open.

**Important:** Guest-cookie enforcement is not one-person-one-vote identity verification. A different browser, cleared cookies, or multiple devices can create duplicate responses.

### 4. Electronically sign a petition

Only petitions have a signing panel.

1. Open a petition and select **Electronically sign**.
2. Submit an email address and enter the six-digit code sent to that address.
3. Enter your full legal name and review the exact petition before signing.
4. Optionally make your signer name public. Check the explicit electronic-signature consent box.
5. Confirm the signature and **Download your signature receipt**. Keep the receipt private—it includes your name and email address. If you explicitly opt in, your full legal name can appear in the public signer directory.

A signature is recorded separately from a support/oppose vote. Its database record includes the verified email, exact document hash, consent version, signing timestamp, and protected connection fingerprints. **Email ownership is not proof of identity; this is not qualified/digital-certificate signing or government certification.**

### 4a. Verify a signature receipt

1. Download the private receipt and open its **Verify integrity of receipt** link, or visit `/verify-signature`.
2. Enter the receipt UUID from `receipt.id`.
3. The server checks whether the stored signing evidence still matches the original integrity seal and returns the petition link and document fingerprint.
4. The public verification response intentionally excludes the signer's name, email, account ID, IP fingerprint, and private connection metadata.

New signatures use a keyed HMAC seal protected by `AUDIT_HASH_SECRET`. Previous signatures without an integrity seal are labeled **unsealed**, never cryptographically verified. Losing or rotating this secret without a managed migration can make older seals unverifiable.

**Limits:** The same site operator controls the database and seal key. This is server-side tamper evidence, not independent certification. It does not establish the person's legal identity, physical residence or eligibility. Statutory petition rules may not accept these signatures.

### 5. Request local verification, when required

For a locality-restricted proposal, first verify your email, then submit your city, state/region and postal code. The request is marked **pending** until a moderator checks independent evidence and records the verification method. Merely providing a city or email never makes a participant verified.

### 6. Share and save

Use **Share the discussion** to copy a direct URL, native share action, or HTML iframe embed code. The embed shows aggregate participation and links back to the original proposal. **Save petition** prompts for sign-in when needed; saved petitions appear under **My activity**.

### 7. Report content

Use **Report** on a proposal or comment. Select an issue category and optionally add details. Reported content enters a moderator review queue. Authorized moderators can dismiss reports or hide reported material. Reports do not change vote counts.

## Quick start

**Requirements:** Node.js 22 or newer, npm, and a clone of this repository. You do **not** need a Netlify project or a paid domain for local development.

~~~bash
git clone https://github.com/theworker02/my-petition.git
cd my-petition
npm install
npm run db:local
npm run dev
~~~

Open **http://127.0.0.1:5173** in your browser. Vite serves the React UI and proxies the API to a local Cloudflare Worker at **http://127.0.0.1:8787**.

The sample D1 UUID in `wrangler.jsonc` is intentionally a placeholder for **local** development; it must be replaced for remote deployment. Your local database and development environment variables are excluded from Git.

For a clean frontend compile and backend configuration check:

~~~bash
npm run typecheck
npm run build
npm run db:local
npx wrangler deploy --dry-run
npm run test:smoke
~~~

### API smoke tests

Run `npm run test:smoke` after a local database migration and frontend build. The suite launches a local Cloudflare Worker and validates guest participation, vote changes, public comments, duplicate reports, optional saved proposals, local eligibility gates, and traceable signing. For signatures, it inserts a synthetic verified-email fixture in local D1 and uses a temporary test-only audit secret: **it never sends actual email or touches production records**.

### Run a local demo dataset (screenshots/testing only)

This fixture populates example proposals, fake participants, comments and votes in your **local** database:

~~~bash
npx wrangler d1 execute my-petition-db --local --file=fixtures/screenshot-seed.sql
~~~

**Never run the screenshot seed against production.** To regenerate the screenshots, run the [Capture UI screenshots](.github/workflows/screenshots.yml) GitHub Actions workflow, which starts the app locally and captures actual Chromium pages. The generated images are committed to `docs/screenshots/`.

## Deploy to Cloudflare Workers

My Petition uses **one Cloudflare Worker with Static Assets** for both the Vite/React website and the Hono API, plus a **Cloudflare D1** database. **Cloudflare Pages is unnecessary**: there is no second frontend deployment, no Netlify project, and no paid custom domain required. A `*.workers.dev` address can be used once the Worker is deployed and the Cloudflare account has a Workers subdomain.

Deployment is **deliberately manual and gated** from [GitHub Actions: Deploy production](.github/workflows/production.yml). Pushing code or passing CI **does not publish the website**. The `wrangler.jsonc` database ID is a local-only placeholder, not a live database.

### Step 1. Set up Cloudflare D1 and Turnstile

1. Sign in at [Cloudflare Dashboard](https://dash.cloudflare.com/). Locate your **Account ID** and create a scoped **API token** that can manage Workers scripts and the My Petition D1 database. Do not paste the token into code, issues or chat.
2. From your own terminal, authenticate with Cloudflare and create the database:

   ```bash
npx wrangler login
npx wrangler d1 create my-petition-db
```

3. Copy the real D1 **database UUID** to GitHub's environment variables (next step), not to the placeholder in the tracked development configuration.
4. In [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile), create a widget for your future site. Store both the **site key** and **secret key**. If you use a `workers.dev` URL, add its hostname to the allowed Turnstile domains. Guest posts, comments, votes and reports are challenged when Turnstile is configured.
5. In [Resend](https://resend.com/), verify the email sender domain you are authorized to use, create an API key, and select a support contact address. The email provider's sender domain must match the configured `MAIL_FROM` address.

### Step 2. Configure GitHub Actions

Go to [Repository settings → Environments](https://github.com/theworker02/my-petition/settings/environments), create an environment named **production**, and apply reviewer restrictions where available. Then configure the following **environment secrets and variables** (under the selected environment).

| Name | GitHub type | Required | Purpose |
|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Yes | 32-character Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Secret | Yes | Scoped Workers and D1 deployment permission |
| `D1_DATABASE_ID` | Variable | Yes | Existing My Petition D1 database UUID |
| `RESEND_API_KEY` | Secret | Yes | Sends email verification and password-recovery messages |
| `MAIL_FROM` | Variable | Yes | Verified sender address, for example `My Petition <noreply@example.org>` |
| `EMAIL_OTP_SECRET` | Secret | Yes | Random secret for verification codes and reset links |
| `AUDIT_HASH_SECRET` | Secret | Yes | Different random secret for signature sealing and rate-limit keys |
| `TURNSTILE_SITE_KEY` | Variable | Yes | Public Cloudflare anti-bot site key |
| `TURNSTILE_SECRET` | Secret | Yes | Private Cloudflare anti-bot verification key |
| `MODERATOR_EMAILS` | Variable | Yes | Comma-separated approved moderator email addresses |
| `SITE_SUPPORT_EMAIL` | Variable | Yes | Public contact for the website |
| `PRODUCTION_BASE_URL` | Variable | Optional | Public HTTPS origin (recommended after the first deployment) |

Generate the two distinct 32+ character hash secrets locally:

```bash
openssl rand -hex 32
openssl rand -hex 32
```


Protect these values as long-lived cryptographic keys. **Rotating the signature-audit key without a key-versioning migration invalidates prior receipt seals.** Cloudflare credentials must be least-privilege and must not be committed.

### Step 3. Deploy with the guarded workflow

1. Confirm that the standard [CI](.github/workflows/ci.yml) workflow is green and that the [screenshot gallery](#screenshots) builds successfully.
2. Go to [GitHub Actions → Deploy production](https://github.com/theworker02/my-petition/actions/workflows/production.yml).
3. Select **Run workflow** for `main`.
4. The workflow validates all required values, builds the app, applies all remote D1 schema migrations, deploys the Worker and static assets with the secrets, then checks the public `/api/ready` endpoint.
5. A green deployment workflow is necessary but **not sufficient**: complete the verification checklist below before announcing the site.

The `scripts/prepare-production.mjs` release script creates ignored, temporary config and secret files. If required values are missing or the D1 UUID is a placeholder, it fails before applying remote migrations. On an existing deployment, **back up D1 and review the migration plan before running the release workflow**.

### Step 4. Launch verification checklist

- [ ] A real `workers.dev` or custom-domain URL loads with HTTPS and correct routing to the API.
- [ ] `GET /api/ready` returns `{"ready":true,"production":true}` from the **deployed** site.
- [ ] Guest visitor can create a proposal, select support or opposition, comment and submit a report with working Turnstile.
- [ ] Resend delivers a one-time code to a **real**, operator-controlled email inbox; invalid and expired codes are rejected.
- [ ] Operator verifies one signed petition receipt, duplicate signature rejection, privacy-safe receipt verification and local-eligibility enforcement.
- [ ] Password recovery works from a genuine received email, invalidates old sessions, and cannot be reused.
- [ ] Moderator's verified email can access the review queue; a regular visitor cannot. Test hiding content and reviewing local evidence.
- [ ] Registered and guest visitors can export and delete their own data; deletion does not expose others' private information.
- [ ] Operator establishes backup and restoration procedures, sets incident escalation, verifies security headers, and reviews accessibility on both desktop and mobile.
- [ ] Final, jurisdiction-appropriate **Privacy Policy**, **Terms**, moderation/appeals rules, consent retention, and support contact are approved and published. Current in-app legal disclosures are preliminary, not legal counsel's reviewed policies.
- [ ] No screenshot fixtures or fake votes have been imported into **remote** D1; screenshots use a separate local demo database.

The operator should perform a controlled beta or canary test and confirm those checks before promoting `1.0.0-rc.1` to a stable public `1.0.0` release.

### Cloudflare pricing and architecture

Cloudflare Workers can host the UI and API together, and D1 supplies persistent storage. An account's free-plan limits, email-provider quotas and future custom domain costs should be checked directly before advertising a zero-cost service. There is no requirement to buy a domain for the initial `workers.dev` deployment.

### Core security notes

- Guest cookies and browser challenges **do not verify unique human identity**; online tallies must not be presented as binding votes or accurate census polling.
- Verified email is **not** independently verified legal identity, and manual local checks are not automatically reliable proof of residency.
- The HMAC-based receipt records remain controlled by the service operator; they are not qualified independent e-signatures.
- API rate limiting uses HMAC-derived keys in D1, subject to normal scaling limitations. Cloudflare WAF rules, bot monitoring, and incident alerting should also be enabled before a wider public launch.

## Project layout

~~~text
my-petition/
├── src/
│   ├── App.tsx            # Pages, authentication UI, voting and proposal views
│   ├── account.tsx        # Password recovery, privacy export/deletion and legal disclosures
│   ├── turnstile.tsx      # Shared anti-bot verification UI
│   ├── features.tsx       # Signatures, verification, sharing, moderation, notifications
│   ├── api.ts             # Typed API client
│   ├── styles.css         # Core design system and responsive UI
│   └── features.css       # Component styling
├── worker/index.ts        # Cloudflare Worker API (Hono)
├── migrations/            # Versioned D1 migrations and signature integrity seal
├── shared/signature.ts     # Versioned e-signature consent text used by UI and API
├── fixtures/              # Local-only example data for screenshots
├── scripts/               # Automated Chromium screenshot capture
├── docs/screenshots/      # Actual captured UI images (generated)
├── .github/workflows/     # CI, screenshot capture, and gated production deployment
├── scripts/prepare-production.mjs # Validated ephemeral Worker release config
├── wrangler.jsonc         # Worker and D1 configuration
└── package.json           # Local commands and dependencies
~~~

## Core API

| Endpoint | Purpose |
|---|---|
| `GET /api/proposals` | Browse and search |
| `GET /api/proposals/:slug` | Proposal, votes, participant display and comments |
| `POST /api/proposals` | Guest or registered proposal creation |
| `POST /api/proposals/:slug/vote` | Submit or update a response |
| `POST /api/proposals/:slug/sign` | Record consent-based electronic signature |
| `GET /api/signatures/:id/verify` | Verify a receipt seal without disclosing signer identity |
| `GET /api/proposals/:slug/signature-receipt` | Signer's private receipt |
| `POST /api/verification/email/request` | Email a verification code |
| `POST /api/verification/email/confirm` | Verify a code |
| `POST /api/verification/location/request` | Submit pending local eligibility request |
| `POST /api/proposals/:slug/save` | Save a petition (requires account) |
| `GET /api/me/activity` | Created, voted, and saved proposals |
| `GET /api/me/notifications` | In-app notification list |
| `POST /api/reports` | Report a proposal or comment |
| `GET /api/moderation/queue` | Moderator-only review queue |
| `GET /api/ready` | Check live production configuration and database connectivity |
| `POST /api/auth/password-reset/request` | Request a single-use password recovery link |
| `POST /api/auth/password-reset/confirm` | Confirm a valid recovery token and revoke old sessions |
| `GET /api/me/export` | Download user or guest-session data |
| `DELETE /api/me/account` | Permanently erase account or guest-session data |

## Privacy, trust and limitations

- **Anonymous display ≠ secret ballot.** A name-hidden vote remains linked to an internal participant ID. E-signature evidence must remain private and only accessible to authorized parties.
- **Guest identity is weak.** A cookie-based visitor can register again in another browser. Scores and tallies are advisory.
- **Email verification is not identity verification.** Owning an email inbox does not establish legal name, residency, or uniqueness.
- **Legal treatment of signatures varies.** The app records intent and sealed evidence, but server-held integrity seals are not an independent attestation. They do not provide qualified signatures, independently verified identity or automatic statutory petition eligibility.
- **Local verification is not automated.** Moderators need a reliable independent identity/residency-check process and privacy-safe evidence handling.
- **Public launch is not yet approved.** Basic throttling, account recovery, self-service export/deletion and a guarded release workflow now exist, but public release still requires provider setup, a manual live test, backup/recovery drills, guest-to-account migration, moderation appeals, a final privacy/retention review and an accessibility audit.

## Contribution and development principles

Avoid fabricated public participation totals or misleading endorsements. Make support and opposition equally accessible, and never use persuasive UI patterns to steer users toward a particular position. Build accessibility, mobile responsiveness, privacy, and moderation into new features by default.

**Maintainer:** [theworker02](https://github.com/theworker02) · **Status:** 1.0.0 release candidate — pending production verification
