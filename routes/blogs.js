import express from 'express';
import Blog from '../models/Blog.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// GET all active enabled blogs (Storefront listing)
router.get('/', async (req, res) => {
  try {
    const blogs = await Blog.find({ enabled: true }).sort({ publishedAt: -1 });
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET all blogs (Admin listing - includes disabled ones)
router.get('/admin', authMiddleware, async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ publishedAt: -1 });
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET single blog by slug or ID
router.get('/:slugOrId', async (req, res) => {
  try {
    // Try by slug first
    let blog = await Blog.findOne({ slug: req.params.slugOrId });
    if (!blog) {
      // Try by ID (only if valid ObjectId format)
      if (req.params.slugOrId.match(/^[0-9a-fA-F]{24}$/)) {
        blog = await Blog.findById(req.params.slugOrId);
      }
    }
    if (!blog) return res.status(404).json({ message: 'Blog not found' });
    res.json(blog);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST create blog post (Admin only)
router.post('/', authMiddleware, async (req, res) => {
  const blog = new Blog(req.body);
  try {
    const newBlog = await blog.save();
    res.status(201).json(newBlog);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT update blog post (Admin only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const updatedBlog = await Blog.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedBlog) return res.status(404).json({ message: 'Blog not found' });
    res.json(updatedBlog);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE blog post (Admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const blog = await Blog.findByIdAndDelete(req.params.id);
    if (!blog) return res.status(404).json({ message: 'Blog not found' });
    res.json({ message: 'Blog post deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
