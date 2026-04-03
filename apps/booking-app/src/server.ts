import express from "express";
import { healthRouter } from "./routes/health";
import { probeRouter } from "./routes/probe";

const app = express();
const port = parseInt(process.env.PORT || "3100", 10);

app.use(express.json());

// Routes
app.use("/api/health", healthRouter);
app.use("/api/probe", probeRouter);

// Catch-all 404
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`> Booking App ready on http://0.0.0.0:${port}`);
});
