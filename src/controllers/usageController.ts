import type { Request, Response, NextFunction } from "express";
import { SessionService } from "../services/sessionService";

export async function getSpendSummary(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const summary = await new SessionService().getSpendSummary();
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
}
