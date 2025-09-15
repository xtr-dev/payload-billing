import type { Payload } from 'payload'

import { devUser } from './helpers/credentials'

export const seed = async (payload: Payload) => {
  // Seed default user first
  const { totalDocs } = await payload.count({
    collection: 'users',
    where: {
      email: {
        equals: devUser.email,
      },
    },
  })

  if (!totalDocs) {
    await payload.create({
      collection: 'users',
      data: devUser,
    })
  }

  // Seed billing sample data
  await seedBillingData(payload)
}

async function seedBillingData(payload: Payload): Promise<void> {
  payload.logger.info('Seeding billing sample data...')
}
