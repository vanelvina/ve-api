import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env variables
dotenv.config();

// Load models
import Banner from './models/Banner.js';
import Category from './models/Category.js';
import Product from './models/Product.js';
import Review from './models/Review.js';
import Widget from './models/Widget.js';
import Admin from './models/Admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the environment!');
  process.exit(1);
}

// Path to data files in the frontend
const frontendDataPath = path.join(__dirname, '../van-elvina/data');

const loadJSONFile = (filename) => {
  const filePath = path.join(frontendDataPath, filename);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return [];
};

async function seed() {
  try {
    console.log('Connecting to MongoDB database...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully!');

    // Clear existing data
    console.log('Clearing existing database collections...');
    await Banner.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Review.deleteMany({});
    await Widget.deleteMany({});
    await Admin.deleteMany({});
    console.log('Cleared existing data.');

    // Seed Admin
    console.log('Seeding default Admin credentials...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);
    await Admin.create({
      username: 'admin',
      password: hashedPassword
    });
    console.log('Admin user created (username: admin, password: password123)');

    // Seed Banners
    console.log('Seeding banners...');
    const banners = loadJSONFile('banners.json');
    if (banners && banners.length) {
      await Banner.insertMany(banners.map((b, idx) => ({ ...b, order: idx })));
      console.log(`Seeded ${banners.length} banners.`);
    }

    // Seed Categories
    console.log('Seeding categories...');
    const categories = loadJSONFile('categories.json');
    if (categories && categories.length) {
      await Category.insertMany(categories);
      console.log(`Seeded ${categories.length} categories.`);
    }

    // Seed Products
    console.log('Seeding products...');
    const products = loadJSONFile('products.json');
    if (products && products.length) {
      await Product.insertMany(products);
      console.log(`Seeded ${products.length} products.`);
    }

    // Seed Reviews
    console.log('Seeding reviews...');
    const reviews = loadJSONFile('reviews.json');
    if (reviews && reviews.length) {
      await Review.insertMany(reviews);
      console.log(`Seeded ${reviews.length} reviews.`);
    }

    // Seed Widgets
    console.log('Seeding widgets layout configurations...');
    const widgets = [
      {
        key: 'hero',
        name: 'Hero Banners Carousel',
        type: 'system',
        enabled: true,
        order: 1,
        title: 'Banners Section',
        subtitle: 'Promotional Carousel'
      },
      {
        key: 'featured',
        name: 'Featured Products Section',
        type: 'system',
        enabled: true,
        order: 2,
        title: 'Featured Products',
        subtitle: 'Handpicked For You',
        description: 'Our bestselling styles — tried, tested, and loved by thousands of women across India.'
      },
      {
        key: 'new-arrivals',
        name: 'New Arrivals Section',
        type: 'system',
        enabled: true,
        order: 3,
        title: 'New Arrivals',
        subtitle: 'Latest Styles',
        description: 'Fresh arrivals crafted from organic fabrics to match your vibes.'
      },
      {
        key: 'everyday-comfort',
        name: 'Everyday Comfort Editorial',
        type: 'system',
        enabled: true,
        order: 4,
        title: 'Everyday Comfort Collection',
        subtitle: 'Everyday Essentials',
        description: "Designed for real life — from morning rush to evening wind-down. Our Everyday Comfort Collection features ultra-soft fabrics, thoughtful fits, and styles that move with you. Because comfort isn't a luxury. It's a daily right.",
        image: 'https://images.unsplash.com/photo-1581044777550-4cfa60707c03?w=800&q=80',
        items: [
          'All-day comfort without compromise',
          'Premium breathable fabrics',
          'No-pinch, no-poke designs',
          'Available in sizes 28A to 44H',
          'Machine washable & durable'
        ]
      },
      {
        key: 'best-sellers',
        name: 'Best Sellers Section',
        type: 'system',
        enabled: true,
        order: 5,
        title: 'Best Sellers',
        subtitle: 'Customer Favorites',
        description: 'Shop the pieces that everyone is talking about.'
      },
      {
        key: 'categories',
        name: 'Shop By Category Section',
        type: 'system',
        enabled: true,
        order: 6,
        title: 'Shop By Category',
        subtitle: 'Find Your Style',
        description: 'Explore our full range — from everyday essentials to special occasion pieces.'
      },
      {
        key: 'reviews',
        name: 'Customer Reviews Section',
        type: 'system',
        enabled: true,
        order: 7,
        title: 'What Our Customers Say',
        subtitle: 'Real Women, Real Stories',
        description: 'Join 50,000+ happy customers who trust Van Elvina for everyday comfort.'
      },
      {
        key: 'usp',
        name: 'Brand USP Promise Section',
        type: 'system',
        enabled: true,
        order: 8,
        title: 'The Van Elvina Promise',
        subtitle: 'Why Choose Van Elvina',
        description: 'We believe every woman deserves innerwear that\'s as beautiful as it is comfortable.',
        items: [
          { icon: '🌿', title: 'Pure Fabrics', desc: 'OEKO-TEX certified, skin-safe materials' },
          { icon: '📏', title: 'Perfect Fit', desc: 'Inclusive sizing from 28A to 44H' },
          { icon: '🚀', title: 'Fast Delivery', desc: 'Delivered in 2–5 business days' },
          { icon: '↩️', title: 'Easy Returns', desc: '30-day exchange policy' },
          { icon: '🔒', title: 'Secure Packing', desc: 'Discreet, privacy-first packaging' },
          { icon: '💰', title: 'Best Value', desc: 'Premium quality at honest prices' }
        ]
      }
    ];

    await Widget.insertMany(widgets);
    console.log(`Seeded ${widgets.length} homepage widgets layout.`);

    console.log('Seeding process completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding process failed:', error);
    process.exit(1);
  }
}

seed();
