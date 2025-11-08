import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { testEmailAdapter } from './helpers/testEmailAdapter'
import { seed } from './seed'
import billingPlugin from '../src/plugin'
import { testProvider } from '../src/providers'

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
      {
        slug: 'customers',
        admin: {
          useAsTitle: 'name',
        },
        fields: [
          {
            name: 'name',
            type: 'text',
            required: true,
          },
          {
            name: 'email',
            type: 'email',
            required: true,
          },
          {
            name: 'phone',
            type: 'text',
          },
          {
            name: 'company',
            type: 'text',
          },
          {
            name: 'taxId',
            type: 'text',
            label: 'Tax ID',
          },
          {
            name: 'address',
            type: 'group',
            fields: [
              {
                name: 'line1',
                type: 'text',
                label: 'Address Line 1',
              },
              {
                name: 'line2',
                type: 'text',
                label: 'Address Line 2',
              },
              {
                name: 'city',
                type: 'text',
              },
              {
                name: 'state',
                type: 'text',
                label: 'State/Province',
              },
              {
                name: 'postalCode',
                type: 'text',
                label: 'Postal Code',
              },
              {
                name: 'country',
                type: 'text',
              },
            ],
          },
        ],
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
        providers: [
          testProvider({
            enabled: true,
            testModeIndicators: {
              showWarningBanners: true,
              showTestBadges: true,
              consoleWarnings: true
            },
            customUiRoute: '/test-payment',
          })
        ],
        collections: {
          payments: 'payments',
          invoices: 'invoices',
          refunds: 'refunds',
        },
        customerRelationSlug: 'customers',
        customerInfoExtractor: (customer) => ({
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          company: customer.company,
          taxId: customer.taxId,
          billingAddress: customer.address ? {
            line1: customer.address.line1,
            line2: customer.address.line2,
            city: customer.address.city,
            state: customer.address.state,
            postalCode: customer.address.postalCode,
            country: customer.address.country,
          } : undefined,
        }),
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
