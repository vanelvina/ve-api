import { supabase } from '../utils/supabase.js';

async function test() {
  console.log('Testing analytics logs...');
  
  // 1. Log a test event
  const { data: inserted, error: insertErr } = await supabase
    .from('inquiries')
    .insert({
      name: 'Test User',
      email: 'test@vanelvina.com',
      phone: '-',
      subject: 'analytics_test_event',
      message: JSON.stringify({ device: 'desktop', page: '/test-url' }),
      status: 'analytics'
    })
    .select()
    .single();

  if (insertErr) {
    console.log('Failed to log test event:', insertErr.message);
  } else {
    console.log('Test event logged successfully, id:', inserted.id);
  }

  // 2. Fetch analytics events
  const { data: fetched, error: fetchErr } = await supabase
    .from('inquiries')
    .select('*')
    .eq('status', 'analytics')
    .limit(5);

  if (fetchErr) {
    console.log('Error fetching analytics events:', fetchErr.message);
  } else {
    console.log('Fetched analytics events:', fetched.length);
    console.log('Sample event:', fetched[0]);
  }

  // 3. Clean up test event if successfully inserted
  if (inserted && inserted.id) {
    await supabase.from('inquiries').delete().eq('id', inserted.id);
    console.log('Cleaned up test event.');
  }
}

test();
