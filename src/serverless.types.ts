import type { z } from 'zod'

import type { AwsEventSource } from '@/aws/aws.types.js'

/**
 * Registry of source unions per adapter. Each adapter types `@Handler` by
 * contributing its own explicit trigger names here — the built-in AWS adapter
 * ships `aws`. A custom adapter package augments this interface with its own
 * key to extend the `@Handler` union.
 */
export interface ServerlessSourceMap {
	aws: AwsEventSource
}

/**
 * Union of every installed adapter's trigger names. With only the built-in
 * AWS adapter this is {@link AwsEventSource}: `SQS`, `EVENTBRIDGE-SQS`,
 * `SNS-SQS`, `EVENTBRIDGE-SNS-SQS`, `SNS`, `EVENTBRIDGE-SNS`, `S3`,
 * `EVENTBRIDGE`, `SCHEDULE`.
 */
export type EventSource = ServerlessSourceMap[keyof ServerlessSourceMap]

/** Contract that all `@Handler()` classes must implement. */
export interface IHandler<T = unknown> {
	execute(event: T): Promise<void>
}

/** Options for the {@link Handler} decorator. */
export type HandlerOptions<S extends z.ZodSchema = z.ZodSchema> = {
	/** Zod schema for event payload validation. */
	schema?: S
}

/** Internal metadata stored by the {@link Handler} decorator. */
export type HandlerMetadata = {
	/** Zod schema for event payload validation. */
	schema?: z.ZodSchema
	/** Agnostic event source. */
	source: EventSource
}

/** Options for {@link ServerlessModule.register}. */
export type ServerlessModuleOptions = {
	/** Serverless adapter to use. */
	adapter: 'aws'
}
