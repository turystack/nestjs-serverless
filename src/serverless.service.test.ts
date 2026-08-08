import { Test } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { IServerlessAdapter } from '@/serverless.adapter.interface.js'
import { SERVERLESS_ADAPTER } from '@/serverless.constants.js'
import { ServerlessService } from '@/serverless.service.js'

describe('ServerlessService', () => {
	let service: ServerlessService
	let adapter: IServerlessAdapter

	beforeEach(async () => {
		const mockAdapter: IServerlessAdapter = {
			formatResponse: vi.fn(),
			parseEvent: vi.fn(),
		}

		const module = await Test.createTestingModule({
			providers: [
				ServerlessService,
				{
					provide: SERVERLESS_ADAPTER,
					useValue: mockAdapter,
				},
			],
		}).compile()

		service = module.get(ServerlessService)
		adapter = module.get(SERVERLESS_ADAPTER)
	})

	it('should delegate parseEvent to adapter', () => {
		const event = {
			Records: [],
		}

		service.parseEvent(event)

		expect(adapter.parseEvent).toHaveBeenCalledWith(event)
	})

	it('should delegate formatResponse to adapter', () => {
		service.formatResponse('SQS', [
			'msg-1',
		])

		expect(adapter.formatResponse).toHaveBeenCalledWith('SQS', [
			'msg-1',
		])
	})
})
