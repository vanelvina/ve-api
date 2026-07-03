import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import { cors } from 'https://deno.land/x/hono@v3.11.7/middleware/cors/index.ts';

// Import route modules
import authRoutes from './routes/auth.ts';
import bannerRoutes from './routes/banners.ts';
import categoryRoutes from './routes/categories.ts';
import productRoutes from './routes/products.ts';
import reviewRoutes from './routes/reviews.ts';
import widgetRoutes from './routes/widgets.ts';
import uploadRoutes from './routes/upload.ts';
import blogRoutes from './routes/blogs.ts';
import userAuthRoutes from './routes/user-auth.ts';
import orderRoutes from './routes/orders.ts';
import aboutRoutes from './routes/about.ts';
import inquiryRoutes from './routes/inquiries.ts';
import wishlistRoutes from './routes/wishlist.ts';
import cartRoutes from './routes/cart.ts';

const app = new Hono();

// Enable CORS
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}));

// Set global Cache-Control headers to completely disable backend response caching
app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  await next();
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'OK',
    message: 'Van Elvina API is running smoothly on Supabase Edge Functions'
  });
});

// Root welcome endpoint
app.get('/', (c) => {
  return c.json({
    status: 'OK',
    message: 'Van Elvina API is running on Supabase Edge Functions. Use /health to check status.'
  });
});

// Mount Routes
app.route('/auth', authRoutes);
app.route('/banners', bannerRoutes);
app.route('/categories', categoryRoutes);
app.route('/products', productRoutes);
app.route('/reviews', reviewRoutes);
app.route('/widgets', widgetRoutes);
app.route('/upload', uploadRoutes);
app.route('/blogs', blogRoutes);
app.route('/user-auth', userAuthRoutes);
app.route('/orders', orderRoutes);
app.route('/about', aboutRoutes);
app.route('/inquiries', inquiryRoutes);
app.route('/wishlist', wishlistRoutes);
app.route('/cart', cartRoutes);

// Error Handler
app.onError((err, c) => {
  console.error('Unhandled Edge Function Error:', err);
  return c.json({ message: 'Internal Server Error', error: err.message }, 500);
});

// Deno serve request handler with URL path normalization
Deno.serve(async (req) => {
  const url = new URL(req.url);
  
  // Normalize path by stripping both potential prefixes sequentially
  let path = url.pathname;
  path = path.replace('/functions/v1/api', '');
  path = path.replace('/api', '');
  
  // Normalize double slashes
  path = path.replace(/\/{2,}/g, '/');
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  
  url.pathname = path;
  
  const newReq = new Request(url.toString(), req);
  return app.fetch(newReq);
});
