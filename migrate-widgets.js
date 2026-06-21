import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Widget from './models/Widget.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the environment!');
  process.exit(1);
}

async function migrate() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    const widgets = await Widget.find();
    console.log(`Found ${widgets.length} widgets.`);

    for (const w of widgets) {
      // 1. Ensure device is explicitly set (defaults to desktop if not set)
      if (!w.device) {
        w.device = 'desktop';
        await w.save();
        console.log(`Updated widget ${w.key} device to desktop.`);
      }

      // 2. If it's a desktop widget, check if a mobile counterpart exists
      if (w.device === 'desktop') {
        const mobileKey = `${w.key}-mobile`;
        const exists = await Widget.findOne({ key: mobileKey });
        if (!exists) {
          const mobileWidget = {
            key: mobileKey,
            name: `${w.name} (Mobile)`,
            device: 'mobile',
            type: w.type,
            enabled: w.enabled,
            order: w.order,
            title: w.title,
            subtitle: w.subtitle,
            description: w.description,
            image: w.imageMobile || w.image, // Fallback desktop image to image for mobile if imageMobile is not set
            imageMobile: w.imageMobile || w.image,
            margins: w.margins ? JSON.parse(JSON.stringify(w.margins)) : { top: false, bottom: false, left: false, right: false },
            items: w.items ? JSON.parse(JSON.stringify(w.items)) : undefined
          };
          
          await Widget.create(mobileWidget);
          console.log(`Created mobile duplicate for ${w.key} with key ${mobileKey}`);
        }
      }
    }

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

migrate();
