/**
 * OpenAI-style tool definitions for appointment flows (KAN-12 prep).
 * Execution still goes through backend tools — LLM must not invent results.
 */

export type LlmToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export const APPOINTMENT_TOOL_DEFINITIONS: LlmToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "check_availability",
      description:
        "Query backend for real appointment availability. Never invent slots; only report what this tool returns.",
      parameters: {
        type: "object",
        properties: {
          doctorName: { type: "string", description: "Preferred doctor name if known" },
          date: { type: "string", description: "Preferred date (ISO or natural language)" },
          timePreference: { type: "string", description: "Morning, afternoon, or specific time" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description:
        "Book an appointment via the backend. Only claim success after this tool confirms persistence.",
      parameters: {
        type: "object",
        properties: {
          patientName: { type: "string" },
          doctorName: { type: "string" },
          startsAt: { type: "string", description: "Appointment start time" },
        },
        required: ["patientName", "startsAt"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_appointment",
      description: "Look up an existing appointment for a patient via the backend.",
      parameters: {
        type: "object",
        properties: {
          patientName: { type: "string" },
          date: { type: "string" },
        },
        required: ["patientName"],
        additionalProperties: false,
      },
    },
  },
];
