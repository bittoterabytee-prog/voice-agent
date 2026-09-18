import type { CallStatus } from "./enums";

export type Call = {
  id: string;
  callerNumber: string;
  language: string;
  startTime: Date;
  endTime: Date | null;
  status: CallStatus;
  createdAt: Date;
};
