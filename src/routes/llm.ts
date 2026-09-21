import { Router } from "express";
import { completeLlmTurn } from "../controllers/llmController";

export const llmRouter = Router();

llmRouter.post("/api/llm/complete", completeLlmTurn);
