# Agentic phone agent guide

The SDK, CLI, and MCP server share placeCall.
Import core guards, errors, logging, and costs from agentic-core.
Keep agentic-core.d.ts unchanged as the contract reference.

Preview with vendor dry or live false.
A live call needs explicit authorization, a live flag, and a vendor key.
Require an AI disclosure line and an E.164 destination.
Honor UTC day hours, caps, and the blocklist.
Keep vendor failures visible. Never claim a failed call succeeded.

MCP tools: place_call, get_consent_log, get_cost_report.
Use place_call for a preview first.
Read the consent log and cost report after dispatch.
Run build, typecheck, and tests before committing changes.
