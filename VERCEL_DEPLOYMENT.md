# Vercel Deployment Guide

Complete guide for deploying the CT Challenge Tracking application to Vercel with Supabase database.

---

## Prerequisites

- [ ] Supabase project created and schema.sql executed
- [ ] Git repository (GitHub, GitLab, or Bitbucket)
- [ ] Vercel account (free tier works fine)
- [ ] Node.js 18+ installed locally

---

## Step 1: Prepare Your Repository

### 1.1 Ensure `.env` is Gitignored

```bash
# Check if .gitignore has .env
cat .gitignore | grep "\.env"

# If not found, add it
echo "" >> .gitignore
echo "# Environment variables" >> .gitignore
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
```

### 1.2 Verify Vercel Configuration

A `vercel.json` file should exist in your project root with this content:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

This ensures:
- ✅ Proper routing for single-page application
- ✅ Correct build output directory
- ✅ Vite framework detection

### 1.3 Commit Everything

```bash
git add .
git commit -m "Prepare for Vercel deployment with Supabase"
git push origin main
```

---

## Step 2: Create Vercel Project

### 2.1 Import Repository

1. Go to [vercel.com](https://vercel.com)
2. Click **Add New** → **Project**
3. Select your Git provider (GitHub/GitLab/Bitbucket)
4. Choose your repository
5. Click **Import**

### 2.2 Configure Build Settings

Vercel should auto-detect these settings:
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

If not auto-detected, set them manually.

### 2.3 Initial Deploy (Will Fail - Expected!)

Click **Deploy** - it will fail because environment variables aren't set yet. This is normal!

---

## Step 3: Configure Environment Variables

### 3.1 Get Supabase Credentials

1. Open your Supabase project dashboard
2. Go to **Settings** (gear icon) → **API**
3. Copy these two values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: Long string starting with `eyJ...`

### 3.2 Add to Vercel

1. In Vercel project dashboard, go to **Settings**
2. Click **Environment Variables** in left sidebar
3. Add **Variable 1**:
   - **Name**: `VITE_SUPABASE_URL`
   - **Value**: Paste your Project URL
   - **Environments**: Check all three boxes
     - ✅ Production
     - ✅ Preview
     - ✅ Development
   - Click **Save**

4. Add **Variable 2**:
   - **Name**: `VITE_SUPABASE_ANON_KEY`
   - **Value**: Paste your anon public key
   - **Environments**: Check all three boxes
     - ✅ Production
     - ✅ Preview
     - ✅ Development
   - Click **Save**

**CRITICAL**: Both variables MUST:
- Start with `VITE_` (required for Vite to expose them)
- Be enabled for all environments
- Have correct values with no extra spaces

---

## Step 4: Redeploy

### 4.1 Trigger Redeploy

1. Go to **Deployments** tab
2. Find the failed deployment (red X)
3. Click the **...** (three dots) menu
4. Click **Redeploy**
5. Select **Use existing Build Cache** (optional, faster)
6. Wait for build to complete (~1-2 minutes)

### 4.2 Verify Build Success

Look for:
- ✅ Green checkmark on deployment
- ✅ "Building" → "Deploying" → "Ready"
- ✅ No error messages

---

## Step 5: Test Production

### 5.1 Visit Your Site

1. Click **Visit** or go to your Vercel URL (e.g., `your-app.vercel.app`)
2. Site should load without errors

### 5.2 Test Database Connection

Open browser console (F12) and verify these logs appear:
```
🔄 Loading state from Supabase...
✓ Loaded: X themes, X students, X assignments, X progress records
✅ State loaded in XXXms
```

### 5.3 Test Full Workflow

Perform these actions on your production site:

1. **Admin Panel**:
   - [ ] Add a new student "Test User"
   - [ ] Drag to "Sat AM1" class
   - [ ] Create a new theme "Test Theme"

2. **Dashboard**:
   - [ ] Select "Sat AM1" class
   - [ ] Toggle 3 challenges for "Test User"
   - [ ] Verify checkmarks appear immediately

3. **Persistence Test**:
   - [ ] Refresh the page (Ctrl+R)
   - [ ] Verify "Test User" still in "Sat AM1"
   - [ ] Verify 3 challenges still checked

4. **Multi-Tab Test**:
   - [ ] Open site in new tab
   - [ ] Toggle a challenge in Tab 1
   - [ ] Wait 2 seconds
   - [ ] Verify Tab 2 updates (LivePublicView auto-polls)

5. **Student Directory**:
   - [ ] Click "Student Directory"
   - [ ] Verify "Test User" appears
   - [ ] Verify 3/5 challenges shown

---

## Step 6: Custom Domain (Optional)

### 6.1 Add Domain

1. In Vercel project, go to **Settings** → **Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `tracker.yourschool.com`)
4. Follow DNS configuration instructions

### 6.2 Update DNS

Add these records to your DNS provider:

**For subdomain (tracker.yourschool.com):**
```
Type: CNAME
Name: tracker
Value: cname.vercel-dns.com
```

**For root domain (yourschool.com):**
```
Type: A
Name: @
Value: 76.76.21.21
```

### 6.3 Wait for SSL

- Certificate provisioning: ~30 minutes
- Full propagation: up to 48 hours
- Vercel automatically provides free SSL

---

## Troubleshooting

### Build Fails

**Error: "Missing environment variables"**
- Solution: Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel Settings
- Don't forget the `VITE_` prefix!

**Error: "Command failed: npm run build"**
- Check build logs for specific error
- Common fix: Run `npm install` and `npm run build` locally first
- Ensure `package.json` has correct build script

### Site Loads But Database Doesn't Work

**Symptom: Blank page or "Loading..." forever**

Check browser console:
```
Failed to fetch
```

**Solutions:**
1. Verify environment variables in Vercel Settings
2. Check Supabase project isn't paused (free tier auto-pauses)
3. Verify anon key is the PUBLIC key, not service_role key
4. Test Supabase connection manually:
   ```javascript
   console.log('URL:', import.meta.env.VITE_SUPABASE_URL)
   console.log('Key:', import.meta.env.VITE_SUPABASE_ANON_KEY?.substring(0, 20) + '...')
   ```

### CORS Errors

**Error: "CORS policy blocked"**

This shouldn't happen with Supabase, but if it does:
1. Check Supabase **Settings** → **API** → **API Settings**
2. Ensure your Vercel domain is allowed
3. Supabase allows all origins by default for anon key

### Data Not Persisting

**Symptom: Changes work but disappear on refresh**

1. Open Supabase SQL Editor
2. Check if data is actually saving:
   ```sql
   SELECT * FROM students ORDER BY created_at DESC LIMIT 5;
   SELECT * FROM student_progress ORDER BY last_updated DESC LIMIT 5;
   ```
3. If no data appears, check:
   - Environment variables are correct
   - Console for save errors
   - Network tab for failed POST requests

---

## Automatic Deployments

### Git Integration

Vercel auto-deploys when you push to Git:

```bash
# Make changes locally
git add .
git commit -m "Update feature"
git push origin main

# Vercel automatically:
# 1. Detects push
# 2. Runs build
# 3. Deploys to production
# 4. Updates your-app.vercel.app
```

### Branch Deployments

- **main branch** → Production (your-app.vercel.app)
- **Other branches** → Preview URLs (branch-name-your-app.vercel.app)
- **Pull Requests** → Automatic preview deployments

### Cancel/Retry Deployments

1. Go to **Deployments** tab
2. Click **...** on any deployment
3. Options:
   - **Redeploy**: Build again (useful after env var changes)
   - **Cancel**: Stop ongoing build
   - **View Source**: See Git commit

---

## Performance Optimization

### Edge Functions (Optional)

For faster loading worldwide, Vercel serves your site from edge locations automatically.

### Caching

Vercel automatically caches:
- Static assets (JS, CSS, images)
- Build outputs
- CDN edge cache

No additional configuration needed!

### Build Speed

**Speed up rebuilds:**
1. Use **Reuse Build Cache** when redeploying
2. Enable **Incremental Static Regeneration** (if using Next.js)
3. Keep dependencies minimal

---

## Monitoring

### Vercel Analytics (Optional)

1. Go to **Analytics** tab in Vercel
2. Enable **Web Analytics** (free)
3. See:
   - Page views
   - Load times
   - Geographic distribution

### Error Tracking

Check **Logs** tab for:
- Build logs
- Function logs (if using serverless functions)
- Real-time request logs

### Supabase Monitoring

1. Open Supabase dashboard
2. Go to **Logs** → **API**
3. Monitor database queries and errors

---

## Backup & Rollback

### Rollback to Previous Deployment

1. Go to **Deployments** tab
2. Find a working deployment (green checkmark)
3. Click **...** → **Promote to Production**
4. Instant rollback - no rebuild needed!

### Database Backup

Always backup before major changes:
1. Go to Supabase **Database** → **Backups**
2. Click **Create Backup**
3. Download backup file
4. Store safely

---

## Cost Estimates

### Vercel (Free Tier)
- ✅ Unlimited websites
- ✅ 100GB bandwidth/month
- ✅ Automatic SSL
- ✅ Git integration
- ⚠️ No custom domains on free tier

### Supabase (Free Tier)
- ✅ 500MB database
- ✅ 1GB file storage
- ✅ 50k monthly active users
- ⚠️ Projects pause after 1 week inactivity (re-activate anytime)

**Total Cost: $0/month** for small schools/clubs

### Upgrade Paths

**Vercel Pro ($20/month):**
- Custom domains
- More bandwidth
- Analytics
- Priority support

**Supabase Pro ($25/month):**
- No auto-pause
- 8GB database
- Daily backups
- Email support

---

## Security Checklist

- [ ] `.env` file in `.gitignore`
- [ ] Using anon public key (not service_role)
- [ ] Environment variables set in Vercel
- [ ] HTTPS enabled (automatic)
- [ ] No credentials in Git history
- [ ] Row Level Security policies configured (optional)

---

## Quick Commands

```bash
# Test build locally
npm run build
npm run preview

# Check environment variables
cat .env

# Force new deployment
git commit --allow-empty -m "Trigger deployment"
git push

# Check Vercel CLI (optional)
npm i -g vercel
vercel --prod
```

---

## Support Resources

- **Vercel Docs**: https://vercel.com/docs
- **Supabase Docs**: https://supabase.com/docs
- **Vite Docs**: https://vitejs.dev
- **This Project**: See TROUBLESHOOTING.md

---

**Last Updated:** January 2025
**Deployment Target:** Vercel + Supabase
**Framework:** Vite + React + TypeScript
