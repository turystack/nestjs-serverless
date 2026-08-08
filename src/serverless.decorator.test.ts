import 'reflect-metadata'

import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import type { HandlerCtor } from '@/serverless.decorator.js'
import {
	createHandlerSchema,
	Handler,
	type HandlerInput,
	handlerMetadataRegistry,
	handlerRegistry,
} from '@/serverless.decorator.js'
import {
	getHandlerMetadata,
	getHandlers,
	isHandler,
} from '@/serverless.utils.js'

describe('Serverless Decorators', () => {
	beforeEach(() => {
		handlerRegistry.clear()
		handlerMetadataRegistry.clear()
	})

	describe('@Handler', () => {
		it('should register class in handler registry', () => {
			@Handler('SQS')
			class TestHandler {
				async execute() {}
			}

			expect(handlerRegistry.has(TestHandler as unknown as HandlerCtor)).toBe(
				true,
			)
		})

		it('should mark class with handler metadata', () => {
			@Handler('SQS')
			class TestHandler {
				async execute() {}
			}

			expect(isHandler(TestHandler)).toBe(true)
		})

		it('should store source in metadata', () => {
			@Handler('SNS')
			class TestHandler {
				async execute() {}
			}

			const metadata = getHandlerMetadata(TestHandler as unknown as HandlerCtor)

			expect(metadata?.source).toBe('SNS')
		})

		it('should store schema in metadata', () => {
			const schema = z.object({
				id: z.string(),
			})

			@Handler('SQS', {
				schema,
			})
			class TestHandler {
				async execute(_event: HandlerInput<typeof schema>) {}
			}

			const metadata = getHandlerMetadata(TestHandler as unknown as HandlerCtor)

			expect(metadata?.schema).toBe(schema)
		})

		it('should support all event sources', () => {
			@Handler('SQS')
			class QueueHandler {
				async execute() {}
			}

			@Handler('SNS')
			class TopicHandler {
				async execute() {}
			}

			@Handler('S3')
			class BucketHandler {
				async execute() {}
			}

			@Handler('EVENTBRIDGE')
			class EventHandler {
				async execute() {}
			}

			const handlers = getHandlers()

			expect(handlers).toContain(QueueHandler)
			expect(handlers).toContain(TopicHandler)
			expect(handlers).toContain(BucketHandler)
			expect(handlers).toContain(EventHandler)
		})
	})

	describe('createHandlerSchema', () => {
		it('should return the schema as-is', () => {
			const schema = z.object({
				name: z.string(),
			})

			expect(createHandlerSchema(schema)).toBe(schema)
		})
	})

	describe('getHandlers', () => {
		it('should return all registered handlers', () => {
			@Handler('SQS')
			class HandlerA {
				async execute() {}
			}

			@Handler('SNS')
			class HandlerB {
				async execute() {}
			}

			const handlers = getHandlers()

			expect(handlers).toContain(HandlerA)
			expect(handlers).toContain(HandlerB)
		})
	})

	describe('isHandler', () => {
		it('should return false for non-handler', () => {
			class NotAHandler {}

			expect(isHandler(NotAHandler)).toBe(false)
		})
	})

	describe('schema-typed decorator', () => {
		it('should accept a class typed with z.infer, without implements', () => {
			const schema = createHandlerSchema(
				z.object({
					orderId: z.string(),
				}),
			)

			@Handler('SQS', {
				schema,
			})
			class TypedHandler {
				async execute(_event: z.infer<typeof schema>) {}
			}

			expect(handlerRegistry.has(TypedHandler as unknown as HandlerCtor)).toBe(
				true,
			)
		})

		it('should reject a class whose execute mismatches the schema (compile-time)', () => {
			const schema = createHandlerSchema(
				z.object({
					orderId: z.string(),
				}),
			)

			// @ts-expect-error execute parameter is incompatible with z.infer<typeof schema>
			@Handler('SQS', {
				schema,
			})
			class MismatchedHandler {
				async execute(_event: { totallyDifferent: boolean }) {}
			}

			expect(MismatchedHandler).toBeDefined()
		})
	})
})
