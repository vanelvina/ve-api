import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import { supabase } from '../utils/supabase.ts';
import { toUUID } from '../utils/uuid.ts';
import { authMiddleware } from '../middleware/auth.ts';

const router = new Hono();

// Helper to map Supabase Blog row to Frontend expected format
const mapBlog = (blog: any) => {
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
router.get('/', async (c) => {
  try {
    const { data, error } = await supabase
      .from('blogs')
      .select('*')
      .eq('is_published', true)
      .order('published_at', { ascending: false });
      
    if (error) throw error;
    return c.json(data.map(mapBlog));
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

// GET all blogs (Admin listing - includes disabled ones)
router.get('/admin', authMiddleware, async (c) => {
  try {
    const { data, error } = await supabase
      .from('blogs')
      .select('*')
      .order('published_at', { ascending: false });
      
    if (error) throw error;
    return c.json(data.map(mapBlog));
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

// GET single blog by slug or ID
router.get('/:slugOrId', async (c) => {
  try {
    const slugOrId = c.req.param('slugOrId');
    // Try by slug first
    const { data: blogBySlug, error: slugError } = await supabase
      .from('blogs')
      .select('*')
      .eq('slug', slugOrId)
      .maybeSingle();

    if (slugError) throw slugError;

    let blog = blogBySlug;
    if (!blog) {
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
    if (!blog) return c.json({ message: 'Blog not found' }, 404);
    return c.json(mapBlog(blog));
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

// POST create blog post (Admin only)
router.post('/', authMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const payload: any = {};
    if (body.title !== undefined) payload.title = body.title;
    if (body.slug !== undefined) payload.slug = body.slug;
    if (body.summary !== undefined) payload.excerpt = body.summary;
    if (body.content !== undefined) payload.content = body.content;
    if (body.image !== undefined) payload.featured_image = body.image;
    if (body.author !== undefined) payload.author = body.author;
    if (body.tags !== undefined) payload.tags = body.tags;
    if (body.enabled !== undefined) payload.is_published = body.enabled;
    if (body.publishedAt !== undefined) payload.published_at = body.publishedAt;

    const { data, error } = await supabase
      .from('blogs')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return c.json(mapBlog(data), 201);
  } catch (error: any) {
    return c.json({ message: error.message }, 400);
  }
});

// PUT update blog post (Admin only)
router.put('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const uuid = toUUID(id);
    const body = await c.req.json().catch(() => ({}));
    const payload: any = {};
    if (body.title !== undefined) payload.title = body.title;
    if (body.slug !== undefined) payload.slug = body.slug;
    if (body.summary !== undefined) payload.excerpt = body.summary;
    if (body.content !== undefined) payload.content = body.content;
    if (body.image !== undefined) payload.featured_image = body.image;
    if (body.author !== undefined) payload.author = body.author;
    if (body.tags !== undefined) payload.tags = body.tags;
    if (body.enabled !== undefined) payload.is_published = body.enabled;
    if (body.publishedAt !== undefined) payload.published_at = body.publishedAt;

    const { data, error } = await supabase
      .from('blogs')
      .update(payload)
      .eq('id', uuid)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return c.json({ message: 'Blog not found' }, 404);
    return c.json(mapBlog(data));
  } catch (error: any) {
    return c.json({ message: error.message }, 400);
  }
});

// DELETE blog post (Admin only)
router.delete('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const uuid = toUUID(id);
    const { data, error } = await supabase
      .from('blogs')
      .delete()
      .eq('id', uuid)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return c.json({ message: 'Blog not found' }, 404);
    return c.json({ message: 'Blog post deleted successfully' });
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

export default router;
