import { callRepository } from "../repositories/callRepository";
import type { Call } from "../models/call";

export class CallService {
  startCall(callerNumber: string, language = "en"): Promise<Call> {
    return callRepository.create({ callerNumber, language, status: "ACTIVE" });
  }
}

export const callService = new CallService();
