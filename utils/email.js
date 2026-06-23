import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_dev_bypass');
const IS_DEV = process.env.NODE_ENV === 'development' || !process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_placeholder_add_your_resend_key';

export const sendEmail = async ({ to, subject, html }) => {
  if (IS_DEV && (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_placeholder_add_your_resend_key')) {
    console.log(`\n========================================`);
    console.log(`[DEV EMAIL BYPASS]`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${html}`);
    console.log(`========================================\n`);
    return { success: true };
  }
  
  try {
    const { error } = await resend.emails.send({
      from: 'Van Elvina <support@vanelvina.com>',
      to,
      subject,
      html,
    });
    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('Email sending error:', err);
    throw new Error(err.message || 'Failed to send email');
  }
};
