import type { CollectionConfig, CollectionSlug, Field } from 'payload'
import type { Id } from './types/index'

export type FieldsOverride = (args: { defaultFields: Field[] }) => Field[]

export const extractSlug =
  (arg: string | Partial<CollectionConfig>) => (typeof arg === 'string' ? arg : arg.slug!) as CollectionSlug

/**
 * Safely cast ID types for PayloadCMS operations
 * This utility provides a typed way to handle the mismatch between our Id type and PayloadCMS expectations
 */
export function toPayloadId(id: Id): any {
  return id as any
}
