-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "PassengerType" AS ENUM ('ADULT', 'CHILD', 'INFANT');

-- CreateEnum
CREATE TYPE "TripType" AS ENUM ('ONE_WAY', 'ROUND_TRIP');

-- CreateEnum
CREATE TYPE "CabinClass" AS ENUM ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('FLIGHT', 'FLIGHT_HOTEL');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'TICKETED', 'CANCELLED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "HotelBookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('REQUIRES_PAYMENT', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FlightDirection" AS ENUM ('OUTBOUND', 'RETURN');

-- CreateEnum
CREATE TYPE "FlightStatus" AS ENUM ('SCHEDULED', 'BOARDING', 'DEPARTED', 'EN_ROUTE', 'LANDED', 'DELAYED', 'CANCELLED', 'DIVERTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FlightStatusEventKind" AS ENUM ('DELAY', 'ETA_CHANGE', 'CANCELLATION', 'GATE_CHANGE', 'TERMINAL_CHANGE', 'DEPARTED', 'LANDED', 'DIVERTED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'PUSH', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_CONFIRMATION', 'BOOKING_CANCELLED', 'PAYMENT_FAILED', 'PRICE_DROP', 'FLIGHT_DELAYED', 'FLIGHT_CANCELLED', 'FLIGHT_LANDED', 'FLIGHT_DEPARTED', 'FLIGHT_GATE_CHANGE', 'SCHEDULE_CHANGE', 'CHECKIN_REMINDER', 'ACCOUNT');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'BOUNCED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('BOUNCE', 'COMPLAINT', 'UNSUBSCRIBE_ALL', 'MANUAL');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "emailVerified" TIMESTAMPTZ(3),
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passengers" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "gender" "Gender" NOT NULL DEFAULT 'UNSPECIFIED',
    "nationality" CHAR(2),
    "passportNumberEnc" TEXT,
    "passportExpiry" DATE,
    "passportCountry" CHAR(2),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bookingEmail" BOOLEAN NOT NULL DEFAULT true,
    "priceAlerts" BOOLEAN NOT NULL DEFAULT true,
    "flightStatus" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" INTEGER,
    "quietHoursEnd" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "airlines" (
    "iata" CHAR(2) NOT NULL,
    "icao" CHAR(3),
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "airlines_pkey" PRIMARY KEY ("iata")
);

-- CreateTable
CREATE TABLE "airports" (
    "iata" CHAR(3) NOT NULL,
    "icao" CHAR(4),
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "airports_pkey" PRIMARY KEY ("iata")
);

-- CreateTable
CREATE TABLE "search_requests" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "tripType" "TripType" NOT NULL,
    "origin" CHAR(3) NOT NULL,
    "destination" CHAR(3) NOT NULL,
    "departDate" DATE NOT NULL,
    "returnDate" DATE,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "cabin" "CabinClass" NOT NULL DEFAULT 'ECONOMY',
    "resultCount" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "search_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "routeKey" TEXT NOT NULL,
    "origin" CHAR(3) NOT NULL,
    "destination" CHAR(3) NOT NULL,
    "departDate" DATE NOT NULL,
    "returnDate" DATE,
    "cabin" "CabinClass" NOT NULL,
    "lowestMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(12) NOT NULL,
    "userId" UUID NOT NULL,
    "type" "BookingType" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "totalMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_flights" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "pnr" TEXT,
    "direction" "FlightDirection" NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "fareRules" JSONB,
    "raw" JSONB,
    "ticketedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_flights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_segments" (
    "id" UUID NOT NULL,
    "bookingFlightId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "airlineIata" CHAR(2) NOT NULL,
    "flightNumber" TEXT NOT NULL,
    "originIata" CHAR(3) NOT NULL,
    "destinationIata" CHAR(3) NOT NULL,
    "departAt" TIMESTAMPTZ(3) NOT NULL,
    "arriveAt" TIMESTAMPTZ(3) NOT NULL,
    "aircraft" TEXT,
    "cabin" "CabinClass" NOT NULL,
    "flightInstanceId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flight_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_passengers" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "passengerId" UUID,
    "type" "PassengerType" NOT NULL DEFAULT 'ADULT',
    "snapshot" JSONB NOT NULL,
    "ticketNumber" TEXT,
    "seat" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_hotels" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "providerBookingId" TEXT,
    "hotelId" TEXT NOT NULL,
    "hotelName" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "guests" INTEGER NOT NULL DEFAULT 1,
    "roomType" TEXT,
    "totalMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "cancellationPolicy" JSONB,
    "freeCancellationUntil" TIMESTAMPTZ(3),
    "status" "HotelBookingStatus" NOT NULL DEFAULT 'PENDING',
    "raw" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'REQUIRES_PAYMENT',
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "refundedMinor" BIGINT NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_events" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_instances" (
    "id" UUID NOT NULL,
    "airlineIata" CHAR(2) NOT NULL,
    "flightNumber" TEXT NOT NULL,
    "originIata" CHAR(3) NOT NULL,
    "destinationIata" CHAR(3) NOT NULL,
    "scheduledDepartAt" TIMESTAMPTZ(3) NOT NULL,
    "scheduledArriveAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "FlightStatus" NOT NULL DEFAULT 'SCHEDULED',
    "estimatedDepartAt" TIMESTAMPTZ(3),
    "estimatedArriveAt" TIMESTAMPTZ(3),
    "actualDepartAt" TIMESTAMPTZ(3),
    "actualArriveAt" TIMESTAMPTZ(3),
    "delayMinutes" INTEGER,
    "depTerminal" TEXT,
    "depGate" TEXT,
    "arrTerminal" TEXT,
    "arrGate" TEXT,
    "baggageBelt" TEXT,
    "providerRef" TEXT,
    "lastPolledAt" TIMESTAMPTZ(3),
    "nextPollAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flight_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_positions" (
    "id" BIGSERIAL NOT NULL,
    "flightInstanceId" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "altitudeFt" INTEGER,
    "speedKts" INTEGER,
    "headingDeg" INTEGER,
    "onGround" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flight_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_status_events" (
    "id" UUID NOT NULL,
    "flightInstanceId" UUID NOT NULL,
    "kind" "FlightStatusEventKind" NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "detectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fannedOutAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flight_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_watches" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tripType" "TripType" NOT NULL,
    "origin" CHAR(3) NOT NULL,
    "destination" CHAR(3) NOT NULL,
    "departDate" DATE NOT NULL,
    "returnDate" DATE,
    "cabin" "CabinClass" NOT NULL DEFAULT 'ECONOMY',
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "targetPriceMinor" BIGINT,
    "dropPercent" DECIMAL(5,2),
    "baselineMinor" BIGINT,
    "lastSeenMinor" BIGINT,
    "lastNotifiedMinor" BIGINT,
    "lastCheckedAt" TIMESTAMPTZ(3),
    "nextCheckAt" TIMESTAMPTZ(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "price_watches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_subscriptions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "flightInstanceId" UUID NOT NULL,
    "bookingId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flight_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bookingId" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "type" "NotificationType" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_suppressions" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_hotels" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "hotelId" TEXT NOT NULL,
    "hotelName" TEXT NOT NULL,
    "cityName" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "saved_hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_webhook_events" (
    "id" UUID NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "eventId" TEXT NOT NULL,
    "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "endpoint" TEXT NOT NULL,
    "statusCode" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "costMicros" INTEGER,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "api_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expires_idx" ON "sessions"("expires");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE INDEX "passengers_userId_deletedAt_idx" ON "passengers"("userId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "airlines_icao_key" ON "airlines"("icao");

-- CreateIndex
CREATE UNIQUE INDEX "airports_icao_key" ON "airports"("icao");

-- CreateIndex
CREATE INDEX "airports_city_idx" ON "airports"("city");

-- CreateIndex
CREATE INDEX "airports_countryCode_idx" ON "airports"("countryCode");

-- CreateIndex
CREATE INDEX "search_requests_userId_createdAt_idx" ON "search_requests"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "search_requests_origin_destination_departDate_idx" ON "search_requests"("origin", "destination", "departDate");

-- CreateIndex
CREATE INDEX "price_snapshots_routeKey_departDate_capturedAt_idx" ON "price_snapshots"("routeKey", "departDate", "capturedAt" DESC);

-- CreateIndex
CREATE INDEX "price_snapshots_capturedAt_idx" ON "price_snapshots"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_reference_key" ON "bookings"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_idempotencyKey_key" ON "bookings"("idempotencyKey");

-- CreateIndex
CREATE INDEX "bookings_userId_createdAt_idx" ON "bookings"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "bookings_userId_status_idx" ON "bookings"("userId", "status");

-- CreateIndex
CREATE INDEX "bookings_status_expiresAt_idx" ON "bookings"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "bookings_deletedAt_idx" ON "bookings"("deletedAt");

-- CreateIndex
CREATE INDEX "booking_flights_bookingId_idx" ON "booking_flights"("bookingId");

-- CreateIndex
CREATE INDEX "booking_flights_pnr_idx" ON "booking_flights"("pnr");

-- CreateIndex
CREATE UNIQUE INDEX "booking_flights_provider_providerOrderId_direction_key" ON "booking_flights"("provider", "providerOrderId", "direction");

-- CreateIndex
CREATE INDEX "flight_segments_airlineIata_flightNumber_departAt_idx" ON "flight_segments"("airlineIata", "flightNumber", "departAt");

-- CreateIndex
CREATE INDEX "flight_segments_flightInstanceId_idx" ON "flight_segments"("flightInstanceId");

-- CreateIndex
CREATE INDEX "flight_segments_originIata_departAt_idx" ON "flight_segments"("originIata", "departAt");

-- CreateIndex
CREATE UNIQUE INDEX "flight_segments_bookingFlightId_seq_key" ON "flight_segments"("bookingFlightId", "seq");

-- CreateIndex
CREATE INDEX "booking_passengers_bookingId_idx" ON "booking_passengers"("bookingId");

-- CreateIndex
CREATE INDEX "booking_passengers_passengerId_idx" ON "booking_passengers"("passengerId");

-- CreateIndex
CREATE INDEX "booking_hotels_bookingId_idx" ON "booking_hotels"("bookingId");

-- CreateIndex
CREATE INDEX "booking_hotels_checkIn_idx" ON "booking_hotels"("checkIn");

-- CreateIndex
CREATE INDEX "booking_hotels_provider_providerBookingId_idx" ON "booking_hotels"("provider", "providerBookingId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripePaymentIntentId_key" ON "payments"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "payments_bookingId_idx" ON "payments"("bookingId");

-- CreateIndex
CREATE INDEX "payments_status_createdAt_idx" ON "payments"("status", "createdAt");

-- CreateIndex
CREATE INDEX "booking_events_bookingId_createdAt_idx" ON "booking_events"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "flight_instances_status_scheduledDepartAt_idx" ON "flight_instances"("status", "scheduledDepartAt");

-- CreateIndex
CREATE INDEX "flight_instances_nextPollAt_idx" ON "flight_instances"("nextPollAt");

-- CreateIndex
CREATE INDEX "flight_instances_originIata_scheduledDepartAt_idx" ON "flight_instances"("originIata", "scheduledDepartAt");

-- CreateIndex
CREATE UNIQUE INDEX "flight_instances_airlineIata_flightNumber_scheduledDepartAt_key" ON "flight_instances"("airlineIata", "flightNumber", "scheduledDepartAt");

-- CreateIndex
CREATE INDEX "flight_positions_flightInstanceId_recordedAt_idx" ON "flight_positions"("flightInstanceId", "recordedAt" DESC);

-- CreateIndex
CREATE INDEX "flight_positions_recordedAt_idx" ON "flight_positions"("recordedAt");

-- CreateIndex
CREATE INDEX "flight_status_events_flightInstanceId_detectedAt_idx" ON "flight_status_events"("flightInstanceId", "detectedAt");

-- CreateIndex
CREATE INDEX "flight_status_events_fannedOutAt_detectedAt_idx" ON "flight_status_events"("fannedOutAt", "detectedAt");

-- CreateIndex
CREATE INDEX "price_watches_userId_active_idx" ON "price_watches"("userId", "active");

-- CreateIndex
CREATE INDEX "price_watches_active_nextCheckAt_idx" ON "price_watches"("active", "nextCheckAt");

-- CreateIndex
CREATE INDEX "price_watches_origin_destination_departDate_idx" ON "price_watches"("origin", "destination", "departDate");

-- CreateIndex
CREATE INDEX "flight_subscriptions_flightInstanceId_idx" ON "flight_subscriptions"("flightInstanceId");

-- CreateIndex
CREATE INDEX "flight_subscriptions_bookingId_idx" ON "flight_subscriptions"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "flight_subscriptions_userId_flightInstanceId_key" ON "flight_subscriptions"("userId", "flightInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_status_createdAt_idx" ON "notifications"("status", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_providerMessageId_idx" ON "notifications"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "email_suppressions_email_key" ON "email_suppressions"("email");

-- CreateIndex
CREATE UNIQUE INDEX "saved_hotels_userId_provider_hotelId_key" ON "saved_hotels"("userId", "provider", "hotelId");

-- CreateIndex
CREATE INDEX "processed_webhook_events_processedAt_idx" ON "processed_webhook_events"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "processed_webhook_events_source_eventId_key" ON "processed_webhook_events"("source", "eventId");

-- CreateIndex
CREATE INDEX "api_audit_logs_provider_createdAt_idx" ON "api_audit_logs"("provider", "createdAt");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passengers" ADD CONSTRAINT "passengers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_requests" ADD CONSTRAINT "search_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_flights" ADD CONSTRAINT "booking_flights_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_segments" ADD CONSTRAINT "flight_segments_bookingFlightId_fkey" FOREIGN KEY ("bookingFlightId") REFERENCES "booking_flights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_segments" ADD CONSTRAINT "flight_segments_airlineIata_fkey" FOREIGN KEY ("airlineIata") REFERENCES "airlines"("iata") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_segments" ADD CONSTRAINT "flight_segments_originIata_fkey" FOREIGN KEY ("originIata") REFERENCES "airports"("iata") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_segments" ADD CONSTRAINT "flight_segments_destinationIata_fkey" FOREIGN KEY ("destinationIata") REFERENCES "airports"("iata") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_segments" ADD CONSTRAINT "flight_segments_flightInstanceId_fkey" FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_passengers" ADD CONSTRAINT "booking_passengers_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_passengers" ADD CONSTRAINT "booking_passengers_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "passengers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_hotels" ADD CONSTRAINT "booking_hotels_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_instances" ADD CONSTRAINT "flight_instances_airlineIata_fkey" FOREIGN KEY ("airlineIata") REFERENCES "airlines"("iata") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_instances" ADD CONSTRAINT "flight_instances_originIata_fkey" FOREIGN KEY ("originIata") REFERENCES "airports"("iata") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_instances" ADD CONSTRAINT "flight_instances_destinationIata_fkey" FOREIGN KEY ("destinationIata") REFERENCES "airports"("iata") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_positions" ADD CONSTRAINT "flight_positions_flightInstanceId_fkey" FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_status_events" ADD CONSTRAINT "flight_status_events_flightInstanceId_fkey" FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_watches" ADD CONSTRAINT "price_watches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_subscriptions" ADD CONSTRAINT "flight_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_subscriptions" ADD CONSTRAINT "flight_subscriptions_flightInstanceId_fkey" FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_subscriptions" ADD CONSTRAINT "flight_subscriptions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_hotels" ADD CONSTRAINT "saved_hotels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
