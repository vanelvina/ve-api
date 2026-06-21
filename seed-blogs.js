import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Blog from './models/Blog.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

const sampleBlogs = [
  {
    title: 'How to Style Bralette as Outerwear for the Festive Season',
    slug: 'how-to-style-bralette-as-outerwear-festive-season',
    summary: 'Transform your look by wearing a bralette as outerwear. Explore elegant, comfortable festive fashion tips with Van Elvina premium styles.',
    content: `
      <h2>The Rise of the Outerwear Bralette</h2>
      <p>Fashion has evolved, and innerwear is no longer meant to stay hidden. The premium lace and silk bralettes from Van Elvina are designed to be shown off. Here's how you can style a bralette as outerwear for this upcoming festive season.</p>
      
      <h3>1. Layer Under a Sheer Saree Blouse</h3>
      <p>Give your traditional saree look a modern twist. Swap out the conventional blouse for a heavily textured lace bralette. It adds comfort, support, and a premium edge to your overall look.</p>
      
      <h3>2. Under a Structured Blazer</h3>
      <p>For a bold, elegant look, pair a high-neck solid bralette with a coordinated pantsuit. Leave the blazer unbuttoned to showcase the delicate fabric and sophisticated lines of the innerwear.</p>

      <h3>Conclusion</h3>
      <p>Comfort should always come first. By utilizing breathable, supportive bralettes, you can look stunning while feeling absolutely free and relaxed.</p>
    `,
    image: 'https://images.unsplash.com/photo-1544966503-7cc5ac882d5f?w=600&q=80',
    author: 'Tanya Agarwal',
    tags: ['Fashion'],
    enabled: true,
    publishedAt: new Date('2025-08-07')
  },
  {
    title: 'Is Pickleball the New Social Club? Here’s How to Dress for the Scene',
    slug: 'pickleball-new-social-club-dress-scene',
    summary: 'Discover the hottest activewear trends for pickleball. Comfort meets style with breathable premium shapewear and sports bras.',
    content: `
      <h2>The Pickleball Craze</h2>
      <p>Pickleball is fast becoming the ultimate social sport. Whether you are playing a quick rally or just hanging out at the courts, looking the part is essential. Van Elvina activewear line offers the perfect blend of dynamic support and luxury comfort.</p>
      
      <h3>Tennis Skirts & Dynamic Crop Tops</h3>
      <p>Choose high-waisted tennis skirts paired with breathable padding sports bras. This provides maximum mobility on the court while keeping you fresh and confident under the sun.</p>

      <h3>Sweat-Wicking Luxury</h3>
      <p>Our fabrics focus on seamless moisture-wicking materials to keep you sweat-free. Comfort starts from the inner layer, and we make sure it stays premium.</p>
    `,
    image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80',
    author: 'Ria Bothra',
    tags: ['Fashion', 'Fitness', 'Lifestyle'],
    enabled: true,
    publishedAt: new Date('2025-09-01')
  },
  {
    title: 'This National Wellness Month, Try the OG Wellness Routine, Not Matcha or Coffee',
    slug: 'national-wellness-month-og-routine',
    summary: 'Focus on pure self-care this Wellness Month. Learn how organic sleepwear, breathing exercises, and natural routines can elevate your health.',
    content: `
      <h2>Redefining Wellness</h2>
      <p>Wellness is not about expensive drinks or trend cycles. It is about simple, natural daily routines. This Wellness Month, we explore the OG routines: deep breathing, high-quality sleep, and breathable clothing that supports your body naturally.</p>
      
      <h3>The Power of Cotton Sleepwear</h3>
      <p>A good night\'s rest is the foundation of physical health. Sleeping in premium, chemical-free organic cotton sleepwear ensures skin breathability and deeper sleep cycles.</p>

      <h3>Unwinding Naturally</h3>
      <p>Instead of reaching for stimulants, spend 10 minutes performing basic stretches and breathing exercises before bed. Let your body heal naturally.</p>
    `,
    image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80',
    author: 'Shriya Supreeth',
    tags: ['Fashion', 'Lifestyle'],
    enabled: true,
    publishedAt: new Date('2025-09-05')
  }
];

async function seed() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.');

  // Clear existing blogs first
  await Blog.deleteMany({});
  console.log('Cleared existing blogs.');

  // Insert seed blogs
  await Blog.insertMany(sampleBlogs);
  console.log('Blogs seeded successfully!');

  await mongoose.disconnect();
}

seed().catch(console.error);
