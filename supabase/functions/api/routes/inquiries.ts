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

    // Send push notification to admins in the background
    if (eventType === 'analytics_visit') {
      sendPushNotification('admin', '👤 New Visitor Counted', `${userName || 'Guest'} viewed the site`).catch(() => {});
    } else if (eventType === 'analytics_add_to_cart') {
      sendPushNotification('admin', '🛒 Product Added to Cart', `${userName || 'Guest'} added ${eventData?.productName || 'a product'} to cart`).catch(() => {});
    } else if (eventType === 'analytics_login') {
      sendPushNotification('admin', '🔑 Customer Login', `${userName || 'User'} logged in`).catch(() => {});
    } else if (eventType === 'analytics_checkout') {
      sendPushNotification('admin', '🛍️ New Order Received!', `Order #${eventData?.orderId || '—'} placed for ₹${(eventData?.total || 0).toLocaleString('en-IN')}`).catch(() => {});
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

