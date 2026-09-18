import type { Request, Response } from "express";

export function health(_req: Request, res: Response): void {
  res.status(200).json({ status: "ok" });
}
