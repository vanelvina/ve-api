import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

import Product from './models/Product.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in the environment!');
  process.exit(1);
}

const productsJsonPath = path.join(__dirname, '../ve-app/data/products.json');

async function syncBadges() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    const products = JSON.parse(fs.readFileSync(productsJsonPath, 'utf-8'));
    console.log(`Loaded ${products.length} products from products.json.`);

    for (const p of products) {
      const result = await Product.updateOne(
        { slug: p.slug },
        { $set: { badge: p.badge } }
      );
      console.log(`Product ${p.slug} badge updated to "${p.badge}": matched ${result.matchedCount}, modified ${result.modifiedCount}`);
    }

    console.log('Badge synchronization complete.');
  } catch (err) {
    console.error('Error during synchronization:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database.');
  }
}

syncBadges();
