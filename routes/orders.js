import express from 'express';
import Order from '../models/Order.js';
import User from '../models/User.js';
import userAuth from '../middleware/userAuth.js';
import adminAuth from '../middleware/auth.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders — Place a new order (user or guest)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      items, shippingAddress, paymentMethod, shippingMethod,
      subtotal, shippingFee, discount, total,
      // optional auth
      userId, isGuest, guestInfo
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
    };

    if (userId) {
      // Logged-in user order
      orderData.userId = userId;
      orderData.isGuest = false;
    } else {
      // Guest order — save guest info for admin visibility
      orderData.isGuest = true;
      orderData.guestInfo = {
        name: guestInfo?.name || shippingAddress.name,
        email: guestInfo?.email || shippingAddress.email || '',
        phone: guestInfo?.phone || shippingAddress.phone || '',
      };
    }

    const order = await Order.create(orderData);

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
    const { orderStatus, paymentStatus } = req.body;
    const update = {};
    if (orderStatus) update.orderStatus = orderStatus;
    if (paymentStatus) update.paymentStatus = paymentStatus;

    const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    return res.json(order);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
