import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  productId: { type: String },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, default: 1 },
  size: { type: String },
  color: { type: String },
  image: { type: String },
}, { _id: false });

const shippingAddressSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String },
  line1: { type: String, required: true },
  line2: { type: String },
  city: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String, required: true },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    default: () => {
      const d = new Date();
      const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      return `VE-${date}-${rand}`;
    }
  },
  // Logged-in user (optional — null = guest)
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isGuest: { type: Boolean, default: false },

  // Guest info (used when userId is null)
  guestInfo: {
    name: String,
    email: String,
    phone: String,
  },

  items: [orderItemSchema],
  shippingAddress: { type: shippingAddressSchema, required: true },
  paymentMethod: { type: String, required: true },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  orderStatus: { 
    type: String, 
    enum: ['placed', 'accepted', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested', 'exchange_requested', 'returned', 'exchanged'], 
    default: 'placed' 
  },
  statusHistory: [{
    status: { type: String },
    timestamp: { type: Date, default: Date.now },
    note: { type: String }
  }],
  shippingMethod: { type: String, default: 'standard' },
  subtotal: { type: Number, required: true },
  shippingFee: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  notes: { type: String },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
}, { timestamps: true });

export default mongoose.model('Order', orderSchema);
