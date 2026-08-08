/** DI token for the active {@link IServerlessAdapter} implementation. */
export const SERVERLESS_ADAPTER = Symbol('SERVERLESS_ADAPTER')

/** Reflect-metadata key for classes decorated with {@link Handler}. */
export const HANDLER_METADATA = 'serverless:handler'
