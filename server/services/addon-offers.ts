import { getRazorpayClient } from './subscription';
import { storage } from '../storage';
import type { AddonOffer, Brand } from '@shared/schema';

export interface EffectiveAddonOffer extends AddonOffer {
  effectivePriceInr: number;
  purchased?: boolean;
}

export async function getEffectiveOffersForBrand(brandId: string): Promise<EffectiveAddonOffer[]> {
  const offers = await storage.getAddonOffersForBrand(brandId);
  const purchases = await storage.getAddonPurchasesByBrand(brandId);
  const paidOfferIds = new Set(
    purchases.filter((p) => p.status === 'paid').map((p) => p.offerId),
  );

  return offers.map((offer) => ({
    ...offer,
    effectivePriceInr: offer.effectivePriceInr,
    purchased: paidOfferIds.has(offer.id),
  }));
}

export async function createAddonCheckout(options: {
  brand: Brand;
  userId: string;
  offerId: string;
}): Promise<{
  purchaseId: string;
  razorpayOrderId: string;
  amountInr: number;
  razorpayKeyId: string;
  offerTitle: string;
}> {
  const offers = await storage.getAddonOffersForBrand(options.brand.id);
  const offer = offers.find((o) => o.id === options.offerId);
  if (!offer || !offer.isActive) {
    throw new Error('Add-on offer not available for this brand');
  }

  const amountInr = offer.effectivePriceInr;
  if (amountInr <= 0) {
    throw new Error('Invalid offer price');
  }

  const client = getRazorpayClient();
  const order = await client.orders.create({
    amount: amountInr * 100,
    currency: 'INR',
    receipt: `addon_${options.brand.id.slice(0, 8)}_${Date.now()}`,
    notes: {
      brand_id: options.brand.id,
      user_id: options.userId,
      offer_id: offer.id,
      type: 'addon_purchase',
    },
  });

  const purchase = await storage.createAddonPurchase({
    brandId: options.brand.id,
    userId: options.userId,
    offerId: offer.id,
    amountInr,
    status: 'pending',
    razorpayOrderId: order.id,
    metadata: { offerSlug: offer.slug, offerTitle: offer.title },
  });

  const keyId = process.env.RAZORPAY_KEY_ID || '';
  if (!keyId) throw new Error('Razorpay is not configured');

  return {
    purchaseId: purchase.id,
    razorpayOrderId: order.id,
    amountInr,
    razorpayKeyId: keyId,
    offerTitle: offer.title,
  };
}

export async function verifyAddonPayment(options: {
  purchaseId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<void> {
  const crypto = await import('crypto');
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  const body = `${options.razorpayOrderId}|${options.razorpayPaymentId}`;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  if (expected !== options.razorpaySignature) {
    throw new Error('Invalid payment signature');
  }

  const purchase = await storage.getAddonPurchase(options.purchaseId);
  if (!purchase) throw new Error('Purchase not found');
  if (purchase.razorpayOrderId !== options.razorpayOrderId) {
    throw new Error('Order mismatch');
  }

  await storage.updateAddonPurchase(options.purchaseId, {
    status: 'paid',
    razorpayPaymentId: options.razorpayPaymentId,
    paidAt: new Date(),
  });

  await storage.createPayment({
    brandId: purchase.brandId,
    amount: purchase.amountInr * 100,
    currency: 'INR',
    status: 'succeeded',
    razorpayPaymentId: options.razorpayPaymentId,
    paymentMethod: 'razorpay',
    metadata: {
      type: 'addon_purchase',
      offerId: purchase.offerId,
      purchaseId: purchase.id,
    },
  });
}
