import { Router } from "express";
import { getSpendSummary } from "../controllers/usageController";

export const usageRouter = Router();

usageRouter.get("/api/usage/summary", getSpendSummary);
