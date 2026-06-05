import mongoose from 'mongoose';

const subcategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true }
});

const categorySchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  image: { type: String },
  productCount: { type: Number, default: 0 },
  subcategories: [subcategorySchema]
}, { timestamps: true });

export default mongoose.model('Category', categorySchema);
