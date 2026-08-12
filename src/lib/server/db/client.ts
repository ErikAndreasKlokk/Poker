import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Builds a Drizzle client from a plain connection string.
 *
 * Kept free of `$env` so the standalone WebSocket server — which is bundled
 * separately from the SvelteKit app and cannot resolve SvelteKit aliases — can
 * use the exact same schema and query layer.
 */
export function createDb(url: string) {
	return drizzle(postgres(url), { schema });
}

export type Db = ReturnType<typeof createDb>;
