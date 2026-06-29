import { supabase } from '../utils/supabase.js';

async function test() {
  console.log('Fetching single blog record...');
  const { data: blog, error: blogErr } = await supabase.from('blogs').select('*').limit(1);
  console.log('Blog sample:', blog, 'Error:', blogErr);

  console.log('Fetching single inquiry record...');
  const { data: inquiry, error: inquiryErr } = await supabase.from('inquiries').select('*').limit(1);
  console.log('Inquiry sample:', inquiry, 'Error:', inquiryErr);

  console.log('Fetching single widget record...');
  const { data: widget, error: widgetErr } = await supabase.from('widgets').select('*').limit(1);
  console.log('Widget sample:', widget, 'Error:', widgetErr);
}

test();
