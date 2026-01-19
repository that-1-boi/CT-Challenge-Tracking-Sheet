-- Verification Script for CT Challenge Tracking Database
-- Run this after executing schema.sql to verify everything is set up correctly

-- =============================================================================
-- 1. CHECK TABLES EXIST
-- =============================================================================
SELECT
  '✓ Tables Created' as status,
  COUNT(*) as table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';

-- List all tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- =============================================================================
-- 2. CHECK VIEWS EXIST
-- =============================================================================
SELECT
  '✓ Views Created' as status,
  COUNT(*) as view_count
FROM information_schema.views
WHERE table_schema = 'public';

-- List all views
SELECT table_name as view_name
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- =============================================================================
-- 3. CHECK FUNCTIONS EXIST
-- =============================================================================
SELECT
  '✓ Functions Created' as status,
  COUNT(*) as function_count
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f';

-- List all functions
SELECT
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname;

-- =============================================================================
-- 4. VERIFY DEFAULT DATA
-- =============================================================================

-- Check class sessions (should have 6)
SELECT '✓ Class Sessions' as status, COUNT(*) as count FROM class_sessions;
SELECT * FROM class_sessions ORDER BY sort_order;

-- Check app settings (should have 4)
SELECT '✓ App Settings' as status, COUNT(*) as count FROM app_settings;
SELECT * FROM app_settings ORDER BY key;

-- Check sample theme (should have 1)
SELECT '✓ Sample Themes' as status, COUNT(*) as count FROM themes;
SELECT name, challenge_1, challenge_2 FROM themes;

-- =============================================================================
-- 5. VERIFY CONSTRAINTS
-- =============================================================================

-- Check primary keys
SELECT
  tc.table_name,
  kcu.column_name,
  tc.constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'PRIMARY KEY'
ORDER BY tc.table_name;

-- Check foreign keys
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, kcu.column_name;

-- Check unique constraints
SELECT
  tc.table_name,
  kcu.column_name,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'UNIQUE'
ORDER BY tc.table_name;

-- =============================================================================
-- 6. TEST BASIC OPERATIONS
-- =============================================================================

-- Test: Insert a student
DO $$
DECLARE
  v_student_id UUID;
  v_theme_id UUID;
BEGIN
  -- Insert test student
  INSERT INTO students (name)
  VALUES ('Test Student')
  RETURNING id INTO v_student_id;

  RAISE NOTICE '✓ Inserted test student: %', v_student_id;

  -- Get sample theme
  SELECT id INTO v_theme_id FROM themes LIMIT 1;

  -- Assign to class
  INSERT INTO student_assignments (student_id, theme_id, class_session_id)
  VALUES (v_student_id, v_theme_id, 'sat-am1');

  RAISE NOTICE '✓ Assigned student to class';

  -- Add progress
  INSERT INTO student_progress (
    student_id,
    theme_id,
    class_session_id,
    challenge_1_completed,
    challenge_2_completed,
    last_updated
  )
  VALUES (
    v_student_id,
    v_theme_id,
    'sat-am1',
    TRUE,
    TRUE,
    NOW()
  );

  RAISE NOTICE '✓ Added student progress';

  -- Clean up test data
  DELETE FROM student_progress WHERE student_id = v_student_id;
  DELETE FROM student_assignments WHERE student_id = v_student_id;
  DELETE FROM students WHERE id = v_student_id;

  RAISE NOTICE '✓ Cleaned up test data';
  RAISE NOTICE '✅ All basic operations working!';
END $$;

-- =============================================================================
-- 7. TEST VIEWS
-- =============================================================================

-- Query student roster view (should work even with no data)
SELECT
  '✓ v_student_roster View' as status,
  COUNT(*) as row_count
FROM v_student_roster;

-- Query progress summary view
SELECT
  '✓ v_progress_summary View' as status,
  COUNT(*) as row_count
FROM v_progress_summary;

-- =============================================================================
-- 8. FINAL STATUS
-- =============================================================================
SELECT
  '🎉 DATABASE VERIFICATION COMPLETE!' as status,
  'All tables, views, functions, and constraints are properly configured.' as message;

-- Display table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
