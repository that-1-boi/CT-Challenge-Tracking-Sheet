# Deployment Checklist - Vercel + Supabase

Use this checklist to ensure smooth deployment to Vercel with Supabase database.

---

## Pre-Deployment

### Database Setup
- [ ] Created Supabase project
- [ ] Ran `database/schema.sql` in SQL Editor
- [ ] Verified tables created (run `database/verify.sql`)
- [ ] Confirmed default class sessions exist
- [ ] Tested database locally with `npm run dev`

### Code Preparation
- [ ] All changes committed to Git
- [ ] `.env` file is in `.gitignore`
- [ ] `.env.example` exists with template
- [ ] `vercel.json` exists in project root
- [ ] `package.json` has correct scripts
- [ ] No hardcoded credentials in code
- [ ] Build works locally (`npm run build`)

### Environment Variables Ready
- [ ] Copied Supabase URL from dashboard
- [ ] Copied anon public key (NOT service_role)
- [ ] Both values saved in secure location
- [ ] Ready to add to Vercel

---

## Vercel Setup

### Initial Import
- [ ] Logged into Vercel account
- [ ] Clicked "Add New" → "Project"
- [ ] Connected Git provider (GitHub/GitLab/Bitbucket)
- [ ] Selected repository
- [ ] Imported project

### Build Configuration
- [ ] Framework detected as "Vite"
- [ ] Build Command: `npm run build`
- [ ] Output Directory: `dist`
- [ ] Install Command: `npm install`
- [ ] Root Directory: `./` (leave blank)

### Environment Variables
- [ ] Opened Settings → Environment Variables
- [ ] Added `VITE_SUPABASE_URL`
  - [ ] Value correct (no trailing slash)
  - [ ] Production enabled
  - [ ] Preview enabled
  - [ ] Development enabled
- [ ] Added `VITE_SUPABASE_ANON_KEY`
  - [ ] Value correct (starts with `eyJ`)
  - [ ] Production enabled
  - [ ] Preview enabled
  - [ ] Development enabled

### First Deployment
- [ ] Clicked "Deploy"
- [ ] Build completed successfully
- [ ] Deployment shows green checkmark
- [ ] No error logs in build output

---

## Post-Deployment Testing

### Basic Functionality
- [ ] Site loads at Vercel URL
- [ ] No console errors (F12 → Console)
- [ ] Admin panel loads
- [ ] Dashboard loads
- [ ] Student Directory loads
- [ ] Live Public View loads

### Database Connection
- [ ] Console shows: "🔄 Loading state from Supabase..."
- [ ] Console shows: "✅ State loaded in XXms"
- [ ] No "Failed to fetch" errors
- [ ] No CORS errors

### Data Operations
- [ ] **CREATE**: Can add new student in Admin
- [ ] **READ**: Student appears in dashboard
- [ ] **UPDATE**: Can drag student to different class
- [ ] **DELETE**: Can toggle challenges on/off
- [ ] **PERSIST**: Data remains after page refresh

### Multi-Tab Sync
- [ ] Opened site in two browser tabs
- [ ] Changed data in Tab 1
- [ ] Tab 2 updates within 2 seconds
- [ ] Both tabs show identical data

### Student Workflow
- [ ] Added "Test Student" in Admin
- [ ] Assigned to "Sat AM1"
- [ ] Toggled 3 challenges in Dashboard
- [ ] Refreshed browser
- [ ] All 3 challenges still checked
- [ ] Student still in "Sat AM1"
- [ ] Appears in Student Directory

---

## Supabase Verification

### Data in Database
Open Supabase SQL Editor and run:

```sql
-- Should show your test student
SELECT * FROM students ORDER BY created_at DESC LIMIT 5;

-- Should show assignment to Sat AM1
SELECT * FROM student_assignments ORDER BY assigned_at DESC LIMIT 5;

-- Should show 3 challenges completed
SELECT * FROM student_progress ORDER BY last_updated DESC LIMIT 5;
```

- [ ] Test student exists in `students` table
- [ ] Assignment exists in `student_assignments` table
- [ ] Progress exists in `student_progress` table
- [ ] No duplicate entries

---

## Performance Check

### Load Times
- [ ] Initial page load < 3 seconds
- [ ] Navigation between pages instant
- [ ] Challenge toggles respond immediately
- [ ] Data saves within 500ms

### Network Requests
Open DevTools → Network tab:
- [ ] Supabase requests return 200 OK
- [ ] No failed requests (red)
- [ ] No slow requests (>5s)

### Console Logs
- [ ] No error messages (red)
- [ ] No warning messages (yellow)
- [ ] Only info messages (blue/grey)

---

## Security Verification

### Environment Variables
- [ ] `.env` NOT in Git repository
- [ ] Environment variables only in Vercel dashboard
- [ ] Using anon public key (not service_role)
- [ ] No credentials in client-side code

### Database Security
- [ ] Row Level Security policies (optional)
- [ ] Anon key has limited permissions
- [ ] No sensitive data in logs

### HTTPS
- [ ] Site served over HTTPS
- [ ] SSL certificate valid
- [ ] No mixed content warnings

---

## Git Integration

### Automatic Deployments
- [ ] Pushed test commit to main branch
- [ ] Vercel automatically triggered build
- [ ] New deployment appeared in dashboard
- [ ] Site updated with changes

### Branch Deployments
- [ ] Created feature branch
- [ ] Pushed to feature branch
- [ ] Vercel created preview URL
- [ ] Preview works independently

---

## Custom Domain (If Applicable)

### DNS Configuration
- [ ] Domain added in Vercel
- [ ] DNS records updated at registrar
- [ ] CNAME/A records pointing to Vercel
- [ ] SSL certificate issued (~30 min)

### Domain Testing
- [ ] Custom domain loads
- [ ] HTTPS works on custom domain
- [ ] All features work on custom domain
- [ ] Redirects configured (www → non-www)

---

## Monitoring Setup

### Vercel Analytics
- [ ] Enabled Web Analytics
- [ ] Seeing traffic data
- [ ] No errors in analytics

### Supabase Monitoring
- [ ] Checked API logs
- [ ] No error patterns
- [ ] Query performance acceptable

---

## Rollback Plan

### Backup
- [ ] Database backup created in Supabase
- [ ] Previous working deployment noted
- [ ] Know how to rollback Vercel deployment

### Emergency Contacts
- [ ] Supabase support contact saved
- [ ] Vercel support contact saved
- [ ] Team members notified of deployment

---

## Documentation

### Internal Docs
- [ ] Added Vercel URL to team docs
- [ ] Updated admin credentials (if any)
- [ ] Shared Supabase access (if needed)

### User Guides
- [ ] Created user guide for instructors
- [ ] Created guide for viewing public display
- [ ] Documented any specific workflows

---

## Final Sign-Off

### Production Ready Criteria
- [ ] All tests passed
- [ ] No critical errors
- [ ] Performance acceptable
- [ ] Security verified
- [ ] Monitoring in place
- [ ] Rollback plan ready

### Team Approval
- [ ] Technical lead approved
- [ ] Stakeholders notified
- [ ] Launch announcement sent

---

## Common Issues & Fixes

### ❌ Build Fails
**Fix:** Check build logs, ensure `npm run build` works locally

### ❌ Environment Variables Not Working
**Fix:** Redeploy after adding/changing env vars

### ❌ Database Connection Fails
**Fix:** Verify Supabase URL and key are correct

### ❌ Data Not Persisting
**Fix:** Check Supabase logs, verify database isn't paused

### ❌ Slow Loading
**Fix:** Check Supabase region matches Vercel region

---

## Success Criteria

✅ **Deployment is successful when:**
1. Site loads without errors
2. Can add/edit/delete data
3. Data persists after refresh
4. Multiple tabs stay synchronized
5. Performance is acceptable
6. No console errors

---

**Deployment Date:** _______________
**Deployed By:** _______________
**Vercel URL:** _______________
**Status:** ⬜ Testing | ⬜ Staging | ⬜ Production

---

**Next Review:** _______________
**Notes:**
_________________________________________
_________________________________________
_________________________________________
