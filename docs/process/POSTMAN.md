# Postman collection (KAN-21)

Importable Postman Collection v2.1 for every **HTTP** route registered under `src/routes/`, plus a shared 404 example.

## Files

| File | Purpose |
| ---- | ------- |
| [`postman/Voice-Agent-API.postman_collection.json`](../../postman/Voice-Agent-API.postman_collection.json) | Collection with requests + saved Success/Fail examples |
| [`postman/Local.postman_environment.json`](../../postman/Local.postman_environment.json) | Local env (`baseUrl` → `http://localhost:3000`) |

Contract source of truth: [`docs/backend/API_DOCUMENTATION.md`](../backend/API_DOCUMENTATION.md).

## Import

1. Start the API (`npm run dev` or `npm start`) with provider keys in `.env` as needed.
2. In Postman: **Import** → select both JSON files under `postman/`.
3. Select environment **Voice Agent — Local**.
4. Send requests. Validation Fail examples work without provider keys; Success for STT/LLM/TTS needs configured providers and realistic payloads (especially audio base64).

## Saved examples

Each endpoint folder includes at least:

- **Success** — typical `200` body shape (placeholders for large base64 where needed)
- **Fail** — `400 VALIDATION_ERROR` and/or `502 EXTERNAL_SERVICE_UNAVAILABLE` matching `errorHandler`:

```json
{ "error": { "code": "...", "message": "..." } }
```

`GET /health` has Success only; shared **Errors** folder covers `404 NOT_FOUND`.

Never put API keys, tokens, or real patient data in collection examples.

## When to update (required)

Update the collection **in the same change** as any new or changed HTTP API:

1. Add/change the route under `src/routes/` and document it in `API_DOCUMENTATION.md`.
2. Add or edit the matching Postman request.
3. Save **Success** and **Fail** examples (validation and/or external failure as applicable).
4. Keep `baseUrl` as an environment variable — no hardcoded hosts with secrets.
5. Run `npm test` — `tests/postmanCollection.test.ts` fails if a registered route path is missing from the collection.

Agents: see [`.cursor/rules/postman-api-collection.mdc`](../../.cursor/rules/postman-api-collection.mdc).
