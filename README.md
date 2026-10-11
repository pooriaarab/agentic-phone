# Agentic phone

Place AI voice calls across vendors from CLI, SDK, or MCP.

## Install

Use Node.js 18 or later.

```sh
npm install agentic-phone
```

## Quickstart

Preview is the default. No key is needed for a preview.
Use an E.164 phone number and a clear AI disclosure line.
Calls pass the day hours guard, including previews.

```sh
npx agentic-phone call --to +12025550123 --script "Your appointment is tomorrow." --disclosure "I am an AI assistant."
npx agentic-phone log
npx agentic-phone costs
```

Use the SDK with the same inputs.

```js
import { placeCall } from 'agentic-phone';

const receipt = await placeCall({
  to: '+12025550123',
  script: 'Your appointment is tomorrow.',
  disclosure: 'I am an AI assistant.',
});
console.log(receipt);
```

Use calls for appointment reminders, order status callbacks,
and event follow-ups.

## Live calls and keys

A live call needs `--live`, a vendor, and its API key in the environment.
Set keys through your shell or secret store.

| Vendor | Environment key | Required call options |
| --- | --- | --- |
| Vapi | VAPI_API_KEY | --assistant, --phone-number-id |
| Bland | BLAND_API_KEY | No extra required options |
| Retell | RETELL_API_KEY | --from |
| Telnyx | TELNYX_API_KEY | --from, --connection-id |

```sh
npx agentic-phone call --vendor bland --live --to +12025550123 --script "Your order is ready." --disclosure "I am an AI assistant."
npx agentic-phone call --vendor vapi --live --to +12025550123 --assistant assistant-id --phone-number-id number-id --script "Your appointment is tomorrow." --disclosure "I am an AI assistant."
npx agentic-phone call --vendor retell --live --from +12025550124 --to +12025550123 --agent agent-id --script "Thank you for attending." --disclosure "I am an AI assistant."
npx agentic-phone call --vendor telnyx --live --from +12025550124 --connection-id connection-id --to +12025550123 --script "Your appointment is tomorrow." --disclosure "I am an AI assistant."
```

Bland sends the disclosure before the task script.
For Vapi, configure the selected assistant to speak the disclosure.
For Retell, configure the agent to speak the disclosure from metadata.
Vapi uses the stored assistant script. Retell uses the stored agent script.
The request script is checked by the pack guards in all cases.

Adapters also accept an `apiKey` constructor option for direct SDK use.
`placeCall` accepts an `apiKey` option too, and falls back to the environment.

## Guards and consent

Every request needs a non-blank AI disclosure line.
Default day hours are 08:00 inclusive to 20:00 exclusive UTC.
A denied call throws `GuardError`.
`createCallGuards` accepts caps, a blocklist, quiet hours, and a clock.
Reuse a guard instance to enforce a cap across calls.
Preview does not count toward the cap or cost report.
Costs count dispatched calls, not vendor billing amounts.

Each successful live call appends a consent record to
`./consent-log.jsonl`, resolved from the current working location.
The record has the time, destination, vendor, call ID, and disclosure.
Use `--log-file` or the SDK `logFile` option to select a file.
SDK callers can set `logFile: null` to disable the write.
The log records the submitted disclosure. It does not prove recipient consent.
If the log write fails after dispatch, the call already exists.
Check the vendor before you retry a failed request.

## Twilio-backed numbers

Vapi `phoneNumberId` can select a Twilio-imported number.
Retell uses `from_number`, set by `--from` or SDK `from`.
Bland uses `from`, set by the same option.
Configure the number with the vendor before a live call.

## Telnyx

Telnyx places direct carrier calls through a Call Control connection.
It uses the same call shape, guards, consent log, and dry-run default.
Set `TELNYX_API_KEY` in the environment before a live call.
Pass `--from` and `--connection-id` with every Telnyx call.

Use case 1: send an appointment reminder from your Telnyx number.
Preview the call first. Add `--live` only after the preview looks right.

```sh
npx agentic-phone call --vendor telnyx --from +12025550124 --connection-id connection-id --to +12025550123 --script "Your appointment is tomorrow." --disclosure "I am an AI assistant."
npx agentic-phone call --vendor telnyx --live --from +12025550124 --connection-id connection-id --to +12025550123 --script "Your appointment is tomorrow." --disclosure "I am an AI assistant."
```

Use case 2: order a new Telnyx number, then call from it.
Preview the order first. It costs nothing until you add `--live`.

```sh
npx agentic-phone provision --number +19705555098
npx agentic-phone provision --live --number +19705555098 --connection-id connection-id
npx agentic-phone call --vendor telnyx --live --from +19705555098 --connection-id connection-id --to +12025550123 --script "Your order is ready." --disclosure "I am an AI assistant."
```

The SDK exposes `provisionTelnyxNumber` with the same options.
A live order returns the Telnyx order ID for status tracking.

## MCP

Start the stdio server with either command.

```sh
npx agentic-phone mcp
npx --package agentic-phone agentic-phone-mcp
```

```json
{
  "mcpServers": {
    "agentic-phone": {
      "command": "npx",
      "args": ["agentic-phone", "mcp"]
    }
  }
}
```

Tools are `place_call`, `get_consent_log`, and `get_cost_report`.
`place_call` defaults to vendor `dry` and `live: false`.
It accepts the same phone options as the SDK.
Errors from guards and vendors return `isError: true`.

## License

MIT. Copyright Pooria Arab.
