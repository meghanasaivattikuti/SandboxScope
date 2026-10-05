import { initBotId } from "botid/client/core";

initBotId({
  protect: [
    { path: "/api/generate", method: "POST" },
    { path: "/api/execute", method: "POST" },
  ],
});
