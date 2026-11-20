import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Runs the files in /api under `npm run dev`, the same way Vercel runs them
// in production. Reads AUTH_SECRET / AUTH_USERS from .env.local.
function apiDevServer() {
  return {
    name: 'api-dev-server',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '');
      for (const [k, v] of Object.entries(env)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
      // Tells /api/signup it may save new accounts into this file (dev only).
      process.env.AUTH_ENV_FILE = path.resolve(process.cwd(), '.env.local');

      server.middlewares.use(async (req, res, next) => {
        if (!(req.url || '').startsWith('/api/')) return next();

        // Same helpers Vercel adds to the response.
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (data) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        };

        // Only top-level files in /api are endpoints (not _lib, not static source).
        const match = /^\/api\/([a-z-]+)(?:\?.*)?$/.exec(req.url);
        if (!match) return res.status(404).json({ error: 'Not found' });

        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const raw = Buffer.concat(chunks).toString();
          try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }

          const mod = await server.ssrLoadModule(`/api/${match[1]}.js`);
          await mod.default(req, res);
        } catch (err) {
          if (err?.code === 'ERR_LOAD_URL' || /Failed to load url/.test(err?.message || '')) {
            return res.status(404).json({ error: 'Not found' });
          }
          console.error(err);
          res.status(500).json({ error: 'Server error' });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiDevServer()],
  server: {
    // /api/signup edits .env.local itself and updates process.env, so Vite
    // must not restart (and reload the page) every time that file changes.
    // Edit it by hand? Stop and re-run `npm run dev`.
    watch: { ignored: ['**/.env.local'] },
  },
});
