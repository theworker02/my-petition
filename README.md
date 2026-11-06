# My Petition

**Your voice. Your impact.**

My Petition is an open-source, mobile-friendly public participation app where anyone with an account can start a petition or public poll, share a support/oppose position, and participate in discussion. It is not an official election, scientific survey, or legally verified signature platform.

## What works in this alpha

- Beautiful, animated responsive interface with proposal cards, a rich proposal detail view, vote selection, animated result bars, and reduced-motion support.
- User accounts with PBKDF2-SHA-256 passwords, unique salts, hashed session tokens and HttpOnly session cookies.
- Petitions and polls with categories, a location label, descriptions and optional closing dates.
- Support/oppose voting with one recorded position per account per proposal; positions can be changed.
- An optional per-vote public display name. Anonymous-display votes remain attached to accounts internally.
- Real persisted counts from D1, no invented vote totals.
- Proposal discovery with search, category filtering, sorting and pagination.
- Public comments, account activity, and author-controlled proposal closing.
- Basic rate limiting and optional Cloudflare Turnstile for registration.

## Stack

React 19 + TypeScript + Vite + React Router + Lucide React; Hono on Cloudflare Workers; Cloudflare D1; Cloudflare Workers Static Assets. No Netlify deployment required.

## Run locally

Requires Node.js 22 or newer.

1. Clone the repository.
2. Run: npm install
3. Run: npm run db:local
4. Run: npm run dev
5. Open http://127.0.0.1:5173

Local API runs at http://127.0.0.1:8787 and Vite proxies requests to it. The placeholder D1 database UUID works for local development. The local database lives in the untracked .wrangler directory.

## Deploy to Cloudflare

1. Run: npx wrangler login
2. Run: npx wrangler d1 create my-petition-db
3. Replace the placeholder database_id in wrangler.jsonc with the real ID returned by Cloudflare.
4. Run: npm run db:remote
5. Set up Cloudflare Turnstile and configure TURNSTILE_SITE_KEY and TURNSTILE_SECRET on the Worker before opening registrations publicly.
6. Run: npm run deploy

The Worker serves API routes and static UI together. This repository does not yet configure automatic deployments, DNS or a custom domain.

## API endpoints

| Method | Endpoint | Function |
|---|---|---|
| GET | /api/session | Session information |
| GET | /api/stats | Aggregate counts |
| GET | /api/proposals | Search and browse |
| GET | /api/proposals/:slug | Proposal, comments and participants |
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Sign in |
| POST | /api/auth/logout | Sign out |
| POST | /api/proposals | Create proposal |
| POST | /api/proposals/:slug/vote | Cast or update vote |
| POST | /api/proposals/:slug/comments | Public discussion |
| POST | /api/proposals/:slug/close | Author closes proposal |
| GET | /api/me/activity | Account activity |

## Safety and privacy

**An anonymous-display vote is NOT an anonymous ballot.** My Petition stores an account link to limit repeat voting, but does not publicly show the name unless the participant opts in. Public comments show account display names. Account display names may be pseudonyms.

**One vote per account does NOT guarantee one vote per person.** Accounts are not identity- or email-verified in this alpha. Results are self-selected online responses, not scientific samples. The platform cannot substitute for statutory petitions, binding referenda or election systems.

Before a public production launch: add email verification and account recovery, consent and privacy policies, content reporting, moderation and abuse prevention, account deletion, fraud prevention, accessibility and security testing, operational monitoring, and compliant data retention. Turnstile is strongly recommended before permitting public registration. Basic API throttles are not sufficient by themselves.

## Product principles

Provide equal affordances to support and oppose. Always show the source of the counts. Do not fabricate testimonials, participants, votes, or percentages. Allow individuals to choose name visibility. Communicate clearly whether results are unofficial.

## Planned milestones

Email verification, moderation/reporting, saved proposals, notifications, sharing/embedding, location-specific verified participation, E2E tests and automated deployment.
