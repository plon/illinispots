import { createApp } from "../app";
import { getServerConfig } from "../config";

const app = createApp({
  roomSchedule: {
    loadRoomSchedule: async () => {
      throw new Error("Sentry migration test error");
    },
  },
});

export default {
  port: getServerConfig().port,
  fetch: app.fetch,
};
