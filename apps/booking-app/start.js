// Custom start script that bypasses Turbo/Yarn CLI wrappers
// Starts Next.js production server directly via its internal API
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const port = parseInt(process.env.PORT || "3100", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";

const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  }).listen(port, hostname, () => {
    console.log(`> Booking App ready on http://${hostname}:${port}`);
  });
});
