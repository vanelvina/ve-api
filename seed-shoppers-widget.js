import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import Widget from './models/Widget.js';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the environment!');
  process.exit(1);
}

async function seedShoppersTalk() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    // Delete existing widget with key 'shoppers-talk-reviews' if any
    await Widget.deleteOne({ key: 'shoppers-talk-reviews' });

    // Create the Shoppers Talk widget
    const newWidget = await Widget.create({
      key: 'shoppers-talk-reviews',
      name: 'Shoppers Talk Reviews Grid',
      type: 'shoppers-talk',
      enabled: true,
      order: 15.5, // Place it nicely in the layout flow, near customer reviews
      title: 'Shoppers Talk',
      subtitle: 'Real Reviews',
      description: 'See what our customers have to say about our comfort-first fits.',
      margins: { top: true, bottom: true, left: false, right: false },
      items: [
        {
          image: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=600&q=80'
        },
        {
          image: 'https://images.unsplash.com/photo-1616150638538-ffb0679a3fc4?w=600&q=80'
        },
        {
          image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80'
        },
        {
          image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&q=80'
        }
      ]
    });

    console.log('Successfully seeded Shoppers Talk Widget:', newWidget.name);
  } catch (err) {
    console.error('Error seeding widget:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

seedShoppersTalk();
