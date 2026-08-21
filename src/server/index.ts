import "./observability";
import { createApp } from "./app";
import { getServerConfig } from "./config";

const app = createApp();
const config = getServerConfig();

export default {
  port: config.port,
  fetch: app.fetch,
};
