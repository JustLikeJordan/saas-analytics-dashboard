-- Fix ai_summaries RLS policy to match canonical pattern
-- Original (0007) was missing WITH CHECK, admin bypass, and the safe current_setting(_, true) form

DROP POLICY "ai_summaries_org_isolation" ON "ai_summaries";
--> statement-breakpoint

CREATE POLICY "ai_summaries_tenant_isolation" ON "ai_summaries"
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true)::integer)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::integer);
--> statement-breakpoint

CREATE POLICY "ai_summaries_admin_bypass" ON "ai_summaries"
  FOR ALL
  USING (COALESCE(current_setting('app.is_admin', true)::boolean, false) = true);
