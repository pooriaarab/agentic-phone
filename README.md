# agentic-phone

[![npm version](https://img.shields.io/npm/v/agentic-phone)](https://www.npmjs.com/package/agentic-phone)
[![Monthly downloads](https://img.shields.io/npm/dm/agentic-phone)](https://www.npmjs.com/package/agentic-phone)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://opensource.org/license/mit)

[Package](https://www.npmjs.com/package/agentic-phone) · [Setup](#send-your-first-call-preview) · [API and commands](#runtime-surfaces) · [Comparisons](#compare) · [llms.txt](https://github.com/pooriaarab/agentic-phone/blob/main/llms.txt)

agentic-phone is an open-source phone dispatch toolkit for developers who use AI voice vendors.
It exposes a TypeScript software development kit (SDK), command-line interface (CLI), and Model Context Protocol (MCP) server.
Previews run locally; live requests use your vendor account.

## Install

```sh
npm install agentic-phone
```

Use Node.js 18 or later. The package includes TypeScript declarations and has three direct runtime dependencies.

## Send your first call preview

Save this as `preview.mjs`, then run `node preview.mjs`. No credentials or environment variables are required.

```js
import { placeCall } from 'agentic-phone';

const receipt = await placeCall({
  to: '+12025550123',
  script: 'Your appointment is tomorrow.',
  disclosure: 'I am an AI assistant.',
  now: () => new Date('2026-10-14T12:00:00Z'),
});
console.log(receipt.dryRun, receipt.callId);
```

Expect `true` and a `dry-` call ID. This preview uses a fixed daytime clock and places no call.
Omit `now` for normal use. Default guards permit dispatch from 08:00 inclusive to 20:00 exclusive UTC, including previews.

During those hours, try the CLI:

```sh
npx agentic-phone call --to +12025550123 --script "Your appointment is tomorrow." --disclosure "I am an AI assistant."
```

## How it works

```text
SDK / CLI / MCP -> validation + guards -> dry preview
                                     -> vendor API -> receipt + local disclosure log
```

## Why it exists

Vapi and Retell AI provide their own voice platforms and APIs.
agentic-phone puts outbound dispatch behind one request shape, with local previews and shared guards.
Vendor assistants, phone numbers, and accounts remain your responsibility.

## Compare

Scope checked on 2026-10-14 against [Vapi documentation](https://docs.vapi.ai/quickstart/introduction) and [Retell AI documentation](https://docs.retellai.com/general/introduction).

| Aspect | agentic-phone | Vapi | Retell AI |
| --- | --- | --- | --- |
| Scope | Local dispatch wrapper | Voice agent platform | Voice and chat agent platform |
| Configuration | TypeScript or CLI flags | Vendor assistant configuration | Vendor agent configuration |
| Execution | Local code calls vendor APIs | Vendor service | Vendor service |

## Coverage

| Adapter | Implemented dispatch | Key | Required vendor fields | Speech behavior |
| --- | --- | --- | --- | --- |
| Vapi | ✓ | `VAPI_API_KEY` | `assistantId`, `phoneNumberId` | Stored assistant; request script and disclosure are not forwarded |
| Bland AI | ✓ | `BLAND_API_KEY` | None beyond common inputs | Disclosure prepended to task; recording requested |
| Retell AI | ✓ | `RETELL_API_KEY` | `from` | Stored agent; disclosure sent as metadata, script not forwarded |
| Telnyx | ✓ | `TELNYX_API_KEY` | `from`, `connectionId`, `assistantId` | AI assistant call; script, disclosure, and voice forwarded per call |
| Dry | Local preview | None | None | No network request |

The dispatcher contains four live adapters and one dry adapter. None are scaffold-only.
Tests exercise mocked responses; this rewrite includes zero credential-checked integrations.
A returned call ID confirms dispatch acceptance, not an answered call or spoken disclosure.
Twilio is not a direct adapter. Vapi can reference a Twilio-imported number through `phoneNumberId`.

## Common use cases

1. Appointment developers: preview reminder requests before dispatch through a configured Vapi assistant.
2. Store operators: submit order-ready tasks through Bland AI with an AI disclosure.
3. Event teams: trigger follow-up calls through an existing Retell AI agent.
4. Telephony developers: preview Telnyx number orders and dial through a Call Control connection.

## Features

- Local previews return structured receipts without vendor credentials.
- Shared guards accept caps, a blocklist, quiet hours, and a clock.
- Successful live dispatch appends a local JSON Lines disclosure record.
- Session cost reports count dispatch units rather than vendor billing amounts.
- Telnyx number provisioning supports preview and live order requests.

## Runtime surfaces

The SDK exports `placeCall`, `createCallGuards`, `provisionTelnyxNumber`, vendor adapters, consent helpers, and core logging and cost helpers.
The SDK uses Node.js filesystem APIs for its local log.

The `agentic-phone/adapters` subpath is the edge-safe surface: plain `fetch`,
no filesystem, no `process.env` reads, and no `agentic-core` import, so it
bundles for Cloudflare Workers without `nodejs_compat`. Keys arrive as
arguments, never from the environment:

```ts
import { TelnyxPhoneAdapter } from 'agentic-phone/adapters';

const telnyx = new TelnyxPhoneAdapter({ apiKey: env.TELNYX_API_KEY });
const placed = await telnyx.placeCall({
  to: '+12025550123',
  from: '+16042399409',
  connectionId: env.TELNYX_CONNECTION_ID,
  assistantId: env.TELNYX_ASSISTANT_ID,
  script: 'Your appointment is tomorrow.',
  disclosure: 'I am an AI assistant.',
  voice: 'Telnyx.KokoroTTS.af_heart',
  maxDurationSec: 600,
});
// placed.providerCallId is the Telnyx call_control_id; callLegId and
// callSessionId identify the leg for transcript and cost lookups.
```

Each `PhoneAdapter` also exposes `transcript`, `liveJoin`, and `callCost`.
Telnyx resolves the conversation over `GET /v2/ai/conversations` filtered by
`metadata->call_control_id`, then reads its `messages`; `liveJoin` bridges a
second call leg (`supervisorCallControlId`), since Telnyx has no single-call
barge-in; `callCost` sums the `call-control` and `ai-voice-assistant` detail
records, and returns `null` until Telnyx posts them after the call.
`DryPhoneAdapter`, `VapiPhoneAdapter`, `BlandPhoneAdapter`, and
`RetellPhoneAdapter` share the interface; outputs a vendor does not support
return `null` or `{ status: 'unsupported' }`.
CLI commands are `call`, `provision`, `log`, `costs`, `mcp`, `help`, and `version`.
Use `--help` or `-h` for flags; `--version` or `-V` prints the version.
`call` accepts either `--script` or `--file`.

Start the stdio MCP server with `npx agentic-phone mcp` or `npx --package agentic-phone agentic-phone-mcp`.
Its three tools are `place_call`, `get_consent_log`, and `get_cost_report`.
The source Worker exposes `GET /health` and preview-only `POST /preview`; it has no live dispatch route.

## Delivery and behavior limits

A live call requires explicit recipient-call authorization, a vendor key, a non-dry vendor, and `live: true` or `--live`.
The package checks a nonblank disclosure field, not legal consent or whether the recipient hears it.
Configure Vapi and Retell AI agents to speak the disclosure. Telnyx sends the disclosure as the assistant greeting, so it is spoken first.
Requests time out after ten seconds. The HTTP helper has no automatic retry or deduplication.
Check vendor state before retrying an uncertain dispatch.

Reuse a `createCallGuards` instance to enforce caps across SDK calls.
Previews do not increment caps or costs. Costs are process-local; a separate CLI process does not retain dispatch totals.
The default log is `./consent-log.jsonl` in the current directory.
Choose `--log-file` or SDK `logFile`; SDK `logFile: null` disables logging.
A log write can fail after the vendor accepts a call. The log does not prove recipient consent.

## Integration guides

Export keys in your shell or secret store. The package does not load `.env` files automatically.

```sh
export BLAND_API_KEY='your-key'
# Run only after authorizing the live call and reviewing a preview.
npx agentic-phone call --vendor bland --live --to +12025550123 --script "Your order is ready." --disclosure "I am an AI assistant."
npx agentic-phone log
```

Vapi CLI calls require `--assistant` and `--phone-number-id`.
Retell AI requires `--from`; `--agent` selects an override agent.
Telnyx requires `--from`, `--connection-id`, and `--assistant`; `--voice` selects the per-call assistant voice.
Bland AI accepts `--from` and `--voice`.
Adapters and `placeCall` also accept an SDK `apiKey` override.

Preview a Telnyx number order:

```sh
npx agentic-phone provision --number +19705555098
```

Expect `dryRun: true` and a `dry-order-` ID.
Add `--live` only after authorizing the purchase and setting `TELNYX_API_KEY`.
The SDK `provisionTelnyxNumber` accepts a `numbers` array and returns an order ID; it does not poll order status.

### Picking a Telnyx voice

The Telnyx `voice` argument maps to `assistant.voice_settings.voice` in the
dial request. Telnyx voice ids follow `Telnyx.<model>.<voice>`; list them with
`GET /v2/text-to-speech/voices?provider=telnyx`. `Telnyx.KokoroTTS.*` voices
are the low-latency set (for example `Telnyx.KokoroTTS.af_heart` for English);
`Telnyx.Ultra.<uuid>` voices are higher quality — copy the id from the voices
response or the Portal voice library. For an ElevenLabs voice, pass the
ElevenLabs voice id as `voice` plus `voiceApiKeyRef`, the identifier of a
Telnyx integration secret that stores the ElevenLabs key. Omit `voice` to use
the stored assistant's voice.

- [Vapi voice assistant setup](https://docs.vapi.ai/quickstart/introduction)
- [Retell AI agent setup](https://docs.retellai.com/general/introduction)

## Status

Version 0.3.0 is pre-1.0; interfaces can change.
[Report issues](https://github.com/pooriaarab/agentic-phone/issues) with reproducible inputs and redacted credentials.
Public case studies are not yet published in this repository.

## FAQ

### What is agentic-phone?

agentic-phone is a local SDK, CLI, and MCP server for outbound phone dispatch.
It uses your vendor accounts and defaults to previews.

### Which integrations are verified?

agentic-phone has mocked tests for four live adapters and one dry adapter.
This README rewrite does not verify live credentials or call completion.

### Does agentic-phone provide a managed phone service?

agentic-phone runs in your environment.
You supply vendor accounts, numbers, and any voice agent configuration.

### How is agentic-phone different from Vapi?

agentic-phone wraps outbound dispatch across vendors.
Vapi provides the voice assistant platform used by its adapter.

### How is agentic-phone different from Retell AI?

agentic-phone submits requests to an existing Retell AI setup.
Retell AI provides the agent that conducts the conversation.

### Does agentic-phone speak my script through Telnyx?

Yes. The dial request attaches a stored Telnyx AI assistant with per-call
overrides: the script becomes the assistant instructions, and the disclosure
opens the call as the greeting and also leads the instructions.

### Does agentic-phone prove consent?

agentic-phone records the submitted disclosure after successful live dispatch.
That local record does not prove recipient consent or audible disclosure.

### Can I preview without an API key?

agentic-phone previews require no key and make no vendor request.
Daytime guards still apply.

### Does agentic-phone report vendor charges?

agentic-phone counts process-local dispatch units.
Read vendor billing for monetary charges.

## License

MIT. Copyright Pooria Arab.
