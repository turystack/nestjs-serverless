import { describe, expect, it } from 'vitest'

import { AwsServerlessAdapter } from '@/aws/aws.adapter.js'
import type {
	EventBridgeEvent,
	S3Event,
	SNSEvent,
	SQSEvent,
} from '@/aws/aws.types.js'

describe('AwsServerlessAdapter', () => {
	const adapter = new AwsServerlessAdapter()

	describe('parseEvent', () => {
		it('should parse SQS event', () => {
			const event: SQSEvent = {
				Records: [
					{
						body: '{"orderId":"123"}',
						eventSource: 'aws:sqs',
						messageId: 'msg-1',
					},
					{
						body: '{"orderId":"456"}',
						eventSource: 'aws:sqs',
						messageId: 'msg-2',
					},
				],
			}

			const result = adapter.parseEvent(event)

			expect(result).toEqual({
				records: [
					{
						body: {
							orderId: '123',
						},
						recordId: 'msg-1',
					},
					{
						body: {
							orderId: '456',
						},
						recordId: 'msg-2',
					},
				],
				source: 'SQS',
			})
		})

		it('should parse SNS event', () => {
			const event: SNSEvent = {
				Records: [
					{
						EventSource: 'aws:sns',
						Sns: {
							Message: '{"notification":"hello"}',
							MessageId: 'sns-1',
						},
					},
				],
			}

			const result = adapter.parseEvent(event)

			expect(result).toEqual({
				records: [
					{
						body: {
							notification: 'hello',
						},
						recordId: 'sns-1',
					},
				],
				source: 'SNS',
			})
		})

		it('should parse S3 event', () => {
			const event: S3Event = {
				Records: [
					{
						eventSource: 'aws:s3',
						s3: {
							bucket: {
								name: 'my-bucket',
							},
							object: {
								eTag: 'abc',
								key: 'uploads/file.pdf',
								size: 1024,
							},
						},
					},
				],
			}

			const result = adapter.parseEvent(event)

			expect(result).toEqual({
				records: [
					{
						body: {
							bucket: 'my-bucket',
							eTag: 'abc',
							key: 'uploads/file.pdf',
							size: 1024,
						},
					},
				],
				source: 'S3',
			})
		})

		it('should parse EventBridge event', () => {
			const event: EventBridgeEvent = {
				detail: {
					orderId: '789',
				},
				'detail-type': 'OrderCreated',
				id: 'eb-1',
				source: 'com.app.orders',
			}

			const result = adapter.parseEvent(event)

			expect(result).toEqual({
				records: [
					{
						body: {
							orderId: '789',
						},
						recordId: 'eb-1',
					},
				],
				source: 'EVENTBRIDGE',
			})
		})

		it('should return null for unrecognized events', () => {
			expect(
				adapter.parseEvent({
					foo: 'bar',
				}),
			).toBeNull()
		})

		it('should return null for null input', () => {
			expect(adapter.parseEvent(null)).toBeNull()
		})

		it('should return null for non-object input', () => {
			expect(adapter.parseEvent('string')).toBeNull()
		})

		it('should return null for an empty Records array', () => {
			expect(
				adapter.parseEvent({
					Records: [],
				}),
			).toBeNull()
		})

		it('should unwrap an EventBridge envelope delivered through SQS', () => {
			const detail = {
				orderId: '123',
			}
			const envelope = {
				detail,
				'detail-type': 'order-created',
				id: 'evt-1',
				source: 'my-app',
			}

			const result = adapter.parseEvent({
				Records: [
					{
						body: JSON.stringify(envelope),
						eventSource: 'aws:sqs',
						messageId: 'msg-1',
					},
				],
			})

			expect(result).toEqual({
				records: [
					{
						body: detail,
						recordId: 'msg-1',
					},
				],
				source: 'EVENTBRIDGE-SQS',
			})
		})

		it('should unwrap an SNS envelope delivered through SQS', () => {
			const payload = {
				userId: 'u1',
			}
			const snsEnvelope = {
				Message: JSON.stringify(payload),
				MessageId: 'sns-1',
				Type: 'Notification',
			}

			const result = adapter.parseEvent({
				Records: [
					{
						body: JSON.stringify(snsEnvelope),
						eventSource: 'aws:sqs',
						messageId: 'msg-1',
					},
				],
			})

			expect(result).toEqual({
				records: [
					{
						body: payload,
						recordId: 'msg-1',
					},
				],
				source: 'SNS-SQS',
			})
		})

		it('should unwrap EventBridge → SNS → SQS chains recursively', () => {
			const detail = {
				invoiceId: 'inv-1',
			}
			const eventBridgeEnvelope = {
				detail,
				'detail-type': 'invoice-created',
				id: 'evt-1',
				source: 'my-app',
			}
			const snsEnvelope = {
				Message: JSON.stringify(eventBridgeEnvelope),
				Type: 'Notification',
			}

			const result = adapter.parseEvent({
				Records: [
					{
						body: JSON.stringify(snsEnvelope),
						eventSource: 'aws:sqs',
						messageId: 'msg-1',
					},
				],
			})

			expect(result?.records[0]?.body).toEqual(detail)
			expect(result?.source).toBe('EVENTBRIDGE-SNS-SQS')
		})

		it('should unwrap an EventBridge envelope delivered through SNS', () => {
			const detail = {
				paymentId: 'p-1',
			}
			const envelope = {
				detail,
				'detail-type': 'payment-received',
				id: 'evt-9',
				source: 'my-app',
			}

			const result = adapter.parseEvent({
				Records: [
					{
						EventSource: 'aws:sns',
						Sns: {
							Message: JSON.stringify(envelope),
							MessageId: 'sns-9',
						},
					},
				],
			})

			expect(result).toEqual({
				records: [
					{
						body: detail,
						recordId: 'sns-9',
					},
				],
				source: 'EVENTBRIDGE-SNS',
			})
		})

		it('should keep non-JSON queue bodies as raw strings', () => {
			const result = adapter.parseEvent({
				Records: [
					{
						body: 'plain text message',
						eventSource: 'aws:sqs',
						messageId: 'msg-raw',
					},
				],
			})

			expect(result?.records[0]?.body).toBe('plain text message')
		})

		it('should classify EventBridge scheduled rules as SCHEDULE', () => {
			const scheduled = adapter.parseEvent({
				detail: {},
				'detail-type': 'Scheduled Event',
				id: 'sched-1',
				source: 'aws.events',
			})
			expect(scheduled?.source).toBe('SCHEDULE')

			const scheduler = adapter.parseEvent({
				detail: {
					jobId: 'j1',
				},
				'detail-type': 'Scheduled Event',
				id: 'sched-2',
				source: 'aws.scheduler',
			})
			expect(scheduler).toEqual({
				records: [
					{
						body: {
							jobId: 'j1',
						},
						recordId: 'sched-2',
					},
				],
				source: 'SCHEDULE',
			})
		})
	})

	describe('formatResponse', () => {
		it('should return batchItemFailures for queue with failures', () => {
			const result = adapter.formatResponse('SQS', [
				'msg-1',
				'msg-2',
			])

			expect(result).toEqual({
				batchItemFailures: [
					{
						itemIdentifier: 'msg-1',
					},
					{
						itemIdentifier: 'msg-2',
					},
				],
			})
		})

		it('should return batchItemFailures for envelope chains through SQS too', () => {
			expect(
				adapter.formatResponse('EVENTBRIDGE-SQS', [
					'msg-9',
				]),
			).toEqual({
				batchItemFailures: [
					{
						itemIdentifier: 'msg-9',
					},
				],
			})
		})

		it('should return undefined for queue with no failures', () => {
			expect(adapter.formatResponse('SQS', [])).toBeUndefined()
		})

		it('should return undefined for topic', () => {
			expect(
				adapter.formatResponse('SNS', [
					'id-1',
				]),
			).toBeUndefined()
		})

		it('should return undefined for bucket', () => {
			expect(adapter.formatResponse('S3', [])).toBeUndefined()
		})

		it('should return undefined for event', () => {
			expect(
				adapter.formatResponse('EVENTBRIDGE', [
					'id-1',
				]),
			).toBeUndefined()
		})
	})
})

describe('AwsServerlessAdapter · delivery attempt', () => {
	const adapter = new AwsServerlessAdapter()

	it('reports the delivery count SQS sent', () => {
		const parsed = adapter.parseEvent({
			Records: [
				{
					attributes: {
						ApproximateReceiveCount: '3',
					},
					body: '{"orderId":"123"}',
					eventSource: 'aws:sqs',
					messageId: 'msg-1',
				},
			],
		})

		expect(parsed?.records[0].attempt).toBe(3)
	})

	it('reports 1 on a first delivery', () => {
		const parsed = adapter.parseEvent({
			Records: [
				{
					attributes: {
						ApproximateReceiveCount: '1',
					},
					body: '{"orderId":"123"}',
					eventSource: 'aws:sqs',
					messageId: 'msg-1',
				},
			],
		})

		expect(parsed?.records[0].attempt).toBe(1)
	})

	it('reports none when SQS omitted the attribute', () => {
		const parsed = adapter.parseEvent({
			Records: [
				{
					body: '{"orderId":"123"}',
					eventSource: 'aws:sqs',
					messageId: 'msg-1',
				},
			],
		})

		expect(parsed?.records[0].attempt).toBeUndefined()
	})

	it('ignores a malformed count instead of propagating NaN', () => {
		const parsed = adapter.parseEvent({
			Records: [
				{
					attributes: {
						ApproximateReceiveCount: 'not-a-number',
					},
					body: '{"orderId":"123"}',
					eventSource: 'aws:sqs',
					messageId: 'msg-1',
				},
			],
		})

		expect(parsed?.records[0].attempt).toBeUndefined()
	})

	it('carries no attempt for SNS, which has no retry counter', () => {
		const parsed = adapter.parseEvent({
			Records: [
				{
					EventSource: 'aws:sns',
					Sns: {
						Message: '{"orderId":"123"}',
						MessageId: 'sns-1',
					},
				},
			],
		})

		expect(parsed?.records[0].attempt).toBeUndefined()
	})
})
