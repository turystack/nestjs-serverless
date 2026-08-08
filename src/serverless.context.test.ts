import { describe, expect, it } from 'vitest'

import { correlationOf } from '@/serverless.context.js'

describe('correlationOf', () => {
	it('reads the id the publisher travelled with', () => {
		expect(
			correlationOf({
				correlationId: 'req-1',
				orderId: 'o1',
			}),
		).toBe('req-1')
	})

	it('reports none when the message carries no id', () => {
		expect(
			correlationOf({
				orderId: 'o1',
			}),
		).toBeUndefined()
	})

	it('ignores a non-string id instead of propagating garbage', () => {
		expect(
			correlationOf({
				correlationId: 42,
			}),
		).toBeUndefined()
	})

	it('tolerates a null body', () => {
		expect(correlationOf(null)).toBeUndefined()
	})

	it('tolerates a primitive body', () => {
		expect(correlationOf('raw string')).toBeUndefined()
	})
})
