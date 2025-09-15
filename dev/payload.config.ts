import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { testEmailAdapter } from './helpers/testEmailAdapter'
import { seed } from './seed'
import billingPlugin from '../src/plugin'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

const buildConfigWithSQLite = () => {
  return buildConfig({
    admin: {
      importMap: {
        baseDir: path.resolve(dirname),
      },
    },
    collections: [
      {
        slug: 'posts',
        fields: [],
      },
      {
        slug: 'media',
        fields: [],
        upload: {
          staticDir: path.resolve(dirname, 'media'),
        },
      },
    ],
    db: sqliteAdapter({
      client: {
        url: `file:${path.resolve(dirname, 'payload.sqlite')}`,
      },
    }),
    editor: lexicalEditor(),
    email: testEmailAdapter,
    onInit: async (payload) => {
      await seed(payload)
    },
    plugins: [
      billingPlugin({
        providers: {
          test: {
            enabled: true,
            autoComplete: true,
          }
        },
        collections: {
          payments: 'payments',
          invoices: 'invoices',
          refunds: 'refunds',
        },
        // // Customer relationship configuration
        // customerRelationSlug: 'customers', // Use 'customers' collection for relationship
        // // customerRelationSlug: false,     // Or set to false to disable customer relationship
        // // customerRelationSlug: 'clients', // Or use a custom collection slug
        //
        // // Provide an extractor for your customer collection structure:
        // customerInfoExtractor: (customer) => ({
        //   name: customer.name || '',
        //   email: customer.email || '',
        //   phone: customer.phone,
        //   company: customer.company,
        //   taxId: customer.taxId,
        //   billingAddress: customer.address ? {
        //     line1: customer.address.line1 || '',
        //     line2: customer.address.line2,
        //     city: customer.address.city || '',
        //     state: customer.address.state,
        //     postalCode: customer.address.postalCode || '',
        //     country: customer.address.country || '',
        //   } : undefined,
        // })
      }),
    ],
    secret: process.env.PAYLOAD_SECRET || 'test-secret_key',
    sharp,
    typescript: {
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
  })
}

export default buildConfigWithSQLite()
