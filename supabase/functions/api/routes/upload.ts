import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import { supabase } from '../utils/supabase.ts';
import { authMiddleware } from '../middleware/auth.ts';

const router = new Hono();

router.post('/', authMiddleware, async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['image'];

    if (!file || !(file instanceof File)) {
      return c.json({ message: 'No file uploaded or invalid file format' }, 400);
    }

    // Validate size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ message: 'File size exceeds 5MB limit' }, 400);
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ message: 'Only images (.jpg, .jpeg, .png, .webp, .gif) are allowed!' }, 400);
    }

    // Generate unique name
    const fileExt = file.name.split('.').pop() || 'png';
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${fileExt}`;

    // Read file contents as ArrayBuffer
    const fileData = await file.arrayBuffer();

    // Upload to Supabase Storage 'uploads' bucket
    const { error } = await supabase.storage
      .from('uploads')
      .upload(filename, fileData, {
        contentType: file.type,
        upsert: false
      });

    if (error) {
      throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('uploads')
      .getPublicUrl(filename);

    return c.json({
      message: 'Image uploaded successfully',
      imageUrl: publicUrl
    }, 201);
  } catch (err: any) {
    console.error('Image upload error:', err);
    return c.json({ message: err.message || 'Image upload failed' }, 400);
  }
});

export default router;
