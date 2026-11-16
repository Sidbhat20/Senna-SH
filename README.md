# Senna-SH

SportsHunt v2: a tournament platform for Bangalore. Organisers publish events with categories, draw fixtures,
schedule matches across courts, run a check-in desk and score live; players find events, register and follow results.

Launch sports: badminton, table tennis, pickleball and football.

## Stack

Next.js 15 (App Router, server actions), TypeScript, Tailwind CSS 4, Supabase (Postgres with row level security,
auth, realtime, storage) and Vitest.

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL and anon key
npm run dev                  # http://localhost:3000
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm test` | Fixture engine, scheduler and scoring tests, plus every SQL migration run in an in-memory Postgres |
| `npm run build` | Production build |
| `npm run db:migrate` | Apply new files in `supabase/migrations` to the Supabase project (needs `SUPABASE_ACCESS_TOKEN`) |

## Where things live

- `src/lib/fixtures/`: draw formats (knockout, league, groups, double elimination), scheduling, club separation, scoring
- `supabase/migrations/`: schema, access rules and match logic (registration, draws, scoring, walkovers)
- `src/app/`: pages and server actions
