import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import { supabase } from '../utils/supabase.ts';
import { toUUID } from '../utils/uuid.ts';
import { authMiddleware } from '../middleware/auth.ts';

const router = new Hono();

const DEFAULT_SUBCATEGORIES: Record<string, any[]> = {
  "bras": [
    { "id": "sub001", "name": "T-Shirt Bras", "slug": "t-shirt-bras" },
    { "id": "sub002", "name": "Push-Up Bras", "slug": "push-up-bras" },
    { "id": "sub003", "name": "Minimizer Bras", "slug": "minimizer-bras" },
    { "id": "sub004", "name": "Bralettes", "slug": "bralettes" },
    { "id": "sub005", "name": "Strapless", "slug": "strapless" },
    { "id": "sub006", "name": "Full Coverage", "slug": "full-coverage" }
  ],
  "panties": [
    { "id": "sub007", "name": "Briefs", "slug": "briefs" },
    { "id": "sub008", "name": "Hipsters", "slug": "hipsters" },
    { "id": "sub009", "name": "Boyshorts", "slug": "boyshorts" },
    { "id": "sub010", "name": "Thongs", "slug": "thongs" },
    { "id": "sub011", "name": "High-Waist", "slug": "high-waist" }
  ],
  "shapewear": [
    { "id": "sub012", "name": "Shaping Briefs", "slug": "shaping-briefs" },
    { "id": "sub013", "name": "Body Shapers", "slug": "body-shapers" },
    { "id": "sub014", "name": "Waist Cinchers", "slug": "waist-cinchers" }
  ],
  "sleepwear": [
    { "id": "sub015", "name": "Sleep Sets", "slug": "sleep-sets" },
    { "id": "sub016", "name": "Bralettes", "slug": "sleep-bralettes" },
    { "id": "sub017", "name": "Lingeris", "slug": "nightwear" }
  ],
  "activewear": [
    { "id": "sub018", "name": "Sports Bras", "slug": "sports-bras" },
    { "id": "sub019", "name": "Active Sets", "slug": "active-sets" }
  ],
  "maternity": [
    { "id": "sub020", "name": "Nursing Bras", "slug": "nursing-bras" },
    { "id": "sub021", "name": "Maternity Briefs", "slug": "maternity-briefs" }
  ],
  "thermals": [
    { "id": "sub022", "name": "Thermal Tops", "slug": "thermal-tops" },
    { "id": "sub023", "name": "Thermal Bottoms", "slug": "thermal-bottoms" },
    { "id": "sub024", "name": "Thermal Sets", "slug": "thermal-sets" }
  ],
  "new-arrivals": []
};

// GET all categories
router.get('/', async (c) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*');

    if (error) throw error;

    const categoriesWithCounts = await Promise.all(data.map(async (row: any) => {
      const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .ilike('category', row.name);

      return {
        _id: row.id,
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        image: row.image,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        productCount: count || 0,
        subcategories: DEFAULT_SUBCATEGORIES[row.slug] || [],
        plpBanner: '',
        plpBannerMobile: ''
      };
    }));

    return c.json(categoriesWithCounts);
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

// POST add new category
router.post('/', authMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const payload = {
      name: body.name,
      slug: body.slug,
      description: body.description,
      image: body.image,
      is_active: body.isActive !== false
    };

    const { data, error } = await supabase
      .from('categories')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    const mapped = {
      _id: data.id,
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      image: data.image,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      productCount: 0,
      subcategories: DEFAULT_SUBCATEGORIES[data.slug] || [],
      plpBanner: '',
      plpBannerMobile: ''
    };
    return c.json(mapped, 201);
  } catch (error: any) {
    return c.json({ message: error.message }, 400);
  }
});

// PUT update category
router.put('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const uuid = toUUID(id);
    const body = await c.req.json().catch(() => ({}));
    const payload: any = {};
    if (body.name !== undefined) payload.name = body.name;
    if (body.slug !== undefined) payload.slug = body.slug;
    if (body.description !== undefined) payload.description = body.description;
    if (body.image !== undefined) payload.image = body.image;
    if (body.isActive !== undefined) payload.is_active = body.isActive;
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('categories')
      .update(payload)
      .eq('id', uuid)
      .select()
      .single();

    if (error) throw error;
    if (!data) return c.json({ message: 'Category not found' }, 404);

    // Fetch productCount
    const { count } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .ilike('category', data.name);

    const mapped = {
      _id: data.id,
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      image: data.image,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      productCount: count || 0,
      subcategories: DEFAULT_SUBCATEGORIES[data.slug] || [],
      plpBanner: '',
      plpBannerMobile: ''
    };
    return c.json(mapped);
  } catch (error: any) {
    return c.json({ message: error.message }, 400);
  }
});

// DELETE category
router.delete('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const uuid = toUUID(id);
    const { data, error } = await supabase
      .from('categories')
      .delete()
      .eq('id', uuid)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return c.json({ message: 'Category not found' }, 404);
    return c.json({ message: 'Category deleted successfully' });
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

export default router;
