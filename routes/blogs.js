import express from 'express';
import { supabase } from '../utils/supabase.js';
import { toUUID } from '../utils/uuid.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Helper to map Supabase Blog row to Frontend expected format
const mapBlog = (blog) => {
  if (!blog) return null;
  return {
    _id: blog.id,
    id: blog.id,
    title: blog.title,
    slug: blog.slug,
    summary: blog.excerpt,
    content: blog.content,
    image: blog.featured_image,
    author: blog.author,
    tags: blog.tags,
    enabled: blog.is_published,
    publishedAt: blog.published_at,
    createdAt: blog.created_at,
    updatedAt: blog.updated_at
  };
};

// GET all active enabled blogs (Storefront listing)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('blogs')
      .select('*')
      .eq('is_published', true)
      .order('published_at', { ascending: false });
      
    if (error) throw error;
    res.json(data.map(mapBlog));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET all blogs (Admin listing - includes disabled ones)
router.get('/admin', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('blogs')
      .select('*')
      .order('published_at', { ascending: false });
      
    if (error) throw error;
    res.json(data.map(mapBlog));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET single blog by slug or ID
router.get('/:slugOrId', async (req, res) => {
  try {
    // Try by slug first
    const { data: blogBySlug, error: slugError } = await supabase
      .from('blogs')
      .select('*')
      .eq('slug', req.params.slugOrId)
      .maybeSingle();

    if (slugError) throw slugError;

    let blog = blogBySlug;
    if (!blog) {
      const slugOrId = req.params.slugOrId;
      const isHexId = /^[0-9a-fA-F]{24}$/.test(slugOrId);
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(slugOrId);
      
      if (isHexId || isUUID) {
        const uuid = toUUID(slugOrId);
        const { data: blogById, error: idError } = await supabase
          .from('blogs')
          .select('*')
          .eq('id', uuid)
          .maybeSingle();
          
        if (idError) throw idError;
        blog = blogById;
      }
    }
    if (!blog) return res.status(404).json({ message: 'Blog not found' });
    res.json(mapBlog(blog));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST create blog post (Admin only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const payload = {};
    if (req.body.title !== undefined) payload.title = req.body.title;
    if (req.body.slug !== undefined) payload.slug = req.body.slug;
    if (req.body.summary !== undefined) payload.excerpt = req.body.summary;
    if (req.body.content !== undefined) payload.content = req.body.content;
    if (req.body.image !== undefined) payload.featured_image = req.body.image;
    if (req.body.author !== undefined) payload.author = req.body.author;
    if (req.body.tags !== undefined) payload.tags = req.body.tags;
    if (req.body.enabled !== undefined) payload.is_published = req.body.enabled;
    if (req.body.publishedAt !== undefined) payload.published_at = req.body.publishedAt;

    const { data, error } = await supabase
      .from('blogs')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(mapBlog(data));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT update blog post (Admin only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const uuid = toUUID(req.params.id);
    const payload = {};
    if (req.body.title !== undefined) payload.title = req.body.title;
    if (req.body.slug !== undefined) payload.slug = req.body.slug;
    if (req.body.summary !== undefined) payload.excerpt = req.body.summary;
    if (req.body.content !== undefined) payload.content = req.body.content;
    if (req.body.image !== undefined) payload.featured_image = req.body.image;
    if (req.body.author !== undefined) payload.author = req.body.author;
    if (req.body.tags !== undefined) payload.tags = req.body.tags;
    if (req.body.enabled !== undefined) payload.is_published = req.body.enabled;
    if (req.body.publishedAt !== undefined) payload.published_at = req.body.publishedAt;

    const { data, error } = await supabase
      .from('blogs')
      .update(payload)
      .eq('id', uuid)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Blog not found' });
    res.json(mapBlog(data));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE blog post (Admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const uuid = toUUID(req.params.id);
    const { data, error } = await supabase
      .from('blogs')
      .delete()
      .eq('id', uuid)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Blog not found' });
    res.json({ message: 'Blog post deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
