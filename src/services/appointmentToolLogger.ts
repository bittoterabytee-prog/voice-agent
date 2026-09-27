import { callEventRepository } from "../repositories/callEventRepository";
import { redactSecrets, redactValue } from "../utils/redact";
import { logger } from "../utils/logger";

export type AppointmentToolContext = {
  /** When set, persist TOOL_CALLED / TOOL_FAILED on call_events (KAN-73). */
  callId?: string | null;
};

type OutcomeBearing = {
  outcome?: string;
  appointment?: { id?: string } | null;
  confirmation?: { appointmentId?: string } | null;
  message?: string;
};

const WRITE_SUCCESS = new Set(["booked", "cancelled", "rescheduled"]);
const HARD_FAILURE = new Set(["failed"]);

function isHardFailureOutcome(outcome: string | undefined): boolean {
  return outcome !== undefined && HARD_FAILURE.has(outcome);
}

function extractAppointmentId(result: OutcomeBearing | null | undefined): string | undefined {
  return result?.confirmation?.appointmentId ?? result?.appointment?.id ?? undefined;
}

function buildMetadata(args: {
  tool: string;
  outcome: string;
  appointmentId?: string;
  message?: string;
  errorName?: string;
}): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    kind: "appointment_tool",
    tool: args.tool,
    outcome: args.outcome,
  };
  if (args.appointmentId) {
    raw.appointmentId = args.appointmentId;
  }
  if (args.message) {
    raw.message = redactSecrets(args.message).slice(0, 240);
  }
  if (args.errorName) {
    raw.errorName = args.errorName;
  }
  return redactValue(raw) as Record<string, unknown>;
}

async function persistEvent(
  callId: string,
  eventType: "TOOL_CALLED" | "TOOL_FAILED",
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await callEventRepository.create({ callId, eventType, metadata });
  } catch (persistError) {
    logger.warn(
      { err: persistError, callId, tool: metadata.tool, eventType },
      "Failed to persist appointment tool call_event",
    );
  }
}

/**
 * Run an appointment tool and record call_events when callId is present (KAN-73).
 * - Hard failure outcomes (`failed`) and thrown errors → TOOL_FAILED
 * - All other completed outcomes → TOOL_CALLED (including needs_confirmation / slot_unavailable)
 * - Validation throws before a write → TOOL_FAILED only (never TOOL_CALLED / success)
 * Metadata is redacted; no secrets or raw SQL dumps.
 */
export async function runLoggedAppointmentTool<T extends OutcomeBearing>(
  opts: { tool: string; callId?: string | null },
  run: () => Promise<T>,
): Promise<T> {
  const callId = opts.callId?.trim() || "";

  try {
    const result = await run();
    if (!callId) {
      return result;
    }

    const outcome = result.outcome ?? "unknown";
    const metadata = buildMetadata({
      tool: opts.tool,
      outcome,
      appointmentId: extractAppointmentId(result),
      message: result.message,
    });

    if (isHardFailureOutcome(outcome)) {
      await persistEvent(callId, "TOOL_FAILED", metadata);
    } else {
      await persistEvent(callId, "TOOL_CALLED", {
        ...metadata,
        success: WRITE_SUCCESS.has(outcome) || outcome === "available",
      });
    }
    return result;
  } catch (error) {
    if (callId) {
      const message =
        error instanceof Error ? error.message : "Appointment tool threw before completion";
      await persistEvent(
        callId,
        "TOOL_FAILED",
        buildMetadata({
          tool: opts.tool,
          outcome: "error",
          message,
          errorName: error instanceof Error ? error.name : "Error",
        }),
      );
    }
    throw error;
  }
}
