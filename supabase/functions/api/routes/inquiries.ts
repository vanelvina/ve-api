import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import { supabase } from '../utils/supabase.ts';
import { toUUID } from '../utils/uuid.ts';
import { authMiddleware } from '../middleware/auth.ts';

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

// GET /api/inquiries — Admin: Retrieve all inquiries
router.get('/', authMiddleware, async (c) => {
  try {
    const { data, error } = await supabase
      .from('inquiries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return c.json((data || []).map(mapInquiry));
  } catch (error: any) {
    console.error('Fetch inquiries error:', error);
    return c.json({ message: 'Server error fetching inquiries.' }, 500);
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
