import express from 'express';
import Widget from '../models/Widget.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// GET all widgets
router.get('/', async (req, res) => {
  try {
    const widgets = await Widget.find().sort({ order: 1 });
    res.json(widgets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST create custom widget
router.post('/', authMiddleware, async (req, res) => {
  const widget = new Widget(req.body);
  try {
    const newWidget = await widget.save();
    res.status(201).json(newWidget);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT update widget (toggle enabled, change title/description, update order, etc.)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const updatedWidget = await Widget.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedWidget) return res.status(404).json({ message: 'Widget not found' });
    res.json(updatedWidget);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE custom widget
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const widget = await Widget.findByIdAndDelete(req.params.id);
    if (!widget) return res.status(404).json({ message: 'Widget not found' });
    res.json({ message: 'Widget deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
