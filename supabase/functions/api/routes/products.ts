import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import { supabase } from '../utils/supabase.ts';
import { toUUID, fromUUID } from '../utils/uuid.ts';
import { authMiddleware } from '../middleware/auth.ts';

const router = new Hono();

// Helper to map Supabase Product row to Frontend expected camelCase format
const mapProductFromSupabase = (prod: any) => {
  if (!prod) return null;
  return {
    _id: prod.id,
    id: prod.id,
    slug: prod.slug,
    name: prod.name,
    brand: prod.brand,
    category: prod.category,
    subcategory: prod.subcategory || '',
    description: prod.description || '',
    highlights: prod.highlights || [],
    fabric: prod.fabric || '',
    care: prod.care || [],
    price: prod.price,
    originalPrice: prod.original_price,
    discount: prod.discount || 0,
    rating: prod.rating || 5.0,
    reviewCount: prod.review_count || 0,
    badge: prod.badge || null,
    tags: prod.tags || [],
    variants: (prod.variants || []).map((v: any) => ({
      _id: v.id || undefined,
      id: v.id || undefined,
      color: v.color || '',
      colorHex: v.colorHex || '',
      sizes: v.sizes || [],
      stockPerSize: v.stockPerSize || {},
      skuPerSize: v.skuPerSize || {},
      images: v.images || []
    })),
    inStock: prod.in_stock !== false,
    stockCount: prod.stock_count || 0,
    sku: prod.sku || '',
    styleId: prod.style_id || '',
    deliveryDays: prod.delivery_days || 3,
    images: prod.images || [],
    videoUrl: prod.video_url || '',
    availableOffer: prod.available_offer || '',
    features: prod.features || [],
    additionalInfo: prod.additional_info || '',
    descriptiveImages: prod.descriptive_images || [],
    faqs: (prod.faqs || []).map((f: any) => ({
      question: f.question || '',
      answer: f.answer || ''
    })),
    isCodAvailable: prod.is_cod_available !== false,
    isReturnable: prod.is_returnable !== false,
    isExchangeable: prod.is_exchangeable !== false,
    isFreeShipping: prod.is_free_shipping === true,
    createdAt: prod.created_at,
    updatedAt: prod.updated_at
  };
};

// Helper to map Frontend Product payload to Supabase snake_case schema
const mapProductToSupabase = (body: any) => {
  const payload: any = {};
  if (body.id !== undefined) payload.id = toUUID(body.id);
  else if (body._id !== undefined) payload.id = toUUID(body._id);
  
  if (body.slug !== undefined) payload.slug = body.slug;
  if (body.name !== undefined) payload.name = body.name;
  if (body.brand !== undefined) payload.brand = body.brand;
  if (body.category !== undefined) payload.category = body.category;
  if (body.subcategory !== undefined) payload.subcategory = body.subcategory;
  if (body.description !== undefined) payload.description = body.description;
  if (body.highlights !== undefined) payload.highlights = body.highlights;
  if (body.fabric !== undefined) payload.fabric = body.fabric;
  if (body.care !== undefined) payload.care = body.care;
  if (body.price !== undefined) payload.price = body.price;
  if (body.originalPrice !== undefined) payload.original_price = body.originalPrice;
  if (body.discount !== undefined) payload.discount = body.discount;
  if (body.rating !== undefined) payload.rating = body.rating;
  if (body.reviewCount !== undefined) payload.review_count = body.reviewCount;
  if (body.badge !== undefined) payload.badge = body.badge;
  if (body.tags !== undefined) payload.tags = body.tags;
  if (body.variants !== undefined) {
    payload.variants = (body.variants || []).map((v: any) => ({
      id: v.id ? toUUID(v.id) : (v._id ? toUUID(v._id) : undefined),
      color: v.color || '',
      colorHex: v.colorHex || '',
      sizes: v.sizes || [],
      stockPerSize: v.stockPerSize || {},
      skuPerSize: v.skuPerSize || {},
      images: v.images || []
    }));
  }
  if (body.inStock !== undefined) payload.in_stock = body.inStock;
  if (body.stockCount !== undefined) payload.stock_count = body.stockCount;
  if (body.sku !== undefined) payload.sku = body.sku;
  if (body.styleId !== undefined) payload.style_id = body.styleId;
  if (body.deliveryDays !== undefined) payload.delivery_days = body.deliveryDays;
  if (body.images !== undefined) payload.images = body.images;
  if (body.videoUrl !== undefined) payload.video_url = body.videoUrl;
  if (body.availableOffer !== undefined) payload.available_offer = body.availableOffer;
  if (body.features !== undefined) payload.features = body.features;
  if (body.additionalInfo !== undefined) payload.additional_info = body.additionalInfo;
  if (body.descriptiveImages !== undefined) payload.descriptive_images = body.descriptiveImages;
  if (body.faqs !== undefined) {
    payload.faqs = (body.faqs || []).map((f: any) => ({
      question: f.question || '',
      answer: f.answer || ''
    }));
  }
  if (body.isCodAvailable !== undefined) payload.is_cod_available = body.isCodAvailable;
  if (body.isReturnable !== undefined) payload.is_returnable = body.isReturnable;
  if (body.isExchangeable !== undefined) payload.is_exchangeable = body.isExchangeable;
  if (body.isFreeShipping !== undefined) payload.is_free_shipping = body.isFreeShipping;
  return payload;
};

// Helper to update product count in categories using Supabase
async function updateCategoryProductCounts() {
  try {
    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('id, name');
    if (catError) throw catError;

    for (const cat of categories || []) {
      if (!cat.name) continue;
      
      const { count, error: countError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .ilike('category', `%${cat.name}%`);
      
      if (countError) throw countError;

      const { error: updateError } = await supabase
        .from('categories')
        .update({ product_count: count })
        .eq('id', cat.id);
      
      if (updateError) throw updateError;
    }
  } catch (error) {
    console.error('Failed to update category product counts:', error);
  }
}

// GET all products
router.get('/', async (c) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*');

    if (error) throw error;
    return c.json((data || []).map(mapProductFromSupabase));
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

// GET single product by slug (used for SSR og:image meta — must come before /:id)
router.get('/slug/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !data) return c.json({ message: 'Product not found' }, 404);
    return c.json(mapProductFromSupabase(data));
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

// POST add new product

// PATCH /products/:id/decrement-stock  — called post-order to reduce per-size inventory
// Body: { items: [{ color: string, size: string, quantity: number }] }
router.patch('/:id/decrement-stock', async (c) => {
  try {
    const productId = c.req.param('id');
    const { items } = await c.req.json().catch(() => ({ items: [] }));
    if (!items?.length) return c.json({ ok: true });

    // Fetch current product
    const { data: prod, error: fetchError } = await supabase
      .from('products')
      .select('variants, stock_count')
      .eq('id', productId)
      .single();

    if (fetchError || !prod) return c.json({ message: 'Product not found' }, 404);

    const variants: any[] = prod.variants || [];
    let totalDecrement = 0;

    for (const item of items) {
      const variantIdx = variants.findIndex(
        (v: any) => v.color?.toLowerCase() === (item.color || '').toLowerCase()
      );
      if (variantIdx === -1) continue;
      const variant = variants[variantIdx];
      const sizeKey = item.size || '';
      const qty = Math.max(1, item.quantity || 1);
      const currentStock = variant.stockPerSize?.[sizeKey] ?? null;
      if (currentStock !== null) {
        variant.stockPerSize[sizeKey] = Math.max(0, currentStock - qty);
      }
      totalDecrement += qty;
    }

    // Persist updated variants + decrement top-level stock count
    const newStockCount = Math.max(0, (prod.stock_count || 0) - totalDecrement);
    const { error: updateError } = await supabase
      .from('products')
      .update({ variants, stock_count: newStockCount })
      .eq('id', productId);

    if (updateError) throw updateError;
    return c.json({ ok: true });
  } catch (error: any) {
    console.error('decrement-stock error:', error);
    return c.json({ message: error.message }, 500);
  }
});



router.post('/', authMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const payload = mapProductToSupabase(body);
    const { data, error } = await supabase
      .from('products')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    await updateCategoryProductCounts();
    return c.json(mapProductFromSupabase(data), 201);
  } catch (error: any) {
    return c.json({ message: error.message }, 400);
  }
});

// PUT update product
router.put('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const uuid = toUUID(id);
    const body = await c.req.json().catch(() => ({}));
    const payload = mapProductToSupabase(body);
    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', uuid)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return c.json({ message: 'Product not found' }, 404);
    
    await updateCategoryProductCounts();
    return c.json(mapProductFromSupabase(data));
  } catch (error: any) {
    return c.json({ message: error.message }, 400);
  }
});

// DELETE product
router.delete('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const uuid = toUUID(id);
    const { data, error } = await supabase
      .from('products')
      .delete()
      .eq('id', uuid)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return c.json({ message: 'Product not found' }, 404);

    await updateCategoryProductCounts();
    return c.json({ message: 'Product deleted successfully' });
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

export default router;
