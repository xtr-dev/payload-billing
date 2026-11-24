import { randomBytes } from 'node:crypto'

/**
 * Placeholder a host can put in a payment's `redirectUrl` (or a provider's default
 * `redirectUrl` / `returnUrl`). The return URL has to be sent to the provider before the payment
 * document has a database id, so the plugin cannot offer `{paymentId}`; instead it gives every
 * payment a random `returnToken` on create and puts it in place of this placeholder.
 */
export const RETURN_TOKEN_PLACEHOLDER = '{returnToken}'

/**
 * A new unguessable token (128 random bits, hex encoded, so it is URL-safe as is).
 */
export function generateReturnToken(): string {
  return randomBytes(16).toString('hex')
}

/**
 * Replace every {@link RETURN_TOKEN_PLACEHOLDER} in `url` with the payment's return token.
 * Returns `url` unchanged when it has no placeholder or the payment has no token.
 */
export function fillReturnToken<T extends null | string | undefined>(
  url: T,
  payment: { returnToken?: null | string },
): T {
  if (!url || !payment.returnToken || !url.includes(RETURN_TOKEN_PLACEHOLDER)) {
    return url
  }
  return url.split(RETURN_TOKEN_PLACEHOLDER).join(encodeURIComponent(payment.returnToken)) as T
}
