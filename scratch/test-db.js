import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Duplicate helper functions from orders.ts
function formatOrderForFrontend(order) {
  if (!order) return null;
  return {
    ...order,
    _id: order.id,
    orderId: order.order_id,
    userId: order.users ? { _id: order.users.id, name: order.users.name, email: order.users.email } : order.user_id,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    orderStatus: order.order_status,
    statusHistory: (order.status_history || []).map((h) => ({
      status: h.status,
      timestamp: h.timestamp || h.createdAt,
      note: h.note || ''
    })),
    shippingMethod: order.shipping_method,
    shippingFee: order.shipping_fee,
    razorpayOrderId: order.razorpay_order_id,
    razorpayPaymentId: order.razorpay_payment_id,
    razorpaySignature: order.razorpay_signature,
    guestInfo: order.guest_info,
    shippingAddress: order.shipping_address,
    createdAt: order.created_at,
    updatedAt: order.updated_at
  };
}

const getOrderCustomerInfo = async (order) => {
  let email = '';
  let name = '';

  if (order.user_id) {
    try {
      const { data: user } = await supabase
        .from('users')
        .select('email, name')
        .eq('id', order.user_id)
        .maybeSingle();
      if (user) {
        email = user.email;
        name = user.name;
      }
    } catch (err) {
      console.error('Error fetching user for order email:', err);
    }
  }

  if (!email && order.guest_info?.email) {
    email = order.guest_info.email;
    name = order.guest_info.name || '';
  }

  if (!email && order.shipping_address?.email) {
    email = order.shipping_address.email;
    name = order.shipping_address.name || '';
  }

  return { email: email?.toLowerCase().trim(), name };
};

// Simulate sendPushNotification
async function sendPushNotification(targetEmail, title, body, url = '/') {
  console.log('sendPushNotification called with:', { targetEmail, title, body, url });
  try {
    const { data: subs, error } = await supabase
      .from('inquiries')
      .select('*')
      .eq('status', 'push_subscription')
      .eq('email', targetEmail);

    if (error) {
      console.error('Error in sendPushNotification querying inquiries:', error);
      throw error;
    }
    console.log('Subscribed push devices found:', subs ? subs.length : 0);
  } catch (error) {
    console.error('sendPushNotification error:', error);
    throw error;
  }
}

async function test() {
  console.log('Fetching first order...');
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('*')
    .limit(1)
    .single();

  if (fetchError) {
    console.error('Fetch error:', fetchError);
    return;
  }

  console.log('Fetched order:', order.order_id, 'Status:', order.order_status);

  // Run status change logic
  const orderStatus = 'label_created';
  const note = 'Test note';
  const orderId = order.id;

  const updatePayload = {};
  let statusChanged = false;

  if (orderStatus && order.order_status !== orderStatus) {
    updatePayload.order_status = orderStatus;
    const newHistory = [...(order.status_history || [])];
    newHistory.push({
      status: orderStatus,
      timestamp: new Date().toISOString(),
      note: note || ''
    });
    updatePayload.status_history = newHistory;
    statusChanged = true;
  }

  console.log('Updating order status in DB...');
  const { data: updatedOrder, error: updateErr } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId)
    .select()
    .single();

  if (updateErr) {
    console.error('Update error:', updateErr);
    return;
  }

  console.log('Successfully updated order status. Running notifications...');

  if (statusChanged) {
    console.log('Running triggerOrderEmail...');
    try {
      const customer = await getOrderCustomerInfo(updatedOrder);
      console.log('Resolved customer info:', customer);
      
      const orderFormatted = formatOrderForFrontend(updatedOrder);
      console.log('Formatted order status:', orderFormatted.orderStatus);

      // Try replacing status underscore
      const subject = `Shipping Update: ${orderFormatted.orderId} - ${orderFormatted.orderStatus.replace(/_/g, ' ').toUpperCase()}`;
      console.log('Constructed subject:', subject);

    } catch (err) {
      console.error('triggerOrderEmail block failed:', err);
    }

    console.log('Running sendPushNotification...');
    try {
      const statusTitle = 'Order Update 📦';
      const statusBody = `Your Order #${updatedOrder.order_id} status has been updated to: ${updatedOrder.order_status.replace(/_/g, ' ').toUpperCase()}`;
      
      // Call sendPushNotification with updatedOrder.email
      await sendPushNotification(updatedOrder.email, statusTitle, statusBody, `/account/orders/${updatedOrder.id}`);
    } catch (err) {
      console.error('sendPushNotification call failed:', err);
    }
  }
}

test();
