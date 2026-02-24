# Supabase Migrations for Phase 2

This directory contains SQL migrations to enable authentication and interactive features.

## Migrations

### 006_auth_integration.sql
Integrates Supabase Auth with the application:
- Adds `user_id` foreign key to `service_providers` table
- Updates RLS policies for authenticated operations
- Ensures users can only modify their own data

### 007_service_requests.sql
Creates the service requests system:
- Creates `service_requests` table
- Adds RLS policies for users and providers
- Includes triggers for automatic timestamp updates

## How to Run Migrations

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of each migration file
5. Run them in order (006, then 007)
6. Verify there are no errors

## Verification

After running migrations, verify:
- Tables exist in Table Editor
- RLS is enabled on all tables
- Policies are created correctly

```sql
-- Check if migrations ran successfully
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('service_requests');

-- Check RLS policies
SELECT tablename, policyname FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```
