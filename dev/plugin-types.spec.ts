import type { Id, Payment, Refund } from '../src/plugin/types/index'
import type { StripeProviderConfig } from '../src/providers/stripe'

import { describe, expectTypeOf, test } from 'vitest'

// These assertions are checked by `pnpm typecheck`; at runtime they are no-ops. They pin the
// exported document types to `Id` (string | number) so hosts on MongoDB (string ids) and on SQL
// adapters (number ids) can use them without casting.
describe('exported document types', () => {
  test('Refund ids and relations use Id', () => {
    expectTypeOf<Refund['id']>().toEqualTypeOf<Id>()
    expectTypeOf<Refund['payment']>().toEqualTypeOf<Id | Payment>()
  })

  test('Payment.refunds entries use Id', () => {
    expectTypeOf<NonNullable<Payment['refunds']>[number]>().toEqualTypeOf<Id | Refund>()
  })
})

describe('StripeProviderConfig', () => {
  test('still accepts the deprecated, ignored webhookUrl so existing configs keep compiling', () => {
    expectTypeOf<{ secretKey: string; webhookUrl: string }>().toExtend<StripeProviderConfig>()
  })
})
