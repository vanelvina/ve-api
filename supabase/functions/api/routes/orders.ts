import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import { supabase } from '../utils/supabase.ts';
import { toUUID } from '../utils/uuid.ts';
import { userAuthMiddleware, authMiddleware } from '../middleware/auth.ts';
import Razorpay from 'npm:razorpay';
import crypto from 'node:crypto';
import jwt from 'npm:jsonwebtoken';
import { sendEmail } from '../utils/email.ts';
import { sendPushNotification } from './inquiries.ts';

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

const triggerOrderPushNotification = async (order: any, title: string, body: string, url: string = '/') => {
  try {
    const customer = await getOrderCustomerInfo(order);
    if (customer.email) {
      await sendPushNotification(customer.email, title, body, url);
    }
  } catch (err) {
    console.error('Error triggering order push notification:', err);
  }
};

// Fire-and-forget: decrement per-size stock for each item in the order
const decrementStockForOrder = (order: any) => {
  try {
    const items: any[] = order.items || [];
    const byProduct: Record<string, { color: string; size: string; quantity: number }[]> = {};
    for (const item of items) {
      const pid = item.productId || item.product_id;
      if (!pid) continue;
      if (!byProduct[pid]) byProduct[pid] = [];
      byProduct[pid].push({ color: item.color || '', size: item.size || '', quantity: item.quantity || 1 });
    }
    for (const [productId, lineItems] of Object.entries(byProduct)) {
      supabase
        .from('products')
        .select('id, variants, stock_count')
        .eq('id', productId)
        .single()
        .then(({ data: prod }: any) => {
          if (!prod) return;
          const variants: any[] = prod.variants || [];
          let totalDecrement = 0;
          for (const li of lineItems) {
            const vIdx = variants.findIndex((v: any) => v.color?.toLowerCase() === li.color.toLowerCase());
            if (vIdx === -1) continue;
            const v = variants[vIdx];
            if (!v.stockPerSize) v.stockPerSize = {};
            const cur = v.stockPerSize[li.size] ?? null;
            if (cur !== null) v.stockPerSize[li.size] = Math.max(0, cur - li.quantity);
            totalDecrement += li.quantity;
          }
          supabase
            .from('products')
            .update({ variants, stock_count: Math.max(0, (prod.stock_count || 0) - totalDecrement) })
            .eq('id', productId)
            .then(({ error }: any) => { if (error) console.error('stock decrement error:', error); });
        })
        .catch((err: any) => console.error('stock decrement fetch error:', err));
    }
  } catch (err) {
    console.error('decrementStockForOrder error:', err);
  }
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
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; line-height: 1.6; background-color: #FDF8F5; color: #2C2C2C; margin: 0;">
          <div style="width: 100%; max-width: 100%; background: white; overflow: hidden;">
            <!-- Logo -->
            <div style="padding: 24px; text-align: center; border-bottom: 1px solid #FAF0F1;">
              <img src="${Deno.env.get('APP_URL') || 'https://vanelvina.com'}/logo.png" alt="Van Elvina" style="height: 38px; width: auto; display: inline-block; max-width: 100%;" />
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
                    ${orderFormatted.items.map((item: any) => `
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
                <a href="${Deno.env.get('APP_URL') || 'https://vanelvina.com'}/account/orders/${orderFormatted._id}" style="background-color: #8A4F5A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: bold; display: inline-block; font-size: 13px; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(138,79,90,0.2);">Track Your Order</a>
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
          <div style="width: 100%; max-width: 100%; background: white; overflow: hidden;">
            <!-- Logo -->
            <div style="padding: 24px; text-align: center; border-bottom: 1px solid #FAF0F1;">
              <img src="${Deno.env.get('APP_URL') || 'https://vanelvina.com'}/logo.png" alt="Van Elvina" style="height: 38px; width: auto; display: inline-block; max-width: 100%;" />
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
                <a href="${Deno.env.get('APP_URL') || 'https://vanelvina.com'}/account/orders/${orderFormatted._id}" style="background-color: #8A4F5A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: bold; display: inline-block; font-size: 13px; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(138,79,90,0.2);">View Order History</a>
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
          <div style="width: 100%; max-width: 100%; background: white; overflow: hidden;">
            <!-- Logo -->
            <div style="padding: 24px; text-align: center; border-bottom: 1px solid #FAF0F1;">
              <img src="${Deno.env.get('APP_URL') || 'https://vanelvina.com'}/logo.png" alt="Van Elvina" style="height: 38px; width: auto; display: inline-block; max-width: 100%;" />
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
    } else if (type === 'exchange_requested') {
      subject = `Exchange Request Received: ${orderFormatted.orderId} - Van Elvina`;
      htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; line-height: 1.6; background-color: #FDF8F5; color: #2C2C2C; margin: 0;">
          <div style="width: 100%; max-width: 100%; background: white; overflow: hidden;">
            <!-- Logo -->
            <div style="padding: 24px; text-align: center; border-bottom: 1px solid #FAF0F1;">
              <img src="${Deno.env.get('APP_URL') || 'https://vanelvina.com'}/logo.png" alt="Van Elvina" style="height: 38px; width: auto; display: inline-block; max-width: 100%;" />
            </div>
            <!-- Header banner -->
            <div style="background-color: #FAF0F1; padding: 32px 24px; text-align: center; border-bottom: 1px solid #E8C5CA;">
              <h1 style="color: #8A4F5A; margin: 0 0 8px; font-family: 'Playfair Display', Georgia, serif; font-size: 24px; font-weight: bold; letter-spacing: 0.5px;">Exchange Requested 🔄</h1>
              <p style="color: #5C2B35; margin: 0; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px;">Fulfillment Request Initiated</p>
            </div>
            <!-- Body -->
            <div style="padding: 32px 24px;">
              <p style="font-size: 15px; margin-top: 0; margin-bottom: 24px; color: #4A4A4A;">
                Hello <strong>${customer.name || 'Valued Customer'}</strong>, we've registered your request to exchange items from order <strong>${orderFormatted.orderId}</strong>.
              </p>
              
              <div style="background: #FAF0F1; border-radius: 16px; padding: 24px; margin-bottom: 28px; border: 1px solid #E8C5CA;">
                <p style="margin: 0 0 8px; font-size: 13px; color: #4A4A4A;"><strong>Exchange Reason:</strong> "${note || 'Not specified'}"</p>
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

              <h4 style="color: #8A4F5A; font-size: 14px; margin-top: 0; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold;">How the Exchange Works</h4>
              <ul style="margin: 0 0 28px; padding-left: 20px; font-size: 13px; color: #555; line-height: 1.7;">
                <li style="margin-bottom: 8px;"><strong>Keep tags intact:</strong> Make sure items are in original condition with tags intact.</li>
                <li style="margin-bottom: 8px;"><strong>Keep packaging:</strong> Pack the items securely in their original wrap/box.</li>
                <li style="margin-bottom: 8px;"><strong>Fulfillment swap:</strong> Our logistics agent will pick up the current package. Once it is received and verified at our quality check desk, we will dispatch the exchange variant/size to your address.</li>
              </ul>

              <p style="color: #8A4F5A; font-size: 13px; text-align: center; font-weight: bold;">
                We are preparing your exchange order and scheduling the pickup timeline.
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
        const orderDate = new Date(order.created_at || Date.now()).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const supportSubject = `🛒 New Order: ${orderFormatted.orderId} – ₹${orderFormatted.total.toLocaleString('en-IN')} | Van Elvina`;
        const supportHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #FDF8F5; padding: 20px; margin: 0; color: #2C2C2C;">
            <div style="max-width: 640px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(92,43,53,0.08); border: 1px solid rgba(232,197,202,0.5);">

              <!-- Header -->
              <div style="background: linear-gradient(135deg, #5C2B35, #8A4F5A); padding: 28px 24px; text-align: center;">
                <h1 style="color: white; margin: 0 0 6px; font-size: 22px; font-weight: bold; letter-spacing: 0.5px;">New Order Received! 🎉</h1>
                <p style="color: rgba(255,255,255,0.75); margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">Van Elvina Store Console</p>
              </div>

              <div style="padding: 28px 24px;">

                <!-- Order Info Banner -->
                <div style="background: #FAF0F1; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; border: 1px solid #E8C5CA;">
                  <p style="margin: 0 0 6px; font-size: 13px; color: #5C2B35;"><strong>Order ID:</strong> <span style="font-family: monospace; font-weight: bold; font-size: 14px; color: #8A4F5A;">${orderFormatted.orderId}</span></p>
                  <p style="margin: 0 0 6px; font-size: 13px; color: #555;"><strong>Placed On:</strong> ${orderDate}</p>
                  <p style="margin: 0 0 6px; font-size: 13px; color: #555;"><strong>Payment Method:</strong> ${orderFormatted.paymentMethod.toUpperCase()}</p>
                  <p style="margin: 0; font-size: 15px; color: #5C2B35; font-weight: bold;">Total: ₹${orderFormatted.total.toLocaleString('en-IN')}</p>
                </div>

                <!-- Customer Info -->
                <h3 style="color: #8A4F5A; font-size: 12px; font-weight: bold; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #FAF0F1; padding-bottom: 6px;">Customer</h3>
                <p style="margin: 0 0 4px; font-size: 13px;"><strong>Name:</strong> ${customer.name || 'N/A'}</p>
                <p style="margin: 0 0 20px; font-size: 13px;"><strong>Email:</strong> <a href="mailto:${customer.email}" style="color: #8A4F5A;">${customer.email || 'N/A'}</a></p>

                <!-- Shipping Address -->
                <h3 style="color: #8A4F5A; font-size: 12px; font-weight: bold; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #FAF0F1; padding-bottom: 6px;">Shipping Address</h3>
                <p style="margin: 0 0 20px; font-size: 13px; line-height: 1.7;">
                  <strong>${orderFormatted.shippingAddress.name}</strong><br/>
                  ${orderFormatted.shippingAddress.line1}${orderFormatted.shippingAddress.line2 ? `, ${orderFormatted.shippingAddress.line2}` : ''}<br/>
                  ${orderFormatted.shippingAddress.city}, ${orderFormatted.shippingAddress.state} – ${orderFormatted.shippingAddress.pincode}<br/>
                  <strong>Phone:</strong> ${orderFormatted.shippingAddress.phone}
                </p>

                <!-- Order Items with Images -->
                <h3 style="color: #8A4F5A; font-size: 12px; font-weight: bold; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #FAF0F1; padding-bottom: 6px;">Items Ordered</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
                  <thead>
                    <tr style="background-color: #FAF0F1; border-bottom: 1px solid #E8C5CA; text-align: left;">
                      <th style="padding: 10px 8px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #8A4F5A;">Photo</th>
                      <th style="padding: 10px 8px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #8A4F5A;">Product</th>
                      <th style="padding: 10px 8px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; color: #8A4F5A;">Qty</th>
                      <th style="padding: 10px 8px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; text-align: right; color: #8A4F5A;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${orderFormatted.items.map((item: any) => `
                      <tr style="border-bottom: 1px solid rgba(232, 197, 202, 0.3); vertical-align: middle;">
                        <td style="padding: 10px 8px; width: 60px;">
                          ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width: 52px; height: 60px; object-fit: cover; border-radius: 6px; display: block; border: 1px solid #FAF0F1;" />` : '<div style="width:52px;height:60px;background:#FAF0F1;border-radius:6px;"></div>'}
                        </td>
                        <td style="padding: 10px 8px; font-size: 13px;">
                          <strong style="display: block; color: #2C2C2C;">${item.name}</strong>
                          <span style="font-size: 11px; color: #888; display: block; margin-top: 3px;">${[item.color, item.size ? `Size: ${item.size}` : ''].filter(Boolean).join(' · ') || 'Standard'}</span>
                        </td>
                        <td style="padding: 10px 8px; font-size: 13px; text-align: center; color: #555;">× ${item.quantity}</td>
                        <td style="padding: 10px 8px; font-size: 13px; text-align: right; font-weight: bold; color: #2C2C2C;">₹${(item.price * item.quantity).toLocaleString('en-IN')}</td>
                      </tr>
                    `).join('')}
                    <tr style="background: #FAF6F0;">
                      <td colspan="3" style="padding: 8px 10px; font-size: 12px; color: #555;">Subtotal</td>
                      <td style="padding: 8px 10px; font-size: 12px; text-align: right; color: #555;">₹${orderFormatted.subtotal.toLocaleString('en-IN')}</td>
                    </tr>
                    <tr style="background: #FAF6F0;">
                      <td colspan="3" style="padding: 4px 10px; font-size: 12px; color: #555;">Shipping</td>
                      <td style="padding: 4px 10px; font-size: 12px; text-align: right; color: #555;">₹${orderFormatted.shippingFee.toLocaleString('en-IN')}</td>
                    </tr>
                    <tr style="background: #FAF6F0;">
                      <td colspan="3" style="padding: 4px 10px; font-size: 12px; color: #555;">Discount</td>
                      <td style="padding: 4px 10px; font-size: 12px; text-align: right; color: #22a722;">-₹${orderFormatted.discount.toLocaleString('en-IN')}</td>
                    </tr>
                    <tr style="font-weight: bold; font-size: 15px; color: #8A4F5A;">
                      <td colspan="3" style="padding: 12px 10px; border-top: 2px solid #8A4F5A;">Grand Total</td>
                      <td style="padding: 12px 10px; border-top: 2px solid #8A4F5A; text-align: right;">₹${orderFormatted.total.toLocaleString('en-IN')}</td>
                    </tr>
                  </tbody>
                </table>

                <!-- CTA -->
                <div style="text-align: center; margin-top: 24px;">
                  <a href="https://vanelvina.com/admin/dashboard" style="background-color: #8A4F5A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block; font-size: 13px; letter-spacing: 0.5px;">Open Admin Dashboard →</a>
                </div>

              </div>

              <!-- Footer -->
              <div style="background: #FAF6F0; border-top: 1px solid #F0E8E0; padding: 16px 24px; text-align: center; font-size: 11px; color: #AAA;">
                Van Elvina Store Console – Automated Order Alert
              </div>

            </div>
          </div>
        `;
        await sendEmail({ to: 'support@vanelvina.com', subject: supportSubject, html: supportHtml });
        console.log(`Admin notification sent to support@vanelvina.com for order ${order.order_id}.`);

      } else if (type === 'return_requested' || type === 'exchange_requested') {
        const isReturn = type === 'return_requested';
        const supportSubject = `${isReturn ? '⚠️ RETURN' : '🔄 EXCHANGE'} REQUESTED: Order ${orderFormatted.orderId} - Van Elvina`;
        const supportHtml = `
          <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; border: 1px solid #E8C5CA; border-radius: 12px;">
            <h2 style="color: #8A4F5A; border-bottom: 2px solid #8A4F5A; padding-bottom: 8px; margin-top: 0;">
              ${isReturn ? 'Return' : 'Exchange'} Request Received
            </h2>
            <p>A customer has initiated a <strong>${isReturn ? 'return' : 'exchange'}</strong> request on Van Elvina.</p>
            
            <div style="background-color: #FDF8F5; border: 1px solid #E8C5CA; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <p style="margin: 0 0 8px;"><strong>Order Reference ID:</strong> ${orderFormatted.orderId}</p>
              <p style="margin: 0 0 8px;"><strong>Type:</strong> ${isReturn ? 'Return (Refund)' : 'Exchange (Product Swap)'}</p>
              <p style="margin: 0;"><strong>Reason:</strong> "${note || 'Not specified'}"</p>
            </div>

            <h3 style="color: #8A4F5A; margin-top: 24px; border-bottom: 1px solid #FAF0F1; padding-bottom: 4px;">Customer Details</h3>
            <p style="margin: 8px 0;">
              <strong>Name:</strong> ${customer.name || 'N/A'}<br/>
              <strong>Email:</strong> ${customer.email || 'N/A'}
            </p>

            <h3 style="color: #8A4F5A; margin-top: 24px; border-bottom: 1px solid #FAF0F1; padding-bottom: 4px;">Pickup Address</h3>
            <p style="margin: 8px 0;">
              <strong>Name:</strong> ${orderFormatted.shippingAddress.name}<br/>
              <strong>Phone:</strong> ${orderFormatted.shippingAddress.phone}<br/>
              <strong>Address:</strong> ${orderFormatted.shippingAddress.line1}${orderFormatted.shippingAddress.line2 ? `, ${orderFormatted.shippingAddress.line2}` : ''}<br/>
              <strong>City/State/Zip:</strong> ${orderFormatted.shippingAddress.city}, ${orderFormatted.shippingAddress.state} - ${orderFormatted.shippingAddress.pincode}
            </p>

            <h3 style="color: #8A4F5A; margin-top: 24px; border-bottom: 1px solid #FAF0F1; padding-bottom: 4px;">Original Order Items</h3>
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
                <tr style="font-weight: bold; color: #8A4F5A;">
                  <td colspan="4" style="padding: 10px; border-top: 2px solid #8A4F5A; text-align: left;">Total Order Value</td>
                  <td style="padding: 10px; border-top: 2px solid #8A4F5A; text-align: right;">₹${orderFormatted.total.toLocaleString('en-IN')}</td>
                </tr>
              </tbody>
            </table>

            <p style="margin-top: 30px; text-align: center;">
              <a href="${Deno.env.get('APP_URL') || 'https://vanelvina.com'}/admin/dashboard" style="background-color: #8A4F5A; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View in Admin Dashboard</a>
            </p>
          </div>
        `;
        await sendEmail({ to: 'support@vanelvina.com', subject: supportSubject, html: supportHtml });
        console.log(`Admin return/exchange notification email sent to support@vanelvina.com for order ${order.order_id}.`);
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
    triggerOrderPushNotification(order, 'Order Placed! 🎉', `Thank you! Your Order #${order.order_id} for ₹${order.total} has been received.`, `/account/orders/${order.id}`).catch(() => {});
    decrementStockForOrder(order);
    
    // Trigger admin push notification
    sendPushNotification('admin', '🛍️ New COD Order Received!', `Order #${order.order_id} placed for ₹${order.total}`, '/admin/dashboard').catch(() => {});

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
      triggerOrderEmail(order, 'confirmed').catch(err => console.error('Error triggering payment-confirmed order email:', err));
      triggerOrderPushNotification(order, 'Payment Confirmed! 💳', `Thank you! Your Order #${order.order_id} for ₹${order.total} payment is confirmed.`, `/account/orders/${order.id}`).catch(() => {});
      decrementStockForOrder(order);
      
      // Trigger admin push notification
      sendPushNotification('admin', '🛍️ New Online Order Received!', `Order #${order.order_id} payment verified for ₹${order.total}`, '/admin/dashboard').catch(() => {});

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
    return c.json({ message: error.message || (typeof error === "string" ? error : "Internal Server Error!"), details: error.stack || error }, 500);
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

    // Explicitly update updated_at timestamp
    updatePayload.updated_at = new Date().toISOString();

    const { data: updatedOrder, error: updateErr } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    if (statusChanged) {
      triggerOrderEmail(updatedOrder, 'status_updated', note).catch(err => console.error('Error triggering status update email:', err));
      
      const isCancelled = updatedOrder.order_status === 'cancelled';
      const statusTitle = isCancelled ? 'Order Cancelled ❌' : 'Order Update 📦';
      const statusBody = isCancelled 
        ? `Your Order #${updatedOrder.order_id} has been cancelled.` 
        : `Your Order #${updatedOrder.order_id} status has been updated to: ${updatedOrder.order_status.replace(/_/g, ' ').toUpperCase()}`;
      
      // Notify customer
      triggerOrderPushNotification(updatedOrder, statusTitle, statusBody, `/account/orders/${updatedOrder.id}`).catch(() => {});
      
      // If order is cancelled, also notify admin
      if (isCancelled) {
        sendPushNotification('admin', '❌ Order Cancelled', `Order #${updatedOrder.order_id} has been cancelled.`).catch(() => {});
      }
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
        status_history: newHistory,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    triggerOrderEmail(updatedOrder, 'return_requested', reason).catch(err => console.error('Error triggering return requested email:', err));
    triggerOrderPushNotification(updatedOrder, 'Return Requested ↩️', `Your return request for Order #${updatedOrder.order_id} has been submitted.`, `/account/orders/${updatedOrder.id}`).catch(() => {});
    sendPushNotification('admin', '↩️ Return Requested', `Order #${updatedOrder.order_id} return requested by customer.`).catch(() => {});

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
        status_history: newHistory,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    triggerOrderEmail(updatedOrder, 'exchange_requested', reason).catch(err => console.error('Error triggering exchange requested email:', err));
    triggerOrderPushNotification(updatedOrder, 'Exchange Requested 🔄', `Your exchange request for Order #${updatedOrder.order_id} has been submitted.`, `/account/orders/${updatedOrder.id}`).catch(() => {});
    sendPushNotification('admin', '🔄 Exchange Requested', `Order #${updatedOrder.order_id} exchange requested by customer.`).catch(() => {});

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

    sendPushNotification(
      'admin', 
      '⚠️ Abandoned Checkout Alert', 
      `${customerName} abandoned checkout for ₹${(total || 0).toLocaleString('en-IN')}`, 
      '/admin/dashboard'
    ).catch(() => {});

    if (customerEmail && customerEmail !== 'N/A' && customerEmail !== 'anonymous@vanelvina.com') {
      sendPushNotification(
        customerEmail, 
        '🛍️ Items are waiting in your bag!', 
        'Finish your checkout now to secure your items before they sell out.', 
        '/bag'
      ).catch(() => {});
    }

    return c.json({ success: true, message: 'Notification sent successfully' });
  } catch (err: any) {
    console.error('notify-abandoned error:', err);
    return c.json({ message: 'Server error' }, 500);
  }
});

export default router;
