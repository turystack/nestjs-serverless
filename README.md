# @turystack/nestjs-serverless

Serverless handler wrapper for NestJS: normalizes any event source into typed records. AWS built-in.

## Installation

```bash
pnpm add @turystack/nestjs-serverless
```

### Peer dependencies

The host application provides these:

```bash
pnpm add @nestjs/common @nestjs/core @turystack/nestjs-config @turystack/nestjs-logger reflect-metadata rxjs zod
```

Optional — install only the ones whose feature you use:

```bash
pnpm add @turystack/nestjs-context @turystack/nestjs-publisher
```

## Documentation

Options, API reference and examples:

**https://tury.dev/libs/nestjs-serverless**

## Development

```bash
pnpm install
pnpm typecheck
pnpm check
pnpm test
pnpm build
```
