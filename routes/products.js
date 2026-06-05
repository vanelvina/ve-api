import express from 'express';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Helper to update product count in categories
async function updateCategoryProductCounts() {
  try {
    const categories = await Category.find();
    for (const cat of categories) {
      const count = await Product.countDocuments({
        category: { $regex: new RegExp('^' + cat.name + '$', 'i') }
      });
      cat.productCount = count;
      await cat.save();
    }
  } catch (error) {
    console.error('Failed to update category product counts:', error);
  }
}

// GET all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST add new product
router.post('/', authMiddleware, async (req, res) => {
  const product = new Product(req.body);
  try {
    const newProduct = await product.save();
    await updateCategoryProductCounts();
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT update product
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedProduct) return res.status(404).json({ message: 'Product not found' });
    await updateCategoryProductCounts();
    res.json(updatedProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE product
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    await updateCategoryProductCounts();
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
