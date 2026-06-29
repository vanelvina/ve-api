import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

async function check() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .limit(1);

    if (error) {
      console.error('Error fetching orders:', error);
    } else {
      console.log('Orders columns:', data && data[0] ? Object.keys(data[0]) : 'No records found');
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

check();
