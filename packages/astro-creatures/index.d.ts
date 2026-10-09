import type { AstroIntegration } from 'astro';
import type { Options } from './src/types';

export type { Concierge, Config, Crew, Options, Station } from './src/types';

/** Your content, shown by one of two shells: 'clean' (the default) or 'room'. */
export default function creatures(options?: Options): AstroIntegration;
