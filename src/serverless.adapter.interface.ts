import type { EventSource } from '@/serverless.types.js'

/** A single parsed record from a serverless event. */
export type ParsedRecord = {
	/**
	 * How many times this record has been delivered, this one included.
	 *
	 * `1` on the first delivery. A handler needs it to tell a retry from a first
	 * attempt — to decide whether to give up, escalate, or route to a dead
	 * letter — and without it the last attempt looks exactly like the first.
	 *
	 * Absent when the source does not report it.
	 */
	attempt?: number
	/** Parsed event body/payload. */
	body: unknown
	/** Record identifier for partial batch failure reporting (e.g. SQS messageId). */
	recordId?: string
}

/** Result of parsing a raw Lambda event. */
export type ParsedEvent = {
	/** Parsed records from the event. */
	records: ParsedRecord[]
	/** Agnostic event source that triggered the Lambda. */
	source: EventSource
}

/**
 * Low-level serverless adapter contract.
 *
 * Implement this interface to add a new cloud provider.
 * The built-in implementation is {@link AwsServerlessAdapter}.
 */
export interface IServerlessAdapter {
	/** Parses the raw Lambda event into typed records. Returns `null` if unrecognized. */
	parseEvent(event: unknown): ParsedEvent | null
	/** Formats the response for the Lambda runtime (e.g. batchItemFailures for SQS). */
	formatResponse(source: EventSource, failedRecordIds: string[]): unknown
}
