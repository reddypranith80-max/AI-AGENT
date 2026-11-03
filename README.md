# Flight Hotel

Flight + hotel search, combined booking, live flight tracking and email notifications.
Next.js 15 · Prisma/Postgres · BullMQ/Redis · React Email/Resend · Mapbox GL.

```
apps/web         Next.js app (UI, route handlers, SSE)
apps/worker      BullMQ consumers + schedulers (tracking polls, price scans, emails, reminders)
packages/domain  Shared types, Zod schemas, pure logic (sorting, filtering, time zones). No I/O
packages/db      Prisma schema, migrations, client (soft-delete extension), reference-data seed
packages/providers  Vendor adapters: Amadeus flights/hotels, FlightAware, Mapbox geocoding + keyless mocks
packages/api     Server services: search, booking, tracking, notifications, alerts, cache, pub/sub, queues
packages/emails  React Email templates (booking, price drop, flight status, check-in)
```

## Run it (no API keys needed)

Without credentials the app uses deterministic **mock** flight, hotel and tracking providers, so every screen works out of the box.

```bash
pnpm install
cp .env.example .env              # set AUTH_SECRET (openssl rand -base64 32)
docker compose up -d              # Postgres + Redis (Redis is optional in dev)
pnpm db:migrate                   # applies prisma/migrations
pnpm --filter @fh/db seed:reference   # airports + airlines (OpenFlights)
pnpm dev                          # http://localhost:3000  (AUTH_DEV_LOGIN=true → sign in with any email)
pnpm worker                       # needs REDIS_URL; without Redis, events and tracking run in-process
```

Without `REDIS_URL` everything runs in one process: events fire in-process, SSE falls back to DB re-reads and
lazily polls the tracking provider. Set `REDIS_URL` and run the worker for the production topology.

## Going live

| Need | Set |
|---|---|
| Live fares + hotels | `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET`, `AMADEUS_BASE_URL` |
| Live tracking | `TRACKING_PROVIDER=flightaware`, `FLIGHTAWARE_API_KEY` |
| Email | `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET` (webhook → `/api/webhooks/resend`) |
| Maps | `NEXT_PUBLIC_MAPBOX_TOKEN` (an SVG map is used otherwise) |
| Sign-in | `RESEND_API_KEY` (magic link) and/or `AUTH_GOOGLE_ID/SECRET`; dev login is disabled in production |
| Security | `AUTH_SECRET`, `PII_ENCRYPTION_KEY` (required in production), `UNSUBSCRIBE_SECRET` |
| Payments | `PAYMENT_MODE=stripe` leaves bookings `PENDING` until your payment webhook calls `confirmBooking()` (Stripe not wired yet) |

## How the pieces fit

- **Search** — `packages/api/src/flights.ts`, `hotels.ts`: normalize → cache (Redis, 5–10 min) → coalesce concurrent identical searches → outbound rate limit. Sorting/filtering are pure functions shared with the client, so changing them never refetches.
- **Flight ↔ hotel link** — hotel search params derive from the chosen flight (`hotelSearchFromFlight`). In the DB, `booking_hotels.bookingId` points at the same `bookings` row as the `booking_flights`; `createBooking()` writes all of it in one transaction.
- **Tracking** — worker `tracking.tick` (30 s) claims due `flight_instances` → `poll-flight` jobs → `applySnapshot()` updates the row, appends a position, records `flight_status_events`, publishes to Redis pub/sub (→ SSE `/api/track/[id]`) and emits `flight.status.changed`. Polling cadence adapts: 6 h → 30 min → 5 min → ~90 s in the air; stops on landed/cancelled/diverted or when nobody watches.
- **Email** — emitters publish typed events (`booking.created`, `flight.status.changed`, `price.alert.triggered`, `checkin.reminder.due`); handlers in `packages/api/src/notify.ts` send through one idempotent path (`sendTemplated`: preferences → suppression list → dedupe key → render → Resend). Check-in reminders are delayed jobs plus a DB sweeper safety net.

## Testing

```bash
pnpm typecheck
pnpm --filter @fh/api test:e2e     # integration test against DATABASE_URL (booking tx, idempotency, tracking, emails)
```
