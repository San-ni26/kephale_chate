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
