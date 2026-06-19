import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema({
  title: { type: String },
  subtitle: { type: String },
  cta: { type: String },
  ctaLink: { type: String, required: true },
  image: { type: String, required: true },
  imageMobile: { type: String },
  badge: { type: String },
  textColor: { type: String, enum: ['light', 'dark'], default: 'light' },
  align: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
  order: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('Banner', bannerSchema);
