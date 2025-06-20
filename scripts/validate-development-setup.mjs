#!/usr/bin/env node

/**
 * Development Setup Validation Script
 * 
 * This script validates that the development environment is properly configured
 * to prevent common setup issues that cause server startup failures or runtime
 * errors. It runs independently of the test suite to check real environment
 * configuration.
 * 
 * Usage: node scripts/validate-development-setup.mjs
 */

import { resolve } from 'path'
import { config } from 'dotenv'

// Load environment variables
config({ path: resolve(process.cwd(), '.env') })
config({ path: resolve(process.cwd(), 'packages/server/.env'), override: true })

// ANSI color codes for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
}

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`)
}

function error(message) {
  log(`❌ ${message}`, colors.red)
}

function success(message) {
  log(`✅ ${message}`, colors.green)
}

function warn(message) {
  log(`⚠️  ${message}`, colors.yellow)
}

function info(message) {
  log(`ℹ️  ${message}`, colors.blue)
}

/**
 * Check if critical environment variables are set
 */
function checkCriticalEnvironmentVariables() {
  info('Checking critical environment variables...')
  
  const criticalVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  const missingVars = criticalVars.filter(varName => !process.env[varName])

  if (missingVars.length > 0) {
    error('CRITICAL: Server will fail to start due to missing environment variables:')
    missingVars.forEach(varName => error(`  - ${varName}`))
    error('')
    error('This causes:')
    error('  1. Migration verification script fails during server startup')
    error('  2. Server fails to start')
    error('  3. Client gets 500 errors when calling APIs')
    error('  4. "Unexpected end of JSON input" errors in browser console')
    error('')
    error('Fix: Ensure packages/server/.env contains:')
    error('  SUPABASE_URL=http://127.0.0.1:54321')
    error('  SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
    return false
  }

  success('All critical environment variables are set')
  return true
}

/**
 * Check environment file locations
 */
async function checkEnvironmentFileLocations() {
  info('Checking environment file locations...')
  
  const fs = await import('fs/promises')
  const serverEnvPath = resolve(process.cwd(), 'packages/server/.env')
  const clientEnvPath = resolve(process.cwd(), 'packages/client/.env')
  
  let allGood = true
  
  try {
    const serverEnvContent = await fs.readFile(serverEnvPath, 'utf-8')
    success('Server .env file exists')
    
    // Check if server .env has the critical variables
    const hasSupabaseUrl = serverEnvContent.includes('SUPABASE_URL=')
    const hasServiceRoleKey = serverEnvContent.includes('SUPABASE_SERVICE_ROLE_KEY=')
    
    if (!hasSupabaseUrl || !hasServiceRoleKey) {
      error('Server .env file exists but missing critical variables:')
      if (!hasSupabaseUrl) error('  - SUPABASE_URL')
      if (!hasServiceRoleKey) error('  - SUPABASE_SERVICE_ROLE_KEY')
      allGood = false
    } else {
      success('Server .env file contains required variables')
    }
  } catch {
    error('Server .env file not found at packages/server/.env')
    error('The migration script may not find required variables without this file')
    allGood = false
  }
  
  try {
    await fs.access(clientEnvPath)
    success('Client .env file exists')
  } catch {
    warn('Client .env file missing at packages/client/.env')
    warn('Client may fall back to root .env, but dedicated client .env is recommended')
  }
  
  return allGood
}

/**
 * Check for production/local environment mismatches
 */
function checkEnvironmentMismatches() {
  info('Checking for environment mismatches...')
  
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return true // This will be caught by previous check
  }

  const isLocalUrl = supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost')
  const isProductionUrl = supabaseUrl.includes('.supabase.co')
  
  // Properly decode JWT to check if it's a local or production key
  let isLocalKey = false
  try {
    // JWT format: header.payload.signature
    const parts = serviceRoleKey.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
      // Local Supabase uses 'supabase-demo' as the issuer
      isLocalKey = payload.iss === 'supabase-demo'
    }
  } catch (error) {
    warn(`Could not decode service role key JWT: ${error.message}`)
    // Fall back to string check if JWT decoding fails
    isLocalKey = serviceRoleKey.includes('supabase-demo')
  }
  
  // Check for dangerous mismatch: production URL with local key or vice versa
  const dangerousMismatch = (isProductionUrl && isLocalKey) || (isLocalUrl && !isLocalKey)

  if (dangerousMismatch) {
    error('CRITICAL: Environment mismatch detected that will cause runtime failures')
    error(`SUPABASE_URL: ${isLocalUrl ? 'Local' : 'Production'} (${supabaseUrl})`)
    error(`Service Role Key: ${isLocalKey ? 'Local' : 'Production'}`)
    error('')
    error('This mismatch causes:')
    error('  1. Authentication failures')
    error('  2. Database connection errors')
    error('  3. 500 errors in API calls')
    error('')
    error('For local development, use:')
    error('  SUPABASE_URL=http://127.0.0.1:54321')
    error('  SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
    return false
  }

  if (isLocalUrl && isLocalKey) {
    success('Using local Supabase configuration (recommended for development)')
  } else if (isProductionUrl && !isLocalKey) {
    warn('Using production Supabase configuration')
    warn('Make sure this is intentional and you have the correct permissions')
  }

  return true
}

/**
 * Check local Supabase connectivity
 */
async function checkLocalSupabaseConnectivity() {
  const supabaseUrl = process.env.SUPABASE_URL

  if (!supabaseUrl?.includes('127.0.0.1') && !supabaseUrl?.includes('localhost')) {
    info('Skipping local Supabase connectivity check (not using local URLs)')
    return true
  }

  info('Checking local Supabase connectivity...')

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

    // Use the REST API endpoint instead of /health which doesn't exist
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)

    if (!response.ok) {
      error('Local Supabase is not responding properly')
      error(`URL: ${supabaseUrl}/rest/v1/`)
      error(`Status: ${response.status}`)
      error('Fix: Run `npm run supabase:start` to start local Supabase')
      return false
    }

    success('Local Supabase is accessible')
    return true
  } catch (error) {
    const errorMessage = error.message || 'Unknown error'
    error('Cannot connect to local Supabase')
    error(`URL: ${supabaseUrl}`)
    error(`Error: ${errorMessage}`)
    error('This will cause server startup to fail and APIs to return 500 errors')
    error('Fix: Run `npm run supabase:start` to start local Supabase')
    return false
  }
}

/**
 * Main validation function
 */
async function validateDevelopmentSetup() {
  log(`${colors.bold}🔍 Development Setup Validation${colors.reset}`)
  log('')

  const checks = [
    checkCriticalEnvironmentVariables(),
    await checkEnvironmentFileLocations(),
    checkEnvironmentMismatches(),
    await checkLocalSupabaseConnectivity()
  ]

  const allPassed = checks.every(check => check === true)

  log('')
  if (allPassed) {
    success('🎉 All development setup checks passed!')
    success('Your environment is properly configured for local development.')
  } else {
    error('💥 Development setup validation failed!')
    error('Please fix the issues above before starting the development server.')
    process.exit(1)
  }
}

// Run validation
validateDevelopmentSetup().catch((error) => {
  error(`Validation script failed: ${error.message}`)
  process.exit(1)
}) 