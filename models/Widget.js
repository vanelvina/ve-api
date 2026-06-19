import mongoose from 'mongoose';

const widgetSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['system', 'banner', 'editorial', 'html', 'promo-grid', 'collection-tabs', 'fit-calculator', 'offers-slider'], default: 'system' },
  enabled: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  title: { type: String },
  subtitle: { type: String },
  description: { type: String },
  image: { type: String },
  items: { type: mongoose.Schema.Types.Mixed } // Stores extra structure like array of strings or list of USPs
}, { timestamps: true });

export default mongoose.model('Widget', widgetSchema);
