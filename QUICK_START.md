# Quick Start Guide - New Database

## ⚡ 5-Minute Setup

### Step 1: Create Supabase Project (2 min)
1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Name it "CT Challenge Tracker"
4. Wait for initialization

### Step 2: Run SQL Schema (1 min)
1. Open **SQL Editor** in Supabase
2. Create **New query**
3. Copy/paste entire [`database/schema.sql`](./database/schema.sql)
4. Click **Run**
5. Verify: "Database schema created successfully!"

### Step 3: Configure Environment (1 min)
1. In Supabase: **Settings** → **API**
2. Copy **Project URL** and **anon public** key
3. Create `.env` file in project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 4: Start Application (1 min)
```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## ✅ Quick Test

1. **Admin Panel** → Add student "Test Student"
2. Drag to "Sat AM1"
3. **Dashboard** → Toggle 3 challenges
4. **Refresh browser** → Everything persists? ✅

---

## 📚 Full Documentation

- **[REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md)** - Complete overview of changes
- **[database/SETUP_GUIDE.md](./database/SETUP_GUIDE.md)** - Detailed setup & troubleshooting
- **[database/schema.sql](./database/schema.sql)** - Database schema

---

## 🆘 Troubleshooting

| Problem | Solution |
|---------|----------|
| "relation does not exist" | Run schema.sql in Supabase |
| Environment vars not loading | Restart dev server, check filename is `.env` |
| No data showing | Check browser console for errors |
| Data not saving | Verify Supabase credentials in `.env` |

---

## 🎯 Key Improvements

✅ **No duplicate students** - each student stored once
✅ **No duplicate history** - generated from progress
✅ **Single source of truth** - student_progress table
✅ **All pages sync** - read from same data pool
✅ **Fast & reliable** - optimized database queries

---

**Ready to go!** 🚀
