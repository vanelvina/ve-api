import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import bcrypt from 'npm:bcryptjs';
import jwt from 'npm:jsonwebtoken';
import { supabase } from '../utils/supabase.ts';
import { authMiddleware } from '../middleware/auth.ts';

const router = new Hono();

// Admin Login
router.post('/login', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch (err) {
    return c.json({ message: 'Invalid JSON body' }, 400);
  }

  const { username, password } = body;
  if (!username || !password) {
    return c.json({ message: 'Username and password are required' }, 400);
  }

  try {
    const { data: admin, error } = await supabase
      .from('admins')
      .select('*')
      .eq('username', username)
      .maybeSingle();

    if (error) throw error;
    if (!admin) {
      return c.json({ message: 'Invalid credentials' }, 401);
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return c.json({ message: 'Invalid credentials' }, 401);
    }

    const token = jwt.sign(
      { id: admin.id, _id: admin.id, username: admin.username },
      Deno.env.get('JWT_SECRET') || 'van_elvina_super_secret_jwt_key_2026',
      { expiresIn: '7d' }
    );

    return c.json({
      token,
      admin: {
        _id: admin.id,
        id: admin.id,
        username: admin.username
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return c.json({ message: 'Server error during login' }, 500);
  }
});

// Verify token
router.get('/verify', authMiddleware, (c) => {
  return c.json({ valid: true, admin: c.get('admin') });
});

export default router;
