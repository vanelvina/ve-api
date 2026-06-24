import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function migrate() {
  if (!MONGODB_URI) {
    console.error('CRITICAL: MONGODB_URI is not defined in env');
    process.exit(1);
  }

  console.log('Connecting to database...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.');

  const db = mongoose.connection.db;
  const usersCollection = db.collection('users');

  console.log('Fetching current indexes on users collection...');
  const indexes = await usersCollection.indexes();
  console.log('Current indexes:', indexes);

  // Find if email_1 index exists
  const hasEmailIndex = indexes.some(idx => idx.name === 'email_1');
  if (hasEmailIndex) {
    console.log('Dropping old unique index "email_1"...');
    await usersCollection.dropIndex('email_1');
    console.log('Dropped "email_1" index.');
  } else {
    console.log('Old index "email_1" does not exist.');
  }

  // Create compound index: { email: 1, authMethod: 1 } with unique constraint
  console.log('Creating compound unique index { email: 1, authMethod: 1 }...');
  await usersCollection.createIndex({ email: 1, authMethod: 1 }, { unique: true, name: 'email_1_authMethod_1' });
  console.log('Compound unique index created successfully.');

  // Let's also check googleId unique index. Currently User.js has:
  // googleId: { type: String, unique: true, sparse: true }
  // We want to make sure googleId_1 index exists
  const hasGoogleIdIndex = indexes.some(idx => idx.name === 'googleId_1');
  if (!hasGoogleIdIndex) {
    console.log('Creating sparse unique index for googleId...');
    await usersCollection.createIndex({ googleId: 1 }, { unique: true, sparse: true, name: 'googleId_1' });
    console.log('Sparse unique index for googleId created.');
  }

  const finalIndexes = await usersCollection.indexes();
  console.log('Final indexes:', finalIndexes);

  await mongoose.disconnect();
  console.log('Disconnected. Migration finished successfully!');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
