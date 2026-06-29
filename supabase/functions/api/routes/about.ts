import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import { supabase } from '../utils/supabase.ts';
import { authMiddleware } from '../middleware/auth.ts';

const router = new Hono();

// Helper to map Supabase about_us row to Frontend expected format
const mapAboutToFrontend = (row: any) => {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    storyTitle: row.story_title,
    storySubtitle: row.story_subtitle,
    storyContent: row.story_content,
    storyImage: row.story_image,
    visionTitle: row.vision_title,
    visionSubtitle: row.vision_subtitle,
    visionContent: row.vision_content,
    philosophyTitle: row.philosophy_title,
    philosophyContent: row.philosophy_content,
    philosophyImage: row.philosophy_image,
    promises: row.promises,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

// GET /api/about — Retrieve the About Us page content. Auto-initializes defaults if empty.
router.get('/', async (c) => {
  try {
    let { data: about, error } = await supabase
      .from('about_us')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!about) {
      const defaultAbout = {
        story_title: 'Our Story',
        story_subtitle: 'It began with a dream.\nWith a vision to go beyond.\nBeyond limited choices.\nBeyond everything women were used to.\nBeyond just lingerie.',
        story_content: "Van Elvina was founded with the vision of helping women uninhibitedly shop for elegant and premium intimate wear. Along the way, we saw the power of this idea and how it helped women break norms.\n\nNow we're taking it ahead and investing in a community that's influencing women in different ways. From our online-offline stores to our new category launches, all our innovations are driven by ideas that weren't thought of before.",
        story_image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=1200',
        vision_title: 'Our Vision',
        vision_subtitle: 'To Offer Every Woman the Confidence, Comfort & Choice She Deserves',
        vision_content: [
          'Confidence is sexy and we want to help women find it, wear it and be it every day.',
          'At Van Elvina, we reinvent lingerie.',
          'We reimagine outerwear.',
          'We rethink design innovation.',
          'And spend hours creating every single piece,',
          'To make a woman feel beautiful in seconds.'
        ],
        philosophy_title: 'Our Design Philosophy',
        philosophy_content: 'Crafted with passion, designed for elegance. Our philosophy blends premium materials, structural excellence, and delicate detailing to deliver intimates that feel like a second skin.',
        philosophy_image: 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?q=80&w=1200',
        promises: [
          { title: "We'll Always Remain Inclusive", description: "Creating Products For Every Body & Age", icon: "inclusive" },
          { title: "We'll Continue To Do Good", description: "By Using Processes That Put Women First", icon: "good" },
          { title: "We'll Continue To Innovate", description: "And Always Make Women Look Forward To Our Designs", icon: "innovate" },
          { title: "We'll Positively Impact Women", description: "Enabling The Entire Cycle From Creation To Delivery", icon: "impact" },
          { title: "We'll Stay True", description: "By Giving You The Finest Quality And Service", icon: "true" }
        ]
      };
      
      const { data: inserted, error: insertErr } = await supabase
        .from('about_us')
        .insert(defaultAbout)
        .select()
        .single();

      if (insertErr) throw insertErr;
      about = inserted;
    }
    return c.json(mapAboutToFrontend(about));
  } catch (error: any) {
    console.error('Fetch About Us content error:', error);
    return c.json({ message: 'Server error fetching page content' }, 500);
  }
});

// PUT /api/about — Update the About Us page content (Admin only)
router.put('/', authMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    let { data: about, error } = await supabase
      .from('about_us')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const defaultAbout = {
      story_title: 'Our Story',
      story_subtitle: 'It began with a dream.\nWith a vision to go beyond.\nBeyond limited choices.\nBeyond everything women were used to.\nBeyond just lingerie.',
      story_content: "Van Elvina was founded with the vision of helping women uninhibitedly shop for elegant and premium intimate wear. Along the way, we saw the power of this idea and how it helped women break norms.\n\nNow we're taking it ahead and investing in a community that's influencing women in different ways. From our online-offline stores to our new category launches, all our innovations are driven by ideas that weren't thought of before.",
      story_image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=1200',
      vision_title: 'Our Vision',
      vision_subtitle: 'To Offer Every Woman the Confidence, Comfort & Choice She Deserves',
      vision_content: [
        'Confidence is sexy and we want to help women find it, wear it and be it every day.',
        'At Van Elvina, we reinvent lingerie.',
        'We reimagine outerwear.',
        'We rethink design innovation.',
        'And spend hours creating every single piece,',
        'To make a woman feel beautiful in seconds.'
      ],
      philosophy_title: 'Our Design Philosophy',
      philosophy_content: 'Crafted with passion, designed for elegance. Our philosophy blends premium materials, structural excellence, and delicate detailing to deliver intimates that feel like a second skin.',
      philosophy_image: 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?q=80&w=1200',
      promises: [
        { title: "We'll Always Remain Inclusive", description: "Creating Products For Every Body & Age", icon: "inclusive" },
        { title: "We'll Continue To Do Good", description: "By Using Processes That Put Women First", icon: "good" },
        { title: "We'll Continue To Innovate", description: "And Always Make Women Look Forward To Our Designs", icon: "innovate" },
        { title: "We'll Positively Impact Women", description: "Enabling The Entire Cycle From Creation To Delivery", icon: "impact" },
        { title: "We'll Stay True", description: "By Giving You The Finest Quality And Service", icon: "true" }
      ]
    };

    if (!about) {
      const insertPayload = {
        story_title: body.storyTitle ?? defaultAbout.story_title,
        story_subtitle: body.storySubtitle ?? defaultAbout.story_subtitle,
        story_content: body.storyContent ?? defaultAbout.story_content,
        story_image: body.storyImage ?? defaultAbout.story_image,
        vision_title: body.visionTitle ?? defaultAbout.vision_title,
        vision_subtitle: body.visionSubtitle ?? defaultAbout.vision_subtitle,
        vision_content: body.visionContent ?? defaultAbout.vision_content,
        philosophy_title: body.philosophyTitle ?? defaultAbout.philosophy_title,
        philosophy_content: body.philosophyContent ?? defaultAbout.philosophy_content,
        philosophy_image: body.philosophyImage ?? defaultAbout.philosophy_image,
        promises: body.promises ?? defaultAbout.promises,
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('about_us')
        .insert(insertPayload)
        .select()
        .single();

      if (insertErr) throw insertErr;
      return c.json(mapAboutToFrontend(inserted));
    } else {
      const updatePayload = {
        story_title: body.storyTitle ?? about.story_title,
        story_subtitle: body.storySubtitle ?? about.story_subtitle,
        story_content: body.storyContent ?? about.story_content,
        story_image: body.storyImage ?? about.story_image,
        vision_title: body.visionTitle ?? about.vision_title,
        vision_subtitle: body.visionSubtitle ?? about.vision_subtitle,
        vision_content: body.visionContent ?? about.vision_content,
        philosophy_title: body.philosophyTitle ?? about.philosophy_title,
        philosophy_content: body.philosophyContent ?? about.philosophy_content,
        philosophy_image: body.philosophyImage ?? about.philosophy_image,
        promises: body.promises ?? about.promises,
        updated_at: new Date().toISOString()
      };

      const { data: updated, error: updateErr } = await supabase
        .from('about_us')
        .update(updatePayload)
        .eq('id', about.id)
        .select()
        .single();

      if (updateErr) throw updateErr;
      return c.json(mapAboutToFrontend(updated));
    }
  } catch (error: any) {
    console.error('Update About Us content error:', error);
    return c.json({ message: 'Server error updating page content' }, 500);
  }
});

export default router;
