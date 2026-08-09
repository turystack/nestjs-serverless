import superjson from 'superjson'

/**
 * Undoes what the publisher did to the payload before it went on the wire.
 *
 * Two layers, in this order:
 *
 * 1. **superjson** — `@turystack/nestjs-publisher` serializes with it so a
 *    `Date`, `Map` or `Set` survives the trip. Reading the body with a plain
 *    `JSON.parse` hands the handler superjson's own wrapper (`{ json, meta }`)
 *    instead of the payload, and every non-JSON type arrives as a string.
 * 2. **the turystack envelope** — carries the correlation id beside the data,
 *    because no transport offers a metadata field that works everywhere.
 *
 * Every step is optional and detected by shape: a record from S3, from a
 * third-party EventBridge rule, or from a producer older than the envelope
 * passes through untouched.
 */

/** What superjson.serialize produces. */
type SuperjsonShape = {
	json: unknown
	meta?: unknown
}

/**
 * Recognises superjson output.
 *
 * Deliberately strict about the key set: an application payload with its own
 * `json` field must not be mistaken for a wrapper and unwrapped into it.
 */
function isSuperjson(value: unknown): value is SuperjsonShape {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false
	}

	const keys = Object.keys(value)

	return (
		keys.includes('json') &&
		keys.every((key) => key === 'json' || key === 'meta')
	)
}

/** What the publisher wraps around the payload. */
type Envelope = {
	turystack: {
		v: number
		correlationId?: string
	}
	data: unknown
}

/** Recognises the envelope by its version, not by the key alone. */
function isEnvelope(value: unknown): value is Envelope {
	if (!value || typeof value !== 'object' || !('turystack' in value)) {
		return false
	}

	const meta = (
		value as {
			turystack?: unknown
		}
	).turystack

	return (
		!!meta &&
		typeof meta === 'object' &&
		typeof (
			meta as {
				v?: unknown
			}
		).v === 'number'
	)
}

export type DecodedPayload = {
	/** The payload as the publisher passed it to `publish({ data })`. */
	body: unknown
	/** Correlation id the publisher travelled with, when it sent one. */
	correlationId?: string
}

/** Peels both layers off a value already parsed out of its transport envelope. */
export function decodePayload(value: unknown): DecodedPayload {
	const deserialized = isSuperjson(value)
		? superjson.deserialize(value as never)
		: value

	if (!isEnvelope(deserialized)) {
		return {
			body: deserialized,
		}
	}

	const { correlationId } = deserialized.turystack

	return {
		body: deserialized.data,
		...(typeof correlationId === 'string' && {
			correlationId,
		}),
	}
}
