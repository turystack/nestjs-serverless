import { Module } from '@nestjs/common'
import { PublisherModule, PublisherService } from '@turystack/nestjs-publisher'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
	Handler,
	handlerMetadataRegistry,
	handlerRegistry,
} from '@/serverless.decorator.js'
import { Serverless } from '@/serverless.factory.js'
import { ServerlessModule } from '@/serverless.module.js'

describe('Serverless.create', () => {
	beforeEach(() => {
		handlerRegistry.clear()
		handlerMetadataRegistry.clear()
	})

	afterEach(() => {
		handlerRegistry.clear()
		handlerMetadataRegistry.clear()
	})

	it('should throw if no handlers registered', async () => {
		@Module({
			imports: [
				ServerlessModule.register({
					adapter: 'aws',
				}),
			],
		})
		class EmptyModule {}

		const lambdaHandler = Serverless.create(EmptyModule)

		await expect(lambdaHandler({}, {})).rejects.toThrow(
			'Expected exactly 1 @Handler(), found 0',
		)
	})

	it('should throw if multiple handlers registered', async () => {
		@Handler('SQS')
		class HandlerA {
			async execute() {}
		}

		@Handler('SNS')
		class HandlerB {
			async execute() {}
		}

		@Module({
			imports: [
				ServerlessModule.register({
					adapter: 'aws',
				}),
			],
			providers: [
				HandlerA,
				HandlerB,
			],
		})
		class MultiModule {}

		const lambdaHandler = Serverless.create(MultiModule)

		await expect(lambdaHandler({}, {})).rejects.toThrow(
			'Expected exactly 1 @Handler(), found 2',
		)
	})

	it('should create a working lambda handler for SQS events', async () => {
		const handleFn = vi.fn()

		@Handler('SQS')
		class OrderHandler {
			async execute(event: unknown) {
				handleFn(event)
			}
		}

		@Module({
			imports: [
				ServerlessModule.register({
					adapter: 'aws',
				}),
			],
			providers: [
				OrderHandler,
			],
		})
		class AppModule {}

		const lambdaHandler = Serverless.create(AppModule)

		const sqsEvent = {
			Records: [
				{
					body: '{"orderId":"123"}',
					eventSource: 'aws:sqs',
					messageId: 'msg-1',
				},
			],
		}

		const result = await lambdaHandler(sqsEvent, {})

		expect(handleFn).toHaveBeenCalledWith({
			orderId: '123',
		})
		expect(result).toBeUndefined()
	})

	it('should validate payload with schema', async () => {
		const schema = z.object({
			orderId: z.string(),
		})
		const handleFn = vi.fn()

		@Handler('SQS', {
			schema,
		})
		class OrderHandler {
			async execute(event: unknown) {
				handleFn(event)
			}
		}

		@Module({
			imports: [
				ServerlessModule.register({
					adapter: 'aws',
				}),
			],
			providers: [
				OrderHandler,
			],
		})
		class AppModule {}

		const lambdaHandler = Serverless.create(AppModule)

		const sqsEvent = {
			Records: [
				{
					body: '{"orderId":"123"}',
					eventSource: 'aws:sqs',
					messageId: 'msg-1',
				},
			],
		}

		await lambdaHandler(sqsEvent, {})

		expect(handleFn).toHaveBeenCalledWith({
			orderId: '123',
		})
	})

	it('should report partial batch failures for SQS', async () => {
		@Handler('SQS')
		class FailingHandler {
			async execute() {
				throw new Error('Processing failed')
			}
		}

		@Module({
			imports: [
				ServerlessModule.register({
					adapter: 'aws',
				}),
			],
			providers: [
				FailingHandler,
			],
		})
		class AppModule {}

		const lambdaHandler = Serverless.create(AppModule)

		const sqsEvent = {
			Records: [
				{
					body: '{"id":"1"}',
					eventSource: 'aws:sqs',
					messageId: 'msg-1',
				},
				{
					body: '{"id":"2"}',
					eventSource: 'aws:sqs',
					messageId: 'msg-2',
				},
			],
		}

		const result = await lambdaHandler(sqsEvent, {})

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

	it('should warn and return undefined for unparseable events', async () => {
		const handleFn = vi.fn()

		@Handler('SQS')
		class TestHandler {
			async execute(event: unknown) {
				handleFn(event)
			}
		}

		@Module({
			imports: [
				ServerlessModule.register({
					adapter: 'aws',
				}),
			],
			providers: [
				TestHandler,
			],
		})
		class AppModule {}

		const lambdaHandler = Serverless.create(AppModule)

		const result = await lambdaHandler(
			{
				unknown: true,
			},
			{},
		)

		expect(handleFn).not.toHaveBeenCalled()
		expect(result).toBeUndefined()
	})

	it('should handle EventBridge events', async () => {
		const handleFn = vi.fn()

		@Handler('EVENTBRIDGE')
		class EventHandler {
			async execute(event: unknown) {
				handleFn(event)
			}
		}

		@Module({
			imports: [
				ServerlessModule.register({
					adapter: 'aws',
				}),
			],
			providers: [
				EventHandler,
			],
		})
		class AppModule {}

		const lambdaHandler = Serverless.create(AppModule)

		const ebEvent = {
			detail: {
				orderId: '789',
			},
			'detail-type': 'OrderCreated',
			id: 'eb-1',
			source: 'com.app.orders',
		}

		await lambdaHandler(ebEvent, {})

		expect(handleFn).toHaveBeenCalledWith({
			orderId: '789',
		})
	})

	it('should handle schema validation failures as record failures', async () => {
		const schema = z.object({
			orderId: z.string(),
		})

		@Handler('SQS', {
			schema,
		})
		class StrictHandler {
			async execute() {}
		}

		@Module({
			imports: [
				ServerlessModule.register({
					adapter: 'aws',
				}),
			],
			providers: [
				StrictHandler,
			],
		})
		class AppModule {}

		const lambdaHandler = Serverless.create(AppModule)

		const sqsEvent = {
			Records: [
				{
					body: '{"invalid":true}',
					eventSource: 'aws:sqs',
					messageId: 'msg-1',
				},
			],
		}

		const result = await lambdaHandler(sqsEvent, {})

		expect(result).toEqual({
			batchItemFailures: [
				{
					itemIdentifier: 'msg-1',
				},
			],
		})
	})
})

describe('Serverless.create publisher flush', () => {
	beforeEach(() => {
		handlerRegistry.clear()
		handlerMetadataRegistry.clear()
	})

	it('should flush pending publishes before returning', async () => {
		const flushSpy = vi.spyOn(PublisherService.prototype, 'flush')
		const delivered: unknown[] = []

		@Handler('SQS')
		class PublishingHandler {
			constructor(private readonly publisher: PublisherService) {}

			async execute(event: unknown) {
				this.publisher.publish({
					data: event,
					destination: 'TOPIC',
					name: 'OrderCreated',
				} as never)
				delivered.push(event)
			}
		}

		@Module({
			imports: [
				ServerlessModule.register({
					adapter: 'aws',
				}),
				PublisherModule.register({
					adapter: 'aws',
					aws: {
						region: 'us-east-1',
					},
				}),
			],
			providers: [
				PublishingHandler,
			],
		})
		class AppModule {}

		const lambdaHandler = Serverless.create(AppModule)

		await lambdaHandler(
			{
				Records: [
					{
						body: '{"orderId":"9"}',
						eventSource: 'aws:sqs',
						messageId: 'msg-1',
					},
				],
			},
			{},
		)

		expect(delivered).toHaveLength(1)
		expect(flushSpy).toHaveBeenCalledTimes(1)
		flushSpy.mockRestore()
	})
})
