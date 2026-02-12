import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendVerificationEmail(
  email: string,
  code: string,
  displayName: string
): Promise<void> {
  // In DEV_MODE, skip sending email (user will use bypass code 414155)
  if (process.env.DEV_MODE === 'true') {
    console.log(`[DEV_MODE] Skipping email send to ${email}, code: ${code}`);
    return;
  }

  const emailFrom = process.env.EMAIL_FROM || 'Verarta <noreply@verarta.com>';
  const mailer = getTransporter();

  await mailer.sendMail({
    from: emailFrom,
    to: email,
    subject: 'Verify your Verarta account',
    html: `
      <h2>Welcome to Verarta, ${displayName}!</h2>
      <p>Your verification code is: <strong style="font-size: 24px;">${code}</strong></p>
      <p>This code expires in 15 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `,
  });
}
