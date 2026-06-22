import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
  identifier: { type: String, required: true }, // email
  otp: { type: String, required: true },         // hashed OTP
  type: { type: String, enum: ['email'], default: 'email' },
  purpose: { type: String, enum: ['login', 'signup'], default: 'login' },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 10 * 60 * 1000) }, // 10 min
}, { timestamps: true });

// TTL index — MongoDB auto-deletes documents after expiresAt
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('OTP', otpSchema);
