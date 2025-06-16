-- Migration: Add user_secrets table for local development fallback
-- and update users table with vault-related columns
-- Created: 2025-06-06 12:00:01

-- Create user_secrets table for local development fallback
-- This table will store encrypted secrets when Supabase Vault is not available
CREATE TABLE IF NOT EXISTS "public"."user_secrets" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" uuid NOT NULL,
    "secret_name" text NOT NULL,
    "secret_data" text NOT NULL, -- JSON blob (encrypted in production)
    "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    "updated_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable RLS on user_secrets table
ALTER TABLE "public"."user_secrets" ENABLE ROW LEVEL SECURITY;

-- Add primary key constraint
ALTER TABLE "public"."user_secrets" ADD CONSTRAINT "user_secrets_pkey" PRIMARY KEY ("id");

-- Add foreign key constraint to users table
ALTER TABLE "public"."user_secrets" ADD CONSTRAINT "user_secrets_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

-- Add unique constraint to prevent duplicate secrets per user
ALTER TABLE "public"."user_secrets" ADD CONSTRAINT "user_secrets_user_secret_unique" 
    UNIQUE ("user_id", "secret_name");

-- Create indexes for performance
CREATE INDEX "idx_user_secrets_user_id" ON "public"."user_secrets" USING btree ("user_id");
CREATE INDEX "idx_user_secrets_secret_name" ON "public"."user_secrets" USING btree ("secret_name");

-- Add vault-related columns to users table
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "spotify_vault_secret_id" text;
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "spotify_reauth_required" boolean DEFAULT false;

-- Create index on vault secret ID for performance
CREATE INDEX IF NOT EXISTS "idx_users_vault_secret_id" ON "public"."users" USING btree ("spotify_vault_secret_id");

-- Update trigger function to handle updated_at for user_secrets
CREATE OR REPLACE FUNCTION public.set_updated_at_user_secrets()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$function$;

-- Create trigger for user_secrets updated_at
CREATE TRIGGER set_user_secrets_updated_at
    BEFORE UPDATE ON "public"."user_secrets"
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_user_secrets();

-- Grant permissions for user_secrets table
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."user_secrets" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."user_secrets" TO "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."user_secrets" TO "service_role";

-- Row Level Security policies for user_secrets
-- Users can only access their own secrets
CREATE POLICY "Users can manage their own secrets" ON "public"."user_secrets"
    FOR ALL USING (auth.uid() = user_id);

-- Service role can access all secrets (for admin operations)
CREATE POLICY "Service role can manage all secrets" ON "public"."user_secrets"
    FOR ALL TO "service_role" USING (true);

-- Create schema version tracking table if it doesn't exist
CREATE TABLE IF NOT EXISTS "public"."supabase_migrations" (
    "version" text NOT NULL PRIMARY KEY,
    "applied_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    "checksum" text
);

-- Insert current schema version
INSERT INTO "public"."supabase_migrations" ("version", "checksum") 
VALUES ('20250606120001', 'vault_integration_v1') 
ON CONFLICT ("version") DO UPDATE SET 
    "applied_at" = timezone('utc'::text, now()),
    "checksum" = EXCLUDED."checksum";

-- Grant permissions on migrations table
GRANT SELECT ON TABLE "public"."supabase_migrations" TO "anon";
GRANT SELECT ON TABLE "public"."supabase_migrations" TO "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."supabase_migrations" TO "service_role"; 