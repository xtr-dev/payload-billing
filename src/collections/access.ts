import type { Access, CollectionConfig } from 'payload'
import type { CollectionExtension } from '../plugin/config'

/**
 * The four operations a consumer can override on a billing collection.
 */
export type BillingCollectionAccess = Partial<
  Pick<NonNullable<CollectionConfig['access']>, 'create' | 'delete' | 'read' | 'update'>
>

/**
 * Default for every operation: only users who signed in through the collection Payload uses for
 * its admin panel (`admin.user`, normally `users`). A customer in a separate auth collection is
 * denied. A site where customers sign up in that same collection must pass its own `access`:
 * the plugin cannot tell staff from customers there.
 *
 * This only governs REST, GraphQL and the admin panel. The plugin's own Local API calls
 * (webhooks, providers, refundPayment, the sweeps) never pass a user, so they bypass access.
 */
export const isAdminCollectionUser: Access = ({ req }) =>
  !!req.user && req.user.collection === req.payload.config.admin.user

/**
 * Default access merged with the consumer's per-operation overrides (an override replaces only
 * the operation it names).
 */
export function resolveAccess(
  option: CollectionExtension | undefined,
): NonNullable<CollectionConfig['access']> {
  const overrides = typeof option === 'object' ? option.access : undefined
  return {
    create: isAdminCollectionUser,
    delete: isAdminCollectionUser,
    read: isAdminCollectionUser,
    update: isAdminCollectionUser,
    ...overrides,
  }
}
