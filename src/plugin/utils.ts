import type { CollectionConfig, Field } from 'payload'

export type FieldsOverride = (args: { defaultFields: Field[] }) => Field[]

export const extractSlug = (arg: string | Partial<CollectionConfig>) => typeof arg === 'string' ? arg : arg.slug!
