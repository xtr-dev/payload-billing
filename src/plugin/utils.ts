import type { CollectionConfig, CollectionSlug, Field } from 'payload'
import type { Id } from './types/index'
import type { CollectionExtension } from './config'

export type FieldsOverride = (args: { defaultFields: Field[] }) => Field[]

/**
 * Extract the slug from a collection configuration
 * Returns the slug from the configuration or the default slug if not provided
 */
export const extractSlug = (arg: CollectionExtension | undefined, defaultSlug: string): CollectionSlug => {
  if (!arg) {
    return defaultSlug as CollectionSlug
  }
  if (typeof arg === 'string') {
    return arg as CollectionSlug
  }
  // arg is an object with slug property
  return arg.slug as CollectionSlug
}

/**
 * Safely cast ID types for PayloadCMS operations
 * This utility provides a typed way to handle the mismatch between our Id type and PayloadCMS expectations
 */
export function toPayloadId(id: Id): any {
  return id as any
}
