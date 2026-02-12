import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendVerificationEmail(
  email: string,
  code: string,
  displayName: string
): Promise<void> {
  const emailFrom = process.env.EMAIL_FROM || 'Verarta <noreply@verarta.com>';

  await transporter.sendMail({
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
