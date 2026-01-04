-- Supabase Database Schema for CT Challenge Tracking Sheet
-- Run these SQL commands in your Supabase SQL Editor to create the required tables

-- 1. Themes table
CREATE TABLE IF NOT EXISTS themes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  challenges TEXT[] NOT NULL,
  challenge_images TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Class Sessions table
CREATE TABLE IF NOT EXISTS class_sessions (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  theme_id UUID REFERENCES themes(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (theme_id, id)
);

-- 3. Students table
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  class_session_id TEXT NOT NULL,
  theme_id UUID REFERENCES themes(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Student Progress table
CREATE TABLE IF NOT EXISTS student_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_session_id TEXT NOT NULL,
  theme_name TEXT NOT NULL,
  challenges_completed TEXT[] NOT NULL DEFAULT '{}',
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(student_id, class_session_id, theme_name)
);

-- 5. App Settings table
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. History Entries table
CREATE TABLE IF NOT EXISTS history_entries (
  id TEXT PRIMARY KEY,
  student_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  week_name TEXT,
  week_theme TEXT NOT NULL,
  challenges TEXT[] NOT NULL DEFAULT '{}',
  all_available_challenges TEXT[] NOT NULL DEFAULT '{}',
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_class_sessions_theme_id ON class_sessions(theme_id);
CREATE INDEX IF NOT EXISTS idx_students_theme_id ON students(theme_id);
CREATE INDEX IF NOT EXISTS idx_students_class_session_id ON students(class_session_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_student_id ON student_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_class_session_id ON student_progress(class_session_id);
CREATE INDEX IF NOT EXISTS idx_history_entries_student_name ON history_entries(student_name);
CREATE INDEX IF NOT EXISTS idx_history_entries_date ON history_entries(date);

-- Enable Row Level Security (RLS) - adjust policies based on your security needs
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE history_entries ENABLE ROW LEVEL SECURITY;

-- Example RLS policies (adjust based on your authentication setup)
-- For now, allowing all operations - you should restrict based on your auth requirements
CREATE POLICY "Allow all operations on themes" ON themes FOR ALL USING (true);
CREATE POLICY "Allow all operations on class_sessions" ON class_sessions FOR ALL USING (true);
CREATE POLICY "Allow all operations on students" ON students FOR ALL USING (true);
CREATE POLICY "Allow all operations on student_progress" ON student_progress FOR ALL USING (true);
CREATE POLICY "Allow all operations on app_settings" ON app_settings FOR ALL USING (true);
CREATE POLICY "Allow all operations on history_entries" ON history_entries FOR ALL USING (true);

