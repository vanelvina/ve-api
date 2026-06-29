import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../utils/supabase.js';
import { toUUID } from '../utils/uuid.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Admin Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const { data: admin, error } = await supabase
      .from('admins')
      .select('*')
      .eq('username', username)
      .maybeSingle();

    if (error) throw error;
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin.id, _id: admin.id, username: admin.username },
      process.env.JWT_SECRET || 'van_elvina_super_secret_jwt_key_2026',
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      admin: {
        _id: admin.id,
        id: admin.id,
        username: admin.username
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error during login' });
  }
});

// Verify token
router.get('/verify', authMiddleware, (req, res) => {
  return res.json({ valid: true, admin: req.admin });
});

export default router;
