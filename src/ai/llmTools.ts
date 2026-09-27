/**
 * OpenAI-style tool definitions for appointment flows (KAN-111).
 * Execution goes through appointmentTools — LLM must not invent results.
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
      name: "identify_patient",
      description:
        "Identify or register a patient by phone (required) and optional name. Never invent patients.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Patient phone number (POC has no caller-ID)" },
          name: { type: "string", description: "Patient name; required to register a new patient" },
          preferredLanguage: { type: "string", description: "en | hi | hinglish" },
        },
        required: ["phone"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_doctor",
      description: "Search real doctors in PostgreSQL. Never invent doctors.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          specialization: { type: "string" },
          specialty: { type: "string" },
          department: { type: "string" },
          gender: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolve_datetime",
      description:
        "Resolve a natural-language date/time phrase to an IST window. Ambiguous phrases return outcome ambiguous.",
      parameters: {
        type: "object",
        properties: {
          phrase: { type: "string", description: "e.g. tomorrow morning" },
        },
        required: ["phrase"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_availability",
      description:
        "Return real open slots for a doctor and resolved window. Never invent slots.",
      parameters: {
        type: "object",
        properties: {
          doctorId: { type: "string" },
          window: {
            type: "object",
            properties: {
              date: { type: "string", description: "YYYY-MM-DD IST" },
              timeStart: { type: "string", description: "HH:MM:SS" },
              timeEnd: { type: "string", description: "HH:MM:SS" },
              partOfDay: {
                type: "string",
                enum: ["morning", "afternoon", "evening", "any"],
              },
            },
            required: ["date", "timeStart", "timeEnd"],
            additionalProperties: false,
          },
          slotMinutes: { type: "number" },
        },
        required: ["doctorId", "window"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_appointment",
      description: "Look up an appointment by id or patient criteria. Read-only.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "string" },
          patientId: { type: "string" },
          doctorId: { type: "string" },
          appointmentDate: { type: "string" },
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
        "Book only when confirmed is true and the slot came from check_availability. Without confirmed=true the tool returns needs_confirmation and does not write.",
      parameters: {
        type: "object",
        properties: {
          patientId: { type: "string" },
          doctorId: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM or HH:MM:SS" },
          confirmed: {
            type: "boolean",
            description: "Must be true after the caller explicitly confirms",
          },
          slotMinutes: { type: "number" },
        },
        required: ["patientId", "doctorId", "date", "time"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description:
        "Cancel a SCHEDULED appointment owned by the patient. Requires confirmed=true to persist.",
      parameters: {
        type: "object",
        properties: {
          patientId: { type: "string" },
          appointmentId: { type: "string" },
          doctorId: { type: "string" },
          appointmentDate: { type: "string" },
          confirmed: { type: "boolean" },
        },
        required: ["patientId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reschedule_appointment",
      description:
        "Move a SCHEDULED appointment to a new real slot. Requires confirmed=true to persist.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "string" },
          patientId: { type: "string" },
          date: { type: "string" },
          time: { type: "string" },
          confirmed: { type: "boolean" },
          slotMinutes: { type: "number" },
        },
        required: ["appointmentId", "patientId", "date", "time"],
        additionalProperties: false,
      },
    },
  },
];
