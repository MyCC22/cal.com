import express from "express";
import { healthRouter } from "./routes/health";
import { probeRouter } from "./routes/probe";
import { adminRouter } from "./routes/admin";
import { slotsRouter } from "./routes/slots";
import { bookingsRouter } from "./routes/bookings";
import { requirePublicKey, requireAdminKey } from "./middleware/auth";
import { corsMiddleware } from "./middleware/cors";

const app = express();
const port = parseInt(process.env.PORT || "3100", 10);

app.use(express.json());

// Health & probe (no auth)
app.use("/api/health", healthRouter);
app.use("/api/probe", probeRouter);

// Admin routes (admin key required)
app.use("/api/admin", requireAdminKey, adminRouter);

// Public routes (CORS + public key)
app.use("/api/v1/slots", corsMiddleware, requirePublicKey, slotsRouter);
app.use("/api/v1/bookings", corsMiddleware, requirePublicKey, bookingsRouter);

// Catch-all 404
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`> Booking App ready on http://0.0.0.0:${port}`);
});
