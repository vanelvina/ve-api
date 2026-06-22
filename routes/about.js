import express from 'express';
import AboutUs from '../models/AboutUs.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// GET /api/about — Retrieve the About Us page content. Auto-initializes defaults if empty.
router.get('/', async (req, res) => {
  try {
    let about = await AboutUs.findOne().lean();
    if (!about) {
      // Create defaults from schema definition
      const newAbout = await AboutUs.create({});
      about = newAbout.toObject();
    }
    return res.json(about);
  } catch (error) {
    console.error('Fetch About Us content error:', error);
    return res.status(500).json({ message: 'Server error fetching page content' });
  }
});

// PUT /api/about — Update the About Us page content (Admin only)
router.put('/', authMiddleware, async (req, res) => {
  try {
    let about = await AboutUs.findOne();
    if (!about) {
      about = new AboutUs(req.body);
    } else {
      // Update fields
      about.storyTitle = req.body.storyTitle ?? about.storyTitle;
      about.storySubtitle = req.body.storySubtitle ?? about.storySubtitle;
      about.storyContent = req.body.storyContent ?? about.storyContent;
      about.storyImage = req.body.storyImage ?? about.storyImage;

      about.visionTitle = req.body.visionTitle ?? about.visionTitle;
      about.visionSubtitle = req.body.visionSubtitle ?? about.visionSubtitle;
      about.visionContent = req.body.visionContent ?? about.visionContent;

      about.philosophyTitle = req.body.philosophyTitle ?? about.philosophyTitle;
      about.philosophyContent = req.body.philosophyContent ?? about.philosophyContent;
      about.philosophyImage = req.body.philosophyImage ?? about.philosophyImage;

      about.promises = req.body.promises ?? about.promises;
    }

    const saved = await about.save();
    return res.json(saved);
  } catch (error) {
    console.error('Update About Us content error:', error);
    return res.status(500).json({ message: 'Server error updating page content' });
  }
});

export default router;
