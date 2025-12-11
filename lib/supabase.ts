import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Client-side Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side Supabase client with service role key
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Database types
export interface UserProfile {
  id: string
  whop_user_id: string
  email: string
  username: string
  balance_cents: number
  lifetime_access: boolean
  created_at: string
  updated_at: string
  whop_unique_id: string
}

export interface UsageEvent {
  id: string
  whop_user_id: string
  tool: string
  task: string
  model: string
  cost_cents: number
  prediction_id?: string
  preview_url?: string
  metadata?: any
  project_id?: string
  created_at: string
}
