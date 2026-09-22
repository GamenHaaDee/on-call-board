import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Draait de API binnen de vite-devserver, zodat `npm run dev` genoeg is:
// één proces voor frontend + backend. Zet VITE_API_PROXY als je in plaats
// daarvan naar een backend elders wilt proxyen.
function embeddedApi(): Plugin {
  return {
    name: "rotacall-embedded-api",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      if (process.env.VITE_API_PROXY) return;

      // Pas laden bij het eerste /api-verzoek: dan is de devserver volledig
      // opgestart en kan vite de TypeScript van de server inladen.
      type ApiApp = (req: unknown, res: unknown, next: () => void) => void;
      let api: Promise<ApiApp> | null = null;
      const load = () => {
        if (!api) {
          api = server.ssrLoadModule(path.resolve(__dirname, "server/app.ts")).then(async (mod) => {
            const stopCron = await mod.startScheduler();
            server.httpServer?.once("close", () => stopCron());
            return mod.createApiApp();
          });
        }
        return api;
      };

      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api")) return next();
        load().then(
          (app) => app(req, res, next),
          (err) => {
            server.config.logger.error(`[vite] API laden mislukt: ${err.message}`);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "API niet beschikbaar (zie serverlog)" }));
          }
        );
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // Alleen actief als je expliciet naar een externe backend wilt proxyen.
    proxy: process.env.VITE_API_PROXY
      ? { "/api": { target: process.env.VITE_API_PROXY, changeOrigin: true } }
      : undefined,
  },
  plugins: [react(), embeddedApi()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
