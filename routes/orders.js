import express from 'express';
import { supabase } from '../utils/supabase.js';
import { toUUID } from '../utils/uuid.js';
import userAuth from '../middleware/userAuth.js';
import adminAuth from '../middleware/auth.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { sendEmail } from '../utils/email.js';

const router = express.Router();

// Helper: Format Order for Frontend compatibility (renames properties to camelCase)
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
    statusHistory: (order.status_history || []).map(h => ({
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

const triggerOrderEmail = async (order, type, note = '') => {
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
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; line-height: 1.6; background-color: #FDF8F5; color: #2C2C2C; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(92,43,53,0.06); border: 1px solid rgba(232, 197, 202, 0.4);">
            <!-- Logo -->
            <div style="padding: 24px; text-align: center; border-bottom: 1px solid #FAF0F1;">
              <img src="${process.env.APP_URL || 'https://vanelvina.com'}/logo.png" alt="Van Elvina" style="height: 38px; width: auto; display: inline-block; max-width: 100%;" />
            </div>
            <!-- Header banner -->
            <div style="background-color: #FAF0F1; padding: 32px 24px; text-align: center; border-bottom: 1px solid #E8C5CA;">
              <h1 style="color: #8A4F5A; margin: 0 0 8px; font-family: 'Playfair Display', Georgia, serif; font-size: 24px; font-weight: bold; letter-spacing: 0.5px;">Your Order is Confirmed! 🎉</h1>
              <p style="color: #5C2B35; margin: 0; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px;">Thank you for shopping with us</p>
            </div>
            <!-- Body -->
            <div style="padding: 32px 24px;">
              <p style="font-size: 15px; margin-top: 0; margin-bottom: 24px; color: #4A4A4A;">
                Hello <strong>${customer.name || 'Valued Customer'}</strong>, we're thrilled to let you know that we've received your order! Our team is already preparing it with the utmost care.
              </p>
              
              <div style="background: #FAF0F1; border-radius: 16px; padding: 24px; margin-bottom: 28px; border: 1px solid #E8C5CA;">
                <h3 style="color: #8A4F5A; font-size: 14px; margin-top: 0; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; border-bottom: 1px solid #E8C5CA; padding-bottom: 8px;">Order Details</h3>
                <p style="margin: 0 0 8px; font-size: 13px; color: #4A4A4A;"><strong>Order Reference:</strong> <span style="font-family: monospace; font-weight: bold; color: #8A4F5A;">${orderFormatted.orderId}</span></p>
                <p style="margin: 0 0 16px; font-size: 13px; color: #4A4A4A;"><strong>Payment Method:</strong> ${orderFormatted.paymentMethod.toUpperCase()}</p>
                
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                  <thead>
                    <tr style="border-bottom: 1px solid #E8C5CA; text-align: left; color: #8A4F5A; font-weight: bold;">
                      <th style="padding: 10px 0;">Item</th>
                      <th style="padding: 10px 0; text-align: center;">Qty</th>
                      <th style="padding: 10px 0; text-align: right;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${orderFormatted.items.map((item) => `
                      <tr style="border-bottom: 1px solid rgba(232, 197, 202, 0.3);">
                        <td style="padding: 10px 0; color: #4A4A4A;">
                          <div style="font-weight: bold;">${item.name}</div>
                          ${item.size ? `<span style="font-size: 11px; color: #888;">Size: ${item.size}</span>` : ''}
                        </td>
                        <td style="padding: 10px 0; text-align: center; color: #4A4A4A; vertical-align: middle;">${item.quantity}</td>
                        <td style="padding: 10px 0; text-align: right; color: #4A4A4A; vertical-align: middle; font-weight: bold;">₹${item.price.toLocaleString('en-IN')}</td>
                      </tr>
                    `).join('')}
                    <tr>
                      <td colspan="2" style="padding: 16px 0 0; font-weight: bold; color: #8A4F5A; font-size: 14px;">Total Paid</td>
                      <td style="padding: 16px 0 0; text-align: right; font-weight: bold; color: #8A4F5A; font-size: 16px;">₹${orderFormatted.total.toLocaleString('en-IN')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Shipping Details -->
              <div style="background: #FAF6F0; border-radius: 16px; padding: 24px; border: 1px solid #F0E8E0; margin-bottom: 32px;">
                <h3 style="color: #C5A58E; font-size: 14px; margin-top: 0; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; border-bottom: 1px solid #F0E8E0; padding-bottom: 8px;">Delivery Details</h3>
                <p style="margin: 0; font-size: 13px; color: #4A4A4A; line-height: 1.6;">
                  <strong style="color: #8A4F5A; font-size: 14px;">${orderFormatted.shippingAddress.name}</strong><br/>
                  ${orderFormatted.shippingAddress.line1}${orderFormatted.shippingAddress.line2 ? `, ${orderFormatted.shippingAddress.line2}` : ''}<br/>
                  ${orderFormatted.shippingAddress.city}, ${orderFormatted.shippingAddress.state} - ${orderFormatted.shippingAddress.pincode}<br/>
                  <strong>Phone:</strong> ${orderFormatted.shippingAddress.phone}
                </p>
              </div>

              <!-- CTA -->
              <div style="text-align: center; margin-bottom: 16px;">
                <a href="${process.env.APP_URL || 'https://vanelvina.com'}/account/orders/${orderFormatted._id}" style="background-color: #8A4F5A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: bold; display: inline-block; font-size: 13px; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(138,79,90,0.2);">Track Your Order</a>
              </div>
            </div>
            <!-- Footer -->
            <div style="background: #FAF6F0; border-top: 1px solid #F0E8E0; padding: 24px; text-align: center; font-size: 11px; color: #888;">
              <p style="margin: 0 0 6px; font-weight: bold; color: #8A4F5A;">Van Elvina</p>
              <p style="margin: 0 0 12px;">Premium Women's Innerwear & Lingerie</p>
              <p style="margin: 0; color: #AAA;">This is an automated order confirmation. If you have any questions, please contact support.</p>
            </div>
          </div>
        </div>
      `;
    } else if (type === 'status_updated') {
      subject = `Shipping Update: ${orderFormatted.orderId} - ${orderFormatted.orderStatus.replace(/_/g, ' ').toUpperCase()}`;
      htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; line-height: 1.6; background-color: #FDF8F5; color: #2C2C2C; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(92,43,53,0.06); border: 1px solid rgba(232, 197, 202, 0.4);">
            <!-- Logo -->
            <div style="padding: 24px; text-align: center; border-bottom: 1px solid #FAF0F1;">
              <img src="${process.env.APP_URL || 'https://vanelvina.com'}/logo.png" alt="Van Elvina" style="height: 38px; width: auto; display: inline-block; max-width: 100%;" />
            </div>
            <!-- Header banner -->
            <div style="background-color: #FAF0F1; padding: 32px 24px; text-align: center; border-bottom: 1px solid #E8C5CA;">
              <h1 style="color: #8A4F5A; margin: 0 0 8px; font-family: 'Playfair Display', Georgia, serif; font-size: 24px; font-weight: bold; letter-spacing: 0.5px;">Shipping Update 📦</h1>
              <p style="color: #5C2B35; margin: 0; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px;">Your order has a new status</p>
            </div>
            <!-- Body -->
            <div style="padding: 32px 24px;">
              <p style="font-size: 15px; margin-top: 0; margin-bottom: 24px; color: #4A4A4A;">
                Hello <strong>${customer.name || 'Valued Customer'}</strong>, we've updated the status of your order <strong>${orderFormatted.orderId}</strong>.
              </p>
              
              <div style="background: #FAF0F1; border-radius: 16px; padding: 24px; margin-bottom: 28px; border: 1px solid #E8C5CA; text-align: center;">
                <span style="font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #888;">Current Status</span>
                <div style="font-size: 22px; font-weight: bold; color: #8A4F5A; margin: 8px 0; font-family: Georgia, serif;">
                  ${orderFormatted.orderStatus.replace(/_/g, ' ').toUpperCase()}
                </div>
                ${note ? `<p style="margin: 12px 0 0; font-size: 13px; color: #5C2B35; font-style: italic; background: white; padding: 10px; border-radius: 8px; border: 1px dashed #E8C5CA;">"${note}"</p>` : ''}
              </div>

              <!-- Shipping Details -->
              <div style="background: #FAF6F0; border-radius: 16px; padding: 24px; border: 1px solid #F0E8E0; margin-bottom: 32px;">
                <h3 style="color: #C5A58E; font-size: 14px; margin-top: 0; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; border-bottom: 1px solid #F0E8E0; padding-bottom: 8px;">Order Summary</h3>
                <p style="margin: 0; font-size: 13px; color: #4A4A4A; line-height: 1.6;">
                  <strong>Order Reference:</strong> ${orderFormatted.orderId}<br/>
                  <strong>Grand Total:</strong> ₹${orderFormatted.total.toLocaleString('en-IN')}<br/>
                  <strong>Shipping To:</strong> ${orderFormatted.shippingAddress.name} (${orderFormatted.shippingAddress.city})
                </p>
              </div>

              <!-- CTA -->
              <div style="text-align: center; margin-bottom: 16px;">
                <a href="${process.env.APP_URL || 'https://vanelvina.com'}/account/orders/${orderFormatted._id}" style="background-color: #8A4F5A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: bold; display: inline-block; font-size: 13px; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(138,79,90,0.2);">View Order History</a>
              </div>
            </div>
            <!-- Footer -->
            <div style="background: #FAF6F0; border-top: 1px solid #F0E8E0; padding: 24px; text-align: center; font-size: 11px; color: #888;">
              <p style="margin: 0 0 6px; font-weight: bold; color: #8A4F5A;">Van Elvina</p>
              <p style="margin: 0 0 12px;">Premium Women's Innerwear & Lingerie</p>
              <p style="margin: 0; color: #AAA;">If you have any questions or feedback, please reply to this email.</p>
            </div>
          </div>
        </div>
      `;
    } else if (type === 'return_requested') {
      subject = `Return Request Received: ${orderFormatted.orderId} - Van Elvina`;
      htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; line-height: 1.6; background-color: #FDF8F5; color: #2C2C2C; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(92,43,53,0.06); border: 1px solid rgba(232, 197, 202, 0.4);">
            <!-- Logo -->
            <div style="padding: 24px; text-align: center; border-bottom: 1px solid #FAF0F1;">
              <img src="${process.env.APP_URL || 'https://vanelvina.com'}/logo.png" alt="Van Elvina" style="height: 38px; width: auto; display: inline-block; max-width: 100%;" />
            </div>
            <!-- Header banner -->
            <div style="background-color: #FAF0F1; padding: 32px 24px; text-align: center; border-bottom: 1px solid #E8C5CA;">
              <h1 style="color: #8A4F5A; margin: 0 0 8px; font-family: 'Playfair Display', Georgia, serif; font-size: 24px; font-weight: bold; letter-spacing: 0.5px;">Return Requested 🔄</h1>
              <p style="color: #5C2B35; margin: 0; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px;">Fulfillment Request Initiated</p>
            </div>
            <!-- Body -->
            <div style="padding: 32px 24px;">
              <p style="font-size: 15px; margin-top: 0; margin-bottom: 24px; color: #4A4A4A;">
                Hello <strong>${customer.name || 'Valued Customer'}</strong>, we've registered your request to return items from order <strong>${orderFormatted.orderId}</strong>.
              </p>
              
              <div style="background: #FAF0F1; border-radius: 16px; padding: 24px; margin-bottom: 28px; border: 1px solid #E8C5CA;">
                <p style="margin: 0 0 8px; font-size: 13px; color: #4A4A4A;"><strong>Return Reason:</strong> "${note || 'Not specified'}"</p>
                <p style="margin: 0; font-size: 13px; color: #4A4A4A;"><strong>Status:</strong> Awaiting Reverse Pickup</p>
              </div>

              <!-- Pickup Address Details -->
              <div style="background: #FAF6F0; border-radius: 16px; padding: 24px; border: 1px solid #F0E8E0; margin-bottom: 28px;">
                <h3 style="color: #C5A58E; font-size: 14px; margin-top: 0; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; border-bottom: 1px solid #F0E8E0; padding-bottom: 8px;">Pickup Address</h3>
                <p style="margin: 0; font-size: 13px; color: #4A4A4A; line-height: 1.6;">
                  <strong>Name:</strong> ${orderFormatted.shippingAddress.name}<br/>
                  <strong>Address:</strong> ${orderFormatted.shippingAddress.line1}${orderFormatted.shippingAddress.line2 ? `, ${orderFormatted.shippingAddress.line2}` : ''}<br/>
                  ${orderFormatted.shippingAddress.city}, ${orderFormatted.shippingAddress.state} - ${orderFormatted.shippingAddress.pincode}<br/>
                  <strong>Phone:</strong> ${orderFormatted.shippingAddress.phone}
                </p>
              </div>

              <h4 style="color: #8A4F5A; font-size: 14px; margin-top: 0; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold;">Important Guidelines for Pickup</h4>
              <ul style="margin: 0 0 28px; padding-left: 20px; font-size: 13px; color: #555; line-height: 1.7;">
                <li style="margin-bottom: 8px;"><strong>Keep tags attached:</strong> The product must be returned with all original tags, labels, and price tickets intact.</li>
                <li style="margin-bottom: 8px;"><strong>Keep packaging:</strong> Please secure the items in their original boxes or plastic bags.</li>
                <li style="margin-bottom: 8px;"><strong>Condition check:</strong> Items must be completely clean, unworn, and unwashed. Our courier agent will verify this.</li>
                <li style="margin-bottom: 0;"><strong>Refund Process:</strong> Once we receive the package back at our warehouse and verify it, your refund will be processed to the original payment source within 5-7 business days.</li>
              </ul>

              <p style="color: #8A4F5A; font-size: 13px; text-align: center; font-weight: bold;">
                Our logistics partner will coordinate the pickup timeline within 2-3 business days.
              </p>
            </div>
            <!-- Footer -->
            <div style="background: #FAF6F0; border-top: 1px solid #F0E8E0; padding: 24px; text-align: center; font-size: 11px; color: #888;">
              <p style="margin: 0 0 6px; font-weight: bold; color: #8A4F5A;">Van Elvina</p>
              <p style="margin: 0 0 12px;">Premium Women's Innerwear & Lingerie</p>
              <p style="margin: 0; color: #AAA;">Need help? Reply directly to this email to contact our operations desk.</p>
            </div>
          </div>
        </div>
      `;
    }

    if (subject && htmlContent) {
      await sendEmail({ to: customer.email, subject, html: htmlContent });
      console.log(`Order email notification sent successfully to ${customer.email} for order ${order.order_id} (${type}).`);

      if (type === 'confirmed') {
        const supportSubject = `New Order Received: ${orderFormatted.orderId}`;
        const productItems = (orderFormatted.items || []).filter(i => i.name !== 'Gift Wrapper');
        const giftWrapItem = (orderFormatted.items || []).find(i => i.name === 'Gift Wrapper');
        const productText = productItems.map(item => `${item.quantity} x ${item.name}`).join(', ');
        const itemsLine = productText + (giftWrapItem ? ' and 1 x Gift Wrapper' : '');

        const supportHtml = `
          <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; color: #2C2C2C;">
            <h2 style="color: #8A4F5A; margin-top: 0;">New Order Received</h2>
            <p>A new order <strong>${orderFormatted.orderId}</strong> has just been placed by <strong>${customer.name || 'Customer'}</strong> (${customer.email}).</p>
            <p><strong>Items:</strong> ${itemsLine}</p>
            <p><strong>Order Total:</strong> ₹${orderFormatted.total.toLocaleString('en-IN')}</p>
            <p>Please check the <a href="${process.env.APP_URL || 'http://localhost:3000'}/admin/dashboard">admin dashboard</a> for full details.</p>
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

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.USER_JWT_SECRET || 've_user_jwt_secret_vanelvina_2026_secure');
    } catch (err) {}
  }
  next();
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
router.post('/', optionalAuth, async (req, res) => {
  try {
    const {
      items, shippingAddress, paymentMethod, shippingMethod,
      subtotal, shippingFee, discount, total, guestInfo
    } = req.body;

    if (!items?.length) {
      return res.status(400).json({ message: 'Cart is empty' });
    }
    if (!shippingAddress?.name || !shippingAddress?.line1 || !shippingAddress?.city) {
      return res.status(400).json({ message: 'Shipping address is required' });
    }
    if (!paymentMethod) {
      return res.status(400).json({ message: 'Payment method is required' });
    }

    const mappedItems = items.map(item => ({
      productId: toUUID(item.productId || item._id),
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      size: item.size || 'Standard',
      color: item.color || '',
      image: item.image || ''
    }));

    const orderPayload = {
      order_id: generateOrderId(),
      user_id: req.user ? toUUID(req.user.id) : null,
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

    let { data: order, error } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select()
      .single();

    // Handle stale JWT foreign key violation on user_id
    if (error && error.code === '23503' && error.message.includes('orders_user_id_fkey')) {
      console.warn('Stale JWT token detected (user_id not in DB). Retrying as guest...');
      orderPayload.user_id = null;
      const retry = await supabase
        .from('orders')
        .insert(orderPayload)
        .select()
        .single();
      order = retry.data;
      error = retry.error;
    }

    if (error) throw error;

    // Trigger order confirmation email notification
    triggerOrderEmail(order, 'confirmed').catch(err => console.error('Error triggering COD order email:', err));

    return res.status(201).json({
      success: true,
      orderId: order.order_id,
      order: formatOrderForFrontend(order),
    });
  } catch (err) {
    console.error('Place order error:', err);
    return res.status(500).json({ message: 'Failed to place order' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders/create-razorpay-order
// ─────────────────────────────────────────────────────────────────────────────
router.post('/create-razorpay-order', optionalAuth, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount) {
      return res.status(400).json({ message: 'Amount is required' });
    }

    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || 'TEST_KEY_ID',
      key_secret: process.env.RAZORPAY_KEY_SECRET || 'TEST_KEY_SECRET',
    });

    const options = {
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `rcpt_${Date.now()}`
    };

    const order = await instance.orders.create(options);
    if (!order) return res.status(500).json({ message: "Some error occurred" });

    res.json(order);
  } catch (error) {
    console.error('Razorpay create order error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders/verify-payment
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify-payment', optionalAuth, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      items, shippingAddress, paymentMethod, shippingMethod,
      subtotal, shippingFee, discount, total, guestInfo
    } = req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || 'TEST_KEY_SECRET')
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature === expectedSign) {
      const mappedItems = items.map(item => ({
        productId: toUUID(item.productId || item._id),
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        size: item.size || 'Standard',
        color: item.color || '',
        image: item.image || ''
      }));

      const orderPayload = {
        order_id: generateOrderId(),
        user_id: req.user ? toUUID(req.user.id) : null,
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

      return res.status(200).json({
        success: true,
        message: "Payment verified successfully",
        orderId: order.order_id,
        order: formatOrderForFrontend(order)
      });
    } else {
      return res.status(400).json({ message: "Invalid signature sent!" });
    }
  } catch (error) {
    console.error('Razorpay verify payment error:', error);
    res.status(500).json({ message: "Internal Server Error!" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/my
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my', userAuth, async (req, res) => {
  try {
    const userId = toUUID(req.user.id);
    const userEmail = req.user.email?.toLowerCase().trim();
    
    let selectQuery = supabase.from('orders').select('*');
    
    if (userEmail) {
      selectQuery = selectQuery.or(`user_id.eq.${userId},guest_info->>email.eq.${userEmail},shipping_address->>email.eq.${userEmail}`);
    } else {
      selectQuery = selectQuery.eq('user_id', userId);
    }
    
    const { data: orders, error } = await selectQuery.order('created_at', { ascending: false });

    if (error) throw error;

    return res.json((orders || []).map(formatOrderForFrontend));
  } catch (err) {
    console.error('fetch my orders error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/:id — Get a specific order by order_id or UUID
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const idParam = req.params.id;
    let selectQuery = supabase.from('orders').select('*');
    
    if (idParam.startsWith('VE-')) {
      selectQuery = selectQuery.eq('order_id', idParam);
    } else {
      selectQuery = selectQuery.eq('id', toUUID(idParam));
    }
    
    const { data: order, error } = await selectQuery.maybeSingle();

    if (error) throw error;
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    return res.json(formatOrderForFrontend(order));
  } catch (err) {
    console.error('get order error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders — Admin: get all orders with pagination
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', adminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
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

    return res.json({
      orders: mappedOrders,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit))
    });
  } catch (err) {
    console.error('admin get all orders error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/orders/:id/status — Admin: update order status
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/status', adminAuth, async (req, res) => {
  try {
    const { orderStatus, paymentStatus, note } = req.body;
    const orderId = toUUID(req.params.id);

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!order) return res.status(404).json({ message: 'Order not found' });

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

    return res.json(formatOrderForFrontend(updatedOrder));
  } catch (err) {
    console.error('update order status error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders/:id/return — Request a return
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/return', userAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const orderId = toUUID(req.params.id);
    const userId = toUUID(req.user.id);

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.order_status !== 'delivered') {
      return res.status(400).json({ message: 'Only delivered orders can be returned' });
    }

    const deliveredEntry = (order.status_history || []).slice().reverse().find(h => h.status === 'delivered');
    const deliveredDate = deliveredEntry ? deliveredEntry.timestamp : order.updated_at;
    
    if (Date.now() - new Date(deliveredDate).getTime() > 7 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ message: 'Return window (7 days) has expired' });
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

    return res.json(formatOrderForFrontend(updatedOrder));
  } catch (err) {
    console.error('request return error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders/:id/exchange — Request an exchange
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/exchange', userAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const orderId = toUUID(req.params.id);
    const userId = toUUID(req.user.id);

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.order_status !== 'delivered') {
      return res.status(400).json({ message: 'Only delivered orders can be exchanged' });
    }

    const deliveredEntry = (order.status_history || []).slice().reverse().find(h => h.status === 'delivered');
    const deliveredDate = deliveredEntry ? deliveredEntry.timestamp : order.updated_at;
    
    if (Date.now() - new Date(deliveredDate).getTime() > 7 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ message: 'Exchange window (7 days) has expired' });
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

    return res.json(formatOrderForFrontend(updatedOrder));
  } catch (err) {
    console.error('request exchange error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
