# Environment Setup Guide

This guide helps ensure your environment is properly configured for local development.

## 🚨 Common Issues and Solutions

### API Failures in Local Development

**Symptoms:**
- `store-spotify-tokens` API returns 500 errors
- `sync-spotify-shows` API fails with database errors  
- "Vault storage failed" messages
- "Upsert failed for one or more shows" errors

**Root Cause:**
Environment files (`.env`) configured for production URLs while running local Supabase.

**Solution:**
Ensure your environment files match your development setup:

#### Server Environment (`packages/server/.env`)
```bash
# ✅ For Local Development
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

# ❌ Production URLs (don't use for local dev)
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=your-production-key
```

#### Client Environment (`packages/client/.env`)
```bash
# ✅ For Local Development  
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
VITE_API_BASE_URL=http://localhost:3000
VITE_BASE_URL=http://localhost:5173

# ❌ Production URLs (don't use for local dev)
# VITE_SUPABASE_URL=https://your-project.supabase.co  
# VITE_API_BASE_URL=https://your-api.onrender.com
```

## 🔧 Setup Steps

### 1. Start Local Supabase
```bash
npm run supabase:start
```

### 2. Verify Supabase Status
```bash
npm run supabase:status
```
Should show services running on `127.0.0.1:54321`

### 3. Update Environment Files
Use the local URLs and keys shown in the supabase status output.

### 4. Verify Configuration
```bash
cd packages/server && npm test environment-configuration.test.ts
```

## 🧪 Why Tests Didn't Catch This Initially

Our unit tests use **mocked Supabase clients** and don't actually connect to databases. This allows tests to run quickly and consistently, but means they don't catch environment configuration mismatches.

### New Safeguards Added
- `environment-configuration.test.ts` - Warns about production/local URL mismatches
- Environment validation in test setup
- Vault monitoring scripts to verify connectivity

## 📊 Monitoring Tools

### Check Vault Health
```bash
npm run monitor:vault
```

### Verify Database Connectivity  
```bash
npm run supabase:status
```

## 🔑 Key Takeaways

1. **Always match environment URLs** - Local development should use `127.0.0.1:54321`
2. **Use production URLs only in production** - Never mix local and production configurations
3. **Run environment tests** - New tests will warn about common configuration issues
4. **Monitor vault connectivity** - Use built-in monitoring tools to verify secure storage is working

## 🆘 Troubleshooting

### Vault Storage Still Failing?
1. Check if vault extension is enabled: Look for vault migrations in `supabase/migrations/`
2. Verify RPC functions exist: `vault_create_user_secret`, `vault_read_user_secret`, etc.
3. Run vault health check: `npm run monitor:vault`

### Database Connection Issues?
1. Ensure Supabase is running: `npm run supabase:status`
2. Check environment variables match Supabase output
3. Verify no production URLs in local `.env` files 