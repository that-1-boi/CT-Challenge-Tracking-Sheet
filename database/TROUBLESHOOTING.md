# Database Troubleshooting Guide

## Common SQL Errors and Solutions

### ✅ Error: "column must appear in the GROUP BY clause"

**Error Message:**
```
ERROR: 42803: column "cs.sort_order" must appear in the GROUP BY clause
or be used in an aggregate function
```

**Cause:** PostgreSQL requires all non-aggregated columns in SELECT to be in GROUP BY.

**Solution:** This has been fixed in the latest `schema.sql`. Make sure you're using the updated version.

---

### Error: "relation does not exist"

**Error Message:**
```
ERROR: 42P01: relation "students" does not exist
```

**Cause:** The schema hasn't been run yet, or ran with errors.

**Solutions:**
1. Run `schema.sql` in Supabase SQL Editor
2. Make sure you copied the ENTIRE file
3. Check for previous error messages

---

### Error: "duplicate key value violates unique constraint"

**Error Message:**
```
ERROR: 23505: duplicate key value violates unique constraint "students_pkey"
```

**Cause:** Trying to insert a student that already exists.

**Solutions:**
1. Use UPSERT instead of INSERT:
   ```sql
   INSERT INTO students (id, name)
   VALUES ('uuid-here', 'Student Name')
   ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
   ```
2. Or check if student exists first
3. Use the application (it handles this automatically)

---

### Error: "invalid input syntax for type uuid"

**Error Message:**
```
ERROR: 22P02: invalid input syntax for type uuid
```

**Cause:** Passing a string where UUID is expected.

**Solutions:**
1. Use proper UUID format: `'550e8400-e29b-41d4-a716-446655440000'`
2. Generate UUID: `gen_random_uuid()`
3. Cast string to UUID: `'string-value'::uuid`

---

### Error: "permission denied for table"

**Error Message:**
```
ERROR: 42501: permission denied for table students
```

**Cause:** RLS (Row Level Security) might be enabled without policies.

**Solutions:**
1. Check if RLS is enabled:
   ```sql
   SELECT tablename, rowsecurity
   FROM pg_tables
   WHERE schemaname = 'public';
   ```
2. Disable RLS (for development):
   ```sql
   ALTER TABLE students DISABLE ROW LEVEL SECURITY;
   -- Repeat for all tables
   ```
3. Or create policies (for production)

---

### Error: "function does not exist"

**Error Message:**
```
ERROR: 42883: function update_student_progress(...) does not exist
```

**Cause:** Function wasn't created or has wrong signature.

**Solutions:**
1. Re-run the `schema.sql` file
2. Check function exists:
   ```sql
   SELECT proname FROM pg_proc
   WHERE proname LIKE '%student%';
   ```
3. Drop and recreate:
   ```sql
   DROP FUNCTION IF EXISTS update_student_progress;
   -- Then run schema.sql again
   ```

---

## Application Errors

### Error: "Failed to fetch" or Network errors

**Cause:** Environment variables not set or incorrect.

**Solutions:**
1. Check `.env` file exists in project root
2. Verify variables start with `VITE_`:
   ```env
   VITE_SUPABASE_URL=https://xxx.supabase.co
   VITE_SUPABASE_ANON_KEY=your-key-here
   ```
3. Restart dev server after changing `.env`
4. Check Supabase project is running (not paused)

---

### Error: "Invalid JWT" or "API key invalid"

**Cause:** Wrong API key in `.env`.

**Solutions:**
1. Go to Supabase: **Settings** → **API**
2. Copy the **anon public** key (NOT service_role)
3. Update `.env` with correct key
4. Restart dev server

---

### Issue: Data not saving

**Symptoms:** Changes appear in UI but disappear on refresh.

**Debug Steps:**
1. Open browser console (F12)
2. Look for errors in Network tab
3. Check Supabase logs:
   - Go to Supabase dashboard
   - Click **Logs** → **API**
   - Look for failed requests
4. Verify data in database:
   ```sql
   SELECT * FROM students ORDER BY created_at DESC LIMIT 10;
   SELECT * FROM student_progress ORDER BY last_updated DESC LIMIT 10;
   ```

**Common Causes:**
- ❌ Environment variables missing
- ❌ Supabase project paused (free tier)
- ❌ Network blocking requests
- ❌ Browser localStorage interfering (clear it)

---

### Issue: Students not appearing

**Debug Steps:**
1. Check if student saved:
   ```sql
   SELECT * FROM students WHERE name ILIKE '%student-name%';
   ```
2. Check if assigned to theme:
   ```sql
   SELECT * FROM student_assignments WHERE student_id = 'uuid-here';
   ```
3. Check browser console for errors
4. Verify theme exists:
   ```sql
   SELECT * FROM themes WHERE name = 'Theme Name';
   ```

---

### Issue: Progress not updating

**Debug Steps:**
1. Check progress table:
   ```sql
   SELECT * FROM student_progress WHERE student_id = 'uuid-here';
   ```
2. Check timestamps:
   ```sql
   SELECT student_id, last_updated
   FROM student_progress
   ORDER BY last_updated DESC;
   ```
3. Verify boolean columns:
   ```sql
   SELECT
     student_id,
     challenge_1_completed,
     challenge_2_completed,
     challenge_3_completed,
     challenge_4_completed,
     challenge_5_completed
   FROM student_progress;
   ```

---

## Verification Queries

### Check data consistency

```sql
-- Count records in each table
SELECT 'students' as table_name, COUNT(*) FROM students
UNION ALL
SELECT 'themes', COUNT(*) FROM themes
UNION ALL
SELECT 'student_assignments', COUNT(*) FROM student_assignments
UNION ALL
SELECT 'student_progress', COUNT(*) FROM student_progress;

-- Find students with progress but no assignment
SELECT sp.student_id, s.name
FROM student_progress sp
JOIN students s ON sp.student_id = s.id
LEFT JOIN student_assignments sa ON sp.student_id = sa.student_id
  AND sp.theme_id = sa.theme_id
WHERE sa.student_id IS NULL;

-- Find duplicate students (should be empty)
SELECT name, COUNT(*) as count
FROM students
GROUP BY LOWER(name)
HAVING COUNT(*) > 1;

-- Find students with duplicate assignments (should be empty)
SELECT student_id, theme_id, COUNT(*) as count
FROM student_assignments
GROUP BY student_id, theme_id
HAVING COUNT(*) > 1;

-- Find students with duplicate progress (should be empty)
SELECT student_id, theme_id, COUNT(*) as count
FROM student_progress
GROUP BY student_id, theme_id
HAVING COUNT(*) > 1;
```

---

## Reset Database (Nuclear Option)

**⚠️ WARNING: This deletes ALL data!**

```sql
-- Drop all tables (cascades to delete all data)
DROP TABLE IF EXISTS student_progress CASCADE;
DROP TABLE IF EXISTS student_assignments CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS themes CASCADE;
DROP TABLE IF EXISTS class_sessions CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;

-- Drop views
DROP VIEW IF EXISTS v_student_roster CASCADE;
DROP VIEW IF EXISTS v_progress_summary CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_student_progress;
DROP FUNCTION IF EXISTS assign_student_to_class;

-- Now re-run schema.sql to start fresh
```

---

## Performance Issues

### Slow queries

**Check query performance:**
```sql
-- Enable timing
\timing on

-- See slow queries in Supabase dashboard:
-- Logs → Database → Slow Queries
```

**Add missing indexes:**
```sql
-- Student name search
CREATE INDEX IF NOT EXISTS idx_students_name_trgm
ON students USING gin(name gin_trgm_ops);

-- Progress lookup
CREATE INDEX IF NOT EXISTS idx_progress_lookup
ON student_progress(student_id, theme_id);
```

### Large table sizes

**Check table sizes:**
```sql
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

**Vacuum and analyze:**
```sql
VACUUM ANALYZE students;
VACUUM ANALYZE student_progress;
-- Repeat for other tables
```

---

## Getting Help

1. **Check browser console** - F12 → Console tab
2. **Check Supabase logs** - Dashboard → Logs
3. **Run verify.sql** - Confirms database is set up correctly
4. **Query tables directly** - Use SQL Editor to inspect data
5. **Check GitHub Issues** - Someone may have had the same problem

---

## Useful SQL Commands

```sql
-- See all tables
\dt

-- Describe table structure
\d students

-- See all views
\dv

-- See all functions
\df

-- Show table constraints
SELECT * FROM information_schema.table_constraints
WHERE table_name = 'students';

-- Show column info
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'students';
```

---

**Last Updated:** January 2025
**Schema Version:** 2.0
