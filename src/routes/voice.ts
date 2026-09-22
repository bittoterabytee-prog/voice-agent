import { Router } from "express";
import { runVoiceTurn } from "../controllers/voicePipelineController";

export const voiceRouter = Router();

voiceRouter.post("/api/voice/turn", runVoiceTurn);
