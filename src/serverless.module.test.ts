import { Test } from '@nestjs/testing'
import { ConfigModule } from '@turystack/nestjs-config'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { SERVERLESS_ADAPTER } from '@/serverless.constants.js'
import { ServerlessModule } from '@/serverless.module.js'
import { ServerlessService } from '@/serverless.service.js'

import { AwsServerlessAdapter } from '@/aws/index.js'

afterEach(() => {
	vi.unstubAllEnvs()
})

describe('ServerlessModule', () => {
	describe('register', () => {
		it('should expose ServerlessService globally', () => {
			const dynamicModule = ServerlessModule.register({
				adapter: 'aws',
			})

			expect(dynamicModule.module).toBe(ServerlessModule)
			expect(dynamicModule.global).toBe(true)
			expect(dynamicModule.exports).toEqual([
				ServerlessService,
			])
		})

		it('should resolve options from a config factory', async () => {
			vi.stubEnv('SERVERLESS_ADAPTER', 'aws')

			const moduleRef = await Test.createTestingModule({
				imports: [
					ConfigModule.register({
						envFilePath: false,
						schema: {
							SERVERLESS_ADAPTER: z.string(),
						},
					}),
					ServerlessModule.register((config) => ({
						adapter: config.get('SERVERLESS_ADAPTER') as 'aws',
					})),
				],
			}).compile()

			expect(moduleRef.get(SERVERLESS_ADAPTER)).toBeInstanceOf(
				AwsServerlessAdapter,
			)
			expect(moduleRef.get(ServerlessService)).toBeInstanceOf(ServerlessService)
		})

		it('should reject a config factory without ConfigModule', async () => {
			await expect(
				Test.createTestingModule({
					imports: [
						ServerlessModule.register((config) => ({
							adapter: config.get('SERVERLESS_ADAPTER') as 'aws',
						})),
					],
				}).compile(),
			).rejects.toThrow(
				'requires ConfigModule (@turystack/nestjs-config) to be registered',
			)
		})
	})
})
