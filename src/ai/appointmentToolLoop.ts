/**
 * LLM ↔ appointment tool loop for voice turns (KAN-111).
 * Final spoken text must reflect tool outcomes; never invent bookings.
 */
import type { LlmCompletionResponse, LlmMessage, LlmService, LlmToolCall } from "./llmService";
import {
  executeAppointmentToolCall,
  type AppointmentToolExecution,
} from "./appointmentToolRunner";
import { APPOINTMENT_TOOL_DEFINITIONS } from "./llmTools";
import {
  failClosedReplyForToolFailure,
  gateMutateToolArguments,
  guardAppointmentReply,
  latestUserUtterance,
  shouldPreferFailClosedReply,
} from "./appointmentSafety";

export const DEFAULT_TOOL_LOOP_MAX_ROUNDS = 6;

export type OpenAiLoopMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

export type AppointmentToolLoopOptions = {
  llm: LlmService;
  messages: LlmMessage[];
  language?: string;
  callId?: string | null;
  maxRounds?: number;
  includeSystemPrompt?: boolean;
  executeTool?: typeof executeAppointmentToolCall;
};

export type AppointmentToolLoopResult = {
  text: string;
  usage?: LlmCompletionResponse["usage"];
  toolRounds: number;
  toolExecutions: AppointmentToolExecution[];
};

function toOpenAiMessages(messages: LlmMessage[]): OpenAiLoopMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

function assistantToolMessage(toolCalls: LlmToolCall[]): OpenAiLoopMessage {
  return {
    role: "assistant",
    content: null,
    tool_calls: toolCalls.map((call, index) => ({
      id: call.id?.trim() || `call_${index}_${call.name}`,
      type: "function" as const,
      function: {
        name: call.name,
        arguments: JSON.stringify(call.arguments ?? {}),
      },
    })),
  };
}

/**
 * Run chat completions with appointment tools until a final text reply or max rounds.
 */
export async function runAppointmentToolLoop(
  options: AppointmentToolLoopOptions,
): Promise<AppointmentToolLoopResult> {
  const executeTool = options.executeTool ?? executeAppointmentToolCall;
  const toolExecutions: AppointmentToolExecution[] = [];

  // Test doubles often stub only `complete`; prefer full OpenAI tool loop when available.
  const canLoop =
    typeof options.llm.buildMessages === "function" &&
    typeof options.llm.completeOpenAiMessages === "function";

  if (!canLoop) {
    const completion = await options.llm.complete({
      messages: options.messages,
      includeSystemPrompt: options.includeSystemPrompt !== false,
      language: options.language,
      enableTools: false,
    });
    const guarded = guardAppointmentReply({
      replyText: completion.text.trim(),
      toolExecutions,
      language: options.language,
    });
    return {
      text: guarded.text,
      usage: completion.usage,
      toolRounds: 0,
      toolExecutions,
    };
  }

  const maxRounds = options.maxRounds ?? DEFAULT_TOOL_LOOP_MAX_ROUNDS;
  const userUtterance = latestUserUtterance(options.messages);
  const seed = options.llm.buildMessages({
    messages: options.messages,
    includeSystemPrompt: options.includeSystemPrompt !== false,
    language: options.language,
  });

  const openAiMessages: OpenAiLoopMessage[] = toOpenAiMessages(seed);
  let usageTotal = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let toolRounds = 0;

  for (let round = 0; round < maxRounds; round += 1) {
    const completion = await options.llm.completeOpenAiMessages({
      messages: openAiMessages,
      enableTools: true,
      tools: APPOINTMENT_TOOL_DEFINITIONS,
    });

    if (completion.usage) {
      usageTotal = {
        promptTokens: usageTotal.promptTokens + completion.usage.promptTokens,
        completionTokens: usageTotal.completionTokens + completion.usage.completionTokens,
        totalTokens: usageTotal.totalTokens + completion.usage.totalTokens,
      };
    }

    const toolCalls = completion.toolCalls ?? [];
    if (toolCalls.length === 0) {
      let text = completion.text.trim();
      if (shouldPreferFailClosedReply(toolExecutions)) {
        text = failClosedReplyForToolFailure(options.language);
      } else {
        text = guardAppointmentReply({
          replyText: text,
          toolExecutions,
          language: options.language,
        }).text;
      }
      return {
        text,
        usage: usageTotal.totalTokens > 0 ? usageTotal : completion.usage,
        toolRounds,
        toolExecutions,
      };
    }

    toolRounds += 1;
    const assistantMessage = assistantToolMessage(toolCalls);
    openAiMessages.push(assistantMessage);

    for (let i = 0; i < toolCalls.length; i += 1) {
      const call = toolCalls[i];
      const toolCallId = assistantMessage.tool_calls?.[i]?.id ?? `call_${i}_${call.name}`;
      const gated = gateMutateToolArguments({
        name: call.name,
        arguments: call.arguments,
        latestUserUtterance: userUtterance,
      });
      const execution = await executeTool(
        { name: call.name, arguments: gated.arguments },
        { callId: options.callId },
      );
      toolExecutions.push(execution);
      openAiMessages.push({
        role: "tool",
        tool_call_id: toolCallId,
        content: JSON.stringify(
          gated.confirmedForcedOff
            ? {
                toolResult: execution.result,
                safetyGate:
                  "confirmed was cleared because the latest user utterance was not an explicit confirmation",
              }
            : execution.result,
        ),
      });
    }
  }

  // Exhausted rounds — ask once more without tools for a spoken wrap-up.
  openAiMessages.push({
    role: "user",
    content:
      "Tool loop limit reached. Reply to the caller using only the tool results already returned. Do not claim a booking unless a tool outcome was booked/cancelled/rescheduled.",
  });
  const final = await options.llm.completeOpenAiMessages({
    messages: openAiMessages,
    enableTools: false,
  });
  if (final.usage) {
    usageTotal = {
      promptTokens: usageTotal.promptTokens + final.usage.promptTokens,
      completionTokens: usageTotal.completionTokens + final.usage.completionTokens,
      totalTokens: usageTotal.totalTokens + final.usage.totalTokens,
    };
  }

  let text = final.text.trim();
  if (shouldPreferFailClosedReply(toolExecutions)) {
    text = failClosedReplyForToolFailure(options.language);
  } else {
    text = guardAppointmentReply({
      replyText: text,
      toolExecutions,
      language: options.language,
    }).text;
  }

  return {
    text,
    usage: usageTotal.totalTokens > 0 ? usageTotal : final.usage,
    toolRounds,
    toolExecutions,
  };
}
