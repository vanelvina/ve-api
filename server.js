import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

// Load routes
import authRoutes from './routes/auth.js';
import bannerRoutes from './routes/banners.js';
import categoryRoutes from './routes/categories.js';
import productRoutes from './routes/products.js';
import reviewRoutes from './routes/reviews.js';
import widgetRoutes from './routes/widgets.js';
import uploadRoutes from './routes/upload.js';
import blogRoutes from './routes/blogs.js';
import userAuthRoutes from './routes/user-auth.js';
import orderRoutes from './routes/orders.js';
import aboutRoutes from './routes/about.js';
import inquiryRoutes from './routes/inquiries.js';
import wishlistRoutes from './routes/wishlist.js';
import cartRoutes from './routes/cart.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/widgets', widgetRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/user-auth', userAuthRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/about', aboutRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/cart', cartRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Van Elvina API is running smoothly' });
});

// Generic Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  res.status(500).json({ message: 'Internal Server Error' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
