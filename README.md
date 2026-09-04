# 15days.io

AI-powered recruitment and asynchronous video interview platform.

> **Status:** Phase 1 of the implementation plan (see below) — design system, theme
> system, marketing site, authentication, dashboard shell, and database schema.
> Phases 2–6 (job/interview CRUD, candidate interview experience, AI evaluation,
> ATS pipeline, analytics, hardening) build on this foundation.

## Architecture

- **Framework:** Next.js 14 (App Router) + React 18 + TypeScript (strict)
- **Styling:** Tailwind CSS + a token-based design system (`src/styles/globals.css`),
  shadcn/ui-style components on Radix primitives, `next-themes` for light/dark
- **Database:** PostgreSQL via Prisma (`prisma/schema.prisma`) — see schema for the
  full normalized model (organizations, jobs, interviews, candidates, applications,
  video responses, evaluations, pipeline, audit log, integrations)
- **Auth:** NextAuth (credentials + OAuth-ready), Prisma adapter, JWT sessions,
  route protection via `src/middleware.ts` (only `/dashboard/*` requires a session —
  candidate interview links are public by design)
- **Authorization:** every server action re-verifies `user → organization membership
  → role → resource ownership` (`src/lib/authz.ts`); no resource id from the client
  is trusted without that check
- **AI / video / storage:** provider abstractions are scaffolded (see
  `.env.example`) so the app runs without live credentials and can be wired to a
  real provider without architectural changes
- **Background jobs:** BullMQ + Redis for video/AI processing (queue architecture
  defined in Phase 4)

## Local setup

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis (for background jobs — optional until Phase 4)

### Install

```bash
npm install
cp .env.example .env
# edit .env — at minimum set DATABASE_URL and NEXTAUTH_SECRET
```

Generate a secret:

```bash
openssl rand -base64 32
```

### Database

```bash
npm run db:generate   # generate Prisma client
npm run db:migrate    # create and apply migrations (dev)
npm run db:seed       # load realistic demo data (Acme Technologies org)
```

Seed creates a demo login:

```
email:    demo@acme.test
password: Demo1234
```

### Development

```bash
npm run dev
```

Visit `http://localhost:3000`.

### Type-checking, linting, tests

```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e   # Playwright, once configured with a running app
```

## Production build

```bash
npm run build
npm run start
```

For production, run migrations with:

```bash
npm run db:deploy
```

## AI provider configuration

Set `AI_PROVIDER` (`openai`, `anthropic`, or `gemini`) and the matching API key (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`) in `.env`. Optionally set `AI_MODEL` to override the default model for whichever provider you chose. Switching providers is an environment-variable change only — no code changes needed, since both question generation (`src/lib/ai.ts`) and resume/answer evaluation (`src/lib/ai-evaluation.ts`) call through the same shared provider abstraction in `src/lib/ai-provider.ts`.
Question generation and candidate evaluation both go through a single provider
abstraction so switching providers doesn't require touching call sites. Until a
key is configured, AI-dependent routes return a clear "provider not configured"
error rather than silently faking output.

Speech-to-text is configured separately via `STT_PROVIDER` (`openai` for
Whisper, or `assemblyai`).

## Storage configuration

Video responses and CVs are stored via an S3-compatible object storage
abstraction (`STORAGE_PROVIDER=s3`), working with AWS S3 or Cloudflare R2.
Set `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ENDPOINT` (for R2 or non-AWS
S3), and credentials in `.env`. The frontend never receives storage credentials
directly — uploads go through signed URLs issued by the server.

## Deployment

The app is Google Cloud and Cloudflare compatible:

1. Provision Postgres (Cloud SQL, Neon, Supabase, etc.) and Redis.
2. Set all `.env.example` variables in your hosting provider's environment
   configuration — never commit real secrets.
3. Run `npm run db:deploy` against the production database as part of your
   deploy step.
4. Deploy the Next.js app (Vercel, Cloud Run, or any Node-compatible host).

## Environment variables

See `.env.example` for the full list with inline documentation.

## Project structure

```
src/
  app/                  # App Router routes
    (auth)/             # login, signup, forgot/reset password
    (dashboard)/         # recruiter dashboard (protected)
    api/                # route handlers
  components/
    ui/                 # design-system primitives (button, card, badge, ...)
    marketing/          # landing page sections
    dashboard/          # sidebar, topbar, charts
  lib/
    auth.ts             # NextAuth config
    authz.ts            # server-side authorization helpers
    db.ts               # Prisma client singleton
    email.ts            # email provider abstraction
    validations/        # Zod schemas
    queries/            # server-side data access
  styles/globals.css    # design tokens (light + dark)
prisma/
  schema.prisma
  seed.ts
```

## Implementation phases

1. **Phase 1 (this codebase):** project init, design system, theme system,
   landing page, authentication, dashboard shell, database schema
2. **Phase 2:** job CRUD, AI interview question generation, interview links
3. **Phase 3:** candidate interview experience, camera/mic, video recording, CV upload
4. **Phase 4:** AI transcription, evaluation, scoring, ranking
5. **Phase 5:** ATS pipeline, candidate profile, reports, analytics
6. **Phase 6:** security hardening, accessibility, performance, testing, deployment
