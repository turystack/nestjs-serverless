import { type DynamicModule, Module } from '@nestjs/common'
import { ConfigService } from '@turystack/nestjs-config'

import type { IServerlessAdapter } from '@/serverless.adapter.interface.js'
import { SERVERLESS_ADAPTER } from '@/serverless.constants.js'
import { ServerlessService } from '@/serverless.service.js'
import type { ServerlessModuleOptions } from '@/serverless.types.js'

import { AwsServerlessAdapter } from '@/aws/index.js'

@Module({})
export class ServerlessModule {
	/**
	 * Registers the serverless event parsing globally. Register it once in the
	 * handler's root module; {@link Serverless.create} resolves
	 * {@link ServerlessService} from the application context.
	 *
	 * The `(config) => options` factory form injects the `ConfigService` from
	 * `@turystack/nestjs-config` at boot.
	 */
	static register(
		options:
			| ServerlessModuleOptions
			| ((config: ConfigService) => ServerlessModuleOptions),
	): DynamicModule {
		return {
			exports: [
				ServerlessService,
			],
			global: true,
			module: ServerlessModule,
			providers: [
				{
					inject: [
						{
							optional: true,
							token: ConfigService,
						},
					],
					provide: SERVERLESS_ADAPTER,
					useFactory: (config?: ConfigService) =>
						ServerlessModule._createAdapter(
							ServerlessModule._resolveOptions(options, config),
						),
				},
				ServerlessService,
			],
		}
	}

	private static _createAdapter(
		options: ServerlessModuleOptions,
	): IServerlessAdapter {
		switch (options.adapter) {
			case 'aws':
				return new AwsServerlessAdapter()
		}
	}

	private static _resolveOptions(
		optionsOrFactory:
			| ServerlessModuleOptions
			| ((config: ConfigService) => ServerlessModuleOptions),
		config?: ConfigService,
	): ServerlessModuleOptions {
		if (typeof optionsOrFactory !== 'function') {
			return optionsOrFactory
		}

		if (!config) {
			throw new Error(
				'[ServerlessModule] register((config) => ...) requires ConfigModule (@turystack/nestjs-config) to be registered',
			)
		}

		return optionsOrFactory(config)
	}
}
