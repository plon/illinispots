import { fileURLToPath, URL } from "node:url";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { getPackedCampusTimezone } from "./scripts/campus-timezone.ts";

const CAMPUS_MOMENT_MODULE_ID = "\0campus-moment-timezone";

/**
 * moment-timezone's default browser entry includes every IANA zone (~715 kB
 * minified). The client only evaluates campus time, so load the package's full
 * historical Chicago rules without shipping unrelated timezone data.
 */
function campusTimezonePlugin(): Plugin {
  const campusZone = getPackedCampusTimezone();

  return {
    name: "campus-moment-timezone",
    enforce: "pre",
    resolveId(source) {
      return source === "moment-timezone" ? CAMPUS_MOMENT_MODULE_ID : null;
    },
    load(id) {
      if (id !== CAMPUS_MOMENT_MODULE_ID) return null;

      return [
        'import moment from "moment-timezone/moment-timezone.js";',
        `moment.tz.add(${JSON.stringify(campusZone)});`,
        "export default moment;",
      ].join("\n");
    },
  };
}

const sentryVitePlugin =
  process.env.SENTRY_DISABLE_AUTO_UPLOAD === "true"
    ? undefined
    : (await import("@sentry/vite-plugin")).sentryVitePlugin;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const sentryBuildEnv = loadEnv("sentry-build-plugin", process.cwd(), "");
  const sentryAuthToken =
    env.SENTRY_AUTH_TOKEN ?? sentryBuildEnv.SENTRY_AUTH_TOKEN;
  const uploadsSourceMaps =
    Boolean(sentryAuthToken) &&
    process.env.SENTRY_DISABLE_AUTO_UPLOAD !== "true";
  const sentryPlugin =
    uploadsSourceMaps && sentryVitePlugin
      ? sentryVitePlugin({
          org: "evan-2t",
          project: "illinispots",
          authToken: sentryAuthToken,
          silent: !env.CI,
          sourcemaps: {
            filesToDeleteAfterUpload: ["./dist/client/**/*.map"],
          },
          telemetry: false,
        })
      : undefined;

  return {
    define: {
      __SENTRY_DEBUG__: false,
    },
    plugins: [
      campusTimezonePlugin(),
      tanstackRouter({
        target: "react",
        routesDirectory: "./src/client/routes",
        generatedRouteTree: "./src/client/routeTree.gen.ts",
        autoCodeSplitting: true,
      }),
      react(),
      ...(sentryPlugin ? [sentryPlugin] : []),
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
