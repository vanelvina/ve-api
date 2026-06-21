import mongoose from 'mongoose';

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  summary: { type: String, required: true },
  content: { type: String, required: true }, // Long rich-text content
  image: { type: String, required: true },   // Cover photo URL
  author: { type: String, default: 'Admin' },
  tags: [{ type: String }],                  // e.g. ['Fashion', 'Lifestyle']
  enabled: { type: Boolean, default: true },
  publishedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('Blog', blogSchema);
