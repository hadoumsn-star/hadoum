import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendResetPasswordEmail(to: string, resetUrl: string) {
    await this.transporter.sendMail({
      from: `"Hadoum" <${process.env.SMTP_USER}>`,
      to,
      subject: 'Réinitialisation de votre mot de passe — Hadoum',
      html: `
        <div style="font-family: Georgia, serif; max-width: 520px; margin: 0 auto; color: #1A1A1A;">
          <div style="background: #1A1A1A; padding: 32px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: #FFFFFF; font-size: 22px; font-weight: 400; margin: 0;">Fondation Hadoum</h1>
            <p style="color: #9CA3AF; font-size: 12px; margin: 8px 0 0;">La maison de l'amour et de la miséricorde</p>
          </div>
          <div style="background: #FFFFFF; padding: 40px 32px; border: 1px solid #E5E7EB; border-top: none;">
            <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 16px;">Réinitialisation de mot de passe</h2>
            <p style="font-size: 14px; color: #374151; line-height: 1.7; margin: 0 0 24px;">
              Vous avez demandé la réinitialisation de votre mot de passe.
              Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.
              Ce lien est valable <strong>1 heure</strong>.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetUrl}"
                style="background: #3E5A78; color: #FFFFFF; padding: 14px 32px; border-radius: 8px;
                       text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
                Réinitialiser mon mot de passe
              </a>
            </div>
            <p style="font-size: 12px; color: #9CA3AF; line-height: 1.6; margin: 24px 0 0;">
              Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.
              Votre mot de passe restera inchangé.<br><br>
              Lien alternatif : <a href="${resetUrl}" style="color: #3E5A78;">${resetUrl}</a>
            </p>
          </div>
          <div style="background: #F9F7F3; padding: 16px 32px; border: 1px solid #E5E7EB; border-top: none;
                      border-radius: 0 0 8px 8px; text-align: center;">
            <p style="font-size: 11px; color: #9CA3AF; margin: 0;">© 2026 Fondation Hadoum · Version 1.0</p>
          </div>
        </div>
      `,
    });

    this.logger.log(`Reset email sent to ${to}`);
  }
}
