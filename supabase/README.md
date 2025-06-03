# Supabase Local Development

This directory contains the Supabase configuration and migrations for local development.

## Quick Start

### 1. Start Local Supabase Stack
```bash
npm run supabase:start
# or directly: supabase start
```

### 2. Check Status
```bash
npm run supabase:status
# or directly: supabase status
```

### 3. Reset Database (with seed data)
```bash
npm run db:reset
# or directly: supabase db reset
```

### 4. Stop Local Stack
```bash
npm run supabase:stop
# or directly: supabase stop
```

## Local URLs
- **API**: http://127.0.0.1:54321
- **Studio**: http://127.0.0.1:54323
- **Database**: postgresql://postgres:postgres@127.0.0.1:54322/postgres

## Environment Configuration

### Local Development (.env.local)
- `SUPABASE_URL=http://127.0.0.1:54321`
- `SUPABASE_ANON_KEY=` (local demo key)
- `VITE_SUPABASE_URL=http://127.0.0.1:54321`
- `VITE_SUPABASE_ANON_KEY=` (local demo key)

### Production (.env)
- `SUPABASE_URL=https://pgsdmvubrqgingyyteef.supabase.co`
- Production keys (git-ignored)

## Migration Workflow

### 1. Make Schema Changes
Use Supabase Studio (http://127.0.0.1:54323) or SQL directly

### 2. Generate Migration
```bash
supabase db diff -f new_migration_name
```

### 3. Apply to Production
```bash
supabase db push
```

## Common Commands

```bash
# View migration status
supabase migration list

# Create new migration
supabase migration new migration_name

# Generate migration from current schema
supabase db diff -f migration_name

# Push migrations to remote
supabase db push

# Pull remote schema changes
supabase db pull

# Dump production data (scrub PII first!)
supabase db dump --data-only > dump.sql

# Restore data to local
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres < dump.sql
```

## Troubleshooting

- **Port conflicts**: Change ports in `config.toml` if needed
- **Docker memory**: Increase Docker memory allocation for heavy usage
- **OAuth redirects**: Ensure localhost URLs are added to auth providers 