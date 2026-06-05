import express from 'express';
import Review from '../models/Review.js';

const router = express.Router();

// GET all reviews
router.get('/', async (req, res) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
