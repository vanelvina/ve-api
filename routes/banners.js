import express from 'express';
import Banner from '../models/Banner.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// GET all banners
router.get('/', async (req, res) => {
  try {
    const banners = await Banner.find().sort({ order: 1 });
    res.json(banners);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST add new banner
router.post('/', authMiddleware, async (req, res) => {
  const banner = new Banner(req.body);
  try {
    const newBanner = await banner.save();
    res.status(201).json(newBanner);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT update banner
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const updatedBanner = await Banner.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedBanner) return res.status(404).json({ message: 'Banner not found' });
    res.json(updatedBanner);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE banner
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });
    res.json({ message: 'Banner deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
