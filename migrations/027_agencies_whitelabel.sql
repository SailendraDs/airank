-- Migration 027: Agencies + white-label + multi-client (Epic J)

CREATE TABLE IF NOT EXISTS agencies (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug varchar UNIQUE,
  logo_url text,
  favicon_url text,
  primary_color varchar,
  secondary_color varchar,
  custom_domain varchar UNIQUE,
  support_email varchar,
  email_from_name text,
  hide_powered_by boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agencies_owner_idx ON agencies (owner_user_id);

CREATE TABLE IF NOT EXISTS agency_clients (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id varchar NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  client_name text,
  client_contact_email varchar,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agency_clients_agency_idx ON agency_clients (agency_id);
CREATE INDEX IF NOT EXISTS agency_clients_brand_idx ON agency_clients (brand_id);
CREATE UNIQUE INDEX IF NOT EXISTS agency_clients_unique_idx ON agency_clients (agency_id, brand_id);
