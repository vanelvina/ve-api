import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import { supabase } from '../utils/supabase.ts';
import { toUUID } from '../utils/uuid.ts';
import { userAuthMiddleware } from '../middleware/auth.ts';

const router = new Hono();

// Helper: Format Product for Frontend compatibility
function formatProductForFrontend(prod: any) {
  if (!prod) return null;
  return {
    ...prod,
    _id: prod.id,
    originalPrice: prod.original_price,
    reviewCount: prod.review_count,
    inStock: prod.in_stock,
    stockCount: prod.stock_count,
    styleId: prod.style_id,
    deliveryDays: prod.delivery_days,
    videoUrl: prod.video_url,
    availableOffer: prod.available_offer,
    additionalInfo: prod.additional_info,
    descriptiveImages: prod.descriptive_images,
    isCodAvailable: prod.is_cod_available,
    isReturnable: prod.is_returnable,
    isExchangeable: prod.is_exchangeable,
    isFreeShipping: prod.is_free_shipping,
    variants: (prod.variants || []).map((v: any) => ({
      ...v,
      _id: v.id
    })),
    createdAt: prod.created_at,
    updatedAt: prod.updated_at
  };
}

// GET /api/wishlist - Get current user's populated wishlist
router.get('/', userAuthMiddleware, async (c) => {
  try {
    const userPayload = c.get('user');
    const userId = toUUID(userPayload.id);

    const { data: dbItems, error } = await supabase
      .from('wishlists')
      .select('*, products(*)')
      .eq('user_id', userId);

    if (error) throw error;

    const products = (dbItems || [])
      .map((item: any) => formatProductForFrontend(item.products))
      .filter((p: any) => p !== null);

    return c.json(products);
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

// POST /api/wishlist/toggle - Toggle a product in user's wishlist
router.post('/toggle', userAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { productId } = body;
    if (!productId) {
      return c.json({ message: 'Product ID is required' }, 400);
    }

    const userPayload = c.get('user');
    const userId = toUUID(userPayload.id);
    const pId = toUUID(productId);

    // Check if item already in wishlist
    const { data: existing, error: fetchErr } = await supabase
      .from('wishlists')
      .select('*')
      .eq('user_id', userId)
      .eq('product_id', pId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (existing) {
      const { error: deleteErr } = await supabase
        .from('wishlists')
        .delete()
        .eq('user_id', userId)
        .eq('product_id', pId);

      if (deleteErr) throw deleteErr;
      return c.json({ action: 'removed', message: 'Product removed from wishlist' });
    } else {
      // Verify product exists first
      const { data: productExists, error: productErr } = await supabase
        .from('products')
        .select('id')
        .eq('id', pId)
        .maybeSingle();

      if (productErr) throw productErr;
      if (!productExists) {
        return c.json({ message: 'Product not found' }, 404);
      }

      const { error: insertErr } = await supabase
        .from('wishlists')
        .insert({
          user_id: userId,
          product_id: pId
        });

      if (insertErr) throw insertErr;
      return c.json({ action: 'added', message: 'Product added to wishlist' });
    }
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

// POST /api/wishlist/merge - Merge multiple products into user's wishlist
router.post('/merge', userAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { productIds } = body;
    if (!Array.isArray(productIds)) {
      return c.json({ message: 'productIds array is required' }, 400);
    }

    const userPayload = c.get('user');
    const userId = toUUID(userPayload.id);

    // Get current user's wishlist items
    const { data: existingItems, error: fetchErr } = await supabase
      .from('wishlists')
      .select('product_id')
      .eq('user_id', userId);

    if (fetchErr) throw fetchErr;

    const existingProductIds = new Set((existingItems || []).map((item: any) => item.product_id));

    // Filter out input product IDs that are already in the wishlist
    const newIdsToTry = [...new Set(productIds.map(toUUID).filter((id: any) => id && !existingProductIds.has(id)))];

    if (newIdsToTry.length > 0) {
      // Verify which of these products actually exist in database
      const { data: validProducts, error: prodErr } = await supabase
        .from('products')
        .select('id')
        .in('id', newIdsToTry);

      if (prodErr) throw prodErr;

      if (validProducts && validProducts.length > 0) {
        const insertPayload = validProducts.map((p: any) => ({
          user_id: userId,
          product_id: p.id
        }));

        const { error: insertErr } = await supabase
          .from('wishlists')
          .insert(insertPayload);

        if (insertErr) throw insertErr;
      }
    }

    // Fetch the final merged, populated wishlist
    const { data: dbItems, error: finalFetchErr } = await supabase
      .from('wishlists')
      .select('*, products(*)')
      .eq('user_id', userId);

    if (finalFetchErr) throw finalFetchErr;

    const products = (dbItems || [])
      .map((item: any) => formatProductForFrontend(item.products))
      .filter((p: any) => p !== null);

    return c.json(products);
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

export default router;
