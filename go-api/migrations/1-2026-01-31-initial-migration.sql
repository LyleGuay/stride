START TRANSACTION;

-- this is the initial migration where we setup base tables.

CREATE TEMP TABLE _migration(version INT, description TEXT);                                                                                                
INSERT INTO _migration VALUES (1, 'Initial Migration');  

DO $$                                                                                                                                                       
BEGIN                                                                                                                                                       
  IF EXISTS (SELECT 1 FROM schema_versions sv JOIN _migration m ON sv.version = m.version) THEN                                                             
    RAISE EXCEPTION 'Migration already applied';                                                                                                            
  END IF;                                                                                                                                                   
END $$;                                                                                                                                                

-- Schema versions for tracking migrations
CREATE TABLE "schema_versions" (
  version integer PRIMARY KEY,
  description character varying(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Users table for basic user tracking
CREATE TABLE "users" (
  "id" SERIAL PRIMARY KEY,
  "username" VARCHAR(255) UNIQUE NOT NULL,
  "email" VARCHAR(255) UNIQUE NOT NULL,
  "auth_token" TEXT NOT NULL,
  "password" TEXT NOT NULL
);

-- Habits
CREATE TYPE "habits_cadence_enum" AS ENUM ('daily', 'weekly');
CREATE TABLE "habits" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(255) NOT NULL,
  "cadence" "habits_cadence_enum" NOT NULL
);


INSERT INTO habits (name, cadence) VALUES ('Food (Default or Cook)', 'daily');
INSERT INTO habits (name, cadence) VALUES ('Calories (In budget or within 100)', 'daily');
  
INSERT INTO schema_versions SELECT * FROM _migration; 

COMMIT;
