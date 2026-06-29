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

    // Fetch all widgets from MongoDB
    const mongoWidgets = await mongoose.connection.db.collection('widgets').find({}).toArray();
    console.log(`Fetched ${mongoWidgets.length} widgets from MongoDB.`);

    // Delete existing widgets from Supabase
    console.log('Clearing widgets in Supabase...');
    const { error: delError } = await supabase
      .from('widgets')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (delError) throw delError;
    console.log('Supabase widgets cleared.');

    // Insert Mongo widgets into Supabase
    console.log('Inserting MongoDB widgets into Supabase...');
    for (const doc of mongoWidgets) {
      const payload = {
        id: toUUID(doc._id),
        type: doc.type || 'system',
        is_active: doc.enabled !== false,
        position: doc.order !== undefined ? doc.order : 0,
        title: doc.title || '',
        config: {
          key: doc.key || '',
          name: doc.name || '',
          device: doc.device || 'desktop',
          subtitle: doc.subtitle || '',
          description: doc.description || '',
          image: doc.image || '',
          imageMobile: doc.imageMobile || '',
          margins: doc.margins || { top: false, bottom: false, left: false, right: false },
          items: doc.items || null
        }
      };

      const { error: insError } = await supabase
        .from('widgets')
        .insert(payload);

      if (insError) {
        console.error(`Failed to insert widget ${doc.key}:`, insError.message);
      } else {
        console.log(`Successfully migrated widget: ${doc.key} (position: ${payload.position})`);
      }
    }

    console.log('Widget migration completed successfully.');
    await mongoose.connection.close();
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

run();
