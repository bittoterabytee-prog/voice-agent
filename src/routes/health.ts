import { Router } from "express";
import { health } from "../controllers/healthController";

export const healthRouter = Router();

healthRouter.get("/health", health);
