import mongoose from 'mongoose';

const promiseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  icon: { type: String, default: '' }
}, { _id: false });

const aboutUsSchema = new mongoose.Schema({
  storyTitle: { type: String, default: 'Our Story' },
  storySubtitle: { type: String, default: 'It began with a dream.\nWith a vision to go beyond.\nBeyond limited choices.\nBeyond everything women were used to.\nBeyond just lingerie.' },
  storyContent: { type: String, default: 'Van Elvina was founded with the vision of helping women uninhibitedly shop for elegant and premium intimate wear. Along the way, we saw the power of this idea and how it helped women break norms.\n\nNow we\'re taking it ahead and investing in a community that\'s influencing women in different ways. From our online-offline stores to our new category launches, all our innovations are driven by ideas that weren\'t thought of before.' },
  storyImage: { type: String, default: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=1200' },
  
  visionTitle: { type: String, default: 'Our Vision' },
  visionSubtitle: { type: String, default: 'To Offer Every Woman the Confidence, Comfort & Choice She Deserves' },
  visionContent: { type: [String], default: [
    'Confidence is sexy and we want to help women find it, wear it and be it every day.',
    'At Van Elvina, we reinvent lingerie.',
    'We reimagine outerwear.',
    'We rethink design innovation.',
    'And spend hours creating every single piece,',
    'To make a woman feel beautiful in seconds.'
  ] },

  philosophyTitle: { type: String, default: 'Our Design Philosophy' },
  philosophyContent: { type: String, default: 'Crafted with passion, designed for elegance. Our philosophy blends premium materials, structural excellence, and delicate detailing to deliver intimates that feel like a second skin.' },
  philosophyImage: { type: String, default: 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?q=80&w=1200' },

  promises: {
    type: [promiseSchema],
    default: [
      { title: "We'll Always Remain Inclusive", description: "Creating Products For Every Body & Age", icon: "inclusive" },
      { title: "We'll Continue To Do Good", description: "By Using Processes That Put Women First", icon: "good" },
      { title: "We'll Continue To Innovate", description: "And Always Make Women Look Forward To Our Designs", icon: "innovate" },
      { title: "We'll Positively Impact Women", description: "Enabling The Entire Cycle From Creation To Delivery", icon: "impact" },
      { title: "We'll Stay True", description: "By Giving You The Finest Quality And Service", icon: "true" }
    ]
  }
}, { timestamps: true });

export default mongoose.model('AboutUs', aboutUsSchema);
