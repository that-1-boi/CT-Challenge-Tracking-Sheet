# Database Setup Guide - CT Challenge Tracking Sheet

This guide will help you set up the new optimized Supabase database for the CT Challenge Tracking application.

## Overview

The new database architecture eliminates all data duplication issues by:
- **Single student records** - each student exists once in the database
- **Single progress tracking** - student_progress table is the only source of truth
- **Clean separation** - students, themes, assignments, and progress are properly normalized
- **No more duplicate history entries** - history is now generated from progress data

---

## Step 1: Create a New Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Click "New Project"
3. Enter project details:
   - **Name**: CT Challenge Tracker (or your preferred name)
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose closest to your location
4. Click "Create new project" and wait for it to initialize (~2 minutes)

---

## Step 2: Run the SQL Schema

1. In your Supabase project dashboard, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Copy the entire contents of `schema.sql` file
4. Paste it into the SQL editor
5. Click **Run** (or press Ctrl+Enter)
6. You should see "Database schema created successfully!" message

**If you see any errors:**
- Make sure you copied the ENTIRE file (including the final SELECT statement)
- Try running it again (idempotent - safe to run multiple times)
- Check the error message and verify you're using PostgreSQL 12+

### Optional: Verify Installation
Run the `verify.sql` script to confirm everything is set up correctly:
1. Click **New query** in SQL Editor
2. Copy/paste entire contents of `verify.sql`
3. Click **Run**
4. You should see "🎉 DATABASE VERIFICATION COMPLETE!" at the end

---

## Step 3: Configure Environment Variables

### For Local Development

1. In Supabase dashboard, go to **Project Settings** (gear icon) → **API**
2. Copy your:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** API key (the long string)

3. Create `.env` file in your project root:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**Important:** Add `.env` to your `.gitignore` to keep credentials secure!

### For Vercel Deployment

1. Go to your Vercel project dashboard
2. Click **Settings** → **Environment Variables**
3. Add the following variables:

| Name | Value | Environment |
|------|-------|-------------|
| `VITE_SUPABASE_URL` | `https://your-project-id.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | Your anon public key | Production, Preview, Development |

4. Click **Save** for each variable
5. **Redeploy** your application for changes to take effect

**Note:** Vercel automatically exposes environment variables prefixed with `VITE_` to the browser at build time.

---

## Step 4: Verify the Database Structure

In Supabase SQL Editor, run these queries to verify:

```sql
-- Check tables were created
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Should show: app_settings, class_sessions, student_assignments,
--              student_progress, students, themes

-- Check default class sessions
SELECT * FROM class_sessions ORDER BY sort_order;

-- Should show: sat-am1, sun-am1, sun-am2, sun-pm1, sun-pm2, unassigned
```

---

## Step 5: Test Locally

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Open the application in your browser (usually `http://localhost:5173`)

3. Test the following:
   - ✅ **Admin Panel**: Add a new student to "Unassigned"
   - ✅ **Admin Panel**: Drag the student to a class (e.g., "Sat AM1")
   - ✅ **Dashboard**: Toggle some challenges for the student
   - ✅ **Refresh**: Close and reopen the browser - data should persist
   - ✅ **Student Directory**: Verify progress shows up

---

## Step 6: Deploy to Vercel

### Initial Deployment

1. **Ensure `.env` is in `.gitignore`**:
   ```bash
   # Check if .gitignore contains .env
   cat .gitignore | grep "^\.env$"
   # If not found, add it:
   echo ".env" >> .gitignore
   ```

2. **Commit and push your code**:
   ```bash
   git add .
   git commit -m "Add Supabase database integration"
   git push origin main
   ```

3. **Deploy on Vercel**:
   - Go to [vercel.com](https://vercel.com) and sign in
   - Click **Add New** → **Project**
   - Import your Git repository
   - **Framework Preset**: Vite (should auto-detect)
   - Click **Deploy** (will fail without env vars - that's expected)

4. **Add Environment Variables** (CRITICAL):
   - In Vercel dashboard, go to **Settings** → **Environment Variables**
   - Add these two variables:

   **Variable 1:**
   - Name: `VITE_SUPABASE_URL`
   - Value: `https://your-project-id.supabase.co`
   - Environments: ✅ Production, ✅ Preview, ✅ Development
   - Click **Save**

   **Variable 2:**
   - Name: `VITE_SUPABASE_ANON_KEY`
   - Value: Your anon public key from Supabase
   - Environments: ✅ Production, ✅ Preview, ✅ Development
   - Click **Save**

5. **Redeploy**:
   - Go to **Deployments** tab
   - Click **...** on the failed deployment
   - Click **Redeploy**
   - Wait for build to complete

6. **Test Production**:
   - Click **Visit** or go to your Vercel URL
   - Test adding students and toggling challenges
   - Verify data persists after refresh

### Subsequent Deployments

Vercel auto-deploys on Git push:
```bash
git add .
git commit -m "Your changes"
git push origin main
# Vercel automatically builds and deploys
```

### Manual Redeploy (if needed)

1. Go to Vercel dashboard → **Deployments**
2. Click **...** → **Redeploy** on any deployment
3. Choose **Use existing Build Cache** for faster rebuilds

---

## Step 7: Verify Production Database Connection

### Check Environment Variables

1. In Vercel, go to **Settings** → **Environment Variables**
2. Verify both variables are present with correct values
3. Ensure they're enabled for all environments

### Test Database Connection

1. Visit your production URL
2. Open browser console (F12)
3. Look for these logs:
   ```
   🔄 Loading state from Supabase...
   ✓ Loaded: X themes, X students, X assignments, X progress records
   ✅ State loaded in XXXms
   ```

4. If you see errors like "Failed to fetch" or "Invalid API key":
   - Double-check environment variables in Vercel
   - Redeploy after fixing
   - Clear browser cache

### Test Full Workflow

On your production Vercel URL:
- [ ] **Add Student**: Admin → Add "Test Student" → Should save
- [ ] **Assign Class**: Drag to "Sat AM1" → Should save
- [ ] **Toggle Challenges**: Dashboard → Toggle 3 challenges → Should save
- [ ] **Refresh Page**: Data should persist
- [ ] **Open in New Tab**: Should show same data
- [ ] **Check Supabase**: SQL Editor → `SELECT * FROM students;` → Should see data

---

## Database Architecture

### Core Tables

#### 1. **students** - Single source of truth for all students
```sql
CREATE TABLE students (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
- Each student exists **once** in the database
- No duplication across themes

#### 2. **themes** - Challenge definitions
```sql
CREATE TABLE themes (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  challenge_1 TEXT,
  challenge_2 TEXT,
  challenge_3 TEXT,
  challenge_4 TEXT,
  challenge_5 TEXT,
  challenge_1_image TEXT,
  -- ... image fields for each challenge
);
```
- Stores challenge names and images per theme
- Each theme is a "week" or curriculum unit

#### 3. **class_sessions** - Time slots
```sql
CREATE TABLE class_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER
);
```
- Pre-populated with: sat-am1, sun-am1, sun-am2, sun-pm1, sun-pm2, unassigned
- Reused across all themes

#### 4. **student_assignments** - Who's in which class for which theme
```sql
CREATE TABLE student_assignments (
  student_id UUID REFERENCES students(id),
  theme_id UUID REFERENCES themes(id),
  class_session_id TEXT REFERENCES class_sessions(id),
  PRIMARY KEY (student_id, theme_id)
);
```
- Links students to classes within specific themes
- One student can be in different classes for different themes

#### 5. **student_progress** - Challenge completion tracking
```sql
CREATE TABLE student_progress (
  student_id UUID REFERENCES students(id),
  theme_id UUID REFERENCES themes(id),
  challenge_1_completed BOOLEAN,
  challenge_2_completed BOOLEAN,
  challenge_3_completed BOOLEAN,
  challenge_4_completed BOOLEAN,
  challenge_5_completed BOOLEAN,
  last_updated TIMESTAMPTZ,
  UNIQUE(student_id, theme_id)
);
```
- **Single source of truth for progress**
- One row per student per theme
- No duplicates possible!

#### 6. **app_settings** - Global configuration
```sql
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```
- Stores current theme, public display settings, etc.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         FRONTEND                             │
│                                                              │
│  ┌──────────┐    ┌──────────┐    ┌────────────────┐       │
│  │  Admin   │    │Dashboard │    │ LivePublicView │       │
│  └────┬─────┘    └────┬─────┘    └───────┬────────┘       │
│       │               │                   │                 │
│       └───────────────┼───────────────────┘                 │
│                       │                                      │
│              ┌────────▼─────────┐                           │
│              │ supabaseService  │                           │
│              │  (Single API)    │                           │
│              └────────┬─────────┘                           │
└───────────────────────┼──────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌────▼─────┐
│   students   │ │   themes    │ │ progress │
│ (one record  │ │ (challenges)│ │ (boolean │
│  per student)│ │             │ │  columns)│
└──────────────┘ └─────────────┘ └──────────┘
```

---

## Key Improvements Over Old Schema

### ❌ Old Schema Problems:
1. Students duplicated across themes
2. Progress stored in TWO places (student_progress + history_entries)
3. History entries created on every challenge toggle
4. Complex key parsing with underscores
5. Race conditions between saves

### ✅ New Schema Solutions:
1. ✅ **One student = one row** in students table
2. ✅ **One progress record per student/theme** - no duplicates
3. ✅ **History auto-generated** from progress (read-only)
4. ✅ **Boolean columns** for challenges (no parsing needed)
5. ✅ **Clean upserts** with proper constraints

---

## Common Operations

### Add a New Student
```sql
INSERT INTO students (id, name)
VALUES (gen_random_uuid(), 'John Doe');
```

### Assign Student to Class for Theme
```sql
INSERT INTO student_assignments (student_id, theme_id, class_session_id)
VALUES (
  '...student-uuid...',
  '...theme-uuid...',
  'sat-am1'
)
ON CONFLICT (student_id, theme_id)
DO UPDATE SET class_session_id = EXCLUDED.class_session_id;
```

### Update Challenge Progress
```sql
INSERT INTO student_progress (
  student_id,
  theme_id,
  challenge_1_completed,
  last_updated
)
VALUES (
  '...student-uuid...',
  '...theme-uuid...',
  TRUE,
  NOW()
)
ON CONFLICT (student_id, theme_id)
DO UPDATE SET
  challenge_1_completed = TRUE,
  last_updated = NOW();
```

### Query Student Progress
```sql
-- Use the convenient view
SELECT * FROM v_student_roster
WHERE theme_name = 'Pneumatic Configs & Basic Claw'
  AND class_session_id = 'sat-am1'
ORDER BY student_name;
```

---

## Troubleshooting

### Issue: "relation does not exist"
**Solution:** You need to run the schema.sql file in Supabase SQL Editor first.

### Issue: Environment variables not loading
**Solution:**
1. Restart your dev server after updating `.env`
2. Make sure the file is named exactly `.env` (not `.env.local` or `.env.txt`)
3. Verify the variables start with `VITE_` (required for Vite)

### Issue: "Invalid JWT" or authentication errors
**Solution:**
1. Double-check you copied the **anon public** key (not the service_role key)
2. Verify the Supabase URL is correct
3. Make sure there are no extra spaces or quotes in the `.env` file

### Issue: Students not appearing after adding
**Solution:**
1. Open browser console (F12)
2. Check for error messages
3. Verify the student was saved to database:
   ```sql
   SELECT * FROM students ORDER BY created_at DESC LIMIT 5;
   ```

### Issue: Progress not saving
**Solution:**
1. Check console for errors
2. Verify student_assignments exist:
   ```sql
   SELECT * FROM student_assignments
   WHERE student_id = '...student-uuid...';
   ```
3. Check if theme exists:
   ```sql
   SELECT * FROM themes WHERE name = 'Theme Name';
   ```

---

## Maintenance

### Clear All Data (Start Fresh)
```sql
-- CAUTION: This deletes everything!
TRUNCATE students, themes, student_assignments, student_progress CASCADE;

-- Re-insert default class sessions
INSERT INTO class_sessions (id, name, sort_order) VALUES
  ('sat-am1', 'Sat AM1', 1),
  ('sun-am1', 'Sun AM1', 2),
  ('sun-am2', 'Sun AM2', 3),
  ('sun-pm1', 'Sun PM1', 4),
  ('sun-pm2', 'Sun PM2', 5),
  ('unassigned', 'Unassigned', 99)
ON CONFLICT (id) DO NOTHING;
```

### Backup Database
In Supabase dashboard:
1. Go to **Database** → **Backups**
2. Click **Create backup**
3. Download the backup file

### Monitor Performance
```sql
-- See table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Next Steps

1. ✅ Run the schema.sql
2. ✅ Configure environment variables
3. ✅ Test adding students and tracking progress
4. 📊 Monitor the application for any issues
5. 🎉 Enjoy duplicate-free progress tracking!

---

## Support

If you encounter issues:
1. Check browser console for errors
2. Check Supabase logs (Dashboard → Logs)
3. Review this guide's troubleshooting section
4. Check the database tables directly in Supabase SQL Editor

**Database Version:** 2.0 (Optimized Schema)
**Last Updated:** January 2025
