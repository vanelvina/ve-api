import express from 'express';
import { supabase } from '../utils/supabase.js';
import { toUUID } from '../utils/uuid.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Helper to map Supabase Widget row to Frontend expected format
const mapWidgetFromSupabase = (widget) => {
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
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('widgets')
      .select('*')
      .order('position', { ascending: true });

    if (error) throw error;
    res.json(data.map(mapWidgetFromSupabase));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST create custom widget
router.post('/', authMiddleware, async (req, res) => {
  try {
    const payload = {
      title: req.body.title || '',
      type: req.body.type || '',
      position: req.body.order || 0,
      is_active: req.body.enabled !== false,
      config: {
        key: req.body.key || '',
        name: req.body.name || '',
        device: req.body.device || 'desktop',
        subtitle: req.body.subtitle || '',
        description: req.body.description || '',
        image: req.body.image || '',
        imageMobile: req.body.imageMobile || '',
        margins: req.body.margins || { top: false, bottom: false, left: false, right: false },
        items: req.body.items || null
      }
    };

    const { data, error } = await supabase
      .from('widgets')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(mapWidgetFromSupabase(data));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT update widget (toggle enabled, change title/description, update order, etc.)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const uuid = toUUID(req.params.id);
    
    // Fetch existing widget
    const { data: existing, error: fetchErr } = await supabase
      .from('widgets')
      .select('*')
      .eq('id', uuid)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ message: 'Widget not found' });

    // Build update payload
    const payload = {};
    if (req.body.title !== undefined) payload.title = req.body.title;
    if (req.body.type !== undefined) payload.type = req.body.type;
    if (req.body.order !== undefined) payload.position = req.body.order;
    if (req.body.enabled !== undefined) payload.is_active = req.body.enabled;

    // Merge existing config with new fields
    const existingConfig = existing.config || {};
    const newConfig = { ...existingConfig };

    if (req.body.key !== undefined) newConfig.key = req.body.key;
    if (req.body.name !== undefined) newConfig.name = req.body.name;
    if (req.body.device !== undefined) newConfig.device = req.body.device;
    if (req.body.subtitle !== undefined) newConfig.subtitle = req.body.subtitle;
    if (req.body.description !== undefined) newConfig.description = req.body.description;
    if (req.body.image !== undefined) newConfig.image = req.body.image;
    if (req.body.imageMobile !== undefined) newConfig.imageMobile = req.body.imageMobile;
    if (req.body.margins !== undefined) newConfig.margins = req.body.margins;
    if (req.body.items !== undefined) newConfig.items = req.body.items;

    payload.config = newConfig;

    const { data: updated, error: updateErr } = await supabase
      .from('widgets')
      .update(payload)
      .eq('id', uuid)
      .select()
      .single();

    if (updateErr) throw updateErr;
    res.json(mapWidgetFromSupabase(updated));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE custom widget
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const uuid = toUUID(req.params.id);
    const { data, error } = await supabase
      .from('widgets')
      .delete()
      .eq('id', uuid)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Widget not found' });
    res.json({ message: 'Widget deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
