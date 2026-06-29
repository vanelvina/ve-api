import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('CRITICAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in environment!');
}

// Create a Supabase client using the service role key to bypass RLS in our secure Express backend
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false, // Prevents library from trying to access localStorage/cookies on server
  }
});
