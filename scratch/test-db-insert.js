import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '/home/saqeb/Projects/ve-api/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function test() {
  console.log('Testing insert COD order...');
  
  const orderPayload = {
    order_id: 'TEST-' + Math.floor(Math.random() * 100000),
    user_id: null,
    items: [
      {
        productId: '00000000-0000-0000-0000-000000000001',
        name: 'Test Product',
        price: 100,
        quantity: 1,
        size: 'M',
        color: 'Red',
        image: ''
      }
    ],
    shipping_address: {
      name: 'John Doe',
      line1: '123 Test St',
      city: 'Test City'
    },
    payment_method: 'cod',
    subtotal: 100,
    shipping_fee: 0,
    discount: 0,
    total: 100,
    guest_info: null,
    status_history: [{ status: 'placed', timestamp: new Date().toISOString(), note: '' }],
    payment_status: 'pending',
    order_status: 'placed'
  };

  const { data, error } = await supabase
    .from('orders')
    .insert(orderPayload)
    .select()
    .single();

  if (error) {
    console.error('Insert error:', error.message, error.details, error.hint, error);
  } else {
    console.log('Insert success!', data.order_id);
    // clean up
    await supabase.from('orders').delete().eq('order_id', data.order_id);
  }
}

test();
