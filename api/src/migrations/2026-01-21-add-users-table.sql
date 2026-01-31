-- Migration: 1
-- Description: Create users, habits tables
-- Generated: 2026-01-22T01:42:58.789Z

CREATE TABLE "users" (
  "id" SERIAL PRIMARY KEY,
  "username" VARCHAR(255) NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "auth_token" TEXT NOT NULL,
  "password" TEXT NOT NULL
);

CREATE TYPE "habits_cadence_enum" AS ENUM ('daily', 'weekly');
CREATE TABLE "habits" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(255) NOT NULL,
  "cadence" "habits_cadence_enum" NOT NULL
);
