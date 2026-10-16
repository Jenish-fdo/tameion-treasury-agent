# AI Consensus Architecture

Credentia asks three AI models whether a proposed payment should proceed and combines their
answers into one verdict: `GO`, `STOP` or `REVIEW`.

> **Integrator rule: only `GO` means "proceed".** Treat `STOP`, `REVIEW`, a `503`, and any
> error or timeout as "do not pay automatically". `REVIEW` means a human should look.

Code: `backend/src/services/aiConsensusService.ts`. Endpoint: `POST /api/v1/intent/evaluate`
(see `docs/api.yaml`).

## Components

```
                         POST /api/v1/intent/evaluate
                                      │
        ┌─────────────────────────────▼──────────────────────────────┐
        │ Express middleware                                         │
        │  request log (Winston) → API key auth → per-minute limiter │
        │  → hourly intent limiter (10 free / 100 premium)           │
        └─────────────────────────────┬──────────────────────────────┘
                                      │
                     Zod validation (400 on failure)
                                      │
                 IntentService  ── reads on-chain trust scores of
                                   sender + recipient (null if unknown)
                                      │
        ┌─────────────────────────────▼──────────────────────────────┐
        │ AIConsensusService.evaluateIntent                          │
        │                                                            │
        │  sanitise context ─► SHA-256 intent hash                   │
        │        │                                                   │
        │        ▼                                                   │
        │  fresh? ──no──► TTL cache hit? ──yes──► return (cached)    │
        │    │                  │no                                  │
        │   yes                 ▼                                    │
        │    │          identical request in flight? ──yes──► share   │
        │    │                  │no                                  │
        │    └──────────────────▼                                    │
        │            Promise.all (parallel)                          │
        │     ┌────────────┬────────────┬────────────┐               │
        │     ▼            ▼            ▼                            │
        │   Kimi (50%)   Qwen (30%)   Jev (20%)                      │
        │   timeout 10s, 2 retries (1s, 2s backoff) each             │
        │     └────────────┴────────────┴────────────┘               │
        │                  │                                         │
        │          < 2 usable answers? ──yes──► 503 error           │
        │                  │no                                       │
        │          calculateConsensus                                │
        │                  │                                         │
        │   injection suspected && GO ──► downgrade to REVIEW        │
        │                  │                                         │
        │        write cache (5 min) + audit log ─► result           │
        └────────────────────────────────────────────────────────────┘
```

## Data flow

1. **Validate.** Zod checks addresses, `amount` (a positive base-10 integer in wei), token
   (address or ticker), `context` (≤ 2000 chars) and rejects unknown fields.
2. **Sanitise + hash.** The context is Unicode-normalised (NFKC) and stripped of control,
   zero-width and bidi characters. The intent hash is SHA-256 of the canonical JSON
   `{from, to, amount, token, context}` with case-insensitive addresses; `fresh` is not part of it.
3. **Cache.** Unless `fresh: true`, a hit within 5 minutes is returned with `cached: true`
   and no model is called. Identical concurrent requests share one set of model calls.
4. **Ask the models** in parallel with the template in `backend/src/prompts/paymentIntent.txt`.
   It is split into a *system* message (rules, risk factors, output format) and a *user* message
   (the untrusted data as JSON). All three get the identical prompt.
5. **Consensus** (below), then cache and audit-log the result.

## Consensus rules

| Answers received | Result |
|---|---|
| 3 answers, ≥ 2 GO | `GO` |
| 3 answers, ≥ 2 STOP | `STOP` |
| 2 answers that agree (the third failed) | that verdict |
| 2 answers that disagree (the third failed) | `REVIEW` |
| fewer than 2 answers | error `INSUFFICIENT_AI_MODELS` (HTTP 503), no verdict |
| `GO`, but the context looks like a prompt injection | `REVIEW`, `flags: ["PROMPT_INJECTION_SUSPECTED"]` |

A failed model (timeout, error, unparseable reply, not configured) counts as neutral.
The weights do not change the verdict; they only weight `confidence`.

**`confidence`** (0-100) is the weighted average of the answering models' own confidence
(Kimi 0.5, Qwen 0.3, Jev 0.2, renormalised over the models that answered). It is *not* the
probability that the verdict is right: a 2-1 split with three confident models still averages high.
Read it together with **`agreement`** (0-1), the share of answering weight on the winning side.
`votes` shows the raw GO/STOP counts.

## Error handling

```
 model call ──► fetch (10 s timeout per attempt)
                  │
        ┌─────────┼───────────────────────────────┐
        ▼         ▼                               ▼
     HTTP 200   timeout / network error /      other 4xx (e.g. bad key)
        │       429 / 5xx                           │
        │            │                              ▼
        │     attempts left? ─yes─► wait 1s, 2s ─►  failure: upstream_error
        │            │ (exponential)                (no retry)
        │            │no
        │            ▼
        │     failure: timeout | network_error | rate_limited | upstream_error
        ▼
   parse JSON {verdict, confidence, reasoning} (Zod)
        │ invalid ─► failure: invalid_response (no retry)
        ▼
     success
```

* Each model is isolated: one failure never fails the others, and the call methods never throw.
* The 10 s timeout applies **per attempt**; the worst case for one model is about 10 + 1 + 10 + 2 + 10 = 33 s.
* Results with fewer than 2 usable answers are **never cached**.
* Validation errors → 400; auth → 401; rate limits → 429; model quorum → 503; the rest → 500
  with no internal details.

## Caching

* Key: SHA-256 intent hash. Value: the full consensus result. TTL: 5 minutes. Max 1000 entries
  (oldest evicted first), so memory is bounded.
* Expiry is enforced both by a cleanup timer (unref'd, so it never blocks shutdown) and by a clock
  check on read, so a delayed timer cannot serve a stale entry.
* `fresh: true` skips the read, recomputes, and refreshes the entry.
* Results are deep-copied on the way in and out, so callers cannot mutate the cache.
* The on-chain trust scores shown to the models are **not** part of the key: a cached verdict can be
  up to 5 minutes behind a score change. Use `fresh: true` when that matters.
* The cache is per process. With several instances, each has its own cache and its own hourly
  rate-limit counters; move both to a shared store (e.g. Redis) before scaling out.

## Audit logging

One JSON line per event on stdout (Winston, `stream: "ai-consensus-audit"`):

* `model_call`: timestamp, `intentHash`, model, success, verdict, confidence, latency, attempts,
  or the failure reason, plus from/to/amount/token.
* `consensus`: timestamp, `intentHash`, `cacheHit`, verdict, confidence, agreement, votes, flags and a
  per-model summary. `REVIEW` and flagged results are logged at `warn`.
* `error`: context and redacted metadata.

Never logged: API keys (also redacted if they appear in error messages), and the free-text
`context` (only its length; the hash lets you correlate with the request).

## Security considerations

**Prompt injection** is the main risk: `context` is attacker-controlled text that is fed to an
LLM that gates money. No filter can fully prevent it, so the design layers defences and assumes
any single one can fail:

1. *Separation.* Instructions live in the system message; user data is a JSON block in the user
   message. `<` is escaped inside it so data cannot forge or close our tags, and the prompt is
   built with replacer functions so `$&`-style sequences in data are not interpreted.
2. *Sanitisation.* Invisible/control characters and look-alike Unicode are normalised away, and
   length is capped.
3. *Explicit rules.* The system prompt says the data may be hostile, that instruction-like text
   is itself evidence of fraud, and that uncertainty means STOP.
4. *Strict output.* Replies must parse to `{verdict: GO|STOP, confidence: 0-100, reasoning}`;
   anything else is a failed model. Reasoning is length-capped. Model output is only ever used as
   data, never executed or interpolated into another prompt.
5. *Redundancy.* Three independent providers must agree; a lone manipulated model cannot produce
   `GO` and a split yields `REVIEW`.
6. *Heuristic flag.* Known injection phrasings downgrade `GO` to `REVIEW` (never the other way).
   This is a tripwire with false negatives, not a boundary.

**Model manipulation / poisoning.** The weights are fixed in code, not caller-controlled. A
provider that is compromised or biased can still sway a 2-of-3 vote; monitor per-model agreement
rates from the audit log and alert when one model deviates from the other two.

**Secrets and abuse.** API keys come from environment variables only and are never logged or
returned. Callers authenticate with API keys, and the endpoint has a stricter hourly limit because
each call costs three paid model requests. The cache plus in-flight sharing limit repeat-request
cost. The per-model response is validated before use, and upstream error bodies are never
forwarded to clients.

**Known limits.** The models do not see the token's decimals or price, so amount judgements are
coarse; they have no access to the payee's real-world identity; their verdicts are advisory
signals and must not be the only control on large payments (add spend limits and, for `REVIEW`,
human approval).

## Configuration

See `backend/.env.example`. Provider endpoints are OpenAI-compatible
(`<BASE_URL>/chat/completions`); the model identifiers are environment settings so they can be
changed without code changes.
