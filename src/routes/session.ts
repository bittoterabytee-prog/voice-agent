import { Router } from "express";
import {
  appendSessionTurn,
  completeSession,
  getSession,
  requestSessionWait,
  resumeSession,
  startSession,
} from "../controllers/sessionController";

export const sessionRouter = Router();

sessionRouter.post("/api/sessions", startSession);
sessionRouter.get("/api/sessions/:callId", getSession);
sessionRouter.post("/api/sessions/:callId/turns", appendSessionTurn);
sessionRouter.post("/api/sessions/:callId/wait", requestSessionWait);
sessionRouter.post("/api/sessions/:callId/resume", resumeSession);
sessionRouter.post("/api/sessions/:callId/complete", completeSession);
