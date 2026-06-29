import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import { supabase } from '../utils/supabase.ts';
import { toUUID } from '../utils/uuid.ts';
import { authMiddleware } from '../middleware/auth.ts';

const router = new Hono();

// Helper to map Supabase Banner row to Frontend expected format
const mapBannerFromSupabase = (row: any) => {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    title: row.title,
    image: row.image,
    imageMobile: row.image_mobile || '',
    ctaLink: row.link || '',
    order: row.position || 0,
    enabled: row.is_active !== false,
    createdAt: row.created_at,
    // Default mock values for frontend admin form compatibility
    subtitle: '',
    cta: 'Shop Now',
    badge: '',
    textColor: 'light',
    align: 'left'
  };
};

// Helper to map Frontend Banner payload to Supabase schema
const mapBannerToSupabase = (body: any) => {
  const payload: any = {};
  if (body.title !== undefined) payload.title = body.title;
  if (body.image !== undefined) payload.image = body.image;
  if (body.imageMobile !== undefined) payload.image_mobile = body.imageMobile;
  if (body.ctaLink !== undefined) payload.link = body.ctaLink;
  if (body.order !== undefined) payload.position = body.order;
  if (body.position !== undefined) payload.position = body.position;
  if (body.enabled !== undefined) payload.is_active = body.enabled;
  if (body.isActive !== undefined) payload.is_active = body.isActive;
  return payload;
};

// GET all banners
router.get('/', async (c) => {
  try {
    const { data, error } = await supabase
      .from('banners')
      .select('*')
      .order('position', { ascending: true });

    if (error) throw error;
    return c.json(data.map(mapBannerFromSupabase));
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

// POST add new banner
router.post('/', authMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const payload = mapBannerToSupabase(body);
    const { data, error } = await supabase
      .from('banners')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return c.json(mapBannerFromSupabase(data), 201);
  } catch (error: any) {
    return c.json({ message: error.message }, 400);
  }
});

// PUT update banner
router.put('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const uuid = toUUID(id);
    const body = await c.req.json().catch(() => ({}));
    const payload = mapBannerToSupabase(body);
    const { data, error } = await supabase
      .from('banners')
      .update(payload)
      .eq('id', uuid)
      .select()
      .single();

    if (error) throw error;
    if (!data) return c.json({ message: 'Banner not found' }, 404);
    return c.json(mapBannerFromSupabase(data));
  } catch (error: any) {
    return c.json({ message: error.message }, 400);
  }
});

// DELETE banner
router.delete('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const uuid = toUUID(id);
    const { data, error } = await supabase
      .from('banners')
      .delete()
      .eq('id', uuid)
      .select()
      .maybeSingle();

    if (error) throw error;
    return c.json({ message: 'Banner deleted successfully' });
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

export default router;
