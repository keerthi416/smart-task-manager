const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host: host,
      port: port,
      secure: port === 465,
      auth: { user, pass }
    });
    console.log(`[Mailer] Configured custom SMTP transporter (${host}:${port})`);
  } else {
    try {
      console.log('[Mailer] No custom SMTP credentials found in .env. Creating Ethereal Test Account...');
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log(`[Mailer] Ethereal Test SMTP Account active: ${testAccount.user}`);
    } catch (err) {
      console.error('[Mailer] Failed to create Ethereal test account, falling back to JSON transport:', err.message);
      transporter = nodemailer.createTransport({ jsonTransport: true });
    }
  }

  return transporter;
}

/**
 * Sends an email using Nodemailer
 * @param {Object} opts { to, subject, text, html }
 */
async function sendEmail({ to, subject, text, html }) {
  try {
    const mailer = await getTransporter();
    const fromAddress = process.env.SMTP_FROM || '"Smart Task Manager" <notifications@smarttaskmanager.com>';

    const info = await mailer.sendMail({
      from: fromAddress,
      to: to,
      subject: subject,
      text: text,
      html: html || `<div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">${text.replace(/\n/g, '<br>')}</div>`
    });

    console.log(`\n==============================================`);
    console.log(`[EMAIL DISPATCH SUCCESS]`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`MessageID: ${info.messageId}`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`Preview URL: ${previewUrl}`);
    }
    console.log(`==============================================\n`);

    return { success: true, messageId: info.messageId, previewUrl: previewUrl || null };
  } catch (err) {
    console.error(`[EMAIL DISPATCH FAILED] To: ${to} | Error:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendEmail
};
