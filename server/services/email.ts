/**
 * Email Service — AIRank
 *
 * Reads credentials from system_settings (DB) with env-var fallback.
 * Supports AWS SES SMTP and generic SMTP.
 * Provides branded HTML templates for all transactional emails.
 */

import nodemailer from "nodemailer";
import { storage } from "../storage";
import { logger } from "../lib/logger";

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

interface EmailConfig {
  provider: "ses" | "smtp" | "none";
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

async function getEmailConfig(): Promise<EmailConfig> {
  const settings = await storage.getAllSystemSettings();
  const get = (key: string) => settings.find((s) => s.key === key)?.value ?? "";

  const provider = (get("email_provider") || process.env.EMAIL_PROVIDER || "smtp") as "ses" | "smtp";

  if (provider === "ses") {
    const host = get("ses_smtp_host") || process.env.SES_SMTP_HOST || `email-smtp.ap-south-1.amazonaws.com`;
    const port = parseInt(get("ses_smtp_port") || process.env.SES_SMTP_PORT || "587");
    const user = get("ses_smtp_user") || process.env.SES_SMTP_USER || "";
    const pass = get("ses_smtp_pass") || process.env.SES_SMTP_PASS || "";
    const from = get("ses_from_email") || process.env.SES_FROM_EMAIL || "noreply@airank.io";

    if (!user || !pass) return { provider: "none", host, port, user, pass, from };
    return { provider: "ses", host, port, user, pass, from };
  }

  // SMTP
  const host = get("smtp_host") || process.env.SMTP_HOST || "";
  const port = parseInt(get("smtp_port") || process.env.SMTP_PORT || "587");
  const user = get("smtp_user") || process.env.SMTP_USER || "";
  const pass = get("smtp_pass") || process.env.SMTP_PASS || "";
  const from = get("smtp_from") || process.env.SMTP_FROM || "noreply@airank.io";

  if (!host || !user || !pass) return { provider: "none", host, port, user, pass, from };
  return { provider: "smtp", host, port, user, pass, from };
}

function createTransporter(cfg: EmailConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

// ---------------------------------------------------------------------------
// Core send function
// ---------------------------------------------------------------------------

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: EmailAttachment[],
): Promise<void> {
  const cfg = await getEmailConfig();

  if (cfg.provider === "none") {
    const otpMatch = html.match(/<strong>(\d{6})<\/strong>/);
    const otp = otpMatch ? otpMatch[1] : "N/A";
    logger.warn(`Email not sent (no provider configured). To: ${to} | Subject: ${subject} | OTP: ${otp}`);
    console.log(`\n📧 EMAIL (not sent):\nTo: ${to}\nSubject: ${subject}\nOTP: ${otp}\n`);
    return;
  }

  const transporter = createTransporter(cfg);
  await transporter.sendMail({ from: cfg.from, to, subject, html, attachments });
  logger.info(`Email sent via ${cfg.provider}`, { to, subject, attachments: attachments?.length ?? 0 });
}

// ---------------------------------------------------------------------------
// Base layout
// ---------------------------------------------------------------------------

function baseLayout(content: string, preheader = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AIRank</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Inter,Helvetica,Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f4f7fb;">${preheader}</div>` : ""}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e40af,#0ea5e9);padding:28px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                    AIR<span style="color:#7dd3fc;">ank</span>
                  </span>
                  <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.75);">AI Brand Visibility</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
              © ${new Date().getFullYear()} AIRank · <a href="https://airank.io" style="color:#0ea5e9;text-decoration:none;">airank.io</a>
              <br/>You're receiving this email because you signed up for AIRank.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function heading(text: string) {
  return `<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f172a;">${text}</h1>`;
}

function subtext(text: string) {
  return `<p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.6;">${text}</p>`;
}

function otpBox(code: string) {
  return `
  <div style="text-align:center;margin:32px 0;">
    <div style="display:inline-block;background:#f0f9ff;border:2px dashed #0ea5e9;border-radius:12px;padding:20px 48px;">
      <p style="margin:0 0 4px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Verification Code</p>
      <p style="margin:0;font-size:40px;font-weight:800;letter-spacing:8px;color:#1e40af;">${code}</p>
      <p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">Expires in 10 minutes</p>
    </div>
  </div>`;
}

function ctaButton(text: string, url: string) {
  return `
  <div style="text-align:center;margin:32px 0;">
    <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#1e40af,#0ea5e9);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.2px;">${text}</a>
  </div>`;
}

function planCard(plan: { name: string; price: number; features: string[] }) {
  const featureList = plan.features.map(f => `<li style="padding:4px 0;color:#475569;font-size:14px;">✓ &nbsp;${f}</li>`).join("");
  return `
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:24px;margin:24px 0;">
    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#0ea5e9;text-transform:uppercase;letter-spacing:1px;">Upgrade to</p>
    <h3 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#1e40af;">${plan.name}</h3>
    <p style="margin:0 0 16px;font-size:24px;font-weight:800;color:#0f172a;">₹${plan.price}<span style="font-size:14px;font-weight:400;color:#64748b;">/month</span></p>
    <ul style="margin:0;padding:0 0 0 4px;list-style:none;">${featureList}</ul>
  </div>`;
}

// ---------------------------------------------------------------------------
// 1. Verify Email
// ---------------------------------------------------------------------------

export async function sendVerifyEmail(to: string, firstName: string, otp: string): Promise<void> {
  const content = `
    ${heading(`Welcome to AIRank, ${firstName || "there"}! 👋`)}
    ${subtext("You're almost there. Use the code below to verify your email address and complete your registration.")}
    ${otpBox(otp)}
    <p style="font-size:13px;color:#94a3b8;text-align:center;">If you didn't create an AIRank account, you can safely ignore this email.</p>
  `;
  await sendEmail(to, "Verify your AIRank account", baseLayout(content, "Your verification code is inside"));
}

// ---------------------------------------------------------------------------
// 2. Onboarding Complete
// ---------------------------------------------------------------------------

export async function sendOnboardingComplete(to: string, firstName: string, brandName: string): Promise<void> {
  const content = `
    ${heading(`Your AIRank is ready, ${firstName || "there"}! 🎉`)}
    ${subtext(`We've finished analysing <strong>${brandName}</strong> across all major AI platforms — ChatGPT, Claude, Gemini, and Perplexity.`)}
    <div style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:6px;padding:16px 20px;margin:0 0 24px;">
      <p style="margin:0;font-size:14px;color:#166534;font-weight:600;">✅ Analysis complete</p>
      <p style="margin:4px 0 0;font-size:13px;color:#15803d;">Your AI visibility score, competitor benchmarks, and recommendations are ready to view.</p>
    </div>
    ${ctaButton("View My AIRank Dashboard", "https://airank.io/app/dashboard")}
    ${subtext("Dive into your visibility score, see where competitors outrank you, and discover actionable steps to improve your AI presence.")}
  `;
  await sendEmail(to, `Your AIRank is ready — ${brandName}`, baseLayout(content, "Your AI visibility analysis is complete"));
}

// ---------------------------------------------------------------------------
// 3. Reset Password
// ---------------------------------------------------------------------------

export async function sendResetPasswordEmail(to: string, firstName: string, otp: string): Promise<void> {
  const content = `
    ${heading("Reset your password")}
    ${subtext(`Hi ${firstName || "there"}, we received a request to reset your AIRank password. Use the code below to continue.`)}
    ${otpBox(otp)}
    <div style="background:#fff7ed;border-left:4px solid #f97316;border-radius:6px;padding:16px 20px;margin:0 0 24px;">
      <p style="margin:0;font-size:13px;color:#9a3412;"><strong>Didn't request this?</strong> Your account is safe — simply ignore this email and your password won't change.</p>
    </div>
  `;
  await sendEmail(to, "Reset your AIRank password", baseLayout(content, "Your password reset code is inside"));
}

// ---------------------------------------------------------------------------
// 4. Analysis Runs Complete
// ---------------------------------------------------------------------------

export async function sendAnalysisReady(to: string, firstName: string, brandName: string): Promise<void> {
  const content = `
    ${heading(`New analysis ready — ${brandName}`)}
    ${subtext(`Hi ${firstName || "there"}, your latest AI visibility analysis for <strong>${brandName}</strong> has just completed.`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      ${[
        ["AI Platforms Analysed", "ChatGPT, Claude, Gemini, Perplexity"],
        ["Status", "✅ Complete"],
      ].map(([label, val]) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">${label}</td>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">${val}</td>
        </tr>`).join("")}
    </table>
    ${ctaButton("View Analysis Results", "https://airank.io/app/dashboard")}
  `;
  await sendEmail(to, `Analysis complete — ${brandName}`, baseLayout(content, "Your latest AI visibility data is ready"));
}

// ---------------------------------------------------------------------------
// 5. Payment Confirmation
// ---------------------------------------------------------------------------

export async function sendPaymentConfirmation(
  to: string,
  firstName: string,
  amount: number,
  currency: string,
  planName: string,
  paymentId: string,
): Promise<void> {
  const formatted = new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount / 100);
  const content = `
    ${heading("Payment confirmed ✅")}
    ${subtext(`Hi ${firstName || "there"}, thank you! Your payment has been received and your <strong>${planName}</strong> plan is now active.`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f8fafc;border-radius:8px;overflow:hidden;">
      ${[
        ["Plan", planName],
        ["Amount paid", formatted],
        ["Payment ID", paymentId],
        ["Status", "✅ Successful"],
      ].map(([label, val]) => `
        <tr>
          <td style="padding:12px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">${label}</td>
          <td style="padding:12px 16px;font-size:13px;color:#0f172a;font-weight:600;text-align:right;border-bottom:1px solid #e2e8f0;">${val}</td>
        </tr>`).join("")}
    </table>
    ${ctaButton("Go to Dashboard", "https://airank.io/app/dashboard")}
  `;
  await sendEmail(to, "Payment confirmed — AIRank", baseLayout(content, `Payment of ${formatted} confirmed`));
}

// ---------------------------------------------------------------------------
// 6. Payment Failed
// ---------------------------------------------------------------------------

export async function sendPaymentFailed(
  to: string,
  firstName: string,
  amount: number,
  currency: string,
  planName: string,
  reason?: string,
): Promise<void> {
  const formatted = new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount / 100);
  const content = `
    ${heading("Payment failed ⚠️")}
    ${subtext(`Hi ${firstName || "there"}, unfortunately your payment of <strong>${formatted}</strong> for the <strong>${planName}</strong> plan was unsuccessful.`)}
    ${reason ? `<div style="background:#fff1f2;border-left:4px solid #f43f5e;border-radius:6px;padding:16px 20px;margin:0 0 24px;"><p style="margin:0;font-size:13px;color:#9f1239;"><strong>Reason:</strong> ${reason}</p></div>` : ""}
    <p style="font-size:14px;color:#475569;line-height:1.7;">Please check your payment details and try again. If the issue persists, contact your bank or reach out to our support team.</p>
    ${ctaButton("Retry Payment", "https://airank.io/app/settings")}
  `;
  await sendEmail(to, "Payment failed — AIRank", baseLayout(content, "Your recent payment did not go through"));
}

// ---------------------------------------------------------------------------
// 7. Team invite with credentials
// ---------------------------------------------------------------------------

export async function sendTeamInviteCredentials(
  to: string,
  invitedByName: string,
  brandName: string,
  temporaryPassword: string,
): Promise<void> {
  const inviter = invitedByName?.trim() || "Your admin";
  const content = `
    ${heading(`You've been added to ${brandName}`)}
    ${subtext(`${inviter} added you as a team member in AIRank. Use these credentials to sign in directly to the dashboard.`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f8fafc;border-radius:8px;overflow:hidden;">
      ${[
        ["Email", to],
        ["Temporary password", temporaryPassword],
        ["Brand", brandName],
      ].map(([label, val]) => `
        <tr>
          <td style="padding:12px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">${label}</td>
          <td style="padding:12px 16px;font-size:13px;color:#0f172a;font-weight:600;text-align:right;border-bottom:1px solid #e2e8f0;">${val}</td>
        </tr>`).join("")}
    </table>
    ${ctaButton("Sign in to AIRank", "https://airank.io/auth/sign-in")}
  `;
  await sendEmail(to, `You're invited to ${brandName} on AIRank`, baseLayout(content, "Your team access credentials are inside"));
}

// ---------------------------------------------------------------------------
// 8. Admin broadcast (custom subject + body + optional plan CTA)
// ---------------------------------------------------------------------------

export async function sendAdminBroadcast(
  to: string,
  subject: string,
  body: string,
  attachedPlan?: { name: string; price: number; features: string[] },
): Promise<void> {
  const bodyHtml = body
    .split("\n")
    .map((line) => `<p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.7;">${line || "&nbsp;"}</p>`)
    .join("");

  const content = `
    ${bodyHtml}
    ${attachedPlan ? planCard(attachedPlan) : ""}
    ${attachedPlan ? ctaButton(`Upgrade to ${attachedPlan.name}`, "https://airank.io/app/settings") : ""}
  `;
  await sendEmail(to, subject, baseLayout(content));
}
