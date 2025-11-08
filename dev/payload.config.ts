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
      // Note: No customers collection - the demo uses direct customerInfo fields on invoices
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
          invoices: {
            slug: 'invoices',
            // Use extend to add custom fields and hooks to the invoice collection
            extend: (config) => ({
              ...config,
              fields: [
                ...(config.fields || []),
                // Add a custom message field to invoices
                {
                  name: 'customMessage',
                  type: 'textarea',
                  admin: {
                    description: 'Custom message from the payment (auto-populated)',
                  },
                },
              ],
              hooks: {
                ...config.hooks,
                beforeChange: [
                  ...(config.hooks?.beforeChange || []),
                  // Hook to copy the message from payment metadata to invoice
                  async ({ data, req, operation }) => {
                    // Only run on create operations
                    if (operation === 'create' && data.payment) {
                      try {
                        // Fetch the related payment
                        const payment = await req.payload.findByID({
                          collection: 'payments',
                          id: typeof data.payment === 'object' ? data.payment.id : data.payment,
                        })

                        // Copy the custom message from payment metadata to invoice
                        if (
                          payment?.metadata &&
                          typeof payment.metadata === 'object' &&
                          'customMessage' in payment.metadata &&
                          payment.metadata.customMessage
                        ) {
                          data.customMessage = payment.metadata.customMessage as string
                        }
                      } catch (error) {
                        // Log error but don't fail the invoice creation
                        req.payload.logger.error('Failed to copy custom message to invoice:', error)
                      }
                    }
                    return data
                  },
                ],
              },
            }),
          },
          refunds: 'refunds',
        },
        // Note: No customerRelationSlug or customerInfoExtractor configured
        // This allows the demo to work without a customer collection
        // Invoices will use the direct customerInfo and billingAddress fields
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
