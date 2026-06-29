import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import { supabase } from '../utils/supabase.ts';
import { toUUID } from '../utils/uuid.ts';
import { authMiddleware } from '../middleware/auth.ts';

const router = new Hono();

// Helper to map Supabase Widget row to Frontend expected format
const mapWidgetFromSupabase = (widget: any) => {
  if (!widget) return null;
  const config = widget.config || {};
  return {
    _id: widget.id,
    id: widget.id,
    key: config.key || '',
    name: config.name || '',
    device: config.device || 'desktop',
    type: widget.type || '',
    enabled: widget.is_active,
    order: widget.position || 0,
    title: widget.title || '',
    subtitle: config.subtitle || '',
    description: config.description || '',
    image: config.image || '',
    imageMobile: config.imageMobile || '',
    margins: config.margins || { top: false, bottom: false, left: false, right: false },
    items: config.items || null,
    createdAt: widget.created_at,
    updatedAt: widget.updated_at
  };
};

// GET all widgets
router.get('/', async (c) => {
  try {
    const { data, error } = await supabase
      .from('widgets')
      .select('*')
      .order('position', { ascending: true });

    if (error) throw error;
    return c.json((data || []).map(mapWidgetFromSupabase));
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

// POST create custom widget
router.post('/', authMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const payload = {
      title: body.title || '',
      type: body.type || '',
      position: body.order || 0,
      is_active: body.enabled !== false,
      config: {
        key: body.key || '',
        name: body.name || '',
        device: body.device || 'desktop',
        subtitle: body.subtitle || '',
        description: body.description || '',
        image: body.image || '',
        imageMobile: body.imageMobile || '',
        margins: body.margins || { top: false, bottom: false, left: false, right: false },
        items: body.items || null
      }
    };

    const { data, error } = await supabase
      .from('widgets')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return c.json(mapWidgetFromSupabase(data), 201);
  } catch (error: any) {
    return c.json({ message: error.message }, 400);
  }
});

// PUT update widget (toggle enabled, change title/description, update order, etc.)
router.put('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const uuid = toUUID(id);
    
    // Fetch existing widget
    const { data: existing, error: fetchErr } = await supabase
      .from('widgets')
      .select('*')
      .eq('id', uuid)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) return c.json({ message: 'Widget not found' }, 404);

    const body = await c.req.json().catch(() => ({}));

    // Build update payload
    const payload: any = {};
    if (body.title !== undefined) payload.title = body.title;
    if (body.type !== undefined) payload.type = body.type;
    if (body.order !== undefined) payload.position = body.order;
    if (body.enabled !== undefined) payload.is_active = body.enabled;

    // Merge existing config with new fields
    const existingConfig = existing.config || {};
    const newConfig = { ...existingConfig };

    if (body.key !== undefined) newConfig.key = body.key;
    if (body.name !== undefined) newConfig.name = body.name;
    if (body.device !== undefined) newConfig.device = body.device;
    if (body.subtitle !== undefined) newConfig.subtitle = body.subtitle;
    if (body.description !== undefined) newConfig.description = body.description;
    if (body.image !== undefined) newConfig.image = body.image;
    if (body.imageMobile !== undefined) newConfig.imageMobile = body.imageMobile;
    if (body.margins !== undefined) newConfig.margins = body.margins;
    if (body.items !== undefined) newConfig.items = body.items;

    payload.config = newConfig;

    const { data: updated, error: updateErr } = await supabase
      .from('widgets')
      .update(payload)
      .eq('id', uuid)
      .select()
      .single();

    if (updateErr) throw updateErr;
    return c.json(mapWidgetFromSupabase(updated));
  } catch (error: any) {
    return c.json({ message: error.message }, 400);
  }
});

// DELETE custom widget
router.delete('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const uuid = toUUID(id);
    const { data, error } = await supabase
      .from('widgets')
      .delete()
      .eq('id', uuid)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return c.json({ message: 'Widget not found' }, 404);
    return c.json({ message: 'Widget deleted successfully' });
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

export default router;
