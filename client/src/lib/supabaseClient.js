import { createClient } from '@supabase/supabase-js'

// Initialize the Supabase client with environment variables
// These will be replaced with actual values during build time
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey) 