/**
 * Explicit AWS trigger names — the source union this adapter contributes to
 * `@Handler`. Chains name the full delivery path, deepest producer first.
 */
export type AwsEventSource =
	| 'EVENTBRIDGE'
	| 'EVENTBRIDGE-SNS'
	| 'EVENTBRIDGE-SNS-SQS'
	| 'EVENTBRIDGE-SQS'
	| 'S3'
	| 'SCHEDULE'
	| 'SNS'
	| 'SNS-SQS'
	| 'SQS'

/** Minimal SQS event types (no dependency on @types/aws-lambda). */
export type SQSRecord = {
	/**
	 * SQS system attributes. `ApproximateReceiveCount` is how many times this
	 * message has been delivered — the only way a handler can tell a retry from
	 * a first attempt.
	 */
	attributes?: {
		ApproximateReceiveCount?: string
	}
	body: string
	eventSource: 'aws:sqs'
	messageId: string
}

export type SQSEvent = {
	Records: SQSRecord[]
}

/** Minimal SNS event types. */
export type SNSRecord = {
	EventSource: 'aws:sns'
	Sns: {
		Message: string
		MessageId: string
	}
}

export type SNSEvent = {
	Records: SNSRecord[]
}

/** SNS notification envelope, as delivered inside an SQS body (SNS → SQS subscription). */
export type SNSEnvelope = {
	Type: 'Notification'
	Message: string
	MessageId?: string
}

/** Minimal S3 event types. */
export type S3Record = {
	eventSource: 'aws:s3'
	s3: {
		bucket: {
			name: string
		}
		object: {
			eTag?: string
			key: string
			size?: number
		}
	}
}

export type S3Event = {
	Records: S3Record[]
}

/**
 * Minimal EventBridge event/envelope type. Appears both as the direct Lambda
 * event and nested inside SQS/SNS bodies when the bus targets a queue/topic.
 */
export type EventBridgeEvent = {
	'detail-type': string
	detail: unknown
	id: string
	source: string
}

/** SQS batch item failure response. */
export type SQSBatchResponse = {
	batchItemFailures: {
		itemIdentifier: string
	}[]
}
