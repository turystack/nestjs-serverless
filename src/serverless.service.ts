import { Inject, Injectable } from '@nestjs/common'

import type { IServerlessAdapter } from '@/serverless.adapter.interface.js'
import { SERVERLESS_ADAPTER } from '@/serverless.constants.js'
import type { EventSource } from '@/serverless.types.js'

/**
 * High-level service for parsing and formatting serverless events.
 *
 * Delegates to the underlying {@link IServerlessAdapter} implementation.
 */
@Injectable()
export class ServerlessService {
	constructor(
		@Inject(SERVERLESS_ADAPTER)
		private readonly _adapter: IServerlessAdapter,
	) {}

	/** Parses the raw Lambda event into typed records. */
	parseEvent(event: unknown) {
		return this._adapter.parseEvent(event)
	}

	/** Formats the response for the Lambda runtime. */
	formatResponse(source: EventSource, failedRecordIds: string[]) {
		return this._adapter.formatResponse(source, failedRecordIds)
	}
}
