import 'reflect-metadata'

import { Injectable } from '@nestjs/common'
import type { z } from 'zod'

import { HANDLER_METADATA } from '@/serverless.constants.js'
import type {
	EventSource,
	HandlerMetadata,
	HandlerOptions,
	IHandler,
} from '@/serverless.types.js'

/** Constructor type for handler classes. */
export type HandlerCtor = new (...args: unknown[]) => IHandler

/** Internal registry of all `@Handler()` classes. */
export const handlerRegistry = new Set<HandlerCtor>()

/** Internal registry mapping handler classes to their metadata. */
export const handlerMetadataRegistry = new Map<HandlerCtor, HandlerMetadata>()

/**
 * Class decorator that registers the class as a serverless event handler.
 *
 * Automatically applies `@Injectable()` and adds the class to the handler registry.
 * The class **must** implement `IHandler` (i.e. an `execute(event)` method).
 *
 * The source names are explicit, per adapter (AWS built-in) — the input is
 * normalized before reaching `execute`:
 * - `SQS` — record bodies, JSON-parsed (non-JSON arrives as the raw string)
 * - `EVENTBRIDGE-SQS` / `SNS-SQS` / `EVENTBRIDGE-SNS-SQS` — envelopes
 *   delivered through the queue, unwrapped recursively to the original payload
 * - `SNS` / `EVENTBRIDGE-SNS` — notification `Message` (envelopes unwrapped)
 * - `S3` — records as `{ bucket, key, size, eTag }`
 * - `EVENTBRIDGE` — the event `detail`
 * - `SCHEDULE` — scheduled rules `detail` (`aws.events` / `aws.scheduler`)
 *
 * With `schema`, the **final unwrapped payload** is validated per record —
 * and the decorator is generic on the schema, so the class's `execute`
 * parameter is checked against `z.infer<typeof schema>` at compile time. No
 * `implements` clause is needed; type the parameter once and a mismatch with
 * the schema is a compile error at the decorator.
 *
 * @param source - Explicit trigger name from the adapter's source union ({@link EventSource}).
 * @param options - Optional settings like `schema`.
 *
 * @example
 * ```ts
 * import { Handler } from '@turystack/nestjs-serverless'
 *
 * @Handler('SQS', { schema: orderSchema })
 * class OrderHandler {
 *   async execute(event: z.infer<typeof orderSchema>) {}
 * }
 * ```
 */
export const Handler = <S extends z.ZodSchema = z.ZodSchema>(
	source: EventSource,
	options?: HandlerOptions<S>,
) => {
	return <T extends new (...args: never[]) => IHandler<z.infer<S>>>(
		target: T,
	): T => {
		Injectable()(target)
		handlerRegistry.add(target as unknown as HandlerCtor)
		handlerMetadataRegistry.set(target as unknown as HandlerCtor, {
			schema: options?.schema,
			source,
		})
		Reflect.defineMetadata(HANDLER_METADATA, true, target)
		return target
	}
}

/** Identity helper for Zod handler schemas. Returns the schema as-is while preserving its type. */
export const createHandlerSchema = <T extends z.ZodSchema>(schema: T) => schema

/** Infers the TypeScript type from a Zod handler schema created with {@link createHandlerSchema}. */
export type HandlerInput<T extends z.ZodSchema> = z.infer<T>
