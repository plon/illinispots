import type { BunPlugin } from "bun";
import { rm } from "node:fs/promises";
import { getPackedCampusTimezone } from "./campus-timezone.ts";

const packedCampusTimezone = getPackedCampusTimezone();
const campusTimezonePlugin: BunPlugin = {
  name: "campus-moment-timezone",
  setup(build) {
    build.onResolve({ filter: /^moment-timezone$/ }, () => ({
      path: "campus-moment-timezone",
      namespace: "campus-timezone",
    }));
    build.onLoad(
      { filter: /.*/, namespace: "campus-timezone" },
      () => ({
        contents: [
          'import moment from "moment-timezone/moment-timezone.js";',
          `moment.tz.add(${JSON.stringify(packedCampusTimezone)});`,
          "export default moment;",
        ].join("\n"),
        loader: "js",
      }),
    );
  },
};

const serverOutputDirectory = "./dist/server";
await rm(serverOutputDirectory, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["./src/server/index.ts"],
  outdir: serverOutputDirectory,
  target: "bun",
  minify: true,
  splitting: true,
  sourcemap: "external",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [campusTimezonePlugin],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const totalBytes = result.outputs.reduce(
  (total, output) => total + output.size,
  0,
);
console.log(`Built server bundle: ${result.outputs.length} files, ${totalBytes} bytes`);
