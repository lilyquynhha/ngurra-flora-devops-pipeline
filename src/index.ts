import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./lib/swagger";

import authRoutes from "./routes/auth.routes";
import healthRoutes from "./routes/health.routes";
import plantRoutes from "./routes/plant.routes";
import regionRoutes from "./routes/region.routes";
import occurrenceRoutes from "./routes/occurence.routes";
import tagRoutes from "./routes/tag.routes";
import { errorHandler } from "./middleware/error.middleware";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();

// Rate limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// General rate limit on all other routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: "Too many requests, please try again later" },
});

app.use(express.json());

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.use(express.static("src/public"));
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "Ngurra Flora API Docs",
    customfavIcon: "/favicon.png",
    swaggerOptions: {
      persistAuthorization: true,
    },
    customCssUrl: "/custom.css",
  }),
);

app.get("/api-docs.json", (_req, res) => {
  res.json(swaggerSpec);
});

app.use("/auth", authLimiter, authRoutes);
app.use("/health", healthRoutes);
app.use(generalLimiter);
app.use("/plants", plantRoutes);
app.use("/regions", regionRoutes);
app.use("/occurrences", occurrenceRoutes);
app.use("/tags", tagRoutes);

app.use(errorHandler);

export default app;
