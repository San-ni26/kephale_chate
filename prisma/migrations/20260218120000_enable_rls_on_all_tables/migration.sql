-- Enable Row Level Security (RLS) on all public schema tables
-- This addresses Supabase Security Advisor warnings: rls_disabled_in_public
-- and sensitive_columns_exposed (User.password, EventInvitation.token, UserInvitation.token)
--
-- When RLS is enabled without policies, anon/authenticated roles get no access via PostgREST.
-- Prisma uses the postgres connection which bypasses RLS, so your app continues to work.
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public

-- Prisma migrations table (system)
ALTER TABLE IF EXISTS "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Core models
ALTER TABLE "public"."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."UserInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."InvitationGuest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Follow" ENABLE ROW LEVEL SECURITY;

-- Organization & members
ALTER TABLE "public"."Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."OrganizationMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."OrganizationRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."DepartmentMember" ENABLE ROW LEVEL SECURITY;

-- Collaboration
ALTER TABLE "public"."OrganizationCollaboration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CollaborationGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CollaborationGroupMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CollaborationTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CollaborationDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CollaborationNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CollaborationEditorialItem" ENABLE ROW LEVEL SECURITY;

-- Groups & messaging
ALTER TABLE "public"."Group" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."GroupMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ConversationDeletionRequest" ENABLE ROW LEVEL SECURITY;

-- Group notes & documents
ALTER TABLE "public"."GroupDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."GroupNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."GroupNoteShare" ENABLE ROW LEVEL SECURITY;

-- Department features
ALTER TABLE "public"."DepartmentNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."DepartmentDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."DepartmentEditorialItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."DepartmentGoal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."DepartmentMeeting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."DepartmentPoll" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."DepartmentMonthlyReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PollVote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."TeamDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."DecisionVote" ENABLE ROW LEVEL SECURITY;

-- Tasks
ALTER TABLE "public"."Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."TaskMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."TaskAttachment" ENABLE ROW LEVEL SECURITY;

-- Notifications & announcements
ALTER TABLE "public"."Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Announcement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AnnouncementRead" ENABLE ROW LEVEL SECURITY;

-- Subscription & payments
ALTER TABLE "public"."Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PendingSubscriptionPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PaymentSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PaymentOrder" ENABLE ROW LEVEL SECURITY;

-- Events
ALTER TABLE "public"."EventInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."EventDepartmentBroadcast" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."InvitationRSVP" ENABLE ROW LEVEL SECURITY;

-- User page & social
ALTER TABLE "public"."UserPage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Post" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Like" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PostRead" ENABLE ROW LEVEL SECURITY;

-- Push & Pro
ALTER TABLE "public"."PushSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."UserProSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."UserProSettings" ENABLE ROW LEVEL SECURITY;

-- User finances & personal
ALTER TABLE "public"."UserPersonalTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."UserFinancialGoal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."UserFinancialProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."UserMonthlyStatement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."UserFinancialEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."UserMonthlyProgress" ENABLE ROW LEVEL SECURITY;

-- Auto-enable RLS on future tables in public schema
-- See: https://supabase.com/docs/guides/auth/row-level-security
CREATE OR REPLACE FUNCTION rls_auto_enable()
RETURNS EVENT_TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
    IF cmd.schema_name IS NOT NULL
       AND cmd.schema_name = 'public'
       AND cmd.schema_name NOT IN ('pg_catalog','information_schema')
       AND cmd.schema_name NOT LIKE 'pg_toast%'
       AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('ALTER TABLE IF EXISTS %s ENABLE ROW LEVEL SECURITY', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
    END IF;
  END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls
ON ddl_command_end
WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
EXECUTE FUNCTION rls_auto_enable();
