# Serverless

A serverless handler wrapper for NestJS: one `@Handler` class per function, and the input is normalized **whatever the event source is**. AWS is the built-in adapter option.

## The idea

The lambda is just a wrapper around a single handler. The adapter recognizes the raw event, unwraps any delivery envelopes, and hands the handler the original payload as typed records. The source names are agnostic — the mapping below is the **AWS context** (built-in adapter):

| Trigger | Source | What the handler receives |
|---|---|---|
| SQS | `SQS` | Each record's JSON body (batch, with partial-failure reporting) |
| EventBridge → SQS | `EVENTBRIDGE-SQS` | The event `detail` (envelope unwrapped) |
| SNS → SQS | `SNS-SQS` | The notification `Message` (envelope unwrapped) |
| EventBridge → SNS → SQS | `EVENTBRIDGE-SNS-SQS` | The event `detail` (unwrapped recursively) |
| SNS | `SNS` | The notification `Message` |
| EventBridge → SNS | `EVENTBRIDGE-SNS` | The event `detail` |
| S3 | `S3` | `{ bucket, key, size, eTag }` per record |
| EventBridge | `EVENTBRIDGE` | The event `detail` |
| EventBridge scheduled rules (`aws.events` / `aws.scheduler`) | `SCHEDULE` | The event `detail` |

The source is detected from the actual event at runtime — the chain names make the wiring explicit in the `@Handler` declaration. The `@Handler` union is typed by the adapter: the built-in AWS adapter contributes these names via the `ServerlessSourceMap` registry, and a custom adapter would contribute its own.

Non-JSON queue bodies fall back to the raw string. Unrecognized events are logged and skipped.

## Setup

```ts
// handler.ts — one file per lambda
import { Module } from '@nestjs/common'
import {
  createHandlerSchema,
  Handler,
  Serverless,
  ServerlessModule,
} from '@turystack/nestjs-serverless'
import { z } from 'zod'

const schema = createHandlerSchema(
  z.object({
    subscriptionId: z.string(),
  }),
)

// no implements needed: the decorator checks execute against
// z.infer<typeof schema> at compile time
@Handler('EVENTBRIDGE-SQS', { schema })
class CreateSubscriptionHandler {
  constructor(private readonly subscriptions: SubscriptionService) {} // monorepo lib

  async execute(event: z.infer<typeof schema>) {
    await this.subscriptions.create(event.subscriptionId)
  }
}

@Module({
  imports: [
    ServerlessModule.register({ adapter: 'aws' }),
    // global lib modules: cache, logger, publisher...
  ],
  providers: [CreateSubscriptionHandler],
})
class HandlerModule {}

export const handler = Serverless.create(HandlerModule)
```

- `register` also accepts a `(config) => options` factory that injects the `ConfigService` from `@turystack/nestjs-config` at boot — requires `ConfigModule.register({ schema: configSchema })` in the module, with the schema registered for typed `config.get(...)`:

  ```ts
  export const configSchema = defineConfigSchema({
    QUEUE_URL: z.string(),
  })

  declare module '@turystack/nestjs-config' {
    interface ConfigSchemaRegistry {
      schema: typeof configSchema
    }
  }
  ```
- `Serverless.create` is synchronous — no top-level await. The app context boots lazily on the first invocation (cold start) and is cached for warm invocations.
- Exactly one `@Handler()` class must be registered — more or less than one throws on the first invocation.
- With a `schema`, every record body is validated with Zod before `execute`; invalid records count as failures.
- For SQS-based sources (`SQS`, `EVENTBRIDGE-SQS`, `SNS-SQS`, ...), failed records are reported as `batchItemFailures` (partial batch failure) so only they are redelivered.
- When the app registers `@turystack/nestjs-publisher` (optional peer), the wrapper awaits `publisher.flush()` after processing — pending fire-and-forget publishes are delivered before the lambda freezes.

## API

| Export | Description |
|---|---|
| `Serverless.create(module)` | Returns the lambda function; boots the context once on first invoke |
| `@Handler(source, { schema? })` | Registers the handler class (applies `@Injectable`) |
| `createHandlerSchema(schema)` / `HandlerInput<T>` | Typed Zod schema helpers |
| `ServerlessModule.register({ adapter: 'aws' })` | Global registration of the parsing service |
| `IServerlessAdapter` / `SERVERLESS_ADAPTER` | Adapter contract + DI token for custom providers |

## Adapters

Parsing is abstracted behind `IServerlessAdapter` (`parseEvent` → records + source, `formatResponse` → runtime response). To add a provider, implement it and bind to the `SERVERLESS_ADAPTER` token.

| Adapter | Notes |
|---|---|
| `'aws'` | SQS/SNS/S3/EventBridge, recursive envelope unwrapping, scheduled rules, direct invocations, SQS partial batch failures |
