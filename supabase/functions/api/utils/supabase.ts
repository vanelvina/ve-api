import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('CRITICAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in environment!');
}

// Create a service-role Supabase client to bypass RLS in our secure API
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
  }
});
