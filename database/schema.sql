-- CT Challenge Tracking Sheet - Optimized Database Schema
-- This schema eliminates data duplication and provides a single source of truth

-- Drop existing tables (careful - this will delete all data!)
DROP TABLE IF EXISTS student_progress CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS class_sessions CASCADE;
DROP TABLE IF EXISTS themes CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- 1. STUDENTS: Single source of truth for all students
-- Each student exists ONCE in the database
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Case-insensitive unique constraint on student names
CREATE UNIQUE INDEX idx_students_name_lower ON students(LOWER(name));

-- 2. THEMES: Challenge definitions for each week/theme
CREATE TABLE themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  challenge_1 TEXT NOT NULL DEFAULT 'Challenge 1',
  challenge_2 TEXT NOT NULL DEFAULT 'Challenge 2',
  challenge_3 TEXT NOT NULL DEFAULT 'Challenge 3',
  challenge_4 TEXT NOT NULL DEFAULT 'Challenge 4',
  challenge_5 TEXT NOT NULL DEFAULT 'Challenge 5',
  challenge_1_image TEXT, -- base64 image
  challenge_2_image TEXT,
  challenge_3_image TEXT,
  challenge_4_image TEXT,
  challenge_5_image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CLASS SESSIONS: Time slots (sat-am1, sun-pm2, etc)
-- These are global and reused across themes
CREATE TABLE class_sessions (
  id TEXT PRIMARY KEY, -- 'sat-am1', 'sun-am1', etc.
  name TEXT NOT NULL,   -- 'Sat AM1', 'Sun AM1', etc.
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default class sessions
INSERT INTO class_sessions (id, name, sort_order) VALUES
  ('sat-am1', 'Sat AM1', 1),
  ('sun-am1', 'Sun AM1', 2),
  ('sun-am2', 'Sun AM2', 3),
  ('sun-pm1', 'Sun PM1', 4),
  ('sun-pm2', 'Sun PM2', 5),
  ('unassigned', 'Unassigned', 99)
ON CONFLICT (id) DO NOTHING;

-- 4. STUDENT ASSIGNMENTS: Which students are in which class for which theme
-- This is the "roster" - it links students to class sessions within a specific theme
CREATE TABLE student_assignments (
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  class_session_id TEXT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (student_id, theme_id)
);

CREATE INDEX idx_assignments_theme ON student_assignments(theme_id);
CREATE INDEX idx_assignments_class ON student_assignments(class_session_id);

-- 5. STUDENT PROGRESS: Challenge completion tracking
-- This is the ONLY place where progress is stored
CREATE TABLE student_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  class_session_id TEXT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,

  -- Which challenges are completed (1-5)
  challenge_1_completed BOOLEAN DEFAULT FALSE,
  challenge_2_completed BOOLEAN DEFAULT FALSE,
  challenge_3_completed BOOLEAN DEFAULT FALSE,
  challenge_4_completed BOOLEAN DEFAULT FALSE,
  challenge_5_completed BOOLEAN DEFAULT FALSE,

  -- Timestamps
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ, -- When all 5 challenges were completed

  -- Only one progress record per student per theme
  UNIQUE(student_id, theme_id)
);

CREATE INDEX idx_progress_student ON student_progress(student_id);
CREATE INDEX idx_progress_theme ON student_progress(theme_id);

-- 6. APP SETTINGS: Global application configuration
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO app_settings (key, value) VALUES
  ('current_week_theme_id', ''),
  ('public_theme_id', ''),
  ('public_class_id', 'sat-am1'),
  ('selected_class_id', 'sat-am1')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- VIEWS FOR EASY QUERYING
-- =============================================================================

-- View: Student roster for a specific theme with progress
CREATE OR REPLACE VIEW v_student_roster AS
SELECT
  s.id as student_id,
  s.name as student_name,
  t.id as theme_id,
  t.name as theme_name,
  sa.class_session_id,
  cs.name as class_session_name,
  COALESCE(sp.challenge_1_completed, FALSE) as c1,
  COALESCE(sp.challenge_2_completed, FALSE) as c2,
  COALESCE(sp.challenge_3_completed, FALSE) as c3,
  COALESCE(sp.challenge_4_completed, FALSE) as c4,
  COALESCE(sp.challenge_5_completed, FALSE) as c5,
  sp.last_updated,
  sa.assigned_at
FROM students s
JOIN student_assignments sa ON s.id = sa.student_id
JOIN themes t ON sa.theme_id = t.id
JOIN class_sessions cs ON sa.class_session_id = cs.id
LEFT JOIN student_progress sp ON s.id = sp.student_id AND t.id = sp.theme_id;

-- View: Progress summary per theme
CREATE OR REPLACE VIEW v_progress_summary AS
SELECT
  t.id as theme_id,
  t.name as theme_name,
  sa.class_session_id,
  cs.name as class_session_name,
  cs.sort_order,
  COUNT(DISTINCT s.id) as total_students,
  COUNT(DISTINCT CASE WHEN sp.challenge_1_completed THEN s.id END) as c1_count,
  COUNT(DISTINCT CASE WHEN sp.challenge_2_completed THEN s.id END) as c2_count,
  COUNT(DISTINCT CASE WHEN sp.challenge_3_completed THEN s.id END) as c3_count,
  COUNT(DISTINCT CASE WHEN sp.challenge_4_completed THEN s.id END) as c4_count,
  COUNT(DISTINCT CASE WHEN sp.challenge_5_completed THEN s.id END) as c5_count
FROM themes t
CROSS JOIN class_sessions cs
LEFT JOIN student_assignments sa ON t.id = sa.theme_id AND cs.id = sa.class_session_id
LEFT JOIN students s ON sa.student_id = s.id
LEFT JOIN student_progress sp ON s.id = sp.student_id AND t.id = sp.theme_id
GROUP BY t.id, t.name, sa.class_session_id, cs.name, cs.sort_order
ORDER BY t.created_at, cs.sort_order;

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function: Update student progress
CREATE OR REPLACE FUNCTION update_student_progress(
  p_student_id UUID,
  p_theme_id UUID,
  p_class_session_id TEXT,
  p_challenge_num INTEGER,
  p_completed BOOLEAN
) RETURNS void AS $$
DECLARE
  v_all_completed BOOLEAN;
BEGIN
  -- Upsert progress record
  INSERT INTO student_progress (
    student_id,
    theme_id,
    class_session_id,
    challenge_1_completed,
    challenge_2_completed,
    challenge_3_completed,
    challenge_4_completed,
    challenge_5_completed,
    last_updated
  )
  VALUES (
    p_student_id,
    p_theme_id,
    p_class_session_id,
    CASE WHEN p_challenge_num = 1 THEN p_completed ELSE FALSE END,
    CASE WHEN p_challenge_num = 2 THEN p_completed ELSE FALSE END,
    CASE WHEN p_challenge_num = 3 THEN p_completed ELSE FALSE END,
    CASE WHEN p_challenge_num = 4 THEN p_completed ELSE FALSE END,
    CASE WHEN p_challenge_num = 5 THEN p_completed ELSE FALSE END,
    NOW()
  )
  ON CONFLICT (student_id, theme_id)
  DO UPDATE SET
    challenge_1_completed = CASE
      WHEN p_challenge_num = 1 THEN p_completed
      ELSE student_progress.challenge_1_completed
    END,
    challenge_2_completed = CASE
      WHEN p_challenge_num = 2 THEN p_completed
      ELSE student_progress.challenge_2_completed
    END,
    challenge_3_completed = CASE
      WHEN p_challenge_num = 3 THEN p_completed
      ELSE student_progress.challenge_3_completed
    END,
    challenge_4_completed = CASE
      WHEN p_challenge_num = 4 THEN p_completed
      ELSE student_progress.challenge_4_completed
    END,
    challenge_5_completed = CASE
      WHEN p_challenge_num = 5 THEN p_completed
      ELSE student_progress.challenge_5_completed
    END,
    last_updated = NOW();

  -- Check if all challenges completed and update completed_at
  SELECT
    challenge_1_completed AND
    challenge_2_completed AND
    challenge_3_completed AND
    challenge_4_completed AND
    challenge_5_completed
  INTO v_all_completed
  FROM student_progress
  WHERE student_id = p_student_id AND theme_id = p_theme_id;

  IF v_all_completed THEN
    UPDATE student_progress
    SET completed_at = COALESCE(completed_at, NOW())
    WHERE student_id = p_student_id AND theme_id = p_theme_id;
  ELSE
    UPDATE student_progress
    SET completed_at = NULL
    WHERE student_id = p_student_id AND theme_id = p_theme_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function: Assign student to class in theme
CREATE OR REPLACE FUNCTION assign_student_to_class(
  p_student_id UUID,
  p_theme_id UUID,
  p_class_session_id TEXT
) RETURNS void AS $$
BEGIN
  INSERT INTO student_assignments (student_id, theme_id, class_session_id)
  VALUES (p_student_id, p_theme_id, p_class_session_id)
  ON CONFLICT (student_id, theme_id)
  DO UPDATE SET
    class_session_id = p_class_session_id,
    assigned_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- ROW LEVEL SECURITY (Optional - enable if using auth)
-- =============================================================================

-- Enable RLS on all tables if you want authentication
-- ALTER TABLE students ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE student_assignments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE student_progress ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (since you're using a simple password auth)
-- You can add policies later if needed

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

CREATE INDEX idx_student_progress_updated ON student_progress(last_updated DESC);
CREATE INDEX idx_student_assignments_theme_class ON student_assignments(theme_id, class_session_id);

-- =============================================================================
-- MIGRATION HELPER: Import data from old schema (if needed)
-- =============================================================================

-- This section can be used to migrate data from your old schema
-- Uncomment and modify if you need to preserve existing data

/*
-- 1. Migrate unique students
INSERT INTO students (id, name, created_at)
SELECT DISTINCT id, name, MIN(created_at)
FROM old_students
GROUP BY id, name
ON CONFLICT (id) DO NOTHING;

-- 2. Migrate themes
INSERT INTO themes (id, name, challenge_1, challenge_2, challenge_3, challenge_4, challenge_5)
SELECT
  id,
  name,
  challenges[1],
  challenges[2],
  challenges[3],
  challenges[4],
  challenges[5]
FROM old_themes
ON CONFLICT (name) DO NOTHING;

-- 3. Migrate assignments
INSERT INTO student_assignments (student_id, theme_id, class_session_id)
SELECT DISTINCT student_id, theme_id, class_session_id
FROM old_students
ON CONFLICT (student_id, theme_id) DO NOTHING;
*/

-- =============================================================================
-- SAMPLE DATA (for testing)
-- =============================================================================

-- Insert a sample theme
INSERT INTO themes (name, challenge_1, challenge_2, challenge_3, challenge_4, challenge_5)
VALUES ('Pneumatic Configs & Basic Claw',
        '4 Cylinder Configuration',
        'Programming',
        'Basic Claw',
        'Pin Pickup',
        'Beam Pickup')
ON CONFLICT (name) DO NOTHING;

-- Done!
SELECT 'Database schema created successfully!' as status;
