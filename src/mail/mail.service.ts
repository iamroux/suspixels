import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('mail.host'),
      port: this.configService.get<number>('mail.port'),
      secure: this.configService.get<boolean>('mail.secure'),
      // force IPv4 — Render's network can't reach Gmail over IPv6
      family: 4,
      auth: {
        user: this.configService.get<string>('mail.user'),
        pass: this.configService.get<string>('mail.password'),
      },
    } as any);
  }

  /** Raw send — html is used as-is, no template wrapper. */
  async sendMail(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({
      from: `"Suspixels" <${this.configService.get<string>('mail.user')}>`,
      to,
      subject,
      html,
    });
  }

  /** Wraps content in the global retro theme, then sends. Use for all user-facing emails. */
  async sendStyledMail(to: string, subject: string, content: string): Promise<void> {
    await this.sendMail(to, subject, wrapInTemplate(content));
  }

  async sendWelcomeEmail(to: string): Promise<void> {
    await this.sendStyledMail(to, 'Welcome to Suspixels! 🎨', welcomeContent());
  }

  async sendBulk(
    emails: string[],
    subject: string,
    content: string,
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    const results = await Promise.allSettled(
      emails.map((email) => this.sendStyledMail(email, subject, content)),
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        sent++;
      } else {
        failed++;
        this.logger.error(`Failed to send to ${emails[index]}: ${result.reason}`);
      }
    });

    return { sent, failed };
  }
}

/**
 * Global email shell — dark retro theme matching the Suspixels frontend.
 * Pass any inner HTML as `content`; header + footer are added automatically.
 * All future email types should go through this wrapper.
 */
function wrapInTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#0f0f1a;font-family:'Courier New',Courier,monospace;color:#e0e0ff;">

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
         style="background-color:#0f0f1a;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" width="560" cellspacing="0" cellpadding="0"
               style="max-width:560px;width:100%;background-color:#12122a;
                      border:2px solid #6c63ff;
                      box-shadow:4px 4px 0 #6c63ff,-4px -4px 0 #6c63ff,
                                 4px -4px 0 #6c63ff,-4px 4px 0 #6c63ff;">

          <!-- ── HEADER ── -->
          <tr>
            <td style="padding:28px 32px 20px;text-align:center;
                        background-color:#0f0f2a;border-bottom:2px solid #6c63ff;">
              <div style="display:inline-block;margin-bottom:10px;">
                <span style="display:inline-block;width:10px;height:10px;background:#6c63ff;margin:1px;"></span>
                <span style="display:inline-block;width:10px;height:10px;background:#ff6584;margin:1px;"></span>
                <span style="display:inline-block;width:10px;height:10px;background:#43e97b;margin:1px;"></span>
                <span style="display:inline-block;width:10px;height:10px;background:#f7c948;margin:1px;"></span>
                <span style="display:inline-block;width:10px;height:10px;background:#6c63ff;margin:1px;"></span>
              </div>
              <h1 style="margin:0;font-size:24px;letter-spacing:4px;
                          color:#6c63ff;text-transform:uppercase;
                          text-shadow:2px 2px 0 #ff6584;">SUSPIXELS</h1>
              <p style="margin:6px 0 0;font-size:10px;letter-spacing:2px;
                         color:#8080cc;text-transform:uppercase;">
                pixel canvas &bull; online now
              </p>
            </td>
          </tr>

          <!-- ── BODY (injected content) ── -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>

          <!-- ── FOOTER ── -->
          <tr>
            <td style="padding:16px 32px;text-align:center;
                        background-color:#0a0a18;border-top:2px solid #2a2a4a;">
              <p style="margin:0;font-size:10px;color:#3a3a6a;letter-spacing:1px;">
                You received this from Suspixels.
                &copy; ${new Date().getFullYear()} Suspixels.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

/** Inner content for the welcome / onboarding email. */
function welcomeContent(): string {
  return `
    <h2 style="margin:0 0 16px;font-size:18px;color:#e0e0ff;
                letter-spacing:2px;text-transform:uppercase;
                border-left:4px solid #6c63ff;padding-left:12px;">
      Welcome aboard, pixel artist!
    </h2>

    <p style="margin:0 0 16px;font-size:14px;line-height:1.8;color:#b0b0dd;">
      Your account is live. You are now part of a collaborative,
      ever-growing pixel canvas shared with artists from all over the world.
    </p>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;">
      <tr>
        <td style="height:2px;background:repeating-linear-gradient(
            to right,#6c63ff 0,#6c63ff 8px,transparent 8px,transparent 12px);"></td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td style="padding:10px 12px;background-color:#1a1a3a;border-left:3px solid #6c63ff;">
          <span style="color:#6c63ff;font-size:13px;">&#9632;</span>
          <span style="font-size:13px;color:#c0c0ee;margin-left:8px;">Place pixels on a shared 3000&times;3000 canvas</span>
        </td>
      </tr>
      <tr><td style="height:6px;"></td></tr>
      <tr>
        <td style="padding:10px 12px;background-color:#1a1a3a;border-left:3px solid #ff6584;">
          <span style="color:#ff6584;font-size:13px;">&#9632;</span>
          <span style="font-size:13px;color:#c0c0ee;margin-left:8px;">See other players paint in real time</span>
        </td>
      </tr>
      <tr><td style="height:6px;"></td></tr>
      <tr>
        <td style="padding:10px 12px;background-color:#1a1a3a;border-left:3px solid #43e97b;">
          <span style="color:#43e97b;font-size:13px;">&#9632;</span>
          <span style="font-size:13px;color:#c0c0ee;margin-left:8px;">Save and reuse your favourite colour palettes</span>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;">
      <tr>
        <td style="height:2px;background:repeating-linear-gradient(
            to right,#6c63ff 0,#6c63ff 8px,transparent 8px,transparent 12px);"></td>
      </tr>
    </table>

    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto;">
      <tr>
        <td style="background-color:#6c63ff;box-shadow:4px 4px 0 #3d3799;text-align:center;">
          <a href="https://suspixels.onrender.com"
             style="display:inline-block;padding:14px 32px;
                     font-family:'Courier New',Courier,monospace;
                     font-size:14px;font-weight:bold;
                     letter-spacing:2px;text-transform:uppercase;
                     color:#ffffff;text-decoration:none;">
            &#9654; Start Painting
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:24px 0 0;font-size:11px;color:#5050aa;text-align:center;letter-spacing:1px;">
      Happy painting &mdash; the Suspixels team
    </p>
  `;
}
