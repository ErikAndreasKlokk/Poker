import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { Server } from 'node:http';

/**
 * Runs the WebSocket poker server inside Vite's dev server.
 *
 * The module is pulled in with `ssrLoadModule` rather than a static import so
 * that Vite compiles it on demand — a top-level import would drag the whole
 * server graph into the config file itself. In production the equivalent wiring
 * lives in `server.js`.
 */
function gameServer(databaseUrl: string): Plugin {
	return {
		name: 'poker-game-server',
		apply: 'serve',
		configureServer(server) {
			const httpServer = server.httpServer;
			if (!httpServer || !databaseUrl) return;

			httpServer.once('listening', () => {
				void server
					.ssrLoadModule('/src/server/game-server.ts')
					.then((module) => module.startGameServer(httpServer as Server, databaseUrl))
					.catch((error) => server.config.logger.error(`[poker] game server failed: ${error}`));
			});
		}
	};
}

export default defineConfig(({ mode }) => {
	// Load the full .env (not just VITE_-prefixed keys) so the dev socket server
	// can reach the same database as the app.
	const env = loadEnv(mode, process.cwd(), '');

	return {
		plugins: [
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: adapter(),
				typescript: {
					config: (config) => {
						config.include.push('../drizzle.config.ts');
						// Deliberately not including server.js: it imports build output that
						// only exists after a build, and pulling it in makes svelte-check
						// type-check the entire bundled output.
					}
				}
			}),

			paraglideVitePlugin({
				project: './project.inlang',
				outdir: './src/lib/paraglide',
				emitTsDeclarations: true
			}),

			gameServer(env.DATABASE_URL)
		]
	};
});
