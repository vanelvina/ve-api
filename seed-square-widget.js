import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import Widget from './models/Widget.js';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the environment!');
  process.exit(1);
}

async function seedSquareGrid() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    // Delete existing widget with key 'panty-packs' if any
    await Widget.deleteOne({ key: 'panty-packs' });

    // Create the square grid widget
    const newWidget = await Widget.create({
      key: 'panty-packs',
      name: 'Panty Packs & Combos Grid',
      type: 'square-grid',
      enabled: true,
      order: 11.5, // Place it nicely in the layout flow
      title: 'Panty Haul Packs',
      subtitle: 'Value Combos',
      description: 'Choose your preferred pack size.',
      margins: { top: true, bottom: true, left: false, right: false },
      items: [
        {
          image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80',
          title: 'SINGLE >',
          link: '/products?pack=single'
        },
        {
          image: 'https://images.unsplash.com/photo-1608748324285-7824f8d22744?w=600&q=80',
          title: 'PACK OF 2 >',
          link: '/products?pack=2'
        },
        {
          image: 'https://images.unsplash.com/photo-1582562124811-c09040d0a901?w=600&q=80',
          title: 'PACK OF 3 >',
          link: '/products?pack=3'
        },
        {
          image: 'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=600&q=80',
          title: 'PACK OF 5 >',
          link: '/products?pack=5'
        }
      ]
    });

    console.log('Successfully seeded Square Grid Widget:', newWidget.name);
  } catch (err) {
    console.error('Error seeding widget:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

seedSquareGrid();
