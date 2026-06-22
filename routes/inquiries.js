import express from 'express';
import Inquiry from '../models/Inquiry.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// POST /api/inquiries — Public: Submit feedback/inquiry
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, queryType, message } = req.body;
    if (!name || !email || !phone || !queryType || !message) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const inquiry = await Inquiry.create({
      name,
      email,
      phone,
      queryType,
      message,
    });

    return res.status(201).json({ success: true, inquiry });
  } catch (error) {
    console.error('Submit inquiry error:', error);
    return res.status(500).json({ message: 'Server error submitting feedback.' });
  }
});

// GET /api/inquiries — Admin: Retrieve all inquiries
router.get('/', authMiddleware, async (req, res) => {
  try {
    const inquiries = await Inquiry.find().sort({ createdAt: -1 }).lean();
    return res.json(inquiries);
  } catch (error) {
    console.error('Fetch inquiries error:', error);
    return res.status(500).json({ message: 'Server error fetching inquiries.' });
  }
});

// PUT /api/inquiries/:id/resolve — Admin: Mark inquiry as resolved
router.put('/:id/resolve', authMiddleware, async (req, res) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ message: 'Inquiry not found.' });
    }
    
    // Toggle state or set to resolved
    inquiry.status = inquiry.status === 'resolved' ? 'pending' : 'resolved';
    await inquiry.save();
    
    return res.json(inquiry);
  } catch (error) {
    console.error('Resolve inquiry error:', error);
    return res.status(500).json({ message: 'Server error updating inquiry status.' });
  }
});

// DELETE /api/inquiries/:id — Admin: Delete inquiry
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const inquiry = await Inquiry.findByIdAndDelete(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ message: 'Inquiry not found.' });
    }
    return res.json({ success: true, message: 'Inquiry deleted successfully.' });
  } catch (error) {
    console.error('Delete inquiry error:', error);
    return res.status(500).json({ message: 'Server error deleting inquiry.' });
  }
});

export default router;
