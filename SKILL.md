---
name: agentic-phone
description: Preview and place AI voice calls with Vapi, Bland, or Retell.
---

# Agentic phone

Use `npx agentic-phone call` with a destination, script, and AI disclosure.
Start with a preview. The default vendor is dry and live is false.
For live dispatch, obtain explicit user authorization and use --live.
Read the vendor API key from the environment.
Vapi needs --assistant and --phone-number-id.
Retell needs --from. Bland accepts --from and --voice.
Use E.164 numbers. Honor day hours, caps, and the blocklist.
Stop on a guard denial. Report adapter errors as failures.
Run `npx agentic-phone log` and `npx agentic-phone costs` after dispatch.
MCP clients use place_call, get_consent_log, and get_cost_report.
