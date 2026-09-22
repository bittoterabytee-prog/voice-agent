import type { Request, Response, NextFunction } from "express";
import { SessionService } from "../services/sessionService";
import { ValidationError } from "../utils/errors";

type StartBody = {
  callerNumber?: unknown;
  language?: unknown;
};

type TurnBody = {
  role?: unknown;
  content?: unknown;
  text?: unknown;
  intent?: unknown;
};

function callIdParam(req: Request): string {
  const callId = req.params.callId;
  if (typeof callId !== "string" || !callId.trim()) {
    throw new ValidationError("callId is required");
  }
  return callId.trim();
}

export async function startSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = (req.body ?? {}) as StartBody;
    if (body.callerNumber !== undefined && typeof body.callerNumber !== "string") {
      throw new ValidationError("callerNumber must be a string");
    }
    if (body.language !== undefined && typeof body.language !== "string") {
      throw new ValidationError("language must be a string");
    }
    const callerNumber =
      typeof body.callerNumber === "string" ? body.callerNumber : undefined;
    const language = typeof body.language === "string" ? body.language : undefined;

    const session = await new SessionService().startSession({ callerNumber, language });
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
}

export async function getSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await new SessionService().getSession(callIdParam(req));
    res.status(200).json(session);
  } catch (error) {
    next(error);
  }
}

export async function appendSessionTurn(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const callId = callIdParam(req);
    const body = (req.body ?? {}) as TurnBody;
    const service = new SessionService();

    const text =
      typeof body.text === "string"
        ? body.text
        : typeof body.content === "string"
          ? body.content
          : undefined;

    // User utterances go through wait/resume detection (TC-003 / TC-004).
    if (body.role === undefined || body.role === "user") {
      if (!text?.trim()) {
        throw new ValidationError("text or content is required");
      }
      const result = await service.handleUserUtterance(callId, text);
      res.status(200).json(result);
      return;
    }

    if (body.role !== "assistant" && body.role !== "system") {
      throw new ValidationError("role must be user, assistant, or system");
    }
    if (!text?.trim()) {
      throw new ValidationError("text or content is required");
    }

    const intent = typeof body.intent === "string" || body.intent === null ? body.intent : undefined;
    const session = await service.appendTurn(callId, {
      role: body.role,
      content: text,
      intent,
    });
    res.status(200).json({ ...session, action: "continue" as const });
  } catch (error) {
    next(error);
  }
}

export async function requestSessionWait(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await new SessionService().requestWait(callIdParam(req));
    res.status(200).json(session);
  } catch (error) {
    next(error);
  }
}

export async function resumeSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await new SessionService().resumeFromWait(callIdParam(req));
    res.status(200).json(session);
  } catch (error) {
    next(error);
  }
}

export async function completeSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await new SessionService().completeSession(callIdParam(req));
    res.status(200).json(session);
  } catch (error) {
    next(error);
  }
}
