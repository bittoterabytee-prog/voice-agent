import type { CallEventType } from "./enums";

export type CallEvent = {
  id: string;
  callId: string;
  eventType: CallEventType;
  timestamp: Date;
  metadata: Record<string, unknown>;
};
