import { Resend } from 'npm:resend';

const resend = new Resend(Deno.env.get('RESEND_API_KEY') || 're_dummy_key_for_dev_bypass');
const IS_DEV = Deno.env.get('NODE_ENV') === 'development' || !Deno.env.get('RESEND_API_KEY') || Deno.env.get('RESEND_API_KEY') === 're_placeholder_add_your_resend_key';

export const sendEmail = async ({ to, subject, html }: { to: string; subject: string; html: string }) => {
  if (IS_DEV && (!Deno.env.get('RESEND_API_KEY') || Deno.env.get('RESEND_API_KEY') === 're_placeholder_add_your_resend_key')) {
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
  } catch (err: any) {
    console.error('Email sending error:', err);
    throw new Error(err.message || 'Failed to send email');
  }
};
