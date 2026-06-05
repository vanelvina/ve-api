import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  author: { type: String, required: true },
  avatar: { type: String },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, required: true },
  body: { type: String, required: true },
  date: { type: String },
  verified: { type: Boolean, default: true },
  helpful: { type: Number, default: 0 },
  images: [{ type: String }]
}, { timestamps: true });

export default mongoose.model('Review', reviewSchema);
