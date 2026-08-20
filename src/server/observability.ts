import * as Sentry from "@sentry/bun";
import { getServerConfig } from "./config";

const config = getServerConfig();

Sentry.init({
  dsn: config.sentryDsn,
  environment: config.environment,
  tracesSampleRate: 1,
  sendDefaultPii: false,
});

export { Sentry };
