import { stripeGateway } from "./stripe";
import { razorpayGateway } from "./razorpay";
import { paddleGateway } from "./paddle";
import { lemonsqueezyGateway } from "./lemonsqueezy";
import { manualGateway } from "./manual";
import type { PlatformGateway } from "./types";
import type { PaymentGatewayProvider } from "@/generated/prisma/client";

/**
 * Every concrete platform gateway registers itself here — business logic
 * (subscription lifecycle, checkout Server Actions, webhook routes) only
 * ever calls getGateway()/listConfiguredGateways(), never imports a
 * concrete gateway file directly, so swapping the primary provider or
 * adding a 6th gateway never touches business code. PayPal is
 * deliberately NOT registered as a platform gateway — the spec lists it
 * under Payment Gateways generically, but PayPal's subscription API has no
 * clean plan/price-id-driven checkout-session equivalent to the other four
 * without PayPal-specific UI (Smart Buttons) that doesn't fit this
 * redirect-based abstraction; it remains available as a per-org "accept
 * your own clients' payments" Integration Hub adapter
 * (src/lib/integrations/providers/paypal.ts), just not as a platform
 * billing gateway.
 */
const GATEWAYS: PlatformGateway[] = [stripeGateway, razorpayGateway, paddleGateway, lemonsqueezyGateway, manualGateway];

const GATEWAYS_BY_PROVIDER = new Map(GATEWAYS.map((g) => [g.provider, g]));

export function getGateway(provider: PaymentGatewayProvider): PlatformGateway {
  const gateway = GATEWAYS_BY_PROVIDER.get(provider);
  if (!gateway) throw new Error(`No platform payment gateway registered for "${provider}".`);
  return gateway;
}

export function listGateways(): PlatformGateway[] {
  return GATEWAYS;
}

export function listConfiguredGateways(): PlatformGateway[] {
  return GATEWAYS.filter((g) => g.isConfigured());
}
