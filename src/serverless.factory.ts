import { NestFactory } from '@nestjs/core'
import { LoggerService } from '@turystack/nestjs-logger'

import {
	correlationOf,
	resolveContextRunner,
	type ServerlessContextRunner,
} from '@/serverless.context.js'
import { ServerlessService } from '@/serverless.service.js'
import type { IHandler } from '@/serverless.types.js'
import { getHandlerMetadata, getHandlers } from '@/serverless.utils.js'

/** Used when the context package is absent: runs the record unwrapped. */
const passthrough: ServerlessContextRunner = (_context, callback) => callback()

/**
 * Serverless application factory.
 *
 * Returns a serverless handler function synchronously — no top-level await.
 * The NestJS application context is bootstrapped lazily on the first
 * invocation (cold start) and reused for every invocation after that.
 *
 * @example
 * ```ts
 * import { Serverless } from '@turystack/nestjs-serverless'
 * import { AppModule } from './app.module'
 *
 * export const handler = Serverless.create(AppModule)
 * ```
 */
export const Serverless = {
	create(module: new (...args: unknown[]) => unknown) {
		const logger = new LoggerService('Serverless')

		const bootstrap = async () => {
			const app = await NestFactory.createApplicationContext(module)
			const serverlessService = app.get(ServerlessService)

			await app.init()

			const handlers = getHandlers()

			if (handlers.length !== 1) {
				throw new Error(
					`Expected exactly 1 @Handler(), found ${handlers.length}`,
				)
			}

			const HandlerClass = handlers[0]
			const metadata = getHandlerMetadata(HandlerClass)

			if (!metadata) {
				throw new Error(`Missing metadata for @Handler() ${HandlerClass.name}`)
			}
			const instance = app.get(HandlerClass) as IHandler

			// Optional peer: when the app registers the publisher, its pending
			// fire-and-forget deliveries are flushed before the lambda freezes.
			let flushPublisher: (() => Promise<void>) | undefined
			try {
				const { PublisherService } = await import('@turystack/nestjs-publisher')
				const publisher = app.get(PublisherService, {
					strict: false,
				})
				flushPublisher = () => publisher.flush()
			} catch {
				flushPublisher = undefined
			}

			logger.info('Handler registered', {
				handler: HandlerClass.name,
				source: metadata.source,
			})

			return {
				flushPublisher,
				handlerName: HandlerClass.name,
				instance,
				metadata,
				serverlessService,
			}
		}

		let runtime: ReturnType<typeof bootstrap> | undefined
		let runInContext: ServerlessContextRunner | undefined

		return async (event: unknown, _context: unknown): Promise<unknown> => {
			runtime ??= bootstrap().catch((error) => {
				runtime = undefined
				throw error
			})
			const {
				flushPublisher,
				handlerName,
				instance,
				metadata,
				serverlessService,
			} = await runtime

			const parsed = serverlessService.parseEvent(event)

			if (!parsed) {
				logger.warn('Unrecognized event', {
					event,
				})
				return
			}

			const failedRecordIds: string[] = []

			runInContext ??= (await resolveContextRunner()) ?? passthrough

			for (const record of parsed.records) {
				try {
					const payload = metadata.schema
						? metadata.schema.parse(record.body)
						: record.body

					// Each record is its own operation, and it inherits the id the
					// publisher travelled with — the chain crossed a process boundary,
					// so generating a new one here would break it.
					await runInContext(
						{
							attributes: {
								handler: handlerName,
								// Rides along on every log line of this record, so a
								// failure on the fifth delivery is distinguishable from
								// one on the first without any extra plumbing.
								...(record.attempt !== undefined && {
									attempt: String(record.attempt),
								}),
							},
							// The envelope is the mechanism; the payload field is the
							// older convention, kept so a producer that predates it
							// still ties its chain together.
							correlationId: record.correlationId ?? correlationOf(record.body),
						},
						() => instance.execute(payload),
					)
				} catch (error) {
					logger.error('Record processing failed', {
						error: error as Error,
						handler: handlerName,
						recordId: record.recordId,
					})
					if (record.recordId) {
						failedRecordIds.push(record.recordId)
					}
				}
			}

			await flushPublisher?.()

			return serverlessService.formatResponse(parsed.source, failedRecordIds)
		}
	},
}
