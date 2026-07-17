import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import jwt from 'npm:jsonwebtoken';
import bcrypt from 'npm:bcryptjs';
import { Resend } from 'npm:resend';
import { OAuth2Client } from 'npm:google-auth-library';
import { supabase } from '../utils/supabase.ts';
import { toUUID } from '../utils/uuid.ts';
import { userAuthMiddleware, authMiddleware } from '../middleware/auth.ts';
import { sendEmail } from '../utils/email.ts';
import { sendPushNotification } from './inquiries.ts';

const router = new Hono();
const resend = new Resend(Deno.env.get('RESEND_API_KEY') || 're_dummy_key_for_dev_bypass');
const googleClient = new OAuth2Client(Deno.env.get('GOOGLE_CLIENT_ID'));

const USER_JWT_SECRET = Deno.env.get('USER_JWT_SECRET') || 've_user_jwt_secret_vanelvina_2026_secure';
const IS_DEV = Deno.env.get('NODE_ENV') === 'development';

// ─── Helper: Generate 6-digit OTP ────────────────────────────────────────────
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ─── Helper: Sign user JWT ────────────────────────────────────────────────────
const signUserToken = (user: any) => {
  return jwt.sign(
    { id: user.id, email: user.email, authMethod: user.auth_method },
    USER_JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// ─── Helper: Format User profile for Frontend compatibility ───────────────────
function formatUserForFrontend(user: any) {
  if (!user) return null;
  const formatted: any = {
    ...user,
    _id: user.id,
    authMethod: user.auth_method,
    isVerified: user.is_verified,
    isGuest: user.is_guest,
    isActive: user.is_active,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
  
  if (user.addresses) {
    formatted.addresses = user.addresses.map((addr: any) => ({
      _id: addr.id,
      id: addr.id,
      fullName: addr.full_name,
      email: addr.email || '',
      phone: addr.phone,
      line1: addr.line1,
      line2: addr.line2 || '',
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      isDefault: addr.is_default
    }));
  } else {
    formatted.addresses = [];
  }
  return formatted;
}

// ─── Helper: Send OTP via Resend ─────────────────────────────────────────────
const sendOTPEmail = async (email: string, otp: string, name = '') => {
  if (IS_DEV && Deno.env.get('RESEND_API_KEY') === 're_placeholder_add_your_resend_key') {
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
  } catch (err: any) {
    console.error('Resend error:', err);
    throw new Error('Failed to send verification email');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user-auth/send-otp
// ─────────────────────────────────────────────────────────────────────────────
router.post('/send-otp', async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid JSON body' }, 400);
    }
    const { identifier, type = 'email' } = body;
    if (!identifier || type !== 'email') {
      return c.json({ message: 'Valid email required' }, 400);
    }

    const email = identifier.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ message: 'Invalid email format' }, 400);
    }

    // Generate OTP
    const rawOtp = generateOTP();
    const hashedOtp = await bcrypt.hash(rawOtp, 8);

    // Remove any existing OTP for this identifier
    await supabase.from('otps').delete().eq('email', email);

    // Save new OTP
    const { error: otpErr } = await supabase.from('otps').insert({
      email,
      code: hashedOtp,
      expires_at: new Date(Date.now() + 600000) // 10 minutes from now
    });
    if (otpErr) throw otpErr;

    // Check if user already exists
    const { data: existingUser, error: userErr } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('auth_method', 'email')
      .maybeSingle();

    if (userErr) throw userErr;
    const purpose = existingUser ? 'login' : 'signup';

    // Send email
    await sendOTPEmail(email, rawOtp, existingUser?.name);

    return c.json({
      success: true,
      purpose,
      message: `Verification code sent to ${email}`,
      ...(IS_DEV && { _devOtp: rawOtp })
    });
  } catch (err: any) {
    console.error('send-otp error:', err);
    return c.json({ message: err.message || 'Failed to send OTP' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user-auth/verify-otp
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify-otp', async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid JSON body' }, 400);
    }
    const { identifier, otp, name, password } = body;
    if (!identifier || !otp) {
      return c.json({ message: 'Email and OTP required' }, 400);
    }

    const email = identifier.toLowerCase().trim();

    // Fetch the latest OTP record
    const { data: otpRecord, error: otpFetchErr } = await supabase
      .from('otps')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpFetchErr) throw otpFetchErr;

    if (!otpRecord || new Date(otpRecord.expires_at) < new Date()) {
      return c.json({ message: 'OTP expired or not found. Please request a new code.' }, 400);
    }

    const isValid = await bcrypt.compare(otp, otpRecord.code);
    if (!isValid) {
      return c.json({ message: 'Invalid verification code. Please try again.' }, 400);
    }

    // Delete used OTP
    await supabase.from('otps').delete().eq('email', email);

    // Find or create user
    const { data: existingUser, error: userFetchErr } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('auth_method', 'email')
      .maybeSingle();

    if (userFetchErr) throw userFetchErr;
    const isNewUser = !existingUser;
    let user = existingUser;

    if (!existingUser) {
      const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
      const { data: newUser, error: createErr } = await supabase
        .from('users')
        .insert({
          email,
          name: name?.trim() || email.split('@')[0],
          password: hashedPassword,
          auth_method: 'email',
          is_verified: true,
          is_guest: false,
          is_active: true,
          last_login_at: new Date()
        })
        .select()
        .single();

      if (createErr) throw createErr;
      user = newUser;
    } else {
      if (!user.is_active) {
        return c.json({ message: 'Your account has been suspended by the administrator.' }, 403);
      }
      
      const updatePayload: any = {
        last_login_at: new Date(),
        is_verified: true
      };
      if (name?.trim() && !user.name) {
        updatePayload.name = name.trim();
      }

      const { data: updatedUser, error: updateErr } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', toUUID(user.id))
        .select()
        .single();

      if (updateErr) throw updateErr;
      user = updatedUser;
    }

    const token = signUserToken(user);
    
    // Trigger successful login push notifications
    sendPushNotification(user.email, 'Welcome back! ✨', 'You have logged in successfully to your Van Elvina account.', '/').catch(() => {});
    sendPushNotification('admin', '🔑 Customer Login', `${user.name || 'User'} (${user.email}) logged in via OTP`, '/admin/dashboard').catch(() => {});

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

    return c.json({
      success: true,
      token,
      isNewUser,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        authMethod: user.auth_method,
      }
    });
  } catch (err) {
    console.error('verify-otp error:', err);
    return c.json({ message: 'Server error during verification' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user-auth/google
// ─────────────────────────────────────────────────────────────────────────────
router.post('/google', async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid JSON body' }, 400);
    }
    const { idToken } = body;
    if (!idToken) {
      return c.json({ message: 'Google ID token required' }, 400);
    }

    // Verify with Google
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: Deno.env.get('GOOGLE_CLIENT_ID'),
    });
    const payload = ticket.getPayload();
    if (!payload) {
      return c.json({ message: 'Google authentication failed. Invalid ticket payload.' }, 401);
    }
    const { sub: googleId, email, name, picture } = payload;

    if (!email) {
      return c.json({ message: 'Google account must have an email' }, 400);
    }

    // Find by googleId or email where authMethod is google
    const { data: existingUser, error: fetchErr } = await supabase
      .from('users')
      .select('*')
      .or(`google_id.eq.${googleId},and(email.eq.${email},auth_method.eq.google)`)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    const isNewUser = !existingUser;
    let user = existingUser;

    if (!existingUser) {
      const { data: newUser, error: createErr } = await supabase
        .from('users')
        .insert({
          google_id: googleId,
          email,
          name: name || email.split('@')[0],
          avatar: picture || '',
          auth_method: 'google',
          is_verified: true,
          is_guest: false,
          is_active: true,
          last_login_at: new Date()
        })
        .select()
        .single();

      if (createErr) throw createErr;
      user = newUser;
    } else {
      if (!user.is_active) {
        return c.json({ message: 'Your account has been suspended by the administrator.' }, 403);
      }

      const updatePayload: any = {
        last_login_at: new Date(),
        is_verified: true
      };
      if (!user.google_id) updatePayload.google_id = googleId;
      if (picture) updatePayload.avatar = picture;

      const { data: updatedUser, error: updateErr } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', toUUID(user.id))
        .select()
        .single();

      if (updateErr) throw updateErr;
      user = updatedUser;
    }

    const token = signUserToken(user);

    // Trigger successful login push notifications
    sendPushNotification(user.email, 'Welcome back! ✨', 'You have logged in successfully to your Van Elvina account.', '/').catch(() => {});
    sendPushNotification('admin', '🔑 Customer Login', `${user.name || 'User'} (${user.email}) logged in via Google`, '/admin/dashboard').catch(() => {});

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

    return c.json({
      success: true,
      token,
      isNewUser,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        authMethod: user.auth_method,
      }
    });
  } catch (err: any) {
    console.error('google-auth error:', err);
    try {
      Deno.writeTextFileSync('/home/saqeb/Projects/ve-api/google-auth-error.log', `${new Date().toISOString()} - ERROR: ${err.message}\nStack: ${err.stack}\n\n`, { append: true });
    } catch (fsErr) {}
    return c.json({ message: 'Google authentication failed. Please try again.' }, 401);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user-auth/signup
// ─────────────────────────────────────────────────────────────────────────────
router.post('/signup', async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid JSON body' }, 400);
    }
    const { name, email, password } = body;
    if (!email || !password) {
      return c.json({ message: 'Email and password are required' }, 400);
    }
    const cleanEmail = email.toLowerCase().trim();
    
    const { data: existingUser, error: fetchErr } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .eq('auth_method', 'email')
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (existingUser) {
      return c.json({ message: 'User with this email already exists' }, 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const { data: user, error: createErr } = await supabase
      .from('users')
      .insert({
        email: cleanEmail,
        name: name?.trim() || cleanEmail.split('@')[0],
        password: hashedPassword,
        auth_method: 'email',
        is_verified: true,
        is_guest: false,
        is_active: true,
        last_login_at: new Date()
      })
      .select()
      .single();

    if (createErr) throw createErr;

    const token = signUserToken(user);

    // Trigger admin push notification
    sendPushNotification('admin', '🆕 New Customer Registered', `${user.name || 'User'} (${user.email}) just signed up!`).catch(() => {});
    
    // Trigger customer welcome push notification
    sendPushNotification(user.email, 'Welcome to Van Elvina! ✨', 'Thank you for creating an account with us. Enjoy shopping comfort!', '/').catch(() => {});

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

    return c.json({
      success: true,
      token,
      isNewUser: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        authMethod: user.auth_method,
      }
    }, 201);
  } catch (err) {
    console.error('signup error:', err);
    return c.json({ message: 'Server error during signup' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user-auth/login
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid JSON body' }, 400);
    }
    const { email, password } = body;
    if (!email || !password) {
      return c.json({ message: 'Email and password are required' }, 400);
    }
    const cleanEmail = email.toLowerCase().trim();

    const { data: user, error: fetchErr } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .eq('auth_method', 'email')
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!user) {
      return c.json({ message: 'Invalid email or password' }, 401);
    }
    if (!user.is_active) {
      return c.json({ message: 'Your account has been suspended by the administrator.' }, 403);
    }

    if (!user.password) {
      return c.json({ message: 'Please login with Google.' }, 401);
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return c.json({ message: 'Invalid email or password' }, 401);
    }

    const { data: updatedUser, error: updateErr } = await supabase
      .from('users')
      .update({ last_login_at: new Date() })
      .eq('id', toUUID(user.id))
      .select()
      .single();

    if (updateErr) throw updateErr;

    const token = signUserToken(updatedUser);

    // Trigger successful login push notifications
    sendPushNotification(updatedUser.email, 'Welcome back! ✨', 'You have logged in successfully to your Van Elvina account.', '/').catch(() => {});
    sendPushNotification('admin', '🔑 Customer Login', `${updatedUser.name || 'User'} (${updatedUser.email}) logged in`, '/admin/dashboard').catch(() => {});

    // Trigger successful login email notification
    sendEmail({
      to: updatedUser.email,
      subject: 'Successful Login - Van Elvina',
      html: `
        <div style="font-family: 'Georgia', serif; padding: 20px; line-height: 1.6; background-color: #FDF8F5; color: #2C2C2C;">
          <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg,#8A4F5A,#B76E79); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px;">Van Elvina</h1>
              <p style="color: rgba(255,255,255,0.75); margin: 6px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">Security Alert</p>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #8A4F5A; font-size: 18px; margin: 0 0 16px;">Hello ${updatedUser.name || 'Valued Customer'},</h2>
              <p style="color: #555; font-size: 14px; margin: 0 0 20px;">
                We wanted to let you know that you have successfully signed in to your Van Elvina account.
              </p>
              <div style="background: #FAF0F1; border-radius: 12px; padding: 16px; font-size: 13px; color: #555;">
                <strong>Sign-in details:</strong><br/>
                • Email: ${updatedUser.email}<br/>
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

    return c.json({
      success: true,
      token,
      isNewUser: false,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        avatar: updatedUser.avatar,
        authMethod: updatedUser.auth_method,
      }
    });
  } catch (err) {
    console.error('login error:', err);
    return c.json({ message: 'Server error during login' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/user-auth/me
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', userAuthMiddleware, async (c) => {
  try {
    const userPayload = c.get('user');
    const { data: user, error } = await supabase
      .from('users')
      .select('*, addresses(*)')
      .eq('id', toUUID(userPayload.id))
      .maybeSingle();

    if (error) throw error;
    if (!user) {
      return c.json({ message: 'User not found' }, 404);
    }
    if (!user.is_active) {
      return c.json({ message: 'Your account has been suspended by the administrator.' }, 403);
    }
    
    // Remove sensitive password hash and return formatted
    delete user.password;
    delete user.google_id;

    return c.json(formatUserForFrontend(user));
  } catch (err) {
    console.error('me fetch error:', err);
    return c.json({ message: 'Server error' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/user-auth/me
// ─────────────────────────────────────────────────────────────────────────────
router.put('/me', userAuthMiddleware, async (c) => {
  try {
    const userPayload = c.get('user');
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid JSON body' }, 400);
    }
    const { name, phone } = body;
    const updatePayload: any = {};
    if (name !== undefined) updatePayload.name = name?.trim();
    if (phone !== undefined) updatePayload.phone = phone?.trim();

    const { data: user, error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', toUUID(userPayload.id))
      .select('*, addresses(*)')
      .single();

    if (error) throw error;
    if (!user) return c.json({ message: 'User not found' }, 404);
    if (!user.is_active) {
      return c.json({ message: 'Your account has been suspended by the administrator.' }, 403);
    }
    
    delete user.password;
    delete user.google_id;

    return c.json(formatUserForFrontend(user));
  } catch (err) {
    console.error('me update error:', err);
    return c.json({ message: 'Server error' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user-auth/addresses
// ─────────────────────────────────────────────────────────────────────────────
router.post('/addresses', userAuthMiddleware, async (c) => {
  try {
    const userPayload = c.get('user');
    let addressData;
    try {
      addressData = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid JSON body' }, 400);
    }
    const userId = toUUID(userPayload.id);

    // Get existing addresses count
    const { data: existingAddresses, error: countErr } = await supabase
      .from('addresses')
      .select('id')
      .eq('user_id', userId);

    if (countErr) throw countErr;

    const isFirstAddress = !existingAddresses || existingAddresses.length === 0;
    const shouldBeDefault = addressData.isDefault || isFirstAddress;

    if (shouldBeDefault) {
      // Unset all existing defaults
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', userId);
    }

    const { data: newAddr, error: insertErr } = await supabase
      .from('addresses')
      .insert({
        user_id: userId,
        full_name: addressData.fullName || '',
        email: addressData.email || '',
        phone: addressData.phone || '',
        line1: addressData.line1 || '',
        line2: addressData.line2 || '',
        city: addressData.city || '',
        state: addressData.state || '',
        pincode: addressData.pincode || '',
        is_default: shouldBeDefault
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // Map and return
    return c.json({
      ...newAddr,
      _id: newAddr.id,
      fullName: newAddr.full_name,
      isDefault: newAddr.is_default
    }, 201);
  } catch (err) {
    console.error('add address error:', err);
    return c.json({ message: 'Failed to add address' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/user-auth/addresses/:id
// ─────────────────────────────────────────────────────────────────────────────
router.put('/addresses/:id', userAuthMiddleware, async (c) => {
  try {
    const userPayload = c.get('user');
    const userId = toUUID(userPayload.id);
    const addressId = toUUID(c.req.param('id'));
    let updatedData;
    try {
      updatedData = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid JSON body' }, 400);
    }

    if (updatedData.isDefault) {
      // Mark all others as non-default
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', userId);
    }

    const updatePayload: any = {};
    if (updatedData.fullName !== undefined) updatePayload.full_name = updatedData.fullName;
    if (updatedData.email !== undefined) updatePayload.email = updatedData.email;
    if (updatedData.phone !== undefined) updatePayload.phone = updatedData.phone;
    if (updatedData.line1 !== undefined) updatePayload.line1 = updatedData.line1;
    if (updatedData.line2 !== undefined) updatePayload.line2 = updatedData.line2;
    if (updatedData.city !== undefined) updatePayload.city = updatedData.city;
    if (updatedData.state !== undefined) updatePayload.state = updatedData.state;
    if (updatedData.pincode !== undefined) updatePayload.pincode = updatedData.pincode;
    if (updatedData.isDefault !== undefined) updatePayload.is_default = updatedData.isDefault;

    const { data: updatedAddr, error: updateErr } = await supabase
      .from('addresses')
      .update(updatePayload)
      .eq('id', addressId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Verify at least one default exists
    const { data: userAddresses } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', userId);

    if (userAddresses && userAddresses.length > 0 && !userAddresses.some((a: any) => a.is_default)) {
      // Force default on first
      await supabase
        .from('addresses')
        .update({ is_default: true })
        .eq('id', userAddresses[0].id);
      
      if (updatedAddr.id === userAddresses[0].id) {
        updatedAddr.is_default = true;
      }
    }

    return c.json({
      ...updatedAddr,
      _id: updatedAddr.id,
      fullName: updatedAddr.full_name,
      isDefault: updatedAddr.is_default
    });
  } catch (err) {
    console.error('update address error:', err);
    return c.json({ message: 'Failed to update address' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/user-auth/addresses/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/addresses/:id', userAuthMiddleware, async (c) => {
  try {
    const userPayload = c.get('user');
    const userId = toUUID(userPayload.id);
    const addressId = toUUID(c.req.param('id'));

    const { error: deleteErr } = await supabase
      .from('addresses')
      .delete()
      .eq('id', addressId)
      .eq('user_id', userId);

    if (deleteErr) throw deleteErr;

    // Fetch remaining addresses
    const { data: remaining, error: fetchErr } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', userId);

    if (fetchErr) throw fetchErr;

    // Ensure at least one remaining address is default
    if (remaining && remaining.length > 0 && !remaining.some((a: any) => a.is_default)) {
      await supabase
        .from('addresses')
        .update({ is_default: true })
        .eq('id', remaining[0].id);
      remaining[0].is_default = true;
    }

    const mappedRemaining = (remaining || []).map((addr: any) => ({
      _id: addr.id,
      id: addr.id,
      fullName: addr.full_name,
      email: addr.email || '',
      phone: addr.phone,
      line1: addr.line1,
      line2: addr.line2 || '',
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      isDefault: addr.is_default
    }));

    return c.json({ success: true, addresses: mappedRemaining });
  } catch (err) {
    console.error('delete address error:', err);
    return c.json({ message: 'Failed to delete address' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/user-auth/admin/users
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/users', authMiddleware, async (c) => {
  try {
    const { data: users, error: fetchErr } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchErr) throw fetchErr;
    
    // Enrich users with order metrics
    const enrichedUsers = await Promise.all((users || []).map(async (user: any) => {
      const { data: userOrders, error: orderErr } = await supabase
        .from('orders')
        .select('total')
        .or(`user_id.eq.${toUUID(user.id)},guest_info->>email.eq.${user.email},shipping_address->>email.eq.${user.email}`);

      if (orderErr) throw orderErr;

      const orderCount = userOrders?.length || 0;
      const totalSpent = (userOrders || []).reduce((sum, order) => sum + (parseFloat(order.total) || 0), 0);
      
      return {
        ...user,
        _id: user.id,
        authMethod: user.auth_method,
        isActive: user.is_active,
        isVerified: user.is_verified,
        isGuest: user.is_guest,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        orderCount,
        totalSpent
      };
    }));

    return c.json(enrichedUsers);
  } catch (err) {
    console.error('admin users error:', err);
    return c.json({ message: 'Server error fetching users' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/user-auth/admin/users/:id/status
// ─────────────────────────────────────────────────────────────────────────────
router.put('/admin/users/:id/status', authMiddleware, async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid JSON body' }, 400);
    }
    const { isActive } = body;
    const { data: user, error } = await supabase
      .from('users')
      .update({ is_active: isActive })
      .eq('id', toUUID(c.req.param('id')))
      .select()
      .single();

    if (error) throw error;
    if (!user) return c.json({ message: 'User not found' }, 404);
    
    return c.json({
      ...user,
      _id: user.id,
      isActive: user.is_active,
      authMethod: user.auth_method
    });
  } catch (err) {
    console.error('admin user status update error:', err);
    return c.json({ message: 'Server error' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/user-auth/admin/users/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/admin/users/:id', authMiddleware, async (c) => {
  try {
    const userId = toUUID(c.req.param('id'));
    const { data: user, error: userErr } = await supabase
      .from('users')
      .delete()
      .eq('id', userId)
      .select()
      .single();

    if (userErr) throw userErr;
    if (!user) return c.json({ message: 'User not found' }, 404);
    
    // Convert active orders to guest checkouts to prevent data loss
    await supabase
      .from('orders')
      .update({ user_id: null, guest_info: { email: user.email, name: user.name, phone: user.phone || '' } })
      .eq('user_id', userId);
    
    return c.json({ success: true, message: 'User access removed successfully' });
  } catch (err) {
    console.error('admin user delete error:', err);
    return c.json({ message: 'Server error' }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user-auth/admin/send-custom-email
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin/send-custom-email', authMiddleware, async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid JSON body' }, 400);
    }
    const { to, subject, body: emailBody } = body;
    if (!to || !subject || !emailBody) {
      return c.json({ message: 'Recipient (to), subject, and body are required' }, 400);
    }

    const htmlBody = `
      <div style="font-family: 'Georgia', serif; padding: 20px; line-height: 1.6; background-color: #FDF8F5; color: #2C2C2C;">
        <div style="width: 100%; max-width: 100%; background: white; padding: 20px 0;">
          <h2 style="color: #8A4F5A; margin-top: 0; text-align: center;">Van Elvina</h2>
          <div style="border-top: 1px solid #E8C5CA; margin: 15px 0;"></div>
          <p style="white-space: pre-line; font-size: 14px; color: #555;">${emailBody}</p>
          <div style="border-top: 1px solid #E8C5CA; margin: 20px 0 10px;"></div>
          <p style="font-size: 11px; color: #999; text-align: center; margin: 0;">This is an administrative message sent by Van Elvina support.</p>
        </div>
      </div>
    `;

    await sendEmail({ to, subject, html: htmlBody });
    
    // Trigger custom push notification to user
    sendPushNotification(to, subject, emailBody, '/').catch(() => {});
    return c.json({ success: true, message: 'Email sent successfully' });
  } catch (err: any) {
    console.error('Send custom email error:', err);
    return c.json({ message: err.message || 'Failed to send custom email' }, 500);
  }
});

export default router;
