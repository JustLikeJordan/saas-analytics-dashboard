-- Dual-role setup for RLS enforcement
-- app_admin (POSTGRES_USER) = superuser, owns the DB, runs migrations
-- app_user = restricted role, RLS policies apply to all queries

CREATE ROLE app_user LOGIN PASSWORD 'app';
GRANT CONNECT ON DATABASE analytics TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- app_admin already exists (POSTGRES_USER), just make BYPASSRLS explicit
ALTER ROLE app_admin BYPASSRLS;
