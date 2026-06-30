import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '/home/saqeb/Projects/ve-api/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function check() {
  console.log('--- Checking Push Subscriptions ---');
  const { data: subs, error: err1 } = await supabase
    .from('inquiries')
    .select('*')
    .eq('status', 'push_subscription');

  if (err1) {
    console.error('Error fetching push subscriptions:', err1);
  } else {
    console.log(`Found ${subs?.length || 0} subscriptions:`);
    for (const sub of subs || []) {
      console.log(`- ID: ${sub.id}, Name: ${sub.name}, Email: ${sub.email}, Created At: ${sub.created_at}`);
    }
  }

  console.log('\n--- Checking Analytics Events ---');
  const { data: events, error: err2 } = await supabase
    .from('inquiries')
    .select('id, name, email, subject, created_at')
    .eq('status', 'analytics')
    .order('created_at', { ascending: false })
    .limit(10);

  if (err2) {
    console.error('Error fetching analytics events:', err2);
  } else {
    console.log(`Found ${events?.length || 0} recent events:`);
    for (const ev of events || []) {
      console.log(`- ID: ${ev.id}, Name: ${ev.name}, Email: ${ev.email}, EventType: ${ev.subject}, Created At: ${ev.created_at}`);
    }
  }
}

check();
