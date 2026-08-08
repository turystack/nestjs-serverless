import { Injectable } from '@nestjs/common'

import type {
	IServerlessAdapter,
	ParsedEvent,
} from '@/serverless.adapter.interface.js'
import type { EventSource } from '@/serverless.types.js'

import type {
	AwsEventSource,
	EventBridgeEvent,
	S3Event,
	S3Record,
	SNSEvent,
	SQSBatchResponse,
	SQSEvent,
	SQSRecord,
} from '@/aws/aws.types.js'

/** EventBridge sources that mean a scheduled trigger rather than a domain event. */
const SCHEDULE_SOURCES = new Set([
	'aws.events',
	'aws.scheduler',
])

function isEventBridgeEnvelope(value: unknown): value is EventBridgeEvent {
	return (
		typeof value === 'object' &&
		value !== null &&
		'detail-type' in value &&
		'detail' in value
	)
}

function isSnsEnvelope(value: unknown): value is {
	Type: 'Notification'
	Message: string
} {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as Record<string, unknown>).Type === 'Notification' &&
		typeof (value as Record<string, unknown>).Message === 'string'
	)
}

/**
 * AWS Lambda adapter — normalizes every event shape into records and names
 * the source after the actual delivery chain (deepest producer first):
 *
 * - `SQS`, `SNS`, `S3`, `EVENTBRIDGE` as direct triggers
 * - Envelope chains unwrapped recursively so the handler always receives the
 *   original payload — `EVENTBRIDGE-SQS`, `SNS-SQS`, `EVENTBRIDGE-SNS-SQS`,
 *   `EVENTBRIDGE-SNS`
 * - EventBridge scheduled rules (`aws.events` / `aws.scheduler`) as `SCHEDULE`
 *
 * Unrecognized events return `null` (logged and skipped by the factory).
 */
@Injectable()
export class AwsServerlessAdapter implements IServerlessAdapter {
	parseEvent(event: unknown): ParsedEvent | null {
		if (!event || typeof event !== 'object') {
			return null
		}

		const record = this._firstRecord(event)

		if (record && 'eventSource' in record) {
			if (record.eventSource === 'aws:sqs') {
				return this._parseSqs(event as SQSEvent)
			}
			if (record.eventSource === 'aws:s3') {
				return this._parseS3(event as S3Event)
			}
		}

		if (record && 'EventSource' in record && record.EventSource === 'aws:sns') {
			return this._parseSns(event as SNSEvent)
		}

		if (isEventBridgeEnvelope(event)) {
			return this._parseEventBridge(event)
		}

		return null
	}

	formatResponse(source: EventSource, failedRecordIds: string[]): unknown {
		if (source.endsWith('SQS') && failedRecordIds.length > 0) {
			return {
				batchItemFailures: failedRecordIds.map((id) => ({
					itemIdentifier: id,
				})),
			} satisfies SQSBatchResponse
		}

		return undefined
	}

	/**
	 * Delivery count reported by SQS, `1` on the first attempt.
	 *
	 * Only SQS reports it: EventBridge and SNS deliver without a retry counter,
	 * so those records carry no attempt and a handler must not assume one.
	 */
	private _attemptOf(record: SQSRecord): number | undefined {
		const raw = record.attributes?.ApproximateReceiveCount

		if (!raw) {
			return undefined
		}

		const parsed = Number.parseInt(raw, 10)

		return Number.isFinite(parsed) ? parsed : undefined
	}

	private _firstRecord(event: unknown): Record<string, unknown> | undefined {
		const records = (event as Record<string, unknown>).Records
		if (Array.isArray(records) && records.length > 0) {
			return records[0] as Record<string, unknown>
		}
		return undefined
	}

	/**
	 * Parses a raw string body into the actual payload, unwrapping any known
	 * envelopes (EventBridge, SNS) recursively — covers EventBridge → SQS,
	 * SNS → SQS, and EventBridge → SNS → SQS chains. Every envelope crossed is
	 * pushed into `envelopes` (in unwrap order) so the source can be named
	 * after the real chain. Non-JSON bodies are returned as the raw string.
	 */
	private _parseBody(raw: string, envelopes: string[]): unknown {
		let value: unknown
		try {
			value = JSON.parse(raw)
		} catch {
			return raw
		}
		if (isEventBridgeEnvelope(value)) {
			envelopes.push('EVENTBRIDGE')
			return value.detail
		}
		if (isSnsEnvelope(value)) {
			envelopes.push('SNS')
			return this._parseBody(value.Message, envelopes)
		}
		return value
	}

	/**
	 * Names the source after the delivery chain, deepest producer first —
	 * envelopes are collected in unwrap order (outermost first), so they are
	 * reversed: SQS body → SNS envelope → EventBridge envelope becomes
	 * `EVENTBRIDGE-SNS-SQS`.
	 */
	private _chainSource(base: string, envelopes: string[]): AwsEventSource {
		return [
			...[
				...envelopes,
			].reverse(),
			base,
		].join('-') as AwsEventSource
	}

	private _parseSqs(event: SQSEvent): ParsedEvent {
		// the chain is detected from the first record — SQS batches come from a
		// single queue wiring, so envelopes are uniform across records
		const envelopes: string[] = []
		const records = event.Records.map((record, index) => ({
			attempt: this._attemptOf(record),
			body: this._parseBody(record.body, index === 0 ? envelopes : []),
			recordId: record.messageId,
		}))

		return {
			records,
			source: this._chainSource('SQS', envelopes),
		}
	}

	private _parseSns(event: SNSEvent): ParsedEvent {
		const envelopes: string[] = []
		const records = event.Records.map((record, index) => ({
			body: this._parseBody(record.Sns.Message, index === 0 ? envelopes : []),
			recordId: record.Sns.MessageId,
		}))

		return {
			records,
			source: this._chainSource('SNS', envelopes),
		}
	}

	private _parseS3(event: S3Event): ParsedEvent {
		return {
			records: event.Records.map((record: S3Record) => ({
				body: {
					bucket: record.s3.bucket.name,
					eTag: record.s3.object.eTag,
					key: record.s3.object.key,
					size: record.s3.object.size,
				},
			})),
			source: 'S3',
		}
	}

	private _parseEventBridge(event: EventBridgeEvent): ParsedEvent {
		return {
			records: [
				{
					body: event.detail,
					recordId: event.id,
				},
			],
			source: SCHEDULE_SOURCES.has(event.source) ? 'SCHEDULE' : 'EVENTBRIDGE',
		}
	}
}
