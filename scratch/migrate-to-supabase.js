import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

import AboutUs from '../models/AboutUs.js';
import Admin from '../models/Admin.js';
import Banner from '../models/Banner.js';
import Blog from '../models/Blog.js';
import Cart from '../models/Cart.js';
import Category from '../models/Category.js';
import Inquiry from '../models/Inquiry.js';
import OTP from '../models/OTP.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Review from '../models/Review.js';
import User from '../models/User.js';
import Widget from '../models/Widget.js';
import Wishlist from '../models/Wishlist.js';

// Setup Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Setup MongoDB connection
const mongoUri = process.env.MONGODB_URI;

// Helper: Convert 24-character MongoDB Hex ObjectId to valid 36-character UUID
function toUUID(mongoId) {
  if (!mongoId) return null;
  const str = mongoId.toString();
  if (str.length !== 24) return str; // already UUID
  return `${str.substring(0, 8)}-${str.substring(8, 12)}-${str.substring(12, 16)}-${str.substring(16, 20)}-${str.substring(20, 24)}00000000`;
}

async function runMigration() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB successfully.');

  try {
    // 1. Migrate AboutUs
    console.log('Migrating AboutUs...');
    const abouts = await AboutUs.find();
    for (const doc of abouts) {
      const { error } = await supabase.from('about_us').upsert({
        id: toUUID(doc._id),
        story_title: doc.storyTitle || '',
        story_subtitle: doc.storySubtitle || '',
        story_content: doc.storyContent || '',
        story_image: doc.storyImage || '',
        vision_title: doc.visionTitle || '',
        vision_subtitle: doc.visionSubtitle || '',
        vision_content: doc.visionContent || [],
        philosophy_title: doc.philosophyTitle || '',
        philosophy_content: doc.philosophyContent || '',
        philosophy_image: doc.philosophyImage || '',
        promises: doc.promises || [],
        updated_at: doc.updatedAt || new Date()
      });
      if (error) throw error;
    }
    console.log(`Migrated ${abouts.length} AboutUs records.`);

    // 2. Migrate Admins
    console.log('Migrating Admins...');
    const admins = await Admin.find();
    for (const doc of admins) {
      const { error } = await supabase.from('admins').upsert({
        id: toUUID(doc._id),
        username: doc.username || '',
        password: doc.password || '',
        created_at: doc.createdAt || new Date(),
        updated_at: doc.updatedAt || new Date()
      });
      if (error) throw error;
    }
    console.log(`Migrated ${admins.length} Admins.`);

    // 3. Migrate Banners
    console.log('Migrating Banners...');
    const banners = await Banner.find();
    for (const doc of banners) {
      const { error } = await supabase.from('banners').upsert({
        id: toUUID(doc._id),
        title: doc.title || '',
        image: doc.image || '',
        image_mobile: doc.imageMobile || '',
        link: doc.link || '',
        position: doc.position || 0,
        is_active: doc.isActive !== false,
        created_at: doc.createdAt || new Date()
      });
      if (error) throw error;
    }
    console.log(`Migrated ${banners.length} Banners.`);

    // 4. Migrate Categories
    console.log('Migrating Categories...');
    const categories = await Category.find();
    for (const doc of categories) {
      const { error } = await supabase.from('categories').upsert({
        id: toUUID(doc._id),
        name: doc.name || '',
        slug: doc.slug || '',
        image: doc.image || '',
        description: doc.description || '',
        is_active: doc.isActive !== false,
        created_at: doc.createdAt || new Date(),
        updated_at: doc.updatedAt || new Date()
      });
      if (error) throw error;
    }
    console.log(`Migrated ${categories.length} Categories.`);

    // 5. Migrate Products
    console.log('Migrating Products...');
    const products = await Product.find();
    for (const doc of products) {
      // Map variants array to JSONB structure
      const mappedVariants = (doc.variants || []).map(v => ({
        id: toUUID(v._id),
        color: v.color || '',
        colorHex: v.colorHex || '',
        sizes: v.sizes || [],
        images: v.images || []
      }));

      // Map faqs
      const mappedFaqs = (doc.faqs || []).map(f => ({
        question: f.question || '',
        answer: f.answer || ''
      }));

      const { error } = await supabase.from('products').upsert({
        id: toUUID(doc._id),
        slug: doc.slug || '',
        name: doc.name || '',
        brand: doc.brand || 'Van Elvina',
        category: doc.category || '',
        subcategory: doc.subcategory || '',
        description: doc.description || '',
        highlights: doc.highlights || [],
        fabric: doc.fabric || '',
        care: doc.care || [],
        price: doc.price || 0,
        original_price: doc.originalPrice || 0,
        discount: doc.discount || 0,
        rating: doc.rating || 5.0,
        review_count: doc.reviewCount || 0,
        badge: doc.badge || null,
        tags: doc.tags || [],
        variants: mappedVariants,
        in_stock: doc.inStock !== false,
        stock_count: doc.stockCount || 0,
        sku: doc.sku || '',
        style_id: doc.styleId || '',
        delivery_days: doc.deliveryDays || 3,
        images: doc.images || [],
        video_url: doc.videoUrl || '',
        available_offer: doc.availableOffer || '',
        features: doc.features || [],
        additional_info: doc.additionalInfo || '',
        descriptive_images: doc.descriptiveImages || [],
        faqs: mappedFaqs,
        is_cod_available: doc.isCodAvailable !== false,
        is_returnable: doc.isReturnable !== false,
        is_exchangeable: doc.isExchangeable !== false,
        is_free_shipping: doc.isFreeShipping === true,
        created_at: doc.createdAt || new Date(),
        updated_at: doc.updatedAt || new Date()
      });
      if (error) throw error;
    }
    console.log(`Migrated ${products.length} Products.`);

    // 6. Migrate Users & Addresses
    console.log('Migrating Users & Addresses...');
    const users = await User.find();
    let totalAddresses = 0;
    for (const doc of users) {
      const userId = toUUID(doc._id);
      if (!doc.email) continue; // skip invalid user

      // Insert User
      const { error: userErr } = await supabase.from('users').upsert({
        id: userId,
        name: doc.name || '',
        email: doc.email,
        password: doc.password || '',
        google_id: doc.googleId || null,
        avatar: doc.avatar || '',
        is_verified: doc.isVerified === true,
        auth_method: doc.authMethod || 'email',
        is_guest: doc.isGuest === true,
        is_active: doc.isActive !== false,
        phone: doc.phone || '',
        last_login_at: doc.lastLoginAt || new Date(),
        created_at: doc.createdAt || new Date(),
        updated_at: doc.updatedAt || new Date()
      });
      if (userErr) throw userErr;

      // Insert User's Addresses
      if (doc.addresses && doc.addresses.length > 0) {
        for (const addr of doc.addresses) {
          const { error: addrErr } = await supabase.from('addresses').upsert({
            id: toUUID(addr._id),
            user_id: userId,
            full_name: addr.fullName || '',
            email: addr.email || '',
            phone: addr.phone || '',
            line1: addr.line1 || '',
            line2: addr.line2 || '',
            city: addr.city || '',
            state: addr.state || '',
            pincode: addr.pincode || '',
            is_default: addr.isDefault === true
          });
          if (addrErr) throw addrErr;
          totalAddresses++;
        }
      }
    }
    console.log(`Migrated ${users.length} Users and ${totalAddresses} Addresses.`);

    // 7. Migrate Blogs
    console.log('Migrating Blogs...');
    const blogs = await Blog.find();
    for (const doc of blogs) {
      const { error } = await supabase.from('blogs').upsert({
        id: toUUID(doc._id),
        title: doc.title || '',
        slug: doc.slug || '',
        content: doc.content || '',
        excerpt: doc.excerpt || '',
        featured_image: doc.featuredImage || '',
        author: doc.author || 'Admin',
        tags: doc.tags || [],
        is_published: doc.isPublished === true,
        published_at: doc.publishedAt || null,
        created_at: doc.createdAt || new Date(),
        updated_at: doc.updatedAt || new Date()
      });
      if (error) throw error;
    }
    console.log(`Migrated ${blogs.length} Blogs.`);

    // 8. Migrate OTPs
    console.log('Migrating OTPs...');
    const otps = await OTP.find();
    for (const doc of otps) {
      const { error } = await supabase.from('otps').upsert({
        id: toUUID(doc._id),
        email: doc.email || '',
        code: doc.code || '',
        expires_at: doc.expiresAt || new Date(Date.now() + 600000),
        created_at: doc.createdAt || new Date()
      });
      if (error) throw error;
    }
    console.log(`Migrated ${otps.length} OTP codes.`);

    // 9. Migrate Inquiries
    console.log('Migrating Inquiries...');
    const inquiries = await Inquiry.find();
    for (const doc of inquiries) {
      const { error } = await supabase.from('inquiries').upsert({
        id: toUUID(doc._id),
        name: doc.name || '',
        email: doc.email || '',
        phone: doc.phone || '',
        subject: doc.subject || '',
        message: doc.message || '',
        status: doc.status || 'pending',
        created_at: doc.createdAt || new Date()
      });
      if (error) throw error;
    }
    console.log(`Migrated ${inquiries.length} Inquiries.`);

    // 10. Migrate Carts
    console.log('Migrating Carts...');
    const carts = await Cart.find();
    let cartCount = 0;
    for (const doc of carts) {
      const userId = toUUID(doc.userId);
      const productId = toUUID(doc.productId);
      if (!userId || !productId) continue;

      const { error } = await supabase.from('carts').upsert({
        id: toUUID(doc._id),
        user_id: userId,
        product_id: productId,
        quantity: doc.quantity || 1,
        color: doc.color || '',
        size: doc.size || '',
        created_at: doc.createdAt || new Date(),
        updated_at: doc.updatedAt || new Date()
      });
      if (error) throw error;
      cartCount++;
    }
    console.log(`Migrated ${cartCount} Cart records.`);

    // 11. Migrate Wishlists
    console.log('Migrating Wishlists...');
    const wishlists = await Wishlist.find();
    let wishlistCount = 0;
    for (const doc of wishlists) {
      const userId = toUUID(doc.userId);
      const productId = toUUID(doc.productId);
      if (!userId || !productId) continue;

      const { error } = await supabase.from('wishlists').upsert({
        id: toUUID(doc._id),
        user_id: userId,
        product_id: productId,
        created_at: doc.createdAt || new Date()
      });
      if (error) throw error;
      wishlistCount++;
    }
    console.log(`Migrated ${wishlistCount} Wishlist records.`);

    // 12. Migrate Reviews
    console.log('Migrating Reviews...');
    const reviews = await Review.find();
    let reviewCount = 0;
    for (const doc of reviews) {
      const userId = toUUID(doc.userId);
      const productId = toUUID(doc.productId);
      if (!userId || !productId) continue;

      const { error } = await supabase.from('reviews').upsert({
        id: toUUID(doc._id),
        product_id: productId,
        user_id: userId,
        rating: doc.rating || 5,
        comment: doc.comment || '',
        images: doc.images || [],
        is_verified_purchase: doc.isVerifiedPurchase === true,
        created_at: doc.createdAt || new Date(),
        updated_at: doc.updatedAt || new Date()
      });
      if (error) throw error;
      reviewCount++;
    }
    console.log(`Migrated ${reviewCount} Reviews.`);

    // 13. Migrate Widgets
    console.log('Migrating Widgets...');
    const widgets = await Widget.find();
    for (const doc of widgets) {
      const { error } = await supabase.from('widgets').upsert({
        id: toUUID(doc._id),
        title: doc.title || '',
        type: doc.type || '',
        position: doc.position || 0,
        is_active: doc.isActive !== false,
        config: doc.config || {},
        created_at: doc.createdAt || new Date(),
        updated_at: doc.updatedAt || new Date()
      });
      if (error) throw error;
    }
    console.log(`Migrated ${widgets.length} Widgets.`);

    // 14. Migrate Orders
    console.log('Migrating Orders...');
    const orders = await Order.find();
    for (const doc of orders) {
      const mappedItems = (doc.items || []).map(item => ({
        productId: toUUID(item.productId),
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.image || '',
        size: item.size || 'Standard'
      }));

      const { error } = await supabase.from('orders').upsert({
        id: toUUID(doc._id),
        order_id: doc.orderId || '',
        user_id: toUUID(doc.userId),
        items: mappedItems,
        shipping_address: doc.shippingAddress || {},
        payment_method: doc.paymentMethod || '',
        payment_status: doc.paymentStatus || 'pending',
        order_status: doc.orderStatus || 'placed',
        subtotal: doc.subtotal || 0,
        shipping_fee: doc.shippingFee || 0.00,
        discount: doc.discount || 0.00,
        total: doc.total || 0,
        razorpay_order_id: doc.razorpay_order_id || null,
        razorpay_payment_id: doc.razorpay_payment_id || null,
        razorpay_signature: doc.razorpay_signature || null,
        guest_info: doc.guestInfo || null,
        created_at: doc.createdAt || new Date(),
        updated_at: doc.updatedAt || new Date()
      });
      if (error) throw error;
    }
    console.log(`Migrated ${orders.length} Orders.`);

    console.log('\n======================================================');
    console.log('SUCCESS: All collections migrated to Supabase PostgreSQL!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('Migration failed with error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

runMigration();
