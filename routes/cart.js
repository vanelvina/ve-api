import express from 'express';
import Cart from '../models/Cart.js';
import userAuth from '../middleware/userAuth.js';

const router = express.Router();

// GET /api/cart - Get current user's populated shopping bag
router.get('/', userAuth, async (req, res) => {
  try {
    let cart = await Cart.findOne({ userId: req.user.id }).populate('items.productId');
    if (!cart) {
      cart = await Cart.create({ userId: req.user.id, items: [] });
    }
    res.json(cart.items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/cart - Sync the shopping bag items with DB
router.post('/', userAuth, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ message: 'Items array is required' });
  }

  try {
    let cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) {
      cart = new Cart({ userId: req.user.id });
    }

    cart.items = items.map(item => ({
      productId: item.productId,
      color: item.variantColor || item.color,
      size: item.size,
      quantity: item.quantity
    }));

    await cart.save();
    
    const populated = await Cart.findById(cart._id).populate('items.productId');
    res.json(populated.items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
