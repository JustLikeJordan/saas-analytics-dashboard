import { z } from 'zod';

export const checkoutSessionSchema = z.object({
  checkoutUrl: z.string().url(),
});

export const portalSessionSchema = z.object({
  portalUrl: z.string().url(),
});

export const subscriptionStatusSchema = z.object({
  tier: z.enum(['free', 'pro']),
});

export type CheckoutSession = z.infer<typeof checkoutSessionSchema>;
export type PortalSession = z.infer<typeof portalSessionSchema>;
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
