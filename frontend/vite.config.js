import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildDebugReport } from './dev/debugReport.js';
import { buildNeighborhoodIndex } from './dev/neighborhoodGraph.js';
import { readSourceSnippet, traceSource } from './dev/sourceTrace.js';

function json(res, body, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function debugReportPlugin() {
  return {
    name: 'valhalla-debug-report',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const parsed = new URL(req.url || '/', 'http://127.0.0.1');
        if (parsed.pathname === '/__debug/source') {
          try {
            const id = parsed.searchParams.get('id');
            const filePath = parsed.searchParams.get('path');
            if (filePath) {
              const snippet = readSourceSnippet(filePath, parsed.searchParams.get('symbol'));
              return json(res, snippet, snippet.error ? 403 : 200);
            }
            if (id) return json(res, traceSource(id));
            return json(res, { error: 'id or path required' }, 400);
          } catch (err) {
            return json(res, { error: err.message }, 500);
          }
        }
        const builders = {
          '/__debug/report': buildDebugReport,
          '/__debug/graph': buildNeighborhoodIndex,
        };
        const build = builders[parsed.pathname];
        if (!build) return next();
        try {
          json(res, build());
        } catch (err) {
          json(res, { error: err.message }, 500);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), debugReportPlugin()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:5001',
      '/auth': 'http://localhost:5001'
    }
  }
});
