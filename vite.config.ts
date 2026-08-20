import { fileURLToPath, URL } from "node:url";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const sentryBuildEnv = loadEnv("sentry-build-plugin", process.cwd(), "");
  const sentryAuthToken =
    env.SENTRY_AUTH_TOKEN ?? sentryBuildEnv.SENTRY_AUTH_TOKEN;
  const uploadsSourceMaps =
    Boolean(sentryAuthToken) &&
    process.env.SENTRY_DISABLE_AUTO_UPLOAD !== "true";

  return {
    plugins: [
      tanstackRouter({
        target: "react",
        routesDirectory: "./src/client/routes",
        generatedRouteTree: "./src/client/routeTree.gen.ts",
        autoCodeSplitting: true,
      }),
      react(),
      ...(uploadsSourceMaps
        ? [
            sentryVitePlugin({
              org: "evan-2t",
              project: "illinispots",
              authToken: sentryAuthToken,
              silent: !env.CI,
              sourcemaps: {
                filesToDeleteAfterUpload: ["./dist/client/**/*.map"],
              },
              telemetry: false,
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": "http://localhost:3000",
      },
    },
    build: {
      outDir: "dist/client",
      emptyOutDir: true,
      sourcemap: uploadsSourceMaps ? "hidden" : false,
      // Mapbox is intentionally loaded as its own lazy chunk. Keep warnings
      // useful for unexpected growth without flagging that known vendor cost.
      chunkSizeWarningLimit: 1600,
    },
  };
});
