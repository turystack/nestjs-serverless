/** Opens a context scope around one record. */
export type ServerlessContextRunner = <T>(
	context: {
		attributes?: Record<string, string>
		correlationId?: string
	},
	callback: () => T,
) => T

/**
 * Resolves `runWithContext` from `@turystack/nestjs-context`.
 *
 * Optional peer, imported lazily: a handler app that does not propagate context
 * still works, its records simply run unscoped.
 */
export async function resolveContextRunner(): Promise<
	ServerlessContextRunner | undefined
> {
	try {
		const { runWithContext } = await import('@turystack/nestjs-context')
		return runWithContext as ServerlessContextRunner
	} catch {
		return undefined
	}
}

/**
 * Reads the correlation id the publisher travelled with.
 *
 * The chain crosses a process boundary here, so the id has to come off the
 * message rather than be generated — otherwise the consumer's logs would never
 * tie back to the request that produced the event.
 */
export function correlationOf(body: unknown): string | undefined {
	if (!body || typeof body !== 'object') {
		return undefined
	}

	const candidate = (
		body as {
			correlationId?: unknown
		}
	).correlationId

	return typeof candidate === 'string' ? candidate : undefined
}
