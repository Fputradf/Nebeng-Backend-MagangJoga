import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { randomBytes } from 'node:crypto';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com',
      port: Number(this.configService.get<string>('SMTP_PORT')) || 587,
      secure: this.configService.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
      tls: {
        // Hanya nonaktifkan untuk dev/sandbox dengan self-signed cert.
        rejectUnauthorized:
          this.configService.get<string>('SMTP_REJECT_UNAUTHORIZED') !==
          'false',
      },
    });
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    const { to, subject, html, from } = options;
    this.logger.log(`Mengirim email ke ${to}: ${subject}`);

    const mailOptions = {
      from:
        from || `Nebeng App <${this.configService.get<string>('SMTP_FROM')}>`,
      to,
      subject,
      html,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email terkirim, messageId: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`Gagal mengirim email ke ${to}: ${error.message}`);
      throw error;
    }
  }

  async sendResetPasswordOtp(
    email: string,
    otp: string,
    expiryMinutes: number,
  ): Promise<void> {
    await this.sendMail({
      to: email,
      subject: 'Kode OTP Reset Kata Sandi – Nebeng',
      html: `
        <html>
          <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background: #f5f5f5; padding: 40px 0;">
              <tr>
                <td align="center">
                  <table width="480" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08);">
                    <tr>
                      <td style="background: #10367D; padding: 28px 32px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: -0.3px;">Nebeng</h1>
                        <p style="color: rgba(255,255,255,0.75); margin: 4px 0 0; font-size: 13px;">Reset Kata Sandi</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 36px 32px;">
                        <p style="color: #333; font-size: 15px; margin: 0 0 16px;">Halo,</p>
                        <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
                          Kami menerima permintaan untuk mereset kata sandi akun Anda.
                          Gunakan kode OTP berikut untuk melanjutkan:
                        </p>

                        <div style="background: #f0f4ff; border: 2px dashed #10367D; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 24px;">
                          <p style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Kode OTP Anda</p>
                          <p style="color: #10367D; font-size: 40px; font-weight: bold; letter-spacing: 12px; margin: 0; font-family: 'Courier New', monospace;">${otp}</p>
                        </div>

                        <p style="color: #888; font-size: 13px; margin: 0 0 24px; text-align: center;">
                          Kode ini berlaku selama <strong>${expiryMinutes} menit</strong>.
                          Jangan bagikan kode ini kepada siapapun.
                        </p>

                        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />

                        <p style="color: #aaa; font-size: 12px; margin: 0; line-height: 1.6;">
                          Jika Anda tidak meminta reset kata sandi, abaikan email ini.
                          Akun Anda tetap aman.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="background: #f9f9f9; padding: 16px 32px; text-align: center;">
                        <p style="color: #bbb; font-size: 11px; margin: 0;">
                          © ${new Date().getFullYear()} Nebeng. Semua hak dilindungi.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });
  }

  async sendResetPasswordLink(email: string, token: string): Promise<void> {
    const resetUrl = this.configService.get<string>('FRONTEND_URL');
    if (!resetUrl) {
      throw new Error(
        'FRONTEND_URL belum dikonfigurasi. Pastikan variabel lingkungan tersedia.',
      );
    }
    const resetLink = `${resetUrl}/reset-password?token=${token}`;

    await this.sendMail({
      to: email,
      subject: 'Reset Kata Sandi',
      html: `
        <html>
          <body style="font-family: sans-serif; line-height: 1.6; color: #333;">
            <p>Halo,</p>
            <p>Kami menerima permintaan untuk mereset kata sandi akun Anda.</p>
            <p>Klik tombol berikut untuk melanjutkan:</p>
            <p style="text-align: center;">
              <a
                href="${resetLink}"
                style="display: inline-block; padding: 10px 20px; background: #007aff; color: #fff; text-decoration: none; border-radius: 6px;"
              >
                Reset Kata Sandi
              </a>
            </p>
            <p>Jika Anda tidak meminta reset, abaikan email ini.</p>
            <p>Token ini berlaku selama ${
              this.configService.get<string>('PASSWORD_RESET_EXPIRY_MINUTES') ||
              30
            } menit.</p>
          </body>
        </html>
      `,
    });
  }

  static generateResetToken(): string {
    return randomBytes(32).toString('hex');
  }

  static generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
