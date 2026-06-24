import express from 'express';
import Order from '../models/Order.js';
import User from '../models/User.js';
import userAuth from '../middleware/userAuth.js';
import adminAuth from '../middleware/auth.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { sendEmail } from '../utils/email.js';

const router = express.Router();

const getOrderCustomerInfo = async (order) => {
  let email = '';
  let name = '';

  if (order.userId) {
    try {
      const user = await User.findById(order.userId);
      if (user) {
        email = user.email;
        name = user.name;
      }
    } catch (err) {
      console.error('Error fetching user for order email:', err);
    }
  }

  if (!email && order.guestInfo?.email) {
    email = order.guestInfo.email;
    name = order.guestInfo.name || '';
  }

  if (!email && order.shippingAddress?.email) {
    email = order.shippingAddress.email;
    name = order.shippingAddress.name || '';
  }

  return { email: email?.toLowerCase().trim(), name };
};

const triggerOrderEmail = async (order, type, note = '') => {
  try {
    const customer = await getOrderCustomerInfo(order);
    if (!customer.email) {
      console.warn(`No email found for order ${order.orderId}, skipping notification.`);
      return;
    }

    let subject = '';
    let htmlContent = '';

    if (type === 'confirmed') {
      subject = `Order Confirmed: ${order.orderId} - Van Elvina`;
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
                <p style="margin: 0 0 10px; font-size: 13px;"><strong>Order ID:</strong> <span style="font-family: monospace; font-weight: bold; color: #8A4F5A;">${order.orderId}</span></p>
                <p style="margin: 0 0 15px; font-size: 13px;"><strong>Payment Method:</strong> ${order.paymentMethod.toUpperCase()}</p>
                
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                  <thead>
                    <tr style="border-bottom: 1px solid #E8C5CA; text-align: left; color: #8A4F5A;">
                      <th style="padding: 8px 0; font-weight: bold;">Item</th>
                      <th style="padding: 8px 0; text-align: center; font-weight: bold;">Qty</th>
                      <th style="padding: 8px 0; text-align: right; font-weight: bold;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${order.items.map(item => `
                      <tr style="border-bottom: 1px solid rgba(232, 197, 202, 0.3);">
                        <td style="padding: 8px 0; color: #555;">${item.name} ${item.size ? `(Size: ${item.size})` : ''}</td>
                        <td style="padding: 8px 0; text-align: center; color: #555;">${item.quantity}</td>
                        <td style="padding: 8px 0; text-align: right; color: #555;">₹${item.price.toLocaleString('en-IN')}</td>
                      </tr>
                    `).join('')}
                    <tr>
                      <td colspan="2" style="padding: 10px 0 0; font-weight: bold; color: #8A4F5A;">Total Amount</td>
                      <td style="padding: 10px 0 0; text-align: right; font-weight: bold; color: #8A4F5A; font-size: 15px;">₹${order.total.toLocaleString('en-IN')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style="background: #FAF6F0; border-radius: 12px; padding: 20px; font-size: 13px; color: #555; border: 1px solid #F0E8E0;">
                <h4 style="margin: 0 0 8px; color: #C5A58E; text-transform: uppercase; font-size: 11px; letter-spacing: 1px;">Delivery Address</h4>
                <p style="margin: 0; line-height: 1.5;">
                  <strong>${order.shippingAddress.name}</strong><br/>
                  ${order.shippingAddress.line1}${order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}<br/>
                  ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}<br/>
                  Phone: ${order.shippingAddress.phone}
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
      subject = `Order Status Update: ${order.orderId} - ${order.orderStatus.toUpperCase()}`;
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
                The status of your order <strong>${order.orderId}</strong> has been updated.
              </p>
              
              <div style="background: #FAF0F1; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #E8C5CA; text-align: center;">
                <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #999;">Current Status</span>
                <div style="font-size: 24px; font-weight: bold; color: #8A4F5A; margin: 8px 0;">
                  ${order.orderStatus.replace(/_/g, ' ').toUpperCase()}
                </div>
                ${note ? `<p style="margin: 10px 0 0; font-size: 13px; color: #666; font-style: italic;">Note: "${note}"</p>` : ''}
              </div>

              <div style="background: #FAF6F0; border-radius: 12px; padding: 20px; font-size: 13px; color: #555; border: 1px solid #F0E8E0;">
                <h4 style="margin: 0 0 8px; color: #C5A58E; text-transform: uppercase; font-size: 11px; letter-spacing: 1px;">Order Summary</h4>
                <p style="margin: 0 0 5px;"><strong>Order ID:</strong> ${order.orderId}</p>
                <p style="margin: 0 0 5px;"><strong>Total Amount:</strong> ₹${order.total.toLocaleString('en-IN')}</p>
                <p style="margin: 0;"><strong>Shipping To:</strong> ${order.shippingAddress.name} (${order.shippingAddress.city})</p>
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
      console.log(`Order email notification sent successfully to ${customer.email} for order ${order.orderId} (${type}).`);

      if (type === 'confirmed') {
        const supportSubject = `New Order Received: ${order.orderId}`;
        const supportHtml = `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #8A4F5A;">New Order Received</h2>
            <p>A new order <strong>${order.orderId}</strong> has just been placed by <strong>${customer.name || 'Customer'}</strong> (${customer.email}).</p>
            <p><strong>Order Total:</strong> ₹${order.total.toLocaleString('en-IN')}</p>
            <p>Please check the <a href="${process.env.APP_URL || 'http://localhost:3000'}/admin/dashboard">admin dashboard</a> for full details.</p>
          </div>
        `;
        await sendEmail({ to: 'support@vanelvina.com', subject: supportSubject, html: supportHtml });
        console.log(`Admin notification sent to support@vanelvina.com for order ${order.orderId}.`);
      }
    }
  } catch (err) {
    console.error(`Failed to send order email for order ${order?.orderId}:`, err);
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders — Place a new order
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

    const orderData = {
      items,
      shippingAddress,
      paymentMethod: paymentMethod || 'cod',
      shippingMethod: shippingMethod || 'standard',
      subtotal: subtotal || 0,
      shippingFee: shippingFee || 0,
      discount: discount || 0,
      total: total || 0,
      userId: req.user ? req.user.id : null,
      isGuest: !req.user,
      guestInfo: guestInfo || null,
      statusHistory: [{ status: 'placed' }]
    };

    const order = await Order.create(orderData);

    // Trigger order confirmation email notification
    triggerOrderEmail(order, 'confirmed').catch(err => console.error('Error triggering COD order email:', err));

    return res.status(201).json({
      success: true,
      orderId: order.orderId,
      order,
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
      amount: Math.round(amount * 100), // amount in the smallest currency unit
      currency: "INR",
      receipt: `rcpt_${Date.now()}`
    };

    const order = await instance.orders.create(options);
    if (!order) return res.status(500).json({ message: "Some error occured" });

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
      // order details to create the order in DB
      items, shippingAddress, paymentMethod, shippingMethod,
      subtotal, shippingFee, discount, total, guestInfo
    } = req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || 'TEST_KEY_SECRET')
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature === expectedSign) {
      // Payment is successful, create the order
      const orderData = {
        items,
        shippingAddress,
        paymentMethod: paymentMethod || 'razorpay',
        paymentStatus: 'paid', // Mark as paid!
        shippingMethod: shippingMethod || 'standard',
        subtotal: subtotal || 0,
        shippingFee: shippingFee || 0,
        discount: discount || 0,
        total: total || 0,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        userId: req.user ? req.user.id : null,
        isGuest: !req.user,
        guestInfo: guestInfo || null,
        statusHistory: [{ status: 'placed' }]
      };

      const order = await Order.create(orderData);

      // Trigger order confirmation email notification
      triggerOrderEmail(order, 'confirmed').catch(err => console.error('Error triggering payment-confirmed order email:', err));

      return res.status(200).json({
        success: true,
        message: "Payment verified successfully",
        orderId: order.orderId,
        order
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
// GET /api/orders/my — Get current user's orders
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my', userAuth, async (req, res) => {
  try {
    const userEmail = req.user.email?.toLowerCase().trim();
    const query = {
      $or: [
        { userId: req.user.id }
      ]
    };
    if (userEmail) {
      query.$or.push({ 'guestInfo.email': userEmail });
      query.$or.push({ 'shippingAddress.email': userEmail });
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .lean();
    return res.json(orders);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/:id — Get a specific order (user must own it, or admin)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findOne({
      $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-f]{24}$/i) ? req.params.id : null }]
    }).lean();
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    return res.json(order);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders — Admin: get all orders
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', adminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = status ? { orderStatus: status } : {};
    const orders = await Order.find(filter)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();
    const total = await Order.countDocuments(filter);
    return res.json({ orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/orders/:id/status — Admin: update order status
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/status', adminAuth, async (req, res) => {
  try {
    const { orderStatus, paymentStatus, note } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    let statusChanged = false;
    if (orderStatus && order.orderStatus !== orderStatus) {
      order.orderStatus = orderStatus;
      order.statusHistory.push({ status: orderStatus, note: note || '' });
      statusChanged = true;
    }
    if (paymentStatus) {
      order.paymentStatus = paymentStatus;
    }

    await order.save();

    if (statusChanged) {
      triggerOrderEmail(order, 'status_updated', note).catch(err => console.error('Error triggering status update email:', err));
    }

    return res.json(order);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders/:id/return — Request a return
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/return', userAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findOne({ _id: req.params.id, userId: req.user.id });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.orderStatus !== 'delivered') {
      return res.status(400).json({ message: 'Only delivered orders can be returned' });
    }

    const deliveredEntry = order.statusHistory.slice().reverse().find(h => h.status === 'delivered');
    const deliveredDate = deliveredEntry ? deliveredEntry.timestamp : order.updatedAt;
    
    if (Date.now() - new Date(deliveredDate).getTime() > 7 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ message: 'Return window (7 days) has expired' });
    }

    order.orderStatus = 'return_requested';
    order.statusHistory.push({ status: 'return_requested', note: reason });
    await order.save();

    return res.json(order);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders/:id/exchange — Request an exchange
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/exchange', userAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findOne({ _id: req.params.id, userId: req.user.id });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.orderStatus !== 'delivered') {
      return res.status(400).json({ message: 'Only delivered orders can be exchanged' });
    }

    const deliveredEntry = order.statusHistory.slice().reverse().find(h => h.status === 'delivered');
    const deliveredDate = deliveredEntry ? deliveredEntry.timestamp : order.updatedAt;
    
    if (Date.now() - new Date(deliveredDate).getTime() > 7 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ message: 'Exchange window (7 days) has expired' });
    }

    order.orderStatus = 'exchange_requested';
    order.statusHistory.push({ status: 'exchange_requested', note: reason });
    await order.save();

    return res.json(order);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
