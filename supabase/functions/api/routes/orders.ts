import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import { supabase } from '../utils/supabase.ts';
import { toUUID } from '../utils/uuid.ts';
import { userAuthMiddleware, authMiddleware } from '../middleware/auth.ts';
import Razorpay from 'npm:razorpay';
import crypto from 'node:crypto';
import jwt from 'npm:jsonwebtoken';
import { sendEmail } from '../utils/email.ts';

const router = new Hono();

// Helper: Format Order for Frontend compatibility (renames properties to camelCase)
function formatOrderForFrontend(order: any) {
  if (!order) return null;
  return {
    ...order,
    _id: order.id,
    orderId: order.order_id,
    userId: order.users ? { _id: order.users.id, name: order.users.name, email: order.users.email } : order.user_id,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    orderStatus: order.order_status,
    statusHistory: (order.status_history || []).map((h: any) => ({
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

const getOrderCustomerInfo = async (order: any) => {
  let email = '';
  let name = '';

  if (order.user_id) {
    try {
      const { data: user } = await supabase
        .from('users')
        .select('email, name')
        .eq('id', toUUID(order.user_id))
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

const triggerOrderEmail = async (order: any, type: string, note = '') => {
  try {
    const customer = await getOrderCustomerInfo(order);
    if (!customer.email) {
      console.warn(`No email found for order ${order.order_id}, skipping notification.`);
      return;
    }

    const orderFormatted = formatOrderForFrontend(order);
    if (!orderFormatted) return;

    let subject = '';
    let htmlContent = '';

    if (type === 'confirmed') {
      subject = `Order Confirmed: ${orderFormatted.orderId} - Van Elvina`;
      htmlContent = `
        <div style="font-family: 'Georgia', serif; padding: 20px; line-height: 1.6; background-color: #FDF8F5; color: #2C2C2C;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg,#8A4F5A,#B76E79); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px;">Van Elvina</h1>
              <p style="color: rgba(255,255,255,0.75); margin: 6px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">Order Confirmed</p>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #8A4F5A; font-size: 18px; margin: 0 0 16px;">Thank you for your order, ${customer.name || 'Valued Customer'}!</h2>
              <p style="color: #555; font-size: 14px; margin: 0 0 20px;">
                We are pleased to confirm that we have received your order. Here is your order summary:
              </p>
              
              <div style="background: #FAF0F1; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #E8C5CA;">
                <p style="margin: 0 0 10px; font-size: 13px;"><strong>Order ID:</strong> <span style="font-family: monospace; font-weight: bold; color: #8A4F5A;">${orderFormatted.orderId}</span></p>
                <p style="margin: 0 0 15px; font-size: 13px;"><strong>Payment Method:</strong> ${orderFormatted.paymentMethod.toUpperCase()}</p>
                
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                  <thead>
                    <tr style="border-bottom: 1px solid #E8C5CA; text-align: left; color: #8A4F5A;">
                      <th style="padding: 8px 0; font-weight: bold;">Item</th>
                      <th style="padding: 8px 0; text-align: center; font-weight: bold;">Qty</th>
                      <th style="padding: 8px 0; text-align: right; font-weight: bold;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${orderFormatted.items.map((item: any) => `
                      <tr style="border-bottom: 1px solid rgba(232, 197, 202, 0.3);">
                        <td style="padding: 8px 0; color: #555;">${item.name} ${item.size ? `(Size: ${item.size})` : ''}</td>
                        <td style="padding: 8px 0; text-align: center; color: #555;">${item.quantity}</td>
                        <td style="padding: 8px 0; text-align: right; color: #555;">₹${item.price.toLocaleString('en-IN')}</td>
                      </tr>
                    `).join('')}
                    <tr>
                      <td colspan="2" style="padding: 10px 0 0; font-weight: bold; color: #8A4F5A;">Total Amount</td>
                      <td style="padding: 10px 0 0; text-align: right; font-weight: bold; color: #8A4F5A; font-size: 15px;">₹${orderFormatted.total.toLocaleString('en-IN')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style="background: #FAF6F0; border-radius: 12px; padding: 20px; font-size: 13px; color: #555; border: 1px solid #F0E8E0;">
                <h4 style="margin: 0 0 8px; color: #C5A58E; text-transform: uppercase; font-size: 11px; letter-spacing: 1px;">Delivery Address</h4>
                <p style="margin: 0; line-height: 1.5;">
                  <strong>${orderFormatted.shippingAddress.name}</strong><br/>
                  ${orderFormatted.shippingAddress.line1}${orderFormatted.shippingAddress.line2 ? `, ${orderFormatted.shippingAddress.line2}` : ''}<br/>
                  ${orderFormatted.shippingAddress.city}, ${orderFormatted.shippingAddress.state} - ${orderFormatted.shippingAddress.pincode}<br/>
                  Phone: ${orderFormatted.shippingAddress.phone}
                </p>
              </div>

              <p style="color: #999; font-size: 12px; margin: 24px 0 0; text-align: center;">
                We will send you another update once your package has shipped!
              </p>
            </div>
            <div style="background: #FAF6F0; border-top: 1px solid #F0E8E0; padding: 20px; text-align: center; font-size: 11px; color: #BBB;">
              © 2026 Van Elvina · Premium Women's Innerwear
            </div>
          </div>
        </div>
      `;
    } else if (type === 'status_updated') {
      subject = `Order Status Update: ${orderFormatted.orderId} - ${orderFormatted.orderStatus.toUpperCase()}`;
      htmlContent = `
        <div style="font-family: 'Georgia', serif; padding: 20px; line-height: 1.6; background-color: #FDF8F5; color: #2C2C2C;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg,#8A4F5A,#B76E79); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px;">Van Elvina</h1>
              <p style="color: rgba(255,255,255,0.75); margin: 6px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">Order Status Update</p>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #8A4F5A; font-size: 18px; margin: 0 0 16px;">Hello ${customer.name || 'Valued Customer'},</h2>
              <p style="color: #555; font-size: 14px; margin: 0 0 20px;">
                The status of your order <strong>${orderFormatted.orderId}</strong> has been updated.
              </p>
              
              <div style="background: #FAF0F1; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #E8C5CA; text-align: center;">
                <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #999;">Current Status</span>
                <div style="font-size: 24px; font-weight: bold; color: #8A4F5A; margin: 8px 0;">
                  ${orderFormatted.orderStatus.replace(/_/g, ' ').toUpperCase()}
                </div>
                ${note ? `<p style="margin: 10px 0 0; font-size: 13px; color: #666; font-style: italic;">Note: "${note}"</p>` : ''}
              </div>

              <div style="background: #FAF6F0; border-radius: 12px; padding: 20px; font-size: 13px; color: #555; border: 1px solid #F0E8E0;">
                <h4 style="margin: 0 0 8px; color: #C5A58E; text-transform: uppercase; font-size: 11px; letter-spacing: 1px;">Order Summary</h4>
                <p style="margin: 0 0 5px;"><strong>Order ID:</strong> ${orderFormatted.orderId}</p>
                <p style="margin: 0 0 5px;"><strong>Total Amount:</strong> ₹${orderFormatted.total.toLocaleString('en-IN')}</p>
                <p style="margin: 0;"><strong>Shipping To:</strong> ${orderFormatted.shippingAddress.name} (${orderFormatted.shippingAddress.city})</p>
              </div>

              <p style="color: #999; font-size: 12px; margin: 24px 0 0; text-align: center;">
                If you have any questions or concerns regarding this update, please reply to this email or contact support.
              </p>
            </div>
            <div style="background: #FAF6F0; border-top: 1px solid #F0E8E0; padding: 20px; text-align: center; font-size: 11px; color: #BBB;">
              © 2026 Van Elvina · Premium Women's Innerwear
            </div>
          </div>
        </div>
      `;
    }

    if (subject && htmlContent) {
      await sendEmail({ to: customer.email, subject, html: htmlContent });
      console.log(`Order email notification sent successfully to ${customer.email} for order ${order.order_id} (${type}).`);

      if (type === 'confirmed') {
        const supportSubject = `New Order Received: ${orderFormatted.orderId} - Van Elvina`;
        const supportHtml = `
          <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; border: 1px solid #E8C5CA; border-radius: 12px;">
            <h2 style="color: #8A4F5A; border-bottom: 2px solid #8A4F5A; padding-bottom: 8px; margin-top: 0;">New Order Received! 🎉</h2>
            <p>A new order has been placed on Van Elvina.</p>
            
            <h3 style="color: #8A4F5A; margin-top: 24px; border-bottom: 1px solid #FAF0F1; padding-bottom: 4px;">Customer Details</h3>
            <p style="margin: 8px 0;">
              <strong>Name:</strong> ${customer.name || 'N/A'}<br/>
              <strong>Email:</strong> ${customer.email || 'N/A'}
            </p>

            <h3 style="color: #8A4F5A; margin-top: 24px; border-bottom: 1px solid #FAF0F1; padding-bottom: 4px;">Shipping Address</h3>
            <p style="margin: 8px 0;">
              <strong>Name:</strong> ${orderFormatted.shippingAddress.name}<br/>
              <strong>Phone:</strong> ${orderFormatted.shippingAddress.phone}<br/>
              <strong>Address:</strong> ${orderFormatted.shippingAddress.line1}${orderFormatted.shippingAddress.line2 ? `, ${orderFormatted.shippingAddress.line2}` : ''}<br/>
              <strong>City/State/Zip:</strong> ${orderFormatted.shippingAddress.city}, ${orderFormatted.shippingAddress.state} - ${orderFormatted.shippingAddress.pincode}
            </p>

            <h3 style="color: #8A4F5A; margin-top: 24px; border-bottom: 1px solid #FAF0F1; padding-bottom: 4px;">Order Items</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <thead>
                <tr style="background-color: #FAF0F1; border-bottom: 1px solid #E8C5CA; text-align: left;">
                  <th style="padding: 10px; font-weight: bold;">Product Name</th>
                  <th style="padding: 10px; font-weight: bold;">Variant/Color</th>
                  <th style="padding: 10px; font-weight: bold; text-align: center;">Size</th>
                  <th style="padding: 10px; font-weight: bold; text-align: center;">Qty</th>
                  <th style="padding: 10px; font-weight: bold; text-align: right;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${orderFormatted.items.map((item: any) => `
                  <tr style="border-bottom: 1px solid rgba(232, 197, 202, 0.3);">
                    <td style="padding: 10px; font-size: 13px;">${item.name}</td>
                    <td style="padding: 10px; font-size: 13px;">${item.color || 'N/A'}</td>
                    <td style="padding: 10px; font-size: 13px; text-align: center;">${item.size || 'Standard'}</td>
                    <td style="padding: 10px; font-size: 13px; text-align: center;">${item.quantity}</td>
                    <td style="padding: 10px; font-size: 13px; text-align: right;">₹${item.price.toLocaleString('en-IN')}</td>
                  </tr>
                `).join('')}
                <tr style="font-weight: bold;">
                  <td colspan="4" style="padding: 10px 10px 0; text-align: left; font-size: 13px;">Subtotal</td>
                  <td style="padding: 10px 10px 0; text-align: right; font-size: 13px;">₹${orderFormatted.subtotal.toLocaleString('en-IN')}</td>
                </tr>
                <tr style="font-weight: bold;">
                  <td colspan="4" style="padding: 5px 10px 0; text-align: left; font-size: 13px;">Shipping Fee</td>
                  <td style="padding: 5px 10px 0; text-align: right; font-size: 13px;">₹${orderFormatted.shippingFee.toLocaleString('en-IN')}</td>
                </tr>
                <tr style="font-weight: bold;">
                  <td colspan="4" style="padding: 5px 10px 0; text-align: left; font-size: 13px;">Discount</td>
                  <td style="padding: 5px 10px 0; text-align: right; font-size: 13px;">-₹${orderFormatted.discount.toLocaleString('en-IN')}</td>
                </tr>
                <tr style="font-weight: bold; font-size: 15px; color: #8A4F5A;">
                  <td colspan="4" style="padding: 10px; border-top: 2px solid #8A4F5A; text-align: left;">Total Paid</td>
                  <td style="padding: 10px; border-top: 2px solid #8A4F5A; text-align: right;">₹${orderFormatted.total.toLocaleString('en-IN')}</td>
                </tr>
              </tbody>
            </table>

            <p style="margin-top: 30px; text-align: center;">
              <a href="${Deno.env.get('APP_URL') || 'https://vanelvina.com'}/admin/dashboard" style="background-color: #8A4F5A; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Manage Order on Admin Dashboard</a>
            </p>
          </div>
        `;
        await sendEmail({ to: 'support@vanelvina.com', subject: supportSubject, html: supportHtml });
        console.log(`Admin notification sent to support@vanelvina.com for order ${order.order_id}.`);
      }
    }
  } catch (err) {
    console.error(`Failed to send order email for order ${order?.order_id}:`, err);
  }
};

const optionalAuth = async (c: any, next: () => Promise<void>) => {
  const authHeader = c.req.header('authorization');
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, Deno.env.get('USER_JWT_SECRET') || 've_user_jwt_secret_vanelvina_2026_secure');
      c.set('user', decoded);
    } catch (err) {}
  }
  await next();
};

const generateOrderId = () => {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `VE-${date}-${rand}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders — Place a new order (COD)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', optionalAuth, async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid JSON body' }, 400);
    }
    const {
      items, shippingAddress, paymentMethod, shippingMethod,
      subtotal, shippingFee, discount, total, guestInfo
    } = body;

    if (!items?.length) {
      return c.json({ message: 'Cart is empty' }, 400);
    }
    if (!shippingAddress?.name || !shippingAddress?.line1 || !shippingAddress?.city) {
      return c.json({ message: 'Shipping address is required' }, 400);
    }
    if (!paymentMethod) {
      return c.json({ message: 'Payment method is required' }, 400);
    }

    const mappedItems = items.map((item: any) => ({
      productId: toUUID(item.productId || item._id),
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      size: item.size || 'Standard',
      color: item.color || '',
      image: item.image || ''
    }));

    const userPayload = c.get('user');

    const orderPayload = {
      order_id: generateOrderId(),
      user_id: userPayload ? toUUID(userPayload.id) : null,
      items: mappedItems,
      shipping_address: shippingAddress,
      payment_method: paymentMethod || 'cod',
      shipping_method: shippingMethod || 'standard',
      subtotal: subtotal || 0,
      shipping_fee: shippingFee || 0,
      discount: discount || 0,
      total: total || 0,
      guest_info: guestInfo || null,
      status_history: [{ status: 'placed', timestamp: new Date().toISOString(), note: '' }],
      payment_status: 'pending',
      order_status: 'placed'
    };

    const { data: order, error } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select()
      .single();

    if (error) throw error;

    // Trigger order confirmation email notification
    triggerOrderEmail(order, 'confirmed').catch(err => console.error('Error triggering COD order email:', err));

    return c.json({
      success: true,
      orderId: order.order_id,
      order: formatOrderForFrontend(order),
    }, 201);
  } catch (err) {
    console.error('Place order error:', err);
    return c.json({ message: 'Failed to place order' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders/create-razorpay-order
// ─────────────────────────────────────────────────────────────────────────────
router.post('/create-razorpay-order', optionalAuth, async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid JSON body' }, 400);
    }
    const { amount } = body;
    if (!amount) {
      return c.json({ message: 'Amount is required' }, 400);
    }

    const instance = new Razorpay({
      key_id: Deno.env.get('RAZORPAY_KEY_ID') || 'TEST_KEY_ID',
      key_secret: Deno.env.get('RAZORPAY_KEY_SECRET') || 'TEST_KEY_SECRET',
    });

    const options = {
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `rcpt_${Date.now()}`
    };

    const order = await instance.orders.create(options);
    if (!order) return c.json({ message: "Some error occurred" }, 500);

    return c.json(order);
  } catch (error) {
    console.error('Razorpay create order error:', error);
    return c.json({ message: "Internal Server Error" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders/verify-payment
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify-payment', optionalAuth, async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid JSON body' }, 400);
    }
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      items, shippingAddress, paymentMethod, shippingMethod,
      subtotal, shippingFee, discount, total, guestInfo
    } = body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", Deno.env.get('RAZORPAY_KEY_SECRET') || 'TEST_KEY_SECRET')
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature === expectedSign) {
      const mappedItems = items.map((item: any) => ({
        productId: toUUID(item.productId || item._id),
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        size: item.size || 'Standard',
        color: item.color || '',
        image: item.image || ''
      }));

      const userPayload = c.get('user');

      const orderPayload = {
        order_id: generateOrderId(),
        user_id: userPayload ? toUUID(userPayload.id) : null,
        items: mappedItems,
        shipping_address: shippingAddress,
        payment_method: paymentMethod || 'razorpay',
        shipping_method: shippingMethod || 'standard',
        subtotal: subtotal || 0,
        shipping_fee: shippingFee || 0,
        discount: discount || 0,
        total: total || 0,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        guest_info: guestInfo || null,
        status_history: [{ status: 'placed', timestamp: new Date().toISOString(), note: '' }],
        payment_status: 'paid',
        order_status: 'placed'
      };

      const { data: order, error } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select()
        .single();

      if (error) throw error;

      // Trigger order confirmation email notification
      triggerOrderEmail(order, 'confirmed').catch(err => console.error('Error triggering payment-confirmed order email:', err));

      return c.json({
        success: true,
        message: "Payment verified successfully",
        orderId: order.order_id,
        order: formatOrderForFrontend(order)
      });
    } else {
      return c.json({ message: "Invalid signature sent!" }, 400);
    }
  } catch (error: any) {
    console.error('Razorpay verify payment error:', error);
    return c.json({ message: error.message || "Internal Server Error!" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/my
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my', userAuthMiddleware, async (c) => {
  try {
    const userPayload = c.get('user');
    const userId = toUUID(userPayload.id);
    const userEmail = userPayload.email?.toLowerCase().trim();
    
    let selectQuery = supabase.from('orders').select('*');
    
    if (userEmail) {
      selectQuery = selectQuery.or(`user_id.eq.${userId},guest_info->>email.eq.${userEmail},shipping_address->>email.eq.${userEmail}`);
    } else {
      selectQuery = selectQuery.eq('user_id', userId);
    }
    
    const { data: orders, error } = await selectQuery.order('created_at', { ascending: false });

    if (error) throw error;

    return c.json((orders || []).map(formatOrderForFrontend));
  } catch (err) {
    console.error('fetch my orders error:', err);
    return c.json({ message: 'Server error' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/:id — Get a specific order by order_id or UUID
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (c) => {
  try {
    const idParam = c.req.param('id');
    let selectQuery = supabase.from('orders').select('*');
    
    if (idParam.startsWith('VE-')) {
      selectQuery = selectQuery.eq('order_id', idParam);
    } else {
      selectQuery = selectQuery.eq('id', toUUID(idParam));
    }
    
    const { data: order, error } = await selectQuery.maybeSingle();

    if (error) throw error;
    if (!order) {
      return c.json({ message: 'Order not found' }, 404);
    }
    return c.json(formatOrderForFrontend(order));
  } catch (err) {
    console.error('get order error:', err);
    return c.json({ message: 'Server error' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders — Admin: get all orders with pagination
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (c) => {
  try {
    const status = c.req.query('status');
    const page = c.req.query('page') || '1';
    const limit = c.req.query('limit') || '50';
    const offset = (Number(page) - 1) * Number(limit);
    
    let countQuery = supabase.from('orders').select('*', { count: 'exact', head: true });
    let selectQuery = supabase.from('orders').select('*, users!user_id(id, name, email)');
    
    if (status) {
      countQuery = countQuery.eq('order_status', status);
      selectQuery = selectQuery.eq('order_status', status);
    }
    
    const { count, error: countErr } = await countQuery;
    if (countErr) throw countErr;

    const { data: orders, error: selectErr } = await selectQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (selectErr) throw selectErr;

    const total = count || 0;
    const mappedOrders = (orders || []).map(formatOrderForFrontend);

    return c.json({
      orders: mappedOrders,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit))
    });
  } catch (err) {
    console.error('admin get all orders error:', err);
    return c.json({ message: 'Server error' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/orders/:id/status — Admin: update order status
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/status', authMiddleware, async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid JSON body' }, 400);
    }
    const { orderStatus, paymentStatus, note } = body;
    const orderId = toUUID(c.req.param('id'));

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!order) return c.json({ message: 'Order not found' }, 404);

    const updatePayload: any = {};
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

    if (paymentStatus) {
      updatePayload.payment_status = paymentStatus;
    }

    const { data: updatedOrder, error: updateErr } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    if (statusChanged) {
      triggerOrderEmail(updatedOrder, 'status_updated', note).catch(err => console.error('Error triggering status update email:', err));
    }

    return c.json(formatOrderForFrontend(updatedOrder));
  } catch (err) {
    console.error('update order status error:', err);
    return c.json({ message: 'Server error' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders/:id/return — Request a return
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/return', userAuthMiddleware, async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const { reason } = body;
    const orderId = toUUID(c.req.param('id'));
    const userPayload = c.get('user');
    const userId = toUUID(userPayload.id);

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!order) return c.json({ message: 'Order not found' }, 404);

    if (order.order_status !== 'delivered') {
      return c.json({ message: 'Only delivered orders can be returned' }, 400);
    }

    const deliveredEntry = (order.status_history || []).slice().reverse().find((h: any) => h.status === 'delivered');
    const deliveredDate = deliveredEntry ? deliveredEntry.timestamp : order.updated_at;
    
    if (Date.now() - new Date(deliveredDate).getTime() > 7 * 24 * 60 * 60 * 1000) {
      return c.json({ message: 'Return window (7 days) has expired' }, 400);
    }

    const newHistory = [...(order.status_history || [])];
    newHistory.push({
      status: 'return_requested',
      timestamp: new Date().toISOString(),
      note: reason || ''
    });

    const { data: updatedOrder, error: updateErr } = await supabase
      .from('orders')
      .update({
        order_status: 'return_requested',
        status_history: newHistory
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return c.json(formatOrderForFrontend(updatedOrder));
  } catch (err) {
    console.error('request return error:', err);
    return c.json({ message: 'Server error' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders/:id/exchange — Request an exchange
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/exchange', userAuthMiddleware, async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const { reason } = body;
    const orderId = toUUID(c.req.param('id'));
    const userPayload = c.get('user');
    const userId = toUUID(userPayload.id);

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!order) return c.json({ message: 'Order not found' }, 404);

    if (order.order_status !== 'delivered') {
      return c.json({ message: 'Only delivered orders can be exchanged' }, 400);
    }

    const deliveredEntry = (order.status_history || []).slice().reverse().find((h: any) => h.status === 'delivered');
    const deliveredDate = deliveredEntry ? deliveredEntry.timestamp : order.updated_at;
    
    if (Date.now() - new Date(deliveredDate).getTime() > 7 * 24 * 60 * 60 * 1000) {
      return c.json({ message: 'Exchange window (7 days) has expired' }, 400);
    }

    const newHistory = [...(order.status_history || [])];
    newHistory.push({
      status: 'exchange_requested',
      timestamp: new Date().toISOString(),
      note: reason || ''
    });

    const { data: updatedOrder, error: updateErr } = await supabase
      .from('orders')
      .update({
        order_status: 'exchange_requested',
        status_history: newHistory
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return c.json(formatOrderForFrontend(updatedOrder));
  } catch (err) {
    console.error('request exchange error:', err);
    return c.json({ message: 'Server error' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders/notify-abandoned — Notify admin about abandoned checkout
// ─────────────────────────────────────────────────────────────────────────────
router.post('/notify-abandoned', optionalAuth, async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid JSON body' }, 400);
    }

    const { items, shippingAddress, total, reason, guestInfo } = body;
    
    // Get customer name & email
    const userPayload = c.get('user');
    let customerName = userPayload?.name || guestInfo?.name || 'Guest Customer';
    let customerEmail = userPayload?.email || guestInfo?.email || 'N/A';
    let customerPhone = userPayload?.phone || guestInfo?.phone || shippingAddress?.phone || 'N/A';

    const subject = `⚠️ Abandoned Checkout / Failed Payment - Van Elvina`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; border: 1px solid #E8C5CA; border-radius: 12px;">
        <h2 style="color: #c23b22; border-bottom: 2px solid #c23b22; padding-bottom: 8px; margin-top: 0;">Abandoned Checkout / Failed Payment Alert ⚠️</h2>
        <p>A customer attempted to checkout but did not complete the payment.</p>
        
        <h3 style="color: #8A4F5A; margin-top: 24px; border-bottom: 1px solid #FAF0F1; padding-bottom: 4px;">Reason / Event</h3>
        <p style="margin: 8px 0; color: #c23b22; font-weight: bold;">
          ${reason || 'Unknown reason / payment cancelled'}
        </p>

        <h3 style="color: #8A4F5A; margin-top: 24px; border-bottom: 1px solid #FAF0F1; padding-bottom: 4px;">Customer Details</h3>
        <p style="margin: 8px 0;">
          <strong>Name:</strong> ${customerName}<br/>
          <strong>Email:</strong> ${customerEmail}<br/>
          <strong>Phone:</strong> ${customerPhone}
        </p>

        ${shippingAddress ? `
          <h3 style="color: #8A4F5A; margin-top: 24px; border-bottom: 1px solid #FAF0F1; padding-bottom: 4px;">Shipping Address Provided</h3>
          <p style="margin: 8px 0;">
            <strong>Name:</strong> ${shippingAddress.name || 'N/A'}<br/>
            <strong>Phone:</strong> ${shippingAddress.phone || 'N/A'}<br/>
            <strong>Address:</strong> ${shippingAddress.line1 || ''}${shippingAddress.line2 ? `, ${shippingAddress.line2}` : ''}<br/>
            <strong>City/State/Zip:</strong> ${shippingAddress.city || ''}, ${shippingAddress.state || ''} - ${shippingAddress.pincode || ''}
          </p>
        ` : ''}

        ${items && items.length > 0 ? `
          <h3 style="color: #8A4F5A; margin-top: 24px; border-bottom: 1px solid #FAF0F1; padding-bottom: 4px;">Cart Items</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background-color: #FAF0F1; border-bottom: 1px solid #E8C5CA; text-align: left;">
                <th style="padding: 10px; font-weight: bold;">Product Name</th>
                <th style="padding: 10px; font-weight: bold;">Variant/Color</th>
                <th style="padding: 10px; font-weight: bold; text-align: center;">Size</th>
                <th style="padding: 10px; font-weight: bold; text-align: center;">Qty</th>
                <th style="padding: 10px; font-weight: bold; text-align: right;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item: any) => `
                <tr style="border-bottom: 1px solid rgba(232, 197, 202, 0.3);">
                  <td style="padding: 10px; font-size: 13px;">${item.name || item.product?.name || 'N/A'}</td>
                  <td style="padding: 10px; font-size: 13px;">${item.variantColor || item.color || 'N/A'}</td>
                  <td style="padding: 10px; font-size: 13px; text-align: center;">${item.size || 'Standard'}</td>
                  <td style="padding: 10px; font-size: 13px; text-align: center;">${item.quantity}</td>
                  <td style="padding: 10px; font-size: 13px; text-align: right;">₹${((item.price || item.product?.price || 0) * item.quantity).toLocaleString('en-IN')}</td>
                </tr>
              `).join('')}
              <tr style="font-weight: bold; font-size: 15px; color: #8A4F5A;">
                <td colspan="4" style="padding: 10px; border-top: 2px solid #8A4F5A; text-align: left;">Cart Total Value</td>
                <td style="padding: 10px; border-top: 2px solid #8A4F5A; text-align: right;">₹${(total || 0).toLocaleString('en-IN')}</td>
              </tr>
            </tbody>
          </table>
        ` : ''}
      </div>
    `;

    await sendEmail({ to: 'support@vanelvina.com', subject, html });
    console.log(`Abandoned checkout email sent to support@vanelvina.com for ${customerEmail}`);
    return c.json({ success: true, message: 'Notification sent successfully' });
  } catch (err: any) {
    console.error('notify-abandoned error:', err);
    return c.json({ message: 'Server error' }, 500);
  }
});

export default router;
