import express from 'express';
import Wishlist from '../models/Wishlist.js';
import userAuth from '../middleware/userAuth.js';
import Product from '../models/Product.js';

const router = express.Router();

// GET /api/wishlist - Get current user's populated wishlist
router.get('/', userAuth, async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({ userId: req.user.id }).populate('products');
    if (!wishlist) {
      wishlist = await Wishlist.create({ userId: req.user.id, products: [] });
    }
    res.json(wishlist.products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/wishlist/toggle - Toggle a product in user's wishlist
router.post('/toggle', userAuth, async (req, res) => {
  const { productId } = req.body;
  if (!productId) {
    return res.status(400).json({ message: 'Product ID is required' });
  }

  try {
    let wishlist = await Wishlist.findOne({ userId: req.user.id });
    if (!wishlist) {
      wishlist = await Wishlist.create({ userId: req.user.id, products: [] });
    }

    const index = wishlist.products.indexOf(productId);
    if (index !== -1) {
      wishlist.products.splice(index, 1);
      await wishlist.save();
      return res.json({ action: 'removed', message: 'Product removed from wishlist' });
    } else {
      const productExists = await Product.findById(productId);
      if (!productExists) {
        return res.status(404).json({ message: 'Product not found' });
      }
      wishlist.products.push(productId);
      await wishlist.save();
      return res.json({ action: 'added', message: 'Product added to wishlist' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
