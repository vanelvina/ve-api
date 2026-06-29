import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Deterministic UUID converter
function toUUID(mongoId) {
  if (!mongoId) return null;
  const str = mongoId.toString().trim();
  if (str.length !== 24) return str;
  return `${str.substring(0, 8)}-${str.substring(8, 12)}-${str.substring(12, 16)}-${str.substring(16, 20)}-${str.substring(20, 24)}00000000`;
}

async function run() {
  const MONGODB_URI = process.env.MONGODB_URI;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!MONGODB_URI || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing configuration in env!');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB!');

    // Fetch all blogs from MongoDB
    const mongoBlogs = await mongoose.connection.db.collection('blogs').find({}).toArray();
    console.log(`Fetched ${mongoBlogs.length} blogs from MongoDB.`);

    // Delete existing blogs from Supabase
    console.log('Clearing blogs in Supabase...');
    const { error: delError } = await supabase
      .from('blogs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (delError) throw delError;
    console.log('Supabase blogs cleared.');

    // Insert Mongo blogs into Supabase
    console.log('Inserting MongoDB blogs into Supabase...');
    for (const doc of mongoBlogs) {
      const payload = {
        id: toUUID(doc._id),
        title: doc.title || '',
        slug: doc.slug || '',
        excerpt: doc.summary || doc.excerpt || '',
        content: doc.content || '',
        featured_image: doc.image || doc.featured_image || '',
        author: doc.author || 'Van Elvina',
        tags: doc.tags || [],
        is_published: doc.enabled !== false,
        published_at: doc.publishedAt ? new Date(doc.publishedAt) : (doc.published_at ? new Date(doc.published_at) : new Date()),
        created_at: doc.createdAt ? new Date(doc.createdAt) : (doc.created_at ? new Date(doc.created_at) : new Date()),
        updated_at: doc.updatedAt ? new Date(doc.updatedAt) : (doc.updated_at ? new Date(doc.updated_at) : new Date())
      };

      const { error: insError } = await supabase
        .from('blogs')
        .insert(payload);

      if (insError) {
        console.error(`Failed to insert blog ${doc.title}:`, insError.message);
      } else {
        console.log(`Successfully migrated blog: ${doc.title}`);
      }
    }

    console.log('Blog migration completed successfully.');
    await mongoose.connection.close();
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

run();
