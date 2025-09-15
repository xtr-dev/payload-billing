import type { CollectionConfig } from 'payload'

import type { 
  AccessArgs,
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CustomerData,
  CustomerDocument
} from '../types/payload'

export function createCustomersCollection(slug: string = 'customers'): CollectionConfig {
  return {
    slug,
    access: {
      create: ({ req: { user } }: AccessArgs) => !!user,
      delete: ({ req: { user } }: AccessArgs) => !!user,
      read: ({ req: { user } }: AccessArgs) => !!user,
      update: ({ req: { user } }: AccessArgs) => !!user,
    },
    admin: {
      defaultColumns: ['email', 'name', 'createdAt'],
      group: 'Billing',
      useAsTitle: 'email',
    },
    fields: [
      {
        name: 'email',
        type: 'email',
        admin: {
          description: 'Customer email address',
        },
        index: true,
        unique: true,
      },
      {
        name: 'name',
        type: 'text',
        admin: {
          description: 'Customer full name',
        },
      },
      {
        name: 'phone',
        type: 'text',
        admin: {
          description: 'Customer phone number',
        },
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
            label: 'City',
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
            admin: {
              description: 'ISO 3166-1 alpha-2 country code',
            },
            label: 'Country',
            maxLength: 2,
          },
        ],
      },
      {
        name: 'providerIds',
        type: 'json',
        admin: {
          description: 'Customer IDs from payment providers',
          readOnly: true,
        },
      },
      {
        name: 'metadata',
        type: 'json',
        admin: {
          description: 'Additional customer metadata',
        },
      },
      {
        name: 'payments',
        type: 'relationship',
        admin: {
          description: 'Customer payments',
          readOnly: true,
        },
        hasMany: true,
        relationTo: 'payments',
      },
      {
        name: 'invoices',
        type: 'relationship',
        admin: {
          description: 'Customer invoices',
          readOnly: true,
        },
        hasMany: true,
        relationTo: 'invoices',
      },
    ],
    hooks: {
      afterChange: [
        ({ doc, operation, req }: CollectionAfterChangeHook<CustomerDocument>) => {
          if (operation === 'create') {
            req.payload.logger.info(`Customer created: ${doc.id} (${doc.email})`)
          }
        },
      ],
      beforeChange: [
        ({ data, operation }: CollectionBeforeChangeHook<CustomerData>) => {
          if (operation === 'create' || operation === 'update') {
            // Normalize country code
            if (data.address?.country) {
              data.address.country = data.address.country.toUpperCase()
              if (!/^[A-Z]{2}$/.test(data.address.country)) {
                throw new Error('Country must be a 2-letter ISO code')
              }
            }
          }
        },
      ],
    },
    timestamps: true,
  }
}