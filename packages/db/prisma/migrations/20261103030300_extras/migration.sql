-- Things Prisma's schema language can't express: extensions, partial indexes, CHECK constraints.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Airport autocomplete (name / city / code)
CREATE INDEX "airports_search_trgm" ON "airports"
  USING gin ((lower("name" || ' ' || "city" || ' ' || "iata")) gin_trgm_ops);

-- Hot-path partial indexes
CREATE INDEX "price_watches_due" ON "price_watches" ("nextCheckAt")
  WHERE "active" AND "deletedAt" IS NULL;
CREATE INDEX "bookings_pending_expiry" ON "bookings" ("expiresAt")
  WHERE "status" = 'PENDING';
CREATE INDEX "flight_status_events_unsent" ON "flight_status_events" ("detectedAt")
  WHERE "fannedOutAt" IS NULL;
CREATE INDEX "flight_instances_due" ON "flight_instances" ("nextPollAt")
  WHERE "nextPollAt" IS NOT NULL;

-- Invariants
ALTER TABLE "price_watches" ADD CONSTRAINT "price_watches_has_rule"
  CHECK ("targetPriceMinor" IS NOT NULL OR "dropPercent" IS NOT NULL);
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_total_nonneg" CHECK ("totalMinor" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_le_amount" CHECK ("refundedMinor" <= "amountMinor");
ALTER TABLE "booking_hotels" ADD CONSTRAINT "booking_hotels_dates" CHECK ("checkOut" > "checkIn");
ALTER TABLE "flight_segments" ADD CONSTRAINT "flight_segments_times" CHECK ("arriveAt" > "departAt");
