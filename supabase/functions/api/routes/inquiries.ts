import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import { supabase } from '../utils/supabase.ts';
import { toUUID } from '../utils/uuid.ts';
import { authMiddleware } from '../middleware/auth.ts';
import webpush from 'npm:web-push';

webpush.setVapidDetails(
  'mailto:support@vanelvina.com',
  'BF2ljIBKIQS12D8ynJn2rLVbA8LFcsEsOm4Pjik6HAMWto3LaGWwh29Sud_KGZzfODX5zPTE-ZugvVveDWCGwzY',
  'f-idj4KvkQsoR8G4m2y_AEMcMLVo78SGbRzPMFE6gko'
);

export async function sendPushNotification(targetEmail: string, title: string, body: string, url: string = '/') {
  try {
    const { data: subs, error } = await supabase
      .from('inquiries')
      .select('*')
      .eq('status', 'push_subscription')
      .eq('email', targetEmail);

    if (error || !subs || subs.length === 0) return;

    for (const subRow of subs) {
      try {
        const subscription = JSON.parse(subRow.message);
        const payload = JSON.stringify({ title, body, url });
        await webpush.sendNotification(subscription, payload);
      } catch (err: any) {
        console.error(`Failed to send push notification to subscription ID ${subRow.id}:`, err);
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('inquiries').delete().eq('id', subRow.id);
        }
      }
    }
  } catch (error) {
    console.error('sendPushNotification error:', error);
  }
}

const router = new Hono();

// Helper to map Supabase Inquiry row to Frontend expected format
const mapInquiry = (inquiry: any) => {
  if (!inquiry) return null;
  return {
    _id: inquiry.id,
    id: inquiry.id,
    name: inquiry.name,
    email: inquiry.email,
    phone: inquiry.phone,
    queryType: inquiry.subject,
    message: inquiry.message,
    status: inquiry.status,
    createdAt: inquiry.created_at,
    updatedAt: inquiry.updated_at || inquiry.created_at
  };
};

// POST /api/inquiries — Public: Submit feedback/inquiry
router.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { name, email, phone, queryType, message } = body;
    if (!name || !email || !phone || !queryType || !message) {
      return c.json({ message: 'All fields are required.' }, 400);
    }

    const { data: inquiry, error } = await supabase
      .from('inquiries')
      .insert({
        name,
        email,
        phone,
        subject: queryType,
        message,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    return c.json({ success: true, inquiry: mapInquiry(inquiry) }, 201);
  } catch (error: any) {
    console.error('Submit inquiry error:', error);
    return c.json({ message: 'Server error submitting feedback.' }, 500);
  }
});

// GET /api/inquiries — Admin: Retrieve all inquiries (excluding analytics logs)
router.get('/', authMiddleware, async (c) => {
  try {
    const { data, error } = await supabase
      .from('inquiries')
      .select('*')
      .not('status', 'in', '(analytics,push_subscription)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return c.json((data || []).map(mapInquiry));
  } catch (error: any) {
    console.error('Fetch inquiries error:', error);
    return c.json({ message: 'Server error fetching inquiries.' }, 500);
  }
});

// POST /api/inquiries/event — Public/User: Log analytics/tracking events
router.post('/event', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { eventType, eventData, userEmail, userName } = body;
    if (!eventType) {
      return c.json({ message: 'eventType is required' }, 400);
    }
    
    // Store in inquiries table with status = 'analytics'
    const { data, error } = await supabase
      .from('inquiries')
      .insert({
        name: userName || 'Anonymous',
        email: userEmail || 'anonymous@vanelvina.com',
        phone: '-',
        subject: eventType,
        message: JSON.stringify(eventData || {}),
        status: 'analytics'
      })
      .select()
      .single();

    if (error) throw error;

    // Send push notification to admins / users in the background
    if (eventType === 'analytics_visit') {
      sendPushNotification('admin', '👤 New Visitor Counted', `${userName || 'Guest'} viewed the site`).catch(() => {});
    } else if (eventType === 'analytics_add_to_cart') {
      sendPushNotification('admin', '🛒 Product Added to Cart', `${userName || 'Guest'} added ${eventData?.productName || 'a product'} to cart`).catch(() => {});
    } else if (eventType === 'analytics_login') {
      sendPushNotification('admin', '🔑 Customer Login', `${userName || 'User'} logged in`).catch(() => {});
      if (userEmail && userEmail !== 'anonymous@vanelvina.com' && userEmail !== 'anonymous') {
        sendPushNotification(userEmail, 'Welcome back! ✨', `Hello ${userName || 'Delicate'}, you have logged in successfully.`, '/').catch(() => {});
      }
    } else if (eventType === 'analytics_checkout') {
      sendPushNotification('admin', '🛍️ New Order Received!', `Order #${eventData?.orderId || '—'} placed by ${userName || 'Guest'} for ₹${(eventData?.total || 0).toLocaleString('en-IN')}`).catch(() => {});
    } else if (eventType === 'analytics_product_view') {
      sendPushNotification('admin', '👀 Product Viewed', `${userName || 'Guest'} viewed ${eventData?.productName || 'a product'}`).catch(() => {});
    } else if (eventType === 'analytics_click') {
      sendPushNotification('admin', '🖱️ Product Clicked', `${userName || 'Guest'} clicked ${eventData?.productName || 'a product'}`).catch(() => {});
    } else if (eventType === 'analytics_checkout_started') {
      sendPushNotification('admin', '🛒 Checkout Started', `${userName || 'Guest'} opened checkout with ${eventData?.itemsCount || 0} items (Total: ₹${(eventData?.total || 0).toLocaleString('en-IN')})`).catch(() => {});
    } else if (eventType === 'analytics_checkout_abandoned') {
      sendPushNotification('admin', '🥀 Checkout Abandoned', `${userName || 'Guest'} abandoned checkout at step: ${eventData?.lastStep || 'Unknown'}`).catch(() => {});
    }

    return c.json({ success: true, id: data.id }, 201);
  } catch (error: any) {
    console.error('Log event error:', error);
    return c.json({ message: 'Server error logging event' }, 500);
  }
});

// POST /api/inquiries/push-subscribe — Public/User: Register web push subscription
router.post('/push-subscribe', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { email, name, subscription } = body;
    if (!subscription || !subscription.endpoint) {
      return c.json({ message: 'Valid subscription object is required.' }, 400);
    }

    // Check if subscription endpoint already exists
    const { data: existing } = await supabase
      .from('inquiries')
      .select('*')
      .eq('status', 'push_subscription');

    const duplicate = (existing || []).find(row => {
      try {
        const sub = JSON.parse(row.message);
        return sub.endpoint === subscription.endpoint;
      } catch {
        return false;
      }
    });

    if (duplicate) {
      // Update existing registration with latest info
      const { error: updateErr } = await supabase
        .from('inquiries')
        .update({
          email: email || duplicate.email || 'anonymous',
          name: name || duplicate.name || 'Anonymous',
          message: JSON.stringify(subscription)
        })
        .eq('id', duplicate.id);

      if (updateErr) throw updateErr;
    } else {
      // Create new registration
      const { error: insertErr } = await supabase
        .from('inquiries')
        .insert({
          name: name || 'Push Subscription',
          email: email || 'anonymous',
          phone: '-',
          subject: 'push_subscription',
          message: JSON.stringify(subscription),
          status: 'push_subscription'
        });

      if (insertErr) throw insertErr;
    }

    // Try sending a welcome notification to test the push channel
    sendPushNotification(
      email || 'anonymous',
      'Van Elvina ✨',
      'Native Push Notifications successfully activated! Enjoy shopping comfort.',
      '/'
    ).catch(() => {});

    return c.json({ success: true, message: 'Push subscription registered successfully.' });
  } catch (error: any) {
    console.error('Push subscribe error:', error);
    return c.json({ message: 'Server error registering push subscription' }, 500);
  }
});

// GET /api/inquiries/analytics — Admin: Retrieve all analytics event logs
router.get('/analytics', authMiddleware, async (c) => {
  try {
    const { data, error } = await supabase
      .from('inquiries')
      .select('*')
      .eq('status', 'analytics')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return c.json(data || []);
  } catch (error: any) {
    console.error('Fetch analytics error:', error);
    return c.json({ message: 'Server error fetching analytics logs.' }, 500);
  }
});

// GET /api/inquiries/analytics/summary — Admin: Aggregated analytics dashboard data
router.get('/analytics/summary', authMiddleware, async (c) => {
  try {
    const timeframe = c.req.query('timeframe') || 'week';

    // Compute the start date for the timeframe filter
    const now = new Date();
    let startDate: string | null = null;
    if (timeframe === 'today') {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      startDate = d.toISOString();
    } else if (timeframe === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      startDate = d.toISOString();
    } else if (timeframe === 'month') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      startDate = d.toISOString();
    }
    // 'all' => startDate stays null

    // ── 1. Fetch all analytics events for timeframe ──────────────────────────
    let eventsQuery = supabase
      .from('inquiries')
      .select('subject, message, email, created_at')
      .eq('status', 'analytics');
    if (startDate) eventsQuery = eventsQuery.gte('created_at', startDate);

    const { data: events, error: eventsErr } = await eventsQuery;
    if (eventsErr) throw eventsErr;

    const allEvents = events || [];

    // Helper: safely parse JSON message
    const parseMsg = (msg: string): any => {
      try { return JSON.parse(msg); } catch { return {}; }
    };

    // ── 2. Count behavioral metrics ──────────────────────────────────────────
    let visits = 0, productViews = 0, productClicks = 0, impressions = 0,
        addToCarts = 0, checkoutsStarted = 0, checkoutsCompleted = 0,
        checkoutsAbandoned = 0, logins = 0;

    // Per-product aggregation maps
    const productMap: Record<string, {
      productId: string; productName: string; category: string; price: number;
      views: number; impressions: number; clicks: number; carts: number;
    }> = {};

    // Daily trend maps (keyed by YYYY-MM-DD)
    const dailyMap: Record<string, { date: string; visits: number; orders: number; revenue: number }> = {};

    const dateKey = (iso: string) => iso.substring(0, 10);

    const ensureDay = (iso: string) => {
      const k = dateKey(iso);
      if (!dailyMap[k]) dailyMap[k] = { date: k, visits: 0, orders: 0, revenue: 0 };
    };

    const ensureProduct = (data: any) => {
      const pid = data?.productId;
      if (!pid) return;
      if (!productMap[pid]) {
        productMap[pid] = {
          productId: pid,
          productName: data.productName || 'Unknown',
          category: data.category || '',
          price: data.price || 0,
          views: 0, impressions: 0, clicks: 0, carts: 0
        };
      }
      return productMap[pid];
    };

    for (const ev of allEvents) {
      const data = parseMsg(ev.message);
      const day = ev.created_at;

      switch (ev.subject) {
        case 'analytics_visit':
          visits++;
          ensureDay(day);
          dailyMap[dateKey(day)].visits++;
          break;
        case 'analytics_product_view':
          productViews++;
          const pv = ensureProduct(data);
          if (pv) pv.views++;
          break;
        case 'analytics_impression':
          impressions++;
          const pi = ensureProduct(data);
          if (pi) pi.impressions++;
          break;
        case 'analytics_click':
          productClicks++;
          const pc = ensureProduct(data);
          if (pc) pc.clicks++;
          break;
        case 'analytics_add_to_cart':
          addToCarts++;
          const pa = ensureProduct(data);
          if (pa) pa.carts++;
          break;
        case 'analytics_checkout_started':
          checkoutsStarted++;
          break;
        case 'analytics_checkout':
          checkoutsCompleted++;
          break;
        case 'analytics_checkout_abandoned':
          checkoutsAbandoned++;
          break;
        case 'analytics_login':
          logins++;
          break;
      }
    }

    // ── 3. Fetch order metrics from orders table ──────────────────────────────
    let ordersQuery = supabase
      .from('orders')
      .select('id, order_id, order_status, payment_status, total, items, created_at');
    if (startDate) ordersQuery = ordersQuery.gte('created_at', startDate);

    const { data: orders, error: ordersErr } = await ordersQuery;
    if (ordersErr) throw ordersErr;

    const allOrders = orders || [];

    let totalOrders = 0, totalRevenue = 0, totalReturns = 0, totalExchanges = 0;
    const returnStatuses = new Set(['return_requested', 'return_picked_up', 'returned', 'refunded']);
    const exchangeStatuses = new Set(['exchange_requested', 'exchange_packed', 'exchange_dispatched', 'exchanged']);

    // Per-product order aggregation
    const productOrderMap: Record<string, { orders: number; revenue: number; productName: string }> = {};

    for (const order of allOrders) {
      const isPaid = ['paid', 'completed', 'cod'].includes(order.payment_status) ||
                     ['accepted', 'label_created', 'in_transit', 'shipped', 'delivered',
                      'return_requested', 'return_picked_up', 'returned', 'refunded',
                      'exchange_requested', 'exchange_packed', 'exchange_dispatched', 'exchanged'].includes(order.order_status);

      if (returnStatuses.has(order.order_status)) {
        totalReturns++;
      } else if (exchangeStatuses.has(order.order_status)) {
        totalExchanges++;
      } else {
        totalOrders++;
        if (isPaid) totalRevenue += Number(order.total) || 0;
      }

      // Daily orders + revenue
      ensureDay(order.created_at);
      const dk = dateKey(order.created_at);
      if (!returnStatuses.has(order.order_status) && !exchangeStatuses.has(order.order_status)) {
        dailyMap[dk].orders++;
        if (isPaid) dailyMap[dk].revenue += Number(order.total) || 0;
      }

      // Product-level order aggregation
      const items: any[] = Array.isArray(order.items) ? order.items : [];
      for (const item of items) {
        const pid = item.productId;
        if (!pid) continue;
        if (!productOrderMap[pid]) productOrderMap[pid] = { orders: 0, revenue: 0, productName: item.name || 'Unknown' };
        productOrderMap[pid].orders += item.quantity || 1;
        productOrderMap[pid].revenue += (Number(item.price) || 0) * (Number(item.quantity) || 1);
      }
    }

    // ── 4. Merge product maps ─────────────────────────────────────────────────
    // Merge order data into productMap (event-based), and include order-only products
    const allProductIds = new Set([...Object.keys(productMap), ...Object.keys(productOrderMap)]);
    const mergedProducts = Array.from(allProductIds).map(pid => {
      const ev = productMap[pid];
      const ord = productOrderMap[pid];
      return {
        productId: pid,
        productName: ev?.productName || ord?.productName || 'Unknown',
        category: ev?.category || '',
        price: ev?.price || 0,
        views: ev?.views || 0,
        impressions: ev?.impressions || 0,
        clicks: ev?.clicks || 0,
        carts: ev?.carts || 0,
        orders: ord?.orders || 0,
        revenue: ord?.revenue || 0,
      };
    });

    // Sort helpers
    const byViews = [...mergedProducts].sort((a, b) => b.views - a.views).slice(0, 10);
    const byRevenue = [...mergedProducts].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const byCarts = [...mergedProducts].sort((a, b) => b.carts - a.carts).slice(0, 10);

    // ── 5. Build daily trend (sorted ascending, last 30 days max) ────────────
    const dailyTrend = Object.values(dailyMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    // ── 6. Build funnel ───────────────────────────────────────────────────────
    const funnel = [
      { stage: 'Visits', count: visits },
      { stage: 'Product Views', count: productViews },
      { stage: 'Product Clicks', count: productClicks },
      { stage: 'Add to Cart', count: addToCarts },
      { stage: 'Checkout Started', count: checkoutsStarted },
      { stage: 'Orders Completed', count: checkoutsCompleted || totalOrders },
    ];

    return c.json({
      timeframe,
      generatedAt: new Date().toISOString(),
      metrics: {
        visits,
        productViews,
        impressions,
        productClicks,
        addToCarts,
        checkoutsStarted,
        checkoutsCompleted: checkoutsCompleted || totalOrders,
        checkoutsAbandoned,
        logins,
        orders: totalOrders,
        returns: totalReturns,
        exchanges: totalExchanges,
        revenue: Math.round(totalRevenue),
        conversionRate: visits > 0 ? ((checkoutsCompleted || totalOrders) / visits * 100).toFixed(1) : '0.0',
        abandonRate: checkoutsStarted > 0 ? (checkoutsAbandoned / checkoutsStarted * 100).toFixed(1) : '0.0',
        cartToCheckout: addToCarts > 0 ? (checkoutsStarted / addToCarts * 100).toFixed(1) : '0.0',
      },
      funnel,
      topProductsByViews: byViews,
      topProductsByRevenue: byRevenue,
      topProductsByCarts: byCarts,
      dailyTrend,
    });
  } catch (error: any) {
    console.error('Analytics summary error:', error);
    return c.json({ message: 'Server error generating analytics summary.' }, 500);
  }
});

// PUT /api/inquiries/:id/resolve — Admin: Mark inquiry as resolved
router.put('/:id/resolve', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const uuid = toUUID(id);
    
    // Fetch current status
    const { data: currentInq, error: fetchErr } = await supabase
      .from('inquiries')
      .select('status')
      .eq('id', uuid)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!currentInq) {
      return c.json({ message: 'Inquiry not found.' }, 404);
    }
    
    const newStatus = currentInq.status === 'resolved' ? 'pending' : 'resolved';
    
    // Update status
    const { data: updatedInq, error: updateErr } = await supabase
      .from('inquiries')
      .update({ status: newStatus })
      .eq('id', uuid)
      .select()
      .single();

    if (updateErr) throw updateErr;
    
    return c.json(mapInquiry(updatedInq));
  } catch (error: any) {
    console.error('Resolve inquiry error:', error);
    return c.json({ message: 'Server error updating inquiry status.' }, 500);
  }
});

// DELETE /api/inquiries/:id — Admin: Delete inquiry
router.delete('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const uuid = toUUID(id);
    const { data, error } = await supabase
      .from('inquiries')
      .delete()
      .eq('id', uuid)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return c.json({ message: 'Inquiry not found.' }, 404);
    }
    return c.json({ success: true, message: 'Inquiry deleted successfully.' });
  } catch (error: any) {
    console.error('Delete inquiry error:', error);
    return c.json({ message: 'Server error deleting inquiry.' }, 500);
  }
});

export default router;

