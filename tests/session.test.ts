import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { closePool, connectDatabase, getPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { conversationService } from "../src/conversation/conversationService";
import { isWaitIntent } from "../src/conversation/waitIntent";
import { callEventRepository } from "../src/repositories/callEventRepository";
import { conversationStateRepository } from "../src/repositories/conversationStateRepository";
import { SessionService } from "../src/services/sessionService";
import { ensureTestDatabase, type TestDatabaseHandle } from "./setup/postgres";

let testDatabase: TestDatabaseHandle | undefined;

describe("KAN-15 conversation session & context management", () => {
  beforeAll(async () => {
    testDatabase = await ensureTestDatabase();
    await connectDatabase();
    await runMigrations();
  });

  beforeEach(async () => {
    conversationService.clear();
    await getPool().query(
      "TRUNCATE call_events, conversation_states, calls, appointments, patients, doctors RESTART IDENTITY CASCADE",
    );
  });

  afterEach(() => {
    conversationService.clear();
  });

  afterAll(async () => {
    await closePool();
    await testDatabase?.stop();
  });

  it("TC-001 session start creates call + conversation_state and CALL_STARTED", async () => {
    const service = new SessionService();
    const session = await service.startSession({ callerNumber: "browser", language: "en" });

    expect(session.callId).toBeTruthy();
    expect(session.conversationId).toBeTruthy();
    expect(session.currentState).toBe("ACTIVE_CONVERSATION");
    expect(session.callStatus).toBe("ACTIVE");
    expect(session.messages).toEqual([]);

    const state = await conversationStateRepository.findByCallId(session.callId);
    expect(state?.currentState).toBe("ACTIVE_CONVERSATION");
    expect(state?.language).toBe("en");

    const events = await callEventRepository.listByCallId(session.callId);
    expect(events.map((e) => e.eventType)).toContain("CALL_STARTED");

    const res = await request(createApp()).post("/api/sessions").send({ language: "en" });
    expect(res.status).toBe(201);
    expect(res.body.callId).toBeTruthy();
    expect(res.body.currentState).toBe("ACTIVE_CONVERSATION");
  });

  it("TC-002 retains prior turns in LLM context messages", async () => {
    const service = new SessionService();
    const started = await service.startSession({ language: "en" });

    await service.appendTurn(started.callId, {
      role: "user",
      content: "I need a cardiologist",
    });
    await service.appendTurn(started.callId, {
      role: "assistant",
      content: "I can help with that. What day works?",
    });

    const next = await service.handleUserUtterance(started.callId, "Tuesday afternoon");
    expect(next.action).toBe("continue");
    expect(next.messages).toEqual([
      { role: "user", content: "I need a cardiologist" },
      { role: "assistant", content: "I can help with that. What day works?" },
      { role: "user", content: "Tuesday afternoon" },
    ]);

    const res = await request(createApp())
      .post(`/api/sessions/${started.callId}/turns`)
      .send({ text: "Around 3 PM" });
    expect(res.status).toBe(200);
    expect(res.body.messages.at(-1)).toEqual({ role: "user", content: "Around 3 PM" });
    expect(res.body.messages.length).toBe(4);
  });

  it("TC-003 wait flow transitions state and records WAIT_STARTED", async () => {
    expect(isWaitIntent("please hold on a second")).toBe(true);

    const service = new SessionService();
    const started = await service.startSession();

    const waited = await service.handleUserUtterance(started.callId, "hold on");
    expect(waited.action).toBe("waited");
    expect(waited.currentState).toBe("WAITING_FOR_USER");
    expect(waited.agentReply).toMatch(/wait/i);

    const state = await conversationStateRepository.findByCallId(started.callId);
    expect(state?.currentState).toBe("WAITING_FOR_USER");

    const events = await callEventRepository.listByCallId(started.callId);
    expect(events.map((e) => e.eventType)).toContain("WAIT_STARTED");
    expect(events.map((e) => e.eventType)).toContain("USER_SPEECH");

    const explicit = await request(createApp())
      .post(`/api/sessions/${started.callId}/wait`)
      .send({});
    expect(explicit.status).toBe(200);
    expect(explicit.body.currentState).toBe("WAITING_FOR_USER");
  });

  it("TC-004 resume after wait goes CALLER_RETURNED then ACTIVE_CONVERSATION", async () => {
    const service = new SessionService();
    const started = await service.startSession();
    await service.requestWait(started.callId);

    const before = await conversationStateRepository.findByCallId(started.callId);
    expect(before?.currentState).toBe("WAITING_FOR_USER");

    const resumed = await service.resumeFromWait(started.callId);
    expect(resumed.currentState).toBe("ACTIVE_CONVERSATION");

    const events = await callEventRepository.listByCallId(started.callId);
    expect(events.map((e) => e.eventType)).toContain("CALLER_RETURNED");

    // Re-enter wait, then resume via utterance
    await service.requestWait(started.callId);
    const viaSpeech = await service.handleUserUtterance(started.callId, "I'm back, let's book 6 PM");
    expect(viaSpeech.action).toBe("resumed");
    expect(viaSpeech.currentState).toBe("ACTIVE_CONVERSATION");
    expect(viaSpeech.messages.at(-1)?.content).toContain("6 PM");

    const httpResume = await request(createApp())
      .post(`/api/sessions/${started.callId}/resume`)
      .send({});
    // already active — idempotent
    expect(httpResume.status).toBe(200);
    expect(httpResume.body.currentState).toBe("ACTIVE_CONVERSATION");
  });

  it("GET session 404 for unknown callId", async () => {
    const res = await request(createApp()).get(
      "/api/sessions/00000000-0000-4000-8000-000000000099",
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("rehydrates turn context from call_events after memory clear", async () => {
    const service = new SessionService();
    const started = await service.startSession();
    await service.appendTurn(started.callId, { role: "user", content: "Book Friday" });
    await service.appendTurn(started.callId, {
      role: "assistant",
      content: "Friday works. Morning or afternoon?",
    });

    conversationService.clear();

    const restored = await service.getSession(started.callId);
    expect(restored.messages).toEqual([
      { role: "user", content: "Book Friday" },
      { role: "assistant", content: "Friday works. Morning or afternoon?" },
    ]);
  });

  it("complete session marks CALL_COMPLETED and CALL_ENDED", async () => {
    const service = new SessionService();
    const started = await service.startSession();
    const done = await service.completeSession(started.callId);
    expect(done.currentState).toBe("CALL_COMPLETED");
    expect(done.callStatus).toBe("COMPLETED");

    const events = await callEventRepository.listByCallId(started.callId);
    expect(events.map((e) => e.eventType)).toContain("CALL_ENDED");

    await expect(
      service.handleUserUtterance(started.callId, "hello again"),
    ).rejects.toThrow(/closed/i);
  });

  it("KAN-18 lists sessions and call_events over HTTP for Call History", async () => {
    const service = new SessionService();
    const a = await service.startSession({ callerNumber: "browser-a", language: "en" });
    await service.appendTurn(a.callId, { role: "user", content: "hello" });
    await service.appendTurn(a.callId, { role: "assistant", content: "hi" });
    await callEventRepository.create({
      callId: a.callId,
      eventType: "TOOL_FAILED",
      metadata: {
        kind: "voice_pipeline",
        stage: "tts",
        softFail: true,
        code: "EXTERNAL_SERVICE_UNAVAILABLE",
        message: "TTS soft fail",
      },
    });
    await service.completeSession(a.callId);

    const list = await request(createApp()).get("/api/sessions?limit=10");
    expect(list.status).toBe(200);
    const listed = list.body.sessions.find((s: { callId: string }) => s.callId === a.callId);
    expect(listed).toBeTruthy();
    expect(typeof listed.estimatedUsd).toBe("number");

    const spend = await request(createApp()).get("/api/usage/summary");
    expect(spend.status).toBe(200);
    expect(spend.body).toMatchObject({
      currency: "USD",
      callCount: expect.any(Number),
      turnCount: expect.any(Number),
    });
    expect(typeof spend.body.estimatedUsdTotal).toBe("number");
    expect(spend.body.note).toMatch(/not a live OpenAI wallet/i);

    const eventsRes = await request(createApp()).get(`/api/sessions/${a.callId}/events`);
    expect(eventsRes.status).toBe(200);
    expect(eventsRes.body.callId).toBe(a.callId);
    const types = eventsRes.body.events.map((e: { eventType: string }) => e.eventType);
    expect(types).toEqual(
      expect.arrayContaining(["CALL_STARTED", "USER_SPEECH", "AGENT_RESPONSE", "TOOL_FAILED", "CALL_ENDED"]),
    );
    const failure = eventsRes.body.events.find(
      (e: { eventType: string; metadata?: { kind?: string } }) =>
        e.eventType === "TOOL_FAILED" && e.metadata?.kind === "voice_pipeline",
    );
    expect(failure?.metadata?.stage).toBe("tts");
    expect(failure?.metadata?.softFail).toBe(true);
  });
});
