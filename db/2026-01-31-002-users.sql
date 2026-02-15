CREATE TABLE "users" (
  "id" SERIAL PRIMARY KEY,
  "username" VARCHAR(255) UNIQUE NOT NULL,
  "email" VARCHAR(255) UNIQUE NOT NULL,
  "auth_token" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now()
);
