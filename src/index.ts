import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./lib/swagger.js";
import helmet from "helmet";

import authRoutes from "./routes/auth.routes.js";
import healthRoutes from "./routes/health.routes.js";
import plantRoutes from "./routes/plant.routes.js";
import regionRoutes from "./routes/region.routes.js";
import occurrenceRoutes from "./routes/occurence.routes.js";
import tagRoutes from "./routes/tag.routes.js";
import { errorHandler } from "./middleware/error.middleware.js";
import rateLimit from "express-rate-limit";
import { metricsMiddleware } from "./middleware/metrics.middleware.js";
import metricsRoutes from "./routes/metrics.routes.js";

dotenv.config();

const app = express();

app.use(helmet()); // use helmet to secure app

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

app.use(metricsMiddleware); // track all requests
app.use(healthRoutes);
app.use(metricsRoutes);

app.use("/auth", authLimiter, authRoutes);
app.use(generalLimiter);
app.use("/plants", plantRoutes);
app.use("/regions", regionRoutes);
app.use("/occurrences", occurrenceRoutes);
app.use("/tags", tagRoutes);

app.use(errorHandler);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

export default app;
