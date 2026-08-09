import superjson from 'superjson'
import { describe, expect, it } from 'vitest'

import { decodePayload } from '@/serverless.payload.js'

/**
 * The publisher's half of the contract, reproduced here rather than imported:
 * `@turystack/nestjs-publisher` is an optional peer, and a consumer app that
 * does not install it must still build. Producing the bytes locally also means
 * this test fails if either side drifts, which is the whole point — each
 * library was tested against its own assumptions, and nobody asserted that one
 * could read the other.
 */
function onTheWire(data: unknown, correlationId?: string): unknown {
	const envelope = {
		data,
		turystack: {
			...(correlationId && {
				correlationId,
			}),
			v: 1,
		},
	}

	// superjson.stringify then JSON.parse is exactly what the transport does:
	// the publisher writes a string, AWS hands the consumer the parsed object.
	return JSON.parse(superjson.stringify(envelope))
}

describe('decodePayload', () => {
	it('returns what the publisher passed to publish({ data })', () => {
		const decoded = decodePayload(
			onTheWire({
				orderId: 'order-1',
				total: 99.9,
			}),
		)

		expect(decoded.body).toEqual({
			orderId: 'order-1',
			total: 99.9,
		})
	})

	it('keeps the types superjson exists to preserve', () => {
		const decoded = decodePayload(
			onTheWire({
				paidAt: new Date('2026-01-01T00:00:00.000Z'),
				tags: new Set([
					'priority',
				]),
			}),
		)

		const body = decoded.body as {
			paidAt: Date
			tags: Set<string>
		}

		// A plain JSON.parse gives a string here, and the handler silently
		// operates on the wrong type.
		expect(body.paidAt).toBeInstanceOf(Date)
		expect(body.paidAt.toISOString()).toBe('2026-01-01T00:00:00.000Z')
		expect(body.tags).toBeInstanceOf(Set)
		expect(body.tags.has('priority')).toBe(true)
	})

	it('carries the correlation id across the boundary', () => {
		const decoded = decodePayload(
			onTheWire(
				{
					orderId: 'order-1',
				},
				'req-abc',
			),
		)

		expect(decoded.correlationId).toBe('req-abc')
		expect(decoded.body).toEqual({
			orderId: 'order-1',
		})
	})

	it('reports no correlation when the publisher had none', () => {
		const decoded = decodePayload(
			onTheWire({
				orderId: 'order-1',
			}),
		)

		expect(decoded.correlationId).toBeUndefined()
	})

	describe('payloads that never went through the publisher', () => {
		it('passes a plain object through untouched', () => {
			const decoded = decodePayload({
				bucket: 'uploads',
				key: 'a.png',
			})

			expect(decoded.body).toEqual({
				bucket: 'uploads',
				key: 'a.png',
			})
			expect(decoded.correlationId).toBeUndefined()
		})

		it('passes a raw string through untouched', () => {
			expect(decodePayload('not json at all').body).toBe('not json at all')
		})

		it('does not mistake an application field named json for superjson', () => {
			const body = {
				json: {
					nested: true,
				},
				owner: 'me',
			}

			expect(decodePayload(body).body).toEqual(body)
		})

		it('does not mistake an application field named turystack for the envelope', () => {
			const body = {
				turystack: {
					plan: 'pro',
				},
			}

			expect(decodePayload(body).body).toEqual(body)
		})
	})
})
