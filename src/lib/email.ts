import nodemailer from 'nodemailer';

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

/**
 * Send OTP verification email
 */
export async function sendOTPEmail(email: string, otpCode: string, name?: string): Promise<boolean> {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: email,
      subject: 'Code de vérification - Chat Kephale',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); padding: 30px; text-align: center; color: white; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 40px 30px; }
            .otp-code { background: #f1f5f9; border: 2px dashed #3b82f6; border-radius: 8px; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b; margin: 30px 0; }
            .info { color: #64748b; font-size: 14px; line-height: 1.6; }
            .footer { background: #f8fafc; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Chat Kephale</h1>
            </div>
            <div class="content">
              <h2 style="color: #1e293b; margin-top: 0;">Bonjour ${name || 'Utilisateur'},</h2>
              <p style="color: #475569; font-size: 16px;">Votre code de vérification est :</p>
              <div class="otp-code">${otpCode}</div>
              <div class="info">
                <p>⏱️ Ce code est valide pendant <strong>10 minutes</strong>.</p>
                <p>🔒 Ne partagez jamais ce code avec qui que ce soit.</p>
                <p>❓ Si vous n'avez pas demandé ce code, ignorez cet email.</p>
              </div>
            </div>
            <div class="footer">
              <p>&copy; 2024 Chat Kephale - Application de messagerie sécurisée</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending OTP email:', error);

    // Fallback for development: Log OTP to console and allow proceeding
    if (process.env.NODE_ENV !== 'production') {
      console.log('=================================================================');
      console.log('DEV MODE: Email failed. Here is the OTP code for verification:');
      console.log(`OTP CODE: ${otpCode}`);
      console.log('=================================================================');
      return true;
    }

    return false;
  }
}

/**
 * Send welcome email after successful registration
 */
export async function sendWelcomeEmail(email: string, name: string): Promise<boolean> {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: email,
      subject: 'Bienvenue sur Chat Kephale',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); padding: 40px; text-align: center; color: white; }
            .content { padding: 40px 30px; color: #475569; }
            .feature { margin: 20px 0; padding-left: 30px; position: relative; }
            .feature:before { content: '✓'; position: absolute; left: 0; color: #10b981; font-weight: bold; font-size: 20px; }
            .footer { background: #f8fafc; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 28px;">🎉 Bienvenue sur Chat Kephale !</h1>
            </div>
            <div class="content">
              <h2 style="color: #1e293b;">Bonjour ${name},</h2>
              <p>Votre compte a été créé avec succès ! Vous faites maintenant partie de la plateforme de messagerie la plus sécurisée.</p>
              
              <h3 style="color: #1e293b; margin-top: 30px;">🔐 Vos avantages :</h3>
              <div class="feature">Chiffrement de bout en bout pour tous vos messages</div>
              <div class="feature">Vérification d'appareil pour une sécurité maximale</div>
              <div class="feature">Organisations et départements pour le travail d'équipe</div>
              <div class="feature">Partage sécurisé de fichiers (images, PDF, Word)</div>
              <div class="feature">Groupes de discussion privés</div>
              
              <p style="margin-top: 30px;">Connectez-vous dès maintenant et commencez à discuter en toute sécurité !</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/login" style="background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Se connecter</a>
              </div>
            </div>
            <div class="footer">
              <p>&copy; 2024 Chat Kephale - Application de messagerie sécurisée</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return false;
  }
}

/**
 * Send invoice email for invitation creation/update
 */
export async function sendInvoiceEmail(
  email: string,
  name: string,
  orderDetails: {
    title: string;
    type: string;
    date: Date;
    guests: number;
    amount: number;
    paymentMethod: string;
    transactionId: string;
  }
): Promise<boolean> {
  try {
    const formatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' });
    const formattedAmount = formatter.format(orderDetails.amount);
    const formattedDate = new Date(orderDetails.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: email,
      subject: `Facture - Invitation "${orderDetails.title}"`,
      html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
              .header { background: #1e293b; padding: 30px; text-align: center; color: white; }
              .content { padding: 40px 30px; color: #334155; }
              .invoice-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
              .row { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 10px; }
              .row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
              .total { font-weight: bold; font-size: 18px; color: #0f172a; border-top: 2px solid #cbd5e1; padding-top: 15px; margin-top: 10px; }
              .footer { background: #f1f5f9; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; }
              .status-paid { color: #16a34a; font-weight: bold; border: 1px solid #16a34a; padding: 4px 8px; border-radius: 4px; display: inline-block; margin-bottom: 15px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0; font-size: 24px;">Reçu de Paiement</h1>
                <p style="opacity: 0.8; margin: 5px 0 0;">Chat Kephale Invitations</p>
              </div>
              <div class="content">
                <h2 style="margin-top: 0;">Bonjour ${name},</h2>
                <p>Merci pour votre paiement. Voici les détails de votre facture pour la création de votre invitation.</p>
                
                <div style="text-align: center;">
                  <div class="status-paid">PAYÉ</div>
                </div>

                <div class="invoice-box">
                  <div class="row">
                    <span>Transaction ID</span>
                    <strong>${orderDetails.transactionId}</strong>
                  </div>
                  <div class="row">
                    <span>Mode de paiement</span>
                    <strong>${orderDetails.paymentMethod}</strong>
                  </div>
                  <div class="row">
                    <span>Événement</span>
                    <strong>${orderDetails.title} (${orderDetails.type})</strong>
                  </div>
                  <div class="row">
                    <span>Date de l'événement</span>
                    <span>${formattedDate}</span>
                  </div>
                  <div class="row">
                    <span>Invités prévus</span>
                    <span>${orderDetails.guests} pers.</span>
                  </div>
                  <div class="row total">
                    <span>TOTAL PAYÉ</span>
                    <span>${formattedAmount}</span>
                  </div>
                </div>

                <p>Votre invitation est maintenant active et prête à être partagée !</p>
              </div>
              <div class="footer">
                <p>&copy; 2024 Chat Kephale - Facture générée automatiquement</p>
              </div>
            </div>
          </body>
          </html>
        `,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending invoice email:', error);
    return false;
  }
}

/**
 * Send event invitation email (sent from Chat Kephale, on behalf of the organization)
 * L'email est envoyé depuis le système Chat Kephale (SMTP_FROM), pas depuis l'email de l'organisation.
 * Le contenu précise que l'invitation est envoyée au nom de l'organisation.
 */
export async function sendEventInvitationEmail(
  email: string,
  recipientName: string | null,
  organizationName: string,
  eventDetails: {
    title: string;
    description?: string | null;
    eventType: string;
    eventDate: Date;
    maxAttendees: number;
  },
  invitationLink: string
): Promise<boolean> {
  try {
    const formattedDate = new Date(eventDetails.eventDate).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const eventTypeLabels: Record<string, string> = {
      PROFESSIONAL: 'Professionnel',
      DINNER: 'Dîner',
      MEETING: 'Réunion',
      PARTY: 'Soirée',
      CONFERENCE: 'Conférence',
      WORKSHOP: 'Atelier',
      OTHER: 'Autre',
    };
    const typeLabel = eventTypeLabels[eventDetails.eventType] || eventDetails.eventType;

    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: email,
      subject: `Invitation : ${eventDetails.title} – ${organizationName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background-color: #f1f5f9; margin: 0; padding: 0; }
            .container { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
            .header { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 28px 24px; text-align: center; color: #fff; }
            .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
            .badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 20px; font-size: 12px; margin-top: 8px; }
            .content { padding: 28px 24px; color: #334155; }
            .content h2 { color: #0f172a; font-size: 18px; margin: 0 0 12px; }
            .content p { margin: 0 0 12px; line-height: 1.5; font-size: 15px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
            .card-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 14px; }
            .card-row:last-child { margin-bottom: 0; }
            .card-label { color: #64748b; min-width: 100px; }
            .card-value { color: #0f172a; font-weight: 500; }
            .cta { text-align: center; margin: 24px 0 16px; }
            .cta a { display: inline-block; background: #1e293b; color: #fff !important; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; }
            .footer { background: #f8fafc; padding: 16px 24px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📅 Chat Kephale – Invitation à un événement</h1>
              <span class="badge">Envoyé au nom de ${organizationName}</span>
            </div>
            <div class="content">
              <h2>Bonjour ${recipientName || 'Utilisateur'},</h2>
              <p>L'organisation <strong>${organizationName}</strong> vous invite à l'événement suivant via Chat Kephale.</p>
              
              <div class="card">
                <div class="card-row">
                  <span class="card-label">Événement</span>
                  <span class="card-value">${eventDetails.title}</span>
                </div>
                <div class="card-row">
                  <span class="card-label">Type</span>
                  <span class="card-value">${typeLabel}</span>
                </div>
                <div class="card-row">
                  <span class="card-label">Date et heure</span>
                  <span class="card-value">${formattedDate}</span>
                </div>
                <div class="card-row">
                  <span class="card-label">Places</span>
                  <span class="card-value">${eventDetails.maxAttendees} participants</span>
                </div>
                ${eventDetails.description ? `
                <div class="card-row" style="margin-top: 8px;">
                  <span class="card-label">Description</span>
                  <span class="card-value" style="flex:1;">${eventDetails.description}</span>
                </div>
                ` : ''}
              </div>

              <p>Cliquez sur le bouton ci-dessous pour voir l'événement et confirmer votre participation.</p>
              <div class="cta">
                <a href="${invitationLink}">Voir l'événement et répondre</a>
              </div>
              <p style="font-size: 13px; color: #64748b;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><a href="${invitationLink}" style="color: #3b82f6; word-break: break-all;">${invitationLink}</a></p>
            </div>
            <div class="footer">
              <p>Cet email a été envoyé par Chat Kephale au nom de l'organisation. &copy; Chat Kephale</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending event invitation email:', error);
    if (process.env.NODE_ENV !== 'production') {
      console.log('DEV: Event invitation email failed for', email, error);
    }
    return false;
  }
}
