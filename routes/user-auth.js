import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Resend } from 'resend';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import OTP from '../models/OTP.js';
import userAuth from '../middleware/userAuth.js';
import adminAuth from '../middleware/auth.js';
import Order from '../models/Order.js';

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_dev_bypass');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const USER_JWT_SECRET = process.env.USER_JWT_SECRET || 've_user_jwt_secret_vanelvina_2026_secure';
const IS_DEV = process.env.NODE_ENV === 'development';

// ─── Helper: Generate 6-digit OTP ────────────────────────────────────────────
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ─── Helper: Sign user JWT ────────────────────────────────────────────────────
const signUserToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, authMethod: user.authMethod },
    USER_JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// ─── Helper: Send OTP via Resend ─────────────────────────────────────────────
const sendOTPEmail = async (email, otp, name = '') => {
  if (IS_DEV && process.env.RESEND_API_KEY === 're_placeholder_add_your_resend_key') {
    console.log(`[DEV] OTP for ${email}: ${otp}`);
    return { success: true };
  }
  try {
    const { error } = await resend.emails.send({
      from: 'Van Elvina <support@vanelvina.com>',
      to: email,
      subject: `${otp} is your Van Elvina verification code`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: 'Georgia', serif; background:#FDF8F5; margin:0; padding:40px 20px;">
          <div style="max-width:480px; margin:0 auto; background:white; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
            <div style="background:linear-gradient(135deg,#8A4F5A,#B76E79); padding:32px; text-align:center;">
              <h1 style="color:white; margin:0; font-size:28px; font-weight:700; letter-spacing:1px;">Van Elvina</h1>
              <p style="color:rgba(255,255,255,0.75); margin:6px 0 0; font-size:12px; text-transform:uppercase; letter-spacing:2px;">Verification Code</p>
            </div>
            <div style="padding:40px 32px;">
              ${name ? `<p style="color:#2C2C2C; font-size:16px; margin:0 0 16px;">Hello ${name},</p>` : ''}
              <p style="color:#555; font-size:15px; line-height:1.6; margin:0 0 28px;">
                Use the code below to verify your identity. This code is valid for <strong>10 minutes</strong>.
              </p>
              <div style="background:#FAF0F1; border:2px solid #E8C5CA; border-radius:12px; padding:24px; text-align:center; margin:0 0 28px;">
                <span style="font-size:42px; font-weight:800; letter-spacing:12px; color:#8A4F5A; font-family:monospace;">${otp}</span>
              </div>
              <p style="color:#999; font-size:13px; line-height:1.5; margin:0;">
                If you didn't request this code, you can safely ignore this email.
              </p>
            </div>
            <div style="background:#FAF6F0; border-top:1px solid #F0E8E0; padding:20px 32px; text-align:center;">
              <p style="color:#BBB; font-size:12px; margin:0;">© 2026 Van Elvina · Premium Women's Innerwear</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('Resend error:', err);
    throw new Error('Failed to send verification email');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user-auth/send-otp
// Body: { identifier: "email@example.com", type: "email" }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  try {
    const { identifier, type = 'email' } = req.body;
    if (!identifier || type !== 'email') {
      return res.status(400).json({ message: 'Valid email required' });
    }

    const email = identifier.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Generate OTP
    const rawOtp = generateOTP();
    const hashedOtp = await bcrypt.hash(rawOtp, 8);

    // Remove any existing OTP for this identifier
    await OTP.deleteMany({ identifier: email });

    // Save new OTP (TTL auto-expires after 10 min)
    await OTP.create({
      identifier: email,
      otp: hashedOtp,
      type: 'email',
    });

    // Check if user already exists (determines purpose)
    const existingUser = await User.findOne({ email });
    const purpose = existingUser ? 'login' : 'signup';

    // Send email
    await sendOTPEmail(email, rawOtp, existingUser?.name);

    return res.json({
      success: true,
      purpose,
      message: `Verification code sent to ${email}`,
      ...(IS_DEV && { _devOtp: rawOtp }) // expose in dev mode response for easy testing
    });
  } catch (err) {
    console.error('send-otp error:', err);
    return res.status(500).json({ message: err.message || 'Failed to send OTP' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user-auth/verify-otp
// Body: { identifier: "email@example.com", otp: "123456", name: "Priya" (for signup) }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { identifier, otp, name } = req.body;
    if (!identifier || !otp) {
      return res.status(400).json({ message: 'Email and OTP required' });
    }

    const email = identifier.toLowerCase().trim();

    const otpRecord = await OTP.findOne({ identifier: email }).sort({ createdAt: -1 });
    if (!otpRecord) {
      return res.status(400).json({ message: 'OTP expired or not found. Please request a new code.' });
    }
    const isValid = await bcrypt.compare(otp, otpRecord.otp);

    if (!isValid) {
      return res.status(400).json({ message: 'Invalid verification code. Please try again.' });
    }

    // Delete used OTP
    await OTP.deleteMany({ identifier: email });

    // Find or create user
    let user = await User.findOne({ email });
    const isNewUser = !user;

    if (!user) {
      user = await User.create({
        email,
        name: name?.trim() || email.split('@')[0],
        authMethod: 'email',
        isVerified: true,
        isGuest: false,
        isActive: true,
        lastLoginAt: new Date()
      });
    } else {
      if (!user.isActive) {
        return res.status(403).json({ message: 'Your account has been suspended by the administrator.' });
      }
      user.lastLoginAt = new Date();
      if (!user.isVerified) {
        user.isVerified = true;
      }
      // Update name if provided and not yet set
      if (name?.trim() && !user.name) {
        user.name = name.trim();
      }
      await user.save();
    }

    const token = signUserToken(user);
    return res.json({
      success: true,
      token,
      isNewUser,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        authMethod: user.authMethod,
      }
    });
  } catch (err) {
    console.error('verify-otp error:', err);
    return res.status(500).json({ message: 'Server error during verification' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user-auth/google
// Body: { idToken: "<Google ID Token from frontend>" }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: 'Google ID token required' });
    }

    // Verify with Google
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({ message: 'Google account must have an email' });
    }

    // Find by googleId or email
    let user = await User.findOne({ $or: [{ googleId }, { email }] });
    const isNewUser = !user;

    if (!user) {
      user = await User.create({
        googleId,
        email,
        name: name || email.split('@')[0],
        avatar: picture || '',
        authMethod: 'google',
        isVerified: true,
        isGuest: false,
        isActive: true,
        lastLoginAt: new Date()
      });
    } else {
      if (!user.isActive) {
        return res.status(403).json({ message: 'Your account has been suspended by the administrator.' });
      }
      user.lastLoginAt = new Date();
      // Link Google ID if signing in via Google for first time
      if (!user.googleId) user.googleId = googleId;
      if (!user.avatar && picture) user.avatar = picture;
      if (!user.isVerified) user.isVerified = true;
      await user.save();
    }

    const token = signUserToken(user);
    return res.json({
      success: true,
      token,
      isNewUser,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        authMethod: user.authMethod,
      }
    });
  } catch (err) {
    console.error('google-auth error:', err);
    return res.status(401).json({ message: 'Google authentication failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/user-auth/me — Get current user profile
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', userAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-googleId');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: 'Your account has been suspended by the administrator.' });
    }
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/user-auth/me — Update profile name
// ─────────────────────────────────────────────────────────────────────────────
router.put('/me', userAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.isActive) {
      return res.status(403).json({ message: 'Your account has been suspended by the administrator.' });
    }
    user.name = name?.trim();
    await user.save();
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/user-auth/admin/users — Admin: get all registered users
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find().select('-googleId').sort({ createdAt: -1 }).lean();
    
    // Enrich users with order metrics
    const enrichedUsers = await Promise.all(users.map(async (user) => {
      const userOrders = await Order.find({
        $or: [
          { userId: user._id },
          { isGuest: true, 'guestInfo.email': user.email },
          { isGuest: true, 'shippingAddress.email': user.email }
        ]
      }).select('total').lean();
      const orderCount = userOrders.length;
      const totalSpent = userOrders.reduce((sum, order) => sum + (order.total || 0), 0);
      return {
        ...user,
        orderCount,
        totalSpent
      };
    }));

    return res.json(enrichedUsers);
  } catch (err) {
    console.error('admin users error:', err);
    return res.status(500).json({ message: 'Server error fetching users' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/user-auth/admin/users/:id/status — Admin: suspend/activate user
// ─────────────────────────────────────────────────────────────────────────────
router.put('/admin/users/:id/status', adminAuth, async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true }).select('-googleId');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/user-auth/admin/users/:id — Admin: delete user access
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/admin/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Convert active orders to guest checkouts to prevent data loss
    await Order.updateMany({ userId: req.params.id }, { $set: { userId: null, isGuest: true } });
    
    return res.json({ success: true, message: 'User access removed successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
