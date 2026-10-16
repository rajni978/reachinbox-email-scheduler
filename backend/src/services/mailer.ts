import nodemailer, { Transporter } from 'nodemailer';

export interface SendMailOptions {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  body: string;
}

export interface SendMailResult {
  messageId: string;
  etherealUrl: string | null;
  accepted: string[];
  rejected: string[];
}

export class MailerService {
  private static transporters = new Map<string, Transporter>();

  /**
   * Retrieves or creates a cached Nodemailer transporter for a sender
   */
  static getTransporter(host: string, port: number, secure: boolean, user: string, pass: string): Transporter {
    const key = `${user}@${host}:${port}`;
    if (!this.transporters.has(key)) {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
      });

      this.transporters.set(key, transporter);
    }
    return this.transporters.get(key)!;
  }

  /**
   * Generates a real Ethereal test account
   */
  static async createEtherealAccount() {
    const testAccount = await nodemailer.createTestAccount();
    return {
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      user: testAccount.user,
      pass: testAccount.pass,
      webUrl: 'https://ethereal.email',
    };
  }

  /**
   * Sends an email via Nodemailer and extracts Ethereal preview URL if applicable
   */
  static async sendEmail(options: SendMailOptions): Promise<SendMailResult> {
    const transporter = this.getTransporter(
      options.host,
      options.port,
      options.secure,
      options.user,
      options.pass
    );

    const info = await transporter.sendMail({
      from: options.from,
      to: options.to,
      subject: options.subject,
      text: options.body,
      html: `<div style="font-family: sans-serif; line-height: 1.6; color: #333; padding: 20px;">
        <h2>${options.subject}</h2>
        <div style="white-space: pre-wrap;">${options.body}</div>
        <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;" />
        <p style="font-size: 12px; color: #999;">Sent by ReachInbox Email Scheduler</p>
      </div>`,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    const etherealUrl = previewUrl ? previewUrl.toString() : null;

    return {
      messageId: info.messageId,
      etherealUrl,
      accepted: (info.accepted as string[]) || [],
      rejected: (info.rejected as string[]) || [],
    };
  }
}
