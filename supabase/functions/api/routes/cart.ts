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

// Helper: Format Cart Item for Frontend compatibility
function formatCartItem(item: any) {
  if (!item) return null;
  return {
    _id: item.id,
    id: item.id,
    productId: item.products ? formatProductForFrontend(item.products) : item.product_id,
    color: item.color,
    size: item.size,
    quantity: item.quantity
  };
}

// GET /api/cart - Get current user's populated shopping bag
router.get('/', userAuthMiddleware, async (c) => {
  try {
    const userPayload = c.get('user');
    const userId = toUUID(userPayload.id);

    const { data: dbItems, error } = await supabase
      .from('carts')
      .select('*, products(*)')
      .eq('user_id', userId);

    if (error) throw error;
    return c.json((dbItems || []).map(formatCartItem));
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

// POST /api/cart - Sync the shopping bag items with DB
router.post('/', userAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { items } = body;
    if (!Array.isArray(items)) {
      return c.json({ message: 'Items array is required' }, 400);
    }

    const userPayload = c.get('user');
    const userId = toUUID(userPayload.id);

    // Delete existing cart items
    const { error: deleteError } = await supabase
      .from('carts')
      .delete()
      .eq('user_id', userId);

    if (deleteError) throw deleteError;

    if (items.length > 0) {
      const insertPayload = items.map((item: any) => ({
        user_id: userId,
        product_id: toUUID(item.productId?._id || item.productId?.id || item.productId),
        color: item.variantColor || item.color,
        size: item.size,
        quantity: item.quantity
      }));

      const { error: insertError } = await supabase
        .from('carts')
        .insert(insertPayload);

      if (insertError) throw insertError;
    }

    // Fetch updated populated cart
    const { data: dbItems, error: fetchError } = await supabase
      .from('carts')
      .select('*, products(*)')
      .eq('user_id', userId);

    if (fetchError) throw fetchError;

    return c.json((dbItems || []).map(formatCartItem));
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

export default router;
