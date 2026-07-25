/**
 * Shiprocket utility module for Van Elvina backend.
 *
 * Handles:
 *  - JWT auth with in-memory caching (10-day tokens, 9-day cache window)
 *  - createShipment()   → Create order + auto-assign AWB + request pickup
 *  - cancelShipment()   → Cancel a Shiprocket order
 *  - trackShipment()    → Get live tracking events by AWB
 *
 * Pickup pincode: 431001 (Aurangabad warehouse)
 * All calls are idempotent-safe: errors are returned as Result objects,
 * never thrown, so the caller decides whether to block or log-and-continue.
 */

const SHIPROCKET_BASE = 'https://apiv2.shiprocket.in/v1/external';
const PICKUP_PINCODE = '431001';
const PICKUP_LOCATION = Deno.env.get('SHIPROCKET_PICKUP_LOCATION') || 'Primary';

// ─── Auth token cache ──────────────────────────────────────────────────────
let _token: string | null = null;
let _tokenExpiresAt: number = 0;

async function getToken(): Promise<string | null> {
  const email = Deno.env.get('SHIPROCKET_EMAIL') || '';
  const password = Deno.env.get('SHIPROCKET_PASSWORD') || '';

  if (!email || !password) {
    console.warn('[Shiprocket] Credentials not configured. Skipping.');
    return null;
  }

  const now = Date.now();
  if (_token && now < _tokenExpiresAt) return _token;

  try {
    const res = await fetch(`${SHIPROCKET_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!data?.token) throw new Error(`Shiprocket auth failed: ${JSON.stringify(data)}`);
    _token = data.token;
    // Cache for 9 days (tokens live 10 days)
    _tokenExpiresAt = now + 9 * 24 * 60 * 60 * 1000;
    console.log('[Shiprocket] Auth token refreshed.');
    return _token;
  } catch (err: any) {
    console.error('[Shiprocket] Auth error:', err?.message);
    _token = null;
    _tokenExpiresAt = 0;
    return null;
  }
}

async function shiprocketFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getToken();
  if (!token) return null;

  const res = await fetch(`${SHIPROCKET_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    // Token rejected — clear cache and let next call re-authenticate
    console.warn('[Shiprocket] 401 received — clearing token cache.');
    _token = null;
    _tokenExpiresAt = 0;
    return null;
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    console.error('[Shiprocket] Non-JSON response:', text.slice(0, 200));
    return null;
  }
}

// ─── Result type ──────────────────────────────────────────────────────────
export interface ShiprocketResult {
  success: boolean;
  shiprocketOrderId?: number | null;
  shipmentId?: number | null;
  awbCode?: string | null;
  courierName?: string | null;
  pickupScheduledDate?: string | null;
  error?: string;
}

export interface TrackingEvent {
  date: string;
  activity: string;
  location: string;
  status: string;
}

export interface TrackingResult {
  success: boolean;
  awb?: string;
  courierName?: string;
  currentStatus?: string;
  deliveryDate?: string | null;
  events: TrackingEvent[];
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function buildOrderName(addr: any): { first: string; last: string } {
  const full = (addr?.name || '').trim();
  const parts = full.split(' ');
  return {
    first: parts[0] || 'Customer',
    last: parts.slice(1).join(' ') || '.',
  };
}

// ─── Main: Create Shipment ─────────────────────────────────────────────────
/**
 * Creates a Shiprocket order, assigns an AWB, and requests pickup.
 * All sub-steps are attempted in sequence. Partial success is handled
 * gracefully — e.g. if pickup request fails, AWB is still returned.
 */
export async function createShipment(order: any): Promise<ShiprocketResult> {
  try {
    const addr = order.shipping_address || {};
    const { first, last } = buildOrderName(addr);
    const isCod = order.payment_method === 'cod';

    // Build order items for Shiprocket
    const orderItems = (order.items || []).map((item: any) => ({
      name: item.name || 'Van Elvina Product',
      sku: item.sku || `SKU-${item.productId || 'NA'}`,
      units: item.quantity || 1,
      selling_price: item.price || 0,
      discount: '',
      tax: '',
      hsn: '',
    }));

    if (!orderItems.length) {
      return { success: false, error: 'No items in order' };
    }

    // ── Step 1: Create Shiprocket Order ──────────────────────────────────
    const orderDate = new Date().toISOString().replace('T', ' ').split('.')[0];
    const createPayload = {
      order_id: order.order_id,
      order_date: orderDate,
      pickup_location: PICKUP_LOCATION,
      channel_id: '',
      comment: `Van Elvina order ${order.order_id}`,
      // Billing = shipping (same for our use case)
      billing_customer_name: first,
      billing_last_name: last,
      billing_address: addr.line1 || '',
      billing_address_2: addr.line2 || '',
      billing_isd_code: '91',
      billing_city: addr.city || '',
      billing_pincode: String(addr.pincode || ''),
      billing_state: addr.state || '',
      billing_country: 'India',
      billing_email: addr.email || order.guest_info?.email || '',
      billing_phone: String(addr.phone || '').replace(/\D/g, '').slice(-10),
      shipping_is_billing: true,
      order_items: orderItems,
      payment_method: isCod ? 'COD' : 'Prepaid',
      shipping_charges: order.shipping_fee || 0,
      giftwrap_charges: 0,
      transaction_charges: 0,
      total_discount: order.discount || 0,
      sub_total: order.subtotal || order.total || 0,
      // Default dimensions for innerwear — lightweight, compact
      length: 20,
      breadth: 15,
      height: 5,
      weight: 0.5,
    };

    const created = await shiprocketFetch('/orders/create/adhoc', {
      method: 'POST',
      body: JSON.stringify(createPayload),
    });

    if (!created) {
      return { success: false, error: 'Shiprocket order creation returned null' };
    }
    if (created.status_code && created.status_code !== 1) {
      return { success: false, error: created.message || 'Order creation failed' };
    }

    const shiprocketOrderId: number = created.order_id;
    const shipmentId: number = created.shipment_id;

    console.log(`[Shiprocket] Order created: srOrderId=${shiprocketOrderId}, shipmentId=${shipmentId}`);

    // ── Step 2: Assign AWB (auto-select best courier) ─────────────────────
    const awbRes = await shiprocketFetch('/courier/assign/awb', {
      method: 'POST',
      body: JSON.stringify({
        shipment_id: String(shipmentId),
        courier_id: '',  // empty = auto-assign based on serviceability & cost
      }),
    });

    const awbCode: string | null = awbRes?.response?.data?.awb_code || awbRes?.awb_code || null;
    const courierName: string | null = awbRes?.response?.data?.courier_name || awbRes?.courier_name || null;

    if (!awbCode) {
      console.warn(`[Shiprocket] AWB assignment failed for shipmentId=${shipmentId}:`, awbRes);
      // Still return partial success — order is in Shiprocket, admin can manually assign AWB
      return {
        success: true,
        shiprocketOrderId,
        shipmentId,
        awbCode: null,
        courierName: null,
        error: 'AWB assignment failed — please assign manually in Shiprocket dashboard',
      };
    }

    console.log(`[Shiprocket] AWB assigned: ${awbCode} via ${courierName}`);

    // ── Step 3: Request Pickup ─────────────────────────────────────────────
    const pickupRes = await shiprocketFetch('/courier/generate/pickup', {
      method: 'POST',
      body: JSON.stringify({ shipment_id: [shipmentId] }),
    });

    const pickupDate: string | null =
      pickupRes?.pickup_scheduled_date ||
      pickupRes?.response?.pickup_scheduled_date ||
      null;

    console.log(`[Shiprocket] Pickup requested. Scheduled: ${pickupDate || 'TBD'}`);

    return {
      success: true,
      shiprocketOrderId,
      shipmentId,
      awbCode,
      courierName,
      pickupScheduledDate: pickupDate,
    };
  } catch (err: any) {
    console.error('[Shiprocket] createShipment error:', err?.message || err);
    return { success: false, error: err?.message || 'Shiprocket shipment creation failed' };
  }
}

// ─── Cancel Shipment ───────────────────────────────────────────────────────
/**
 * Cancels a Shiprocket order by its Shiprocket order ID.
 * Safe to call even if no shiprocket_order_id exists (returns success silently).
 */
export async function cancelShipment(shiprocketOrderId: number | null | undefined): Promise<{ success: boolean; error?: string }> {
  if (!shiprocketOrderId) {
    // Order was never pushed to Shiprocket — nothing to cancel
    return { success: true };
  }
  try {
    const res = await shiprocketFetch('/orders/cancel', {
      method: 'POST',
      body: JSON.stringify({ ids: [shiprocketOrderId] }),
    });
    if (!res) return { success: false, error: 'Shiprocket cancel returned null' };
    console.log(`[Shiprocket] Order ${shiprocketOrderId} cancelled:`, res?.message);
    return { success: true };
  } catch (err: any) {
    console.error('[Shiprocket] cancelShipment error:', err?.message);
    return { success: false, error: err?.message };
  }
}

// ─── Track Shipment ────────────────────────────────────────────────────────
/**
 * Returns normalised tracking events for a given AWB code.
 */
export async function trackShipment(awb: string): Promise<TrackingResult> {
  if (!awb?.trim()) {
    return { success: false, events: [], error: 'No AWB code provided' };
  }
  try {
    const res = await shiprocketFetch(`/courier/track/shipment/${awb.trim()}`, {
      method: 'GET',
    });

    if (!res) return { success: false, events: [], error: 'Tracking returned null' };

    // Shiprocket returns tracking_data.track_activities[]
    const trackingData = res?.tracking_data || res?.data?.tracking_data || {};
    const raw: any[] = trackingData?.track_activities || [];
    const currentStatus: string = trackingData?.shipment_status || trackingData?.shipment_track?.[0]?.current_status || '';
    const courierName: string = trackingData?.shipment_track?.[0]?.courier_name || '';
    const deliveryDate: string | null = trackingData?.shipment_track?.[0]?.delivered_date || null;

    const events: TrackingEvent[] = raw.map((e: any) => ({
      date: e.date || '',
      activity: e.activity || e.status || '',
      location: e.location || e.city || '',
      status: e['sr-status-label'] || e.status || '',
    }));

    return {
      success: true,
      awb: awb.trim(),
      courierName,
      currentStatus,
      deliveryDate,
      events,
    };
  } catch (err: any) {
    console.error('[Shiprocket] trackShipment error:', err?.message);
    return { success: false, events: [], error: err?.message };
  }
}
