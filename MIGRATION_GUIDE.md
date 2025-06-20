# Environment Consolidation Migration Guide

## Overview
This guide helps team members migrate from the old package-specific environment file structure to the new consolidated root-level environment setup.

## What Changed

### Before (Old Structure)
```
listener/
├── packages/
│   ├── server/
│   │   ├── .env              ❌ REMOVED
│   │   └── .env.example      ❌ REMOVED
│   └── client/
│       └── .env              ❌ REMOVED
└── .env.example              ✅ Enhanced
```

### After (New Structure)
```
listener/
├── .env.local                ✅ NEW - All development credentials
├── .env.example              ✅ Enhanced - Comprehensive documentation
├── .env.production           ✅ Production template
├── .env.test                 ✅ Test environment
└── ENVIRONMENT_SETUP.md      ✅ NEW - Setup instructions
```

## Migration Steps for Team Members

### Step 1: Backup Your Current Environment Files
```bash
# Create backup directory
mkdir -p env-backup

# Backup existing files (if they exist)
cp packages/server/.env env-backup/server-env 2>/dev/null || echo "No server .env found"
cp packages/client/.env env-backup/client-env 2>/dev/null || echo "No client .env found"
```

### Step 2: Pull Latest Changes
```bash
git pull origin main
```

### Step 3: Set Up New Environment Structure
```bash
# Copy the example file to create your local environment
cp .env.example .env.local

# Edit with your actual credentials
nano .env.local  # or use your preferred editor
```

### Step 4: Migrate Your Existing Credentials
If you had custom credentials in the old package-specific files, merge them into the new `.env.local`:

1. **Server credentials** (from `packages/server/.env`) → Add to root `.env.local`
2. **Client credentials** (from `packages/client/.env`) → Add to root `.env.local`
3. **Any custom variables** → Add to root `.env.local`

### Step 5: Verify Everything Works
```bash
# Test server startup
cd packages/server && npm run dev

# Test client startup (in another terminal)
cd packages/client && npm run dev

# Run full test suite
npm test
```

### Step 6: Clean Up Old Files
```bash
# Remove old package-specific environment files (if they still exist)
rm -f packages/server/.env packages/server/.env.example
rm -f packages/client/.env
```

## Key Benefits of New Structure

### ✅ **Simplified Setup**
- Single `.env.local` file for all development credentials
- No more confusion about which package needs which variables
- Consistent environment loading across all packages

### ✅ **Better Documentation**
- Comprehensive `.env.example` with detailed comments
- `ENVIRONMENT_SETUP.md` with step-by-step instructions
- Clear troubleshooting guide for common issues

### ✅ **Improved Developer Experience**
- Faster onboarding for new team members
- Reduced setup time from ~15 minutes to ~5 minutes
- Consistent environment variable access patterns

### ✅ **Enhanced Security**
- Clear separation between development and production environments
- Better documentation of required vs optional credentials
- Consistent handling of sensitive information

## Environment File Reference

### `.env.local` (Development)
- Contains all your actual development credentials
- Used for local development and testing
- **Never commit this file to version control**

### `.env.example` (Documentation)
- Shows all required and optional environment variables
- Contains detailed comments and setup instructions
- Safe to commit to version control

### `.env.production` (Production Template)
- Template for production environment variables
- Contains placeholders for production credentials
- Used as reference for deployment setup

### `.env.test` (Testing)
- Contains mock values for testing
- Used by automated test suites
- Safe to commit to version control

## Troubleshooting

### Issue: "Environment variable not found"
**Solution**: Check that the variable is defined in your `.env.local` file and matches the exact name from `.env.example`.

### Issue: "Server won't start"
**Solution**: 
1. Verify all required environment variables are set
2. Run `npm run validate:dev-setup` to check your configuration
3. Check the troubleshooting section in `ENVIRONMENT_SETUP.md`

### Issue: "Client build fails"
**Solution**: Ensure client-side environment variables start with `VITE_` prefix and are defined in `.env.local`.

### Issue: "Tests failing after migration"
**Solution**: Tests use `.env.test` - ensure test environment variables are properly configured.

## Getting Help

1. **Check Documentation**: Review `ENVIRONMENT_SETUP.md` for detailed setup instructions
2. **Validate Setup**: Run `npm run validate:dev-setup` to verify your configuration
3. **Ask Team**: Reach out to the team if you encounter issues not covered here

## Quick Reference Commands

```bash
# Validate your development setup
npm run validate:dev-setup

# Start development servers
npm run dev

# Run tests
npm test

# Check environment variables are loaded
cd packages/server && node -e "console.log(process.env.SUPABASE_URL)"
```

---

**Migration completed successfully?** 🎉 You should now have a single `.env.local` file with all your development credentials, and everything should work exactly as before, but with a much simpler setup process! 