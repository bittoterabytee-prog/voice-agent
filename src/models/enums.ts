export const appointmentStatuses = ["SCHEDULED", "CANCELLED", "COMPLETED", "RESCHEDULED"] as const;
export type AppointmentStatus = (typeof appointmentStatuses)[number];

export const callStatuses = ["ACTIVE", "COMPLETED", "FAILED", "TRANSFERRED"] as const;
export type CallStatus = (typeof callStatuses)[number];

export const conversationStates = [
  "ACTIVE_CONVERSATION",
  "USER_REQUESTED_WAIT",
  "WAITING_FOR_USER",
  "CALLER_RETURNED",
  "HUMAN_HANDOFF",
  "CALL_COMPLETED",
] as const;
export type ConversationStateName = (typeof conversationStates)[number];

export const callEventTypes = [
  "CALL_STARTED",
  "USER_SPEECH",
  "AGENT_RESPONSE",
  "LANGUAGE_CHANGED",
  "INTERRUPTION",
  "WAIT_STARTED",
  "CALLER_RETURNED",
  "TOOL_CALLED",
  "TOOL_FAILED",
  "HUMAN_HANDOFF",
  "CALL_ENDED",
] as const;
export type CallEventType = (typeof callEventTypes)[number];
