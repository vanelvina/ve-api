import mongoose from 'mongoose';

const variantSchema = new mongoose.Schema({
  color: { type: String, required: true },
  colorHex: { type: String, required: true },
  sizes: [{ type: String }],
  images: [{ type: String }]
});

const productSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  brand: { type: String, default: 'Van Elvina' },
  category: { type: String, required: true },
  subcategory: { type: String },
  description: { type: String },
  highlights: [{ type: String }],
  fabric: { type: String },
  care: [{ type: String }],
  price: { type: Number, required: true },
  originalPrice: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  rating: { type: Number, default: 5.0 },
  reviewCount: { type: Number, default: 0 },
  badge: { type: String, enum: ['new', 'bestseller', 'sale', 'trending', null, ''], default: null },
  tags: [{ type: String }],
  variants: [variantSchema],
  inStock: { type: Boolean, default: true },
  stockCount: { type: Number, default: 0 },
  sku: { type: String },
  deliveryDays: { type: Number, default: 3 }
}, { timestamps: true });

export default mongoose.model('Product', productSchema);
