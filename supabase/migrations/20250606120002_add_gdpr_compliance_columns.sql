-- Migration: Add GDPR compliance columns to user_secrets table
-- Phase 6: Token Refresh & GDPR Compliance
-- Created: 2025-06-06 12:00:02

-- Add deleted_at column for GDPR soft delete functionality
-- This allows us to mark secrets as deleted while maintaining them for retention period
ALTER TABLE "public"."user_secrets" 
ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

-- Add index on deleted_at for efficient cleanup queries
CREATE INDEX IF NOT EXISTS "idx_user_secrets_deleted_at" 
ON "public"."user_secrets" USING btree ("deleted_at");

-- Add composite index for retention cleanup queries (deleted_at + created_at)
CREATE INDEX IF NOT EXISTS "idx_user_secrets_retention_cleanup" 
ON "public"."user_secrets" USING btree ("deleted_at", "created_at") 
WHERE "deleted_at" IS NOT NULL;

-- Add version column for secret versioning (future use)
ALTER TABLE "public"."user_secrets" 
ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1;

-- Add retention policy column for flexible retention periods
ALTER TABLE "public"."user_secrets" 
ADD COLUMN IF NOT EXISTS "retention_days" integer DEFAULT 30;

-- Add compliance metadata columns
ALTER TABLE "public"."user_secrets" 
ADD COLUMN IF NOT EXISTS "deletion_reason" text;

ALTER TABLE "public"."user_secrets" 
ADD COLUMN IF NOT EXISTS "compliance_flags" jsonb DEFAULT '{}';

-- Create function for GDPR-compliant soft delete
CREATE OR REPLACE FUNCTION public.gdpr_soft_delete_user_secret(
  p_user_id uuid,
  p_secret_name text,
  p_deletion_reason text DEFAULT 'User request - GDPR Article 17'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  affected_count integer;
  result jsonb;
BEGIN
  -- Soft delete the secret by setting deleted_at
  UPDATE "public"."user_secrets"
  SET 
    deleted_at = timezone('utc'::text, now()),
    deletion_reason = p_deletion_reason,
    compliance_flags = compliance_flags || jsonb_build_object(
      'gdpr_deletion_requested', true,
      'deletion_timestamp', extract(epoch from timezone('utc'::text, now())),
      'deletion_method', 'soft_delete'
    ),
    updated_at = timezone('utc'::text, now())
  WHERE 
    user_id = p_user_id 
    AND secret_name = p_secret_name 
    AND deleted_at IS NULL;
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  
  result := jsonb_build_object(
    'success', affected_count > 0,
    'affected_count', affected_count,
    'status_code', CASE WHEN affected_count > 0 THEN 204 ELSE 404 END,
    'timestamp', extract(epoch from timezone('utc'::text, now())),
    'deletion_reason', p_deletion_reason
  );
  
  RETURN result;
END;
$function$;

-- Create function for GDPR-compliant hard delete
CREATE OR REPLACE FUNCTION public.gdpr_hard_delete_user_secret(
  p_user_id uuid,
  p_secret_name text,
  p_deletion_reason text DEFAULT 'User request - GDPR Article 17 - Right to be forgotten'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  affected_count integer;
  result jsonb;
BEGIN
  -- Hard delete the secret completely
  DELETE FROM "public"."user_secrets"
  WHERE 
    user_id = p_user_id 
    AND secret_name = p_secret_name;
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  
  result := jsonb_build_object(
    'success', affected_count > 0,
    'affected_count', affected_count,
    'status_code', CASE WHEN affected_count > 0 THEN 204 ELSE 404 END,
    'timestamp', extract(epoch from timezone('utc'::text, now())),
    'deletion_reason', p_deletion_reason,
    'deletion_method', 'hard_delete'
  );
  
  RETURN result;
END;
$function$;

-- Create function for automated retention cleanup
CREATE OR REPLACE FUNCTION public.cleanup_expired_secrets(
  p_batch_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  cleanup_count integer;
  total_processed integer := 0;
  batch_record record;
  result jsonb;
BEGIN
  -- Process secrets that are past their retention period
  FOR batch_record IN
    SELECT id, user_id, secret_name, deleted_at, retention_days
    FROM "public"."user_secrets"
    WHERE 
      deleted_at IS NOT NULL 
      AND deleted_at < (timezone('utc'::text, now()) - (retention_days || ' days')::interval)
    ORDER BY deleted_at ASC
    LIMIT p_batch_size
  LOOP
    -- Hard delete expired secret
    DELETE FROM "public"."user_secrets" WHERE id = batch_record.id;
    total_processed := total_processed + 1;
    
    -- Update user to require reauth
    UPDATE "public"."users"
    SET 
      spotify_vault_secret_id = NULL,
      spotify_reauth_required = true,
      updated_at = timezone('utc'::text, now())
    WHERE id = batch_record.user_id;
  END LOOP;
  
  result := jsonb_build_object(
    'success', true,
    'secrets_cleaned', total_processed,
    'batch_size', p_batch_size,
    'timestamp', extract(epoch from timezone('utc'::text, now()))
  );
  
  RETURN result;
END;
$function$;

-- Grant execute permissions on GDPR functions to appropriate roles
GRANT EXECUTE ON FUNCTION public.gdpr_soft_delete_user_secret(uuid, text, text) TO "service_role";
GRANT EXECUTE ON FUNCTION public.gdpr_hard_delete_user_secret(uuid, text, text) TO "service_role";
GRANT EXECUTE ON FUNCTION public.cleanup_expired_secrets(integer) TO "service_role";

-- Update Row Level Security policies to handle soft-deleted secrets
-- Users cannot see their soft-deleted secrets (privacy protection)
DROP POLICY IF EXISTS "Users can manage their own secrets" ON "public"."user_secrets";
CREATE POLICY "Users can manage their active secrets" ON "public"."user_secrets"
    FOR ALL USING (
      auth.uid() = user_id 
      AND deleted_at IS NULL
    );

-- Service role can access all secrets including soft-deleted ones (for cleanup)
DROP POLICY IF EXISTS "Service role can manage all secrets" ON "public"."user_secrets";
CREATE POLICY "Service role can manage all secrets" ON "public"."user_secrets"
    FOR ALL TO "service_role" USING (true);

-- Create audit log table for GDPR compliance tracking
CREATE TABLE IF NOT EXISTS "public"."gdpr_audit_log" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" uuid NOT NULL,
    "secret_name" text NOT NULL,
    "operation" text NOT NULL, -- 'soft_delete', 'hard_delete', 'cleanup'
    "status_code" integer NOT NULL,
    "deletion_reason" text,
    "vault_latency_ms" integer,
    "compliance_metadata" jsonb DEFAULT '{}',
    "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable RLS on audit log
ALTER TABLE "public"."gdpr_audit_log" ENABLE ROW LEVEL SECURITY;

-- Add constraints and indexes for audit log
ALTER TABLE "public"."gdpr_audit_log" ADD CONSTRAINT "gdpr_audit_log_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."gdpr_audit_log" ADD CONSTRAINT "gdpr_audit_log_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

CREATE INDEX "idx_gdpr_audit_log_user_id" ON "public"."gdpr_audit_log" USING btree ("user_id");
CREATE INDEX "idx_gdpr_audit_log_operation" ON "public"."gdpr_audit_log" USING btree ("operation");
CREATE INDEX "idx_gdpr_audit_log_created_at" ON "public"."gdpr_audit_log" USING btree ("created_at");

-- Grant permissions on audit log
GRANT SELECT, INSERT ON TABLE "public"."gdpr_audit_log" TO "service_role";

-- Service role can access audit logs
CREATE POLICY "Service role can manage audit logs" ON "public"."gdpr_audit_log"
    FOR ALL TO "service_role" USING (true);

-- Update schema version
INSERT INTO "public"."supabase_migrations" ("version", "checksum") 
VALUES ('20250606120002', 'gdpr_compliance_v1') 
ON CONFLICT ("version") DO UPDATE SET 
    "applied_at" = timezone('utc'::text, now()),
    "checksum" = EXCLUDED."checksum";

-- Add comment for documentation
COMMENT ON TABLE "public"."user_secrets" IS 'User secrets storage with GDPR compliance features including soft delete and retention policies';
COMMENT ON COLUMN "public"."user_secrets"."deleted_at" IS 'Timestamp when secret was soft-deleted for GDPR compliance';
COMMENT ON COLUMN "public"."user_secrets"."retention_days" IS 'Number of days to retain soft-deleted secrets before hard deletion';
COMMENT ON COLUMN "public"."user_secrets"."deletion_reason" IS 'Reason for deletion for GDPR compliance auditing';
COMMENT ON COLUMN "public"."user_secrets"."compliance_flags" IS 'GDPR compliance metadata and flags';

COMMENT ON TABLE "public"."gdpr_audit_log" IS 'Audit trail for GDPR compliance operations on user secrets';
COMMENT ON FUNCTION public.gdpr_soft_delete_user_secret(uuid, text, text) IS 'GDPR-compliant soft delete function with audit trail';
COMMENT ON FUNCTION public.gdpr_hard_delete_user_secret(uuid, text, text) IS 'GDPR-compliant hard delete function with audit trail';
COMMENT ON FUNCTION public.cleanup_expired_secrets(integer) IS 'Automated cleanup of expired soft-deleted secrets'; 