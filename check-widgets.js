import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

const WidgetSchema = new mongoose.Schema({}, { strict: false });
const Widget = mongoose.model('Widget', WidgetSchema);

async function check() {
  console.log('Connecting to:', MONGODB_URI);
  await mongoose.connect(MONGODB_URI);
  console.log('Connected!');

  const widgets = await Widget.find().lean();
  console.log(`Found ${widgets.length} widgets.`);
  for (const w of widgets) {
    console.log(`- ID: ${w._id}, Key: ${w.key}, Device: ${w.device}, Enabled: ${w.enabled}, Title: ${w.title}`);
  }

  await mongoose.disconnect();
}

check().catch(console.error);
