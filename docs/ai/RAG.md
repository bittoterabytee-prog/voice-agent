# RAG

Retrieval-augmented generation for clinic knowledge (hours, policies, FAQs).

## Infrastructure

| Piece | Value |
| ----- | ----- |
| Vector DB | Qdrant (Docker Compose service `qdrant`) |
| URL | `VECTOR_DB_URL` (local default `http://localhost:6333`) |
| API key | `VECTOR_DB_API_KEY` (optional locally) |
| Embedding model | `EMBEDDING_MODEL` (e.g. `text-embedding-3-small`) |

Start locally: `npm run vector:up` or `npm run deps:up`.

Dashboard: http://localhost:6333/dashboard

## Planned flow

```
User question
  → embed query (EMBEDDING_MODEL)
  → search Qdrant collections
  → inject top chunks into LLM context
  → answer (still no invented appointments)
```

## Rules

- RAG context is for informational answers; **availability/booking still goes through backend tools**.
- Do not store secrets inside vector payloads.
