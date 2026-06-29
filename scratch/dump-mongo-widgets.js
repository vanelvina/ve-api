import mongoose from 'mongoose';
import 'dotenv/config';

async function run() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not found in env');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected!');

    const widgets = await mongoose.connection.db.collection('widgets').find({}).toArray();
    console.log('\n================ WIDGETS IN MONGO ================');
    console.log(JSON.stringify(widgets, null, 2));
    console.log('==================================================\n');

    await mongoose.connection.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
