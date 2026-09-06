import { createServer } from "./app.js";
import { SERVER_PORT } from "./config.js";

const { httpServer } = createServer();

httpServer.listen(SERVER_PORT, () => {
  console.log(`Server listening on port ${SERVER_PORT}`);
});
