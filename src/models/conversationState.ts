import type { ConversationStateName } from "./enums";

export type ConversationStateRecord = {
  id: string;
  callId: string;
  currentState: ConversationStateName;
  language: string;
  intent: string | null;
  timestamp: Date;
};
