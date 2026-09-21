import { Router } from "express";
import { transcribeAudio } from "../controllers/sttController";

export const sttRouter = Router();

sttRouter.post("/api/stt/transcribe", transcribeAudio);
