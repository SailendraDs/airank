/**
 * Invoice PDF Generator
 * 
 * Generates professional PDF invoices for subscriptions and payments
 * Uses PDFKit for PDF generation
 */

import PDFDocument from 'pdfkit';
import { storage } from '../storage';
import type { Invoice, Brand, Subscription } from '@shared/schema';
import fs from 'fs';
import path from 'path';

function resolvePublicAssetPath(assetUrl: string): string | null {
  if (!assetUrl || !assetUrl.startsWith("/")) return null;

  const cleanPath = assetUrl.split("?")[0].split("#")[0];
  const relativePath = cleanPath.replace(/^\/+/g, "");

  const candidates = [
    path.resolve(process.cwd(), "dist/public", relativePath),
    path.resolve(process.cwd(), "client/public", relativePath),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

interface InvoiceData {
  invoice: Invoice;
  brand: Brand;
  subscription?: Subscription;
  companyInfo: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    email: string;
    phone: string;
    gst?: string;
    gstEnabled?: boolean;
  };
}

/**
 * Format currency in INR
 */
function formatCurrency(amountPaise: number): string {
  const amountInr = amountPaise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amountInr);
}

/**
 * Format date
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

async function getInvoiceCompanyInfo() {
  const get = async (key: string, fallback: string): Promise<string> => {
    const val = await storage.getSystemSetting(key);
    const normalized = (val || '').trim();
    return normalized || fallback;
  };

  const gstEnabledRaw = (await storage.getSystemSetting('invoice_gst_enabled')) || 'false';
  const gstEnabled = gstEnabledRaw === 'true';

  const gst = gstEnabled ? await get('invoice_company_gst', '') : '';

  return {
    name: await get('invoice_company_name', 'AIRank'),
    address: await get('invoice_company_address', '123 Tech Park, Electronic City'),
    city: await get('invoice_company_city', 'Bangalore'),
    state: await get('invoice_company_state', 'Karnataka'),
    zip: await get('invoice_company_zip', '560100'),
    country: await get('invoice_company_country', 'India'),
    email: await get('invoice_company_email', 'billing@airank.io'),
    phone: await get('invoice_company_phone', '+91-80-12345678'),
    gst,
    gstEnabled,
  };
}

/**
 * Generate invoice PDF
 */
export async function generateInvoicePDF(invoiceId: string): Promise<Buffer> {
  // Fetch invoice data
  const invoice = await storage.getInvoice(invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  const brand = await storage.getBrand(invoice.brandId);
  if (!brand) {
    throw new Error('Brand not found');
  }

  const subscription = invoice.subscriptionId 
    ? await storage.getSubscription(invoice.subscriptionId)
    : undefined;

  const companyInfo = await getInvoiceCompanyInfo();
  const siteLogoUrl = (await storage.getSystemSetting("site_logo_url")) || "/logo.png";
  const siteLogoPath = resolvePublicAssetPath(siteLogoUrl);

  const data: InvoiceData = {
    invoice,
    brand,
    subscription,
    companyInfo,
  };

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('INVOICE', 50, 50);

      if (siteLogoPath) {
        try {
          doc.image(siteLogoPath, 400, 45, { fit: [140, 60], align: 'right' });
        } catch {
          // Non-fatal: keep generating invoice even if logo image fails.
        }
      }

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(companyInfo.name, 50, 80)
        .text(companyInfo.address, 50, 95)
        .text(`${companyInfo.city}, ${companyInfo.state} ${companyInfo.zip}`, 50, 110)
        .text(companyInfo.country, 50, 125)
        .text(`Email: ${companyInfo.email}`, 50, 140)
        .text(`Phone: ${companyInfo.phone}`, 50, 155);

      if (companyInfo.gst) {
        doc.text(`GST: ${companyInfo.gst}`, 50, 170);
      }

      // Invoice details (right side)
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Invoice Number:', 350, 80)
        .font('Helvetica')
        .text((invoice.invoiceNumber || invoice.id.slice(0, 12).toUpperCase()), 460, 80);

      doc
        .font('Helvetica-Bold')
        .text('Invoice Date:', 350, 95)
        .font('Helvetica')
        .text(formatDate(invoice.createdAt || new Date()), 460, 95);

      if (invoice.paidAt) {
        doc
          .font('Helvetica-Bold')
          .text('Payment Date:', 350, 110)
          .font('Helvetica')
          .text(formatDate(invoice.paidAt), 460, 110);
      }

      doc
        .font('Helvetica-Bold')
        .text('Status:', 350, 125)
        .font('Helvetica')
        .fillColor(invoice.status === 'paid' ? 'green' : 'red')
        .text(invoice.status.toUpperCase(), 460, 125)
        .fillColor('black');

      // Bill to section
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('BILL TO:', 50, 210);

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(brand.name, 50, 230)
        .text(brand.domain, 50, 245);

      // Horizontal line
      doc
        .moveTo(50, 280)
        .lineTo(550, 280)
        .stroke();

      // Table header
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Description', 50, 300)
        .text('Period', 250, 300)
        .text('Amount', 450, 300, { align: 'right' });

      // Horizontal line
      doc
        .moveTo(50, 320)
        .lineTo(550, 320)
        .stroke();

      // Table content
      const description = subscription 
        ? `AIRank ${subscription.planId.charAt(0).toUpperCase() + subscription.planId.slice(1)} Plan`
        : 'AIRank Service';

      const period = subscription
        ? `${formatDate(subscription.currentPeriodStart)} - ${formatDate(subscription.currentPeriodEnd)}`
        : formatDate(invoice.createdAt || new Date());

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(description, 50, 340)
        .text(period, 250, 340)
        .text(formatCurrency(invoice.amount), 450, 340, { align: 'right' });

      // Horizontal line
      doc
        .moveTo(50, 370)
        .lineTo(550, 370)
        .stroke();

      // Subtotal
      const subtotal = invoice.amount;
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Subtotal:', 350, 390)
        .text(formatCurrency(subtotal), 450, 390, { align: 'right' });

      // GST (optional)
      const gstAmount = companyInfo.gstEnabled ? Math.round(subtotal * 0.18) : 0;
      if (companyInfo.gstEnabled) {
        doc
          .text('GST (18%):', 350, 410)
          .text(formatCurrency(gstAmount), 450, 410, { align: 'right' });
      }

      // Total
      const total = subtotal + gstAmount;
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('TOTAL:', 350, 440)
        .text(formatCurrency(total), 450, 440, { align: 'right' });

      // Payment info
      if (invoice.razorpayPaymentId) {
        doc
          .fontSize(9)
          .font('Helvetica')
          .text('Payment ID:', 50, 500)
          .text(invoice.razorpayPaymentId, 120, 500);
      }

      if (invoice.razorpayInvoiceId) {
        doc
          .text('Razorpay Invoice ID:', 50, 515)
          .text(invoice.razorpayInvoiceId, 150, 515);
      }

      // Footer
      doc
        .fontSize(8)
        .font('Helvetica')
        .text('Thank you for your business!', 50, 700, { align: 'center' })
        .text('This is a computer-generated invoice and does not require a signature.', 50, 715, { align: 'center' });

      // Finalize PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Save invoice PDF to file system
 */
export async function saveInvoicePDF(invoiceId: string, outputPath?: string): Promise<string> {
  const pdfBuffer = await generateInvoicePDF(invoiceId);
  
  const defaultPath = path.join(process.cwd(), 'invoices', `${invoiceId}.pdf`);
  const filePath = outputPath || defaultPath;

  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write file
  fs.writeFileSync(filePath, pdfBuffer);

  console.log(`[Invoice] PDF saved: ${filePath}`);
  return filePath;
}

/**
 * Email invoice PDF to customer
 */
export async function emailInvoicePDF(invoiceId: string, recipientEmail: string): Promise<void> {
  const pdfBuffer = await generateInvoicePDF(invoiceId);
  const invoice = await storage.getInvoice(invoiceId);
  
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
  // For now, just log
  console.log(`[Invoice] Would email PDF to ${recipientEmail}`);
  console.log(`[Invoice] PDF size: ${pdfBuffer.length} bytes`);

  // Example integration with nodemailer:
  /*
  const transporter = nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: 'billing@airank.io',
    to: recipientEmail,
    subject: `Invoice ${invoice.id.slice(0, 12).toUpperCase()}`,
    text: `Please find attached your invoice for AIRank services.`,
    html: `<p>Please find attached your invoice for AIRank services.</p>`,
    attachments: [
      {
        filename: `invoice-${invoice.id}.pdf`,
        content: pdfBuffer,
      },
    ],
  });
  */
}

/**
 * Generate invoice on subscription charge
 */
export async function generateInvoiceForSubscription(
  brandId: string,
  subscriptionId: string,
  amount: number,
  razorpayPaymentId?: string,
  razorpayInvoiceId?: string
): Promise<string> {
  const invoice = await storage.createInvoice({
    brandId,
    subscriptionId,
    invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    amount,
    status: razorpayPaymentId ? 'paid' : 'pending',
    razorpayPaymentId,
    razorpayInvoiceId,
    paidAt: razorpayPaymentId ? new Date() : undefined,
  });

  // Generate PDF
  await saveInvoicePDF(invoice.id);

  // Email to customer
  const brand = await storage.getBrand(brandId);
  if (brand) {
    // TODO: Get actual customer email
    // await emailInvoicePDF(invoice.id, customerEmail);
  }

  return invoice.id;
}
