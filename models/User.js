import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, trim: true, default: '' },
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  password: { type: String },
  googleId: { type: String, unique: true, sparse: true },
  avatar: { type: String, default: '' },
  isVerified: { type: Boolean, default: false },
  authMethod: { type: String, enum: ['email', 'google'], default: 'email' },
  isGuest: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  phone: { type: String, default: '' },
  addresses: [{
    fullName: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    isDefault: { type: Boolean, default: false }
  }],
  lastLoginAt: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.model('User', userSchema);
