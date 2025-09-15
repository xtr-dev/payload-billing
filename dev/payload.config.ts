import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { billingPlugin, defaultCustomerInfoExtractor } from '../dist/index.js'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { testEmailAdapter } from './helpers/testEmailAdapter'
import { seed } from './seed'

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
          customers: 'customers',
          invoices: 'invoices',
          refunds: 'refunds',
          // customerRelation: false, // Set to false to disable customer relationship in invoices
          // customerRelation: 'clients', // Or set to a custom collection slug
        },
        // Use the default extractor for the built-in customer collection
        customerInfoExtractor: defaultCustomerInfoExtractor,
        // Or provide a custom extractor for your own customer collection structure:
        // customerInfoExtractor: (customer) => ({
        //   name: customer.fullName,
        //   email: customer.contactEmail,
        //   phone: customer.phoneNumber,
        //   company: customer.companyName,
        //   taxId: customer.vatNumber,
        //   billingAddress: {
        //     line1: customer.billing.street,
        //     city: customer.billing.city,
        //     postalCode: customer.billing.zip,
        //     country: customer.billing.countryCode,
        //   }
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
