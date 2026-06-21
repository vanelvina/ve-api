import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Widget from './models/Widget.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function fix() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.');

  // Update all widgets missing the 'device' property to 'desktop'
  const result = await Widget.updateMany(
    { device: { $exists: false } },
    { $set: { device: 'desktop' } }
  );

  console.log(`Matched ${result.matchedCount} and updated ${result.modifiedCount} widgets.`);

  // Also check if any duplicate mobile counterparts need to be created
  const widgets = await Widget.find({ device: 'desktop' });
  for (const w of widgets) {
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
        image: w.imageMobile || w.image,
        imageMobile: w.imageMobile || w.image,
        margins: w.margins ? JSON.parse(JSON.stringify(w.margins)) : { top: false, bottom: false, left: false, right: false },
        items: w.items ? JSON.parse(JSON.stringify(w.items)) : undefined
      };
      await Widget.create(mobileWidget);
      console.log(`Created missing mobile counterpart for ${w.key}`);
    }
  }

  await mongoose.disconnect();
  console.log('Done!');
}

fix().catch(console.error);
