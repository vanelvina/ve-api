import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import { supabase } from '../utils/supabase.ts';

const router = new Hono();

// Helper to map Supabase Review row (with joined users and products) to Frontend format
const mapReviewFromSupabase = (row: any) => {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    productId: row.product_id,
    productName: row.products ? row.products.name : 'Unknown Product',
    author: row.users ? row.users.name : 'Anonymous',
    avatar: row.users ? row.users.avatar : '',
    rating: row.rating || 5,
    title: row.comment ? (row.comment.length > 25 ? row.comment.substring(0, 25) + '...' : row.comment) : 'Review',
    body: row.comment || '',
    date: row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    verified: row.is_verified_purchase !== false,
    helpful: 0,
    images: row.images || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

// GET all reviews
router.get('/', async (c) => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('*, users(name, avatar), products(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return c.json((data || []).map(mapReviewFromSupabase));
  } catch (error: any) {
    return c.json({ message: error.message }, 500);
  }
});

export default router;
