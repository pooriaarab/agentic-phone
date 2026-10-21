import type { CallInput } from "./types.js";

// Shared dial body for Telnyx AI-assistant calls. `assistant.id` attaches a
// stored assistant; the other fields are per-call overrides, so the script
// lands on `instructions`, the disclosure opens the call through `greeting`
// and also leads the instructions, and `voice` selects the per-call voice
// (`Telnyx.<model>.<voice>`, or an ElevenLabs voice id with `voiceApiKeyRef`
// naming a Telnyx integration secret that holds the ElevenLabs key).
export function telnyxDialBody(input: CallInput): Record<string, unknown> {
  const assistant: Record<string, unknown> = {
    id: input.assistantId,
    instructions: `${input.disclosure}\n\n${input.script}`,
    greeting: input.firstMessage
      ? `${input.disclosure} ${input.firstMessage}`
      : input.disclosure,
  };
  if (input.voice) {
    assistant.voice_settings = {
      voice: input.voice,
      ...(input.voiceApiKeyRef ? { api_key_ref: input.voiceApiKeyRef } : {}),
    };
  }
  if (input.dynamicVariables)
    assistant.dynamic_variables = input.dynamicVariables;
  return {
    connection_id: input.connectionId,
    to: input.to,
    from: input.from,
    ...(input.maxDurationSec ? { time_limit_secs: input.maxDurationSec } : {}),
    ...(input.record ? { record: "record-from-answer" } : {}),
    ...(input.clientState ? { client_state: input.clientState } : {}),
    assistant,
  };
}
