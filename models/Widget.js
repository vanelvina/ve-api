import mongoose from 'mongoose';

const widgetSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['system', 'banner', 'editorial', 'html', 'promo-grid', 'collection-tabs', 'fit-calculator', 'offers-slider', 'countdown-banner', 'image-only', 'vertical-carousel', 'heading-banner', 'flexible-grid', '3-set-carousel', 'square-grid', 'shoppers-talk'], default: 'system' },
  enabled: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  title: { type: String },
  subtitle: { type: String },
  description: { type: String },
  image: { type: String },
  imageMobile: { type: String },
  margins: {
    top: { type: Boolean, default: false },
    bottom: { type: Boolean, default: false },
    left: { type: Boolean, default: false },
    right: { type: Boolean, default: false }
  },
  items: { type: mongoose.Schema.Types.Mixed } // Stores extra structure like array of strings or list of USPs
}, { timestamps: true });

export default mongoose.model('Widget', widgetSchema);
