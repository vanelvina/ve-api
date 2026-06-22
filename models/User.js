import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, trim: true, default: '' },
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  googleId: { type: String, unique: true, sparse: true },
  avatar: { type: String, default: '' },
  isVerified: { type: Boolean, default: false },
  authMethod: { type: String, enum: ['email', 'google'], default: 'email' },
  isGuest: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.model('User', userSchema);
