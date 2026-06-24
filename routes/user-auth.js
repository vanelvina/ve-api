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
import { sendEmail } from '../utils/email.js';

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
    const existingUser = await User.findOne({ email, authMethod: 'email' });
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
    let user = await User.findOne({ email, authMethod: 'email' });
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
    
    // Trigger successful login email notification
    sendEmail({
      to: user.email,
      subject: 'Successful Login - Van Elvina',
      html: `
        <div style="font-family: 'Georgia', serif; padding: 20px; line-height: 1.6; background-color: #FDF8F5; color: #2C2C2C;">
          <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg,#8A4F5A,#B76E79); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px;">Van Elvina</h1>
              <p style="color: rgba(255,255,255,0.75); margin: 6px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">Security Alert</p>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #8A4F5A; font-size: 18px; margin: 0 0 16px;">Hello ${user.name || 'Valued Customer'},</h2>
              <p style="color: #555; font-size: 14px; margin: 0 0 20px;">
                We wanted to let you know that you have successfully signed in to your Van Elvina account.
              </p>
              <div style="background: #FAF0F1; border-radius: 12px; padding: 16px; font-size: 13px; color: #555;">
                <strong>Sign-in details:</strong><br/>
                • Email: ${user.email}<br/>
                • Method: One-Time Verification Code (OTP)<br/>
                • Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)
              </div>
              <p style="color: #999; font-size: 12px; margin: 24px 0 0;">
                If this wasn't you, please contact our support team immediately.
              </p>
            </div>
            <div style="background: #FAF6F0; border-top: 1px solid #F0E8E0; padding: 20px; text-align: center; font-size: 11px; color: #BBB;">
              © 2026 Van Elvina · Premium Women's Innerwear
            </div>
          </div>
        </div>
      `
    }).catch(err => console.error('Error sending login email:', err));

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

    // Find by googleId or email where authMethod is google
    let user = await User.findOne({ $or: [{ googleId }, { email, authMethod: 'google' }] });
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
      // Always sync/update Google profile image (avatar) if provided
      if (picture) user.avatar = picture;
      if (!user.isVerified) user.isVerified = true;
      await user.save();
    }

    const token = signUserToken(user);

    // Trigger successful login email notification
    sendEmail({
      to: user.email,
      subject: 'Successful Login - Van Elvina',
      html: `
        <div style="font-family: 'Georgia', serif; padding: 20px; line-height: 1.6; background-color: #FDF8F5; color: #2C2C2C;">
          <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg,#8A4F5A,#B76E79); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px;">Van Elvina</h1>
              <p style="color: rgba(255,255,255,0.75); margin: 6px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">Security Alert</p>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #8A4F5A; font-size: 18px; margin: 0 0 16px;">Hello ${user.name || 'Valued Customer'},</h2>
              <p style="color: #555; font-size: 14px; margin: 0 0 20px;">
                We wanted to let you know that you have successfully signed in to your Van Elvina account.
              </p>
              <div style="background: #FAF0F1; border-radius: 12px; padding: 16px; font-size: 13px; color: #555;">
                <strong>Sign-in details:</strong><br/>
                • Email: ${user.email}<br/>
                • Method: Google Account Auth<br/>
                • Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)
              </div>
              <p style="color: #999; font-size: 12px; margin: 24px 0 0;">
                If this wasn't you, please contact our support team immediately.
              </p>
            </div>
            <div style="background: #FAF6F0; border-top: 1px solid #F0E8E0; padding: 20px; text-align: center; font-size: 11px; color: #BBB;">
              © 2026 Van Elvina · Premium Women's Innerwear
            </div>
          </div>
        </div>
      `
    }).catch(err => console.error('Error sending Google login email:', err));

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
// POST /api/user-auth/signup — Email/Password Signup
// ─────────────────────────────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const cleanEmail = email.toLowerCase().trim();
    
    let user = await User.findOne({ email: cleanEmail, authMethod: 'email' });
    if (user) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    user = await User.create({
      email: cleanEmail,
      name: name?.trim() || cleanEmail.split('@')[0],
      password: hashedPassword,
      authMethod: 'email',
      isVerified: true,
      isGuest: false,
      isActive: true,
      lastLoginAt: new Date()
    });

    const token = signUserToken(user);

    // Trigger welcome / signup confirmation email notification
    sendEmail({
      to: user.email,
      subject: 'Welcome to Van Elvina!',
      html: `
        <div style="font-family: 'Georgia', serif; padding: 20px; line-height: 1.6; background-color: #FDF8F5; color: #2C2C2C;">
          <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg,#8A4F5A,#B76E79); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px;">Van Elvina</h1>
              <p style="color: rgba(255,255,255,0.75); margin: 6px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">Welcome!</p>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #8A4F5A; font-size: 18px; margin: 0 0 16px;">Hello ${user.name || 'Valued Customer'},</h2>
              <p style="color: #555; font-size: 14px; margin: 0 0 20px;">
                Thank you for creating an account with Van Elvina. We are thrilled to have you join our circle of comfort and elegance.
              </p>
              <div style="background: #FAF0F1; border-radius: 12px; padding: 16px; font-size: 13px; color: #555;">
                <strong>Account details:</strong><br/>
                • Email: ${user.email}<br/>
                • Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)
              </div>
            </div>
            <div style="background: #FAF6F0; border-top: 1px solid #F0E8E0; padding: 20px; text-align: center; font-size: 11px; color: #BBB;">
              © 2026 Van Elvina · Premium Women's Innerwear
            </div>
          </div>
        </div>
      `
    }).catch(err => console.error('Error sending signup email:', err));

    return res.status(201).json({
      success: true,
      token,
      isNewUser: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        authMethod: user.authMethod,
      }
    });
  } catch (err) {
    console.error('signup error:', err);
    return res.status(500).json({ message: 'Server error during signup' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user-auth/login — Email/Password Login
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const cleanEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: cleanEmail, authMethod: 'email' });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: 'Your account has been suspended by the administrator.' });
    }

    if (!user.password) {
      return res.status(401).json({ message: 'Please login with Google.' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signUserToken(user);

    // Trigger successful login email notification
    sendEmail({
      to: user.email,
      subject: 'Successful Login - Van Elvina',
      html: `
        <div style="font-family: 'Georgia', serif; padding: 20px; line-height: 1.6; background-color: #FDF8F5; color: #2C2C2C;">
          <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg,#8A4F5A,#B76E79); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px;">Van Elvina</h1>
              <p style="color: rgba(255,255,255,0.75); margin: 6px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">Security Alert</p>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #8A4F5A; font-size: 18px; margin: 0 0 16px;">Hello ${user.name || 'Valued Customer'},</h2>
              <p style="color: #555; font-size: 14px; margin: 0 0 20px;">
                We wanted to let you know that you have successfully signed in to your Van Elvina account.
              </p>
              <div style="background: #FAF0F1; border-radius: 12px; padding: 16px; font-size: 13px; color: #555;">
                <strong>Sign-in details:</strong><br/>
                • Email: ${user.email}<br/>
                • Method: Password Auth<br/>
                • Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)
              </div>
              <p style="color: #999; font-size: 12px; margin: 24px 0 0;">
                If this wasn't you, please contact our support team immediately.
              </p>
            </div>
            <div style="background: #FAF6F0; border-top: 1px solid #F0E8E0; padding: 20px; text-align: center; font-size: 11px; color: #BBB;">
              © 2026 Van Elvina · Premium Women's Innerwear
            </div>
          </div>
        </div>
      `
    }).catch(err => console.error('Error sending login email:', err));

    return res.json({
      success: true,
      token,
      isNewUser: false,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        authMethod: user.authMethod,
      }
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ message: 'Server error during login' });
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
// PUT /api/user-auth/me — Update profile
// ─────────────────────────────────────────────────────────────────────────────
router.put('/me', userAuth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.isActive) {
      return res.status(403).json({ message: 'Your account has been suspended by the administrator.' });
    }
    if (name !== undefined) user.name = name?.trim();
    if (phone !== undefined) user.phone = phone?.trim();
    await user.save();
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user-auth/addresses — Add a new address
// ─────────────────────────────────────────────────────────────────────────────
router.post('/addresses', userAuth, async (req, res) => {
  try {
    const addressData = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (addressData.isDefault || user.addresses.length === 0) {
      addressData.isDefault = true;
      user.addresses.forEach(a => a.isDefault = false);
    }
    
    user.addresses.push(addressData);
    await user.save();
    return res.status(201).json(user.addresses[user.addresses.length - 1]);
  } catch (err) {
    console.error('add address error:', err);
    return res.status(500).json({ message: 'Failed to add address' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/user-auth/addresses/:id — Edit/update an address
// ─────────────────────────────────────────────────────────────────────────────
router.put('/addresses/:id', userAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const addressIndex = user.addresses.findIndex(a => a._id.toString() === req.params.id);
    if (addressIndex === -1) {
      return res.status(404).json({ message: 'Address not found' });
    }

    const updatedData = req.body;
    
    // If setting this one to default, mark all others as false
    if (updatedData.isDefault) {
      user.addresses.forEach(a => a.isDefault = false);
    }

    // Merge/update address fields
    const targetAddress = user.addresses[addressIndex];
    if (updatedData.fullName !== undefined) targetAddress.fullName = updatedData.fullName;
    if (updatedData.email !== undefined) targetAddress.email = updatedData.email;
    if (updatedData.phone !== undefined) targetAddress.phone = updatedData.phone;
    if (updatedData.line1 !== undefined) targetAddress.line1 = updatedData.line1;
    if (updatedData.line2 !== undefined) targetAddress.line2 = updatedData.line2;
    if (updatedData.city !== undefined) targetAddress.city = updatedData.city;
    if (updatedData.state !== undefined) targetAddress.state = updatedData.state;
    if (updatedData.pincode !== undefined) targetAddress.pincode = updatedData.pincode;
    if (updatedData.isDefault !== undefined) targetAddress.isDefault = updatedData.isDefault;

    // If we updated default status and none are default, make sure at least one is default
    if (user.addresses.length > 0 && !user.addresses.some(a => a.isDefault)) {
      user.addresses[0].isDefault = true;
    }

    await user.save();
    return res.json(user.addresses[addressIndex]);
  } catch (err) {
    console.error('update address error:', err);
    return res.status(500).json({ message: 'Failed to update address' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/user-auth/addresses/:id — Remove an address
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/addresses/:id', userAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.addresses = user.addresses.filter(a => a._id.toString() !== req.params.id);
    
    if (user.addresses.length > 0 && !user.addresses.some(a => a.isDefault)) {
      user.addresses[0].isDefault = true;
    }

    await user.save();
    return res.json({ success: true, addresses: user.addresses });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete address' });
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user-auth/admin/send-custom-email — Admin: send a custom email to a customer
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin/send-custom-email', adminAuth, async (req, res) => {
  try {
    const { to, subject, body } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ message: 'Recipient (to), subject, and body are required' });
    }

    const htmlBody = `
      <div style="font-family: 'Georgia', serif; padding: 20px; line-height: 1.6; background-color: #FDF8F5; color: #2C2C2C;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <h2 style="color: #8A4F5A; margin-top: 0; text-align: center;">Van Elvina</h2>
          <div style="border-top: 1px solid #E8C5CA; margin: 15px 0;"></div>
          <p style="white-space: pre-line; font-size: 14px; color: #555;">${body}</p>
          <div style="border-top: 1px solid #E8C5CA; margin: 20px 0 10px;"></div>
          <p style="font-size: 11px; color: #999; text-align: center; margin: 0;">This is an administrative message sent by Van Elvina support.</p>
        </div>
      </div>
    `;

    await sendEmail({ to, subject, html: htmlBody });
    return res.json({ success: true, message: 'Email sent successfully' });
  } catch (err) {
    console.error('Send custom email error:', err);
    return res.status(500).json({ message: err.message || 'Failed to send custom email' });
  }
});

export default router;
