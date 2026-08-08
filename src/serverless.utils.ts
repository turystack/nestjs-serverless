import { HANDLER_METADATA } from '@/serverless.constants.js'
import {
	type HandlerCtor,
	handlerMetadataRegistry,
	handlerRegistry,
} from '@/serverless.decorator.js'

/** Returns all classes registered with {@link Handler}. */
export function getHandlers() {
	return Array.from(handlerRegistry)
}

/** Returns the {@link HandlerMetadata} for a handler class. */
export function getHandlerMetadata(target: HandlerCtor) {
	return handlerMetadataRegistry.get(target)
}

/** Checks whether a class is a registered handler. */
export function isHandler(target: unknown) {
	return Reflect.getMetadata(HANDLER_METADATA, target as object) === true
}
