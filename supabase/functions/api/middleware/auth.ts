import jwt from 'npm:jsonwebtoken';

export const authMiddleware = async (c: any, next: () => Promise<void>) => {
  const authHeader = c.req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ message: 'Authorization token required' }, 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, Deno.env.get('JWT_SECRET') || 'van_elvina_super_secret_jwt_key_2026');
    c.set('admin', decoded);
    await next();
  } catch (error) {
    return c.json({ message: 'Invalid or expired authorization token' }, 401);
  }
};

export const userAuthMiddleware = async (c: any, next: () => Promise<void>) => {
  const authHeader = c.req.header('authorization');
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return c.json({ message: 'Access token required' }, 401);
  }

  try {
    const decoded = jwt.verify(token, Deno.env.get('USER_JWT_SECRET') || 've_user_jwt_secret_vanelvina_2026_secure');
    c.set('user', decoded);
    await next();
  } catch (err) {
    return c.json({ message: 'Invalid or expired token' }, 403);
  }
};
