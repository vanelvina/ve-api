import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function check() {
  try {
    // Try to query 'coupons' table
    const { data, error } = await supabase.from('coupons').select('*').limit(1);
    if (error) {
      console.log('Coupons table error (does it exist?):', error.message);
      
      // Let's check what other tables are in the DB by doing a query to pg_tables via an RPC or query if allowed
      // Or we can try to create the coupons table
      console.log('Attempting to check if we can write a coupons table...');
    } else {
      console.log('Coupons table exists! Data:', data);
    }
  } catch (err) {
    console.error('Check error:', err);
  }
}

check();
