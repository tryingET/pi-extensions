---
summary: "Design packet for local-first, voice-sensitive inference on a Threadripper plus RTX 6000-class workstation."
read_when:
  - "Planning local model serving, voice latency, provider capacity, or optional cloud overflow."
---

# Local-first workstation inference design packet

## Executive decision

Use the workstation as the default inference plane. Do not require Modal for normal development or voice turns.

The design supports both common interpretations of “RTX 6000 Pro”:

- RTX 6000 Ada: 48 GB ECC VRAM.
- RTX PRO 6000 Blackwell Workstation Edition: 96 GB ECC VRAM.

The provider contract intentionally does not encode a serving implementation. `lane-op` may export a llama.cpp, vLLM, SGLang, TensorRT-LLM, or other OpenAI-compatible endpoint after that runtime has been validated on the exact GPU/driver/model combination.

## Goals

- First spoken response should not wait for provider discovery, file parsing, a health CLI, container startup, or cloud scheduling.
- Ordinary request adapter overhead should remain negligible relative to model TTFT.
- One machine should support an interactive lane and a background lane without allowing batch work to starve voice.
- Runtime authority, provider registration, and governed audio authority must remain separate.
- Cloud use must be optional and explicit.

## Non-goals

- Pi does not download, quantize, start, stop, promote, or warm models.
- This package does not select a “best” model from benchmark folklore.
- The adapter does not implement fleet scheduling or multi-tenant isolation.
- The adapter does not silently fail over a side-effecting or governed audio request.

## System boundary

```text
Voice/text client
  -> Pi agent loop
    -> @tryinget/pi-workstation-inference-provider
      -> immutable contract generation (memory)
      -> cached endpoint health (memory)
      -> OpenAI-compatible loopback transport
        -> workstation runtime owned by lane-op
          -> RTX 6000-class GPU
```

Optional overflow is outside this path:

```text
explicit policy decision -> remote provider / Modal
```

## Control plane versus data plane

### Control plane

Runs at extension load, explicit `/workstation-inference status|refresh`, or asynchronous TTL refresh:

- read and validate contract files;
- merge canonical/canary model catalogues;
- build the model-ID index;
- register provider models;
- probe health in the background;
- expose diagnostics.

### Data plane

Runs for every ordinary completion:

1. In-memory model lookup.
2. Fresh cached health verdict; stale verdict schedules one background probe.
3. Existing OpenAI-compatible streaming transport.

No file read, JSON parse, lane-op command, subprocess, runtime start, or blocking health preflight belongs here.

## Workload lanes

### Realtime lane

- One already-loaded low-latency model.
- Small queue; fail or degrade rather than waiting indefinitely.
- Voice priority over background agents.
- Streaming enabled.
- Prefix/cache reuse protected by stable prompts and tool schemas.
- Barge-in cancellation propagated immediately.

### Deep-work lane

- Larger model or higher reasoning budget.
- Bounded concurrency.
- May queue behind realtime work or run in a separate server process if VRAM allows.
- Suitable for coding, research, and long tool campaigns.

### Batch lane

- Eval, indexing, embeddings, fine-tuning, and bulk agent jobs.
- Explicit throughput optimization.
- Never shares an unbounded queue with realtime voice.

## Model fit posture

VRAM capacity alone does not determine fit. Weights, quantization, context length, KV cache precision, batching, speculative decoding, and server implementation all matter.

Recommended operating method:

1. Reserve headroom for KV cache and allocator fragmentation.
2. Benchmark the exact production context distribution, not only one-token throughput.
3. Prefer a smaller always-warm realtime model to a larger model that frequently evicts or cold-starts.
4. Use the larger local model for deliberate deep-work turns.
5. Add remote overflow only after local saturation is measured.

A 96 GB Blackwell card materially widens the set of models and context sizes that can remain entirely on GPU. A 48 GB Ada card still provides strong local inference, but larger models may need tighter quantization, smaller context, or CPU offload. Threadripper is valuable for tokenization, compilation, data preparation, concurrent services, and CPU offload, but GPU-resident decode remains primarily GPU-bound.

## Voice latency budget

Engineering targets for the adapter layer:

| Stage | Target |
|---|---:|
| Contract/model routing | p95 < 0.25 ms |
| Cached health decision | p95 < 0.25 ms |
| Provider queue wait | p95 < 20 ms |
| Local transport establishment | reuse connections where transport permits |
| Model cold starts on voice path | zero in normal operation |
| Cancellation initiation | < 10 ms after barge-in signal |

These are design SLOs, not claims about the local model runtime. TTFT and token rate must be measured on the workstation.

## Contract generations

Each generation contains:

- monotonically increasing generation ID;
- load timestamp and next refresh deadline;
- immutable source list;
- merged provider catalogue;
- first-contract-wins `Map<modelId, binding>`.

Refresh behavior:

- first load is awaited before provider registration;
- TTL refresh is singleflight and asynchronous;
- current requests retain their captured generation;
- a successful refresh swaps one reference atomically;
- a failed refresh preserves the prior generation and applies retry backoff;
- explicit status/refresh can await a fresh generation.

Defaults:

- `PI_WORKSTATION_INFERENCE_CONTRACT_REFRESH_MS=5000`
- `PI_WORKSTATION_INFERENCE_CONTRACT_REFRESH_RETRY_MS=1000`

## Health behavior

Ordinary text:

- fresh cached verdict: return immediately;
- stale healthy verdict: allow and schedule one probe;
- stale unhealthy verdict: fail closed while one recovery probe runs;
- no cached verdict: allow the real provider request and schedule one probe;
- provider registration primes all known endpoints asynchronously.

Governed audio:

- retains blocking health validation;
- retains stale-contract rejection;
- retains exact scheduler/broker authority;
- retains no automatic retry after an ambiguous dispatch boundary.

## Startup sequence

1. Dispose any armed governed audio state.
2. Load and validate contract generation from local files only.
3. Register provider and models.
4. Return control to Pi.
5. Prime endpoint health asynchronously.

No network request is awaited during normal extension startup.

## Synthetic adapter baseline

Measured in the delivery environment with Node v22.16.0; these numbers exclude Pi module loading, the model server, GPU work, and network:

- cold contract generation from three local JSON files: p50 0.183 ms, p95 0.320 ms, p99 0.592 ms;
- one million cached model lookups: 60.7 ms total, about 0.061 microseconds per lookup;
- one million fresh-cache background health decisions: 123.6 ms total, about 0.124 microseconds each, with one actual probe.

The benchmark demonstrates that the adapter path is not the voice-latency bottleneck once model residency and server queueing are handled. It is not a claim about workstation TTFT or model throughput.

## Capacity and admission control

The extension cannot enforce GPU scheduling by itself. The workstation runtime owner should expose:

- active requests;
- queued requests;
- prefill tokens and decode tokens;
- TTFT p50/p95/p99;
- inter-token latency;
- KV-cache utilization;
- GPU memory and power;
- cancellation count;
- cold/warm model state.

For a solo builder, a practical starting policy is one high-priority realtime request plus a small bounded deep-work concurrency. Increase only from measurements.

## When Modal becomes justified

Use an explicit remote lane when at least one is true:

- the workstation is unavailable but remote access is required;
- a model or context does not fit locally;
- a short batch burst would otherwise block interactive work;
- remote users need regional proximity;
- a reproducible hosted deployment is needed for external customers;
- measured local utilization is persistently saturated.

Do not add Modal merely to introduce another provider abstraction; Pi already has that seam.

## Security and privacy

- Contracts accept credential-free loopback HTTP only.
- No prompt, response, audio bytes, or provider payload is written by this hot-path cache.
- Contract refresh errors are diagnostic strings, not durable authority.
- Remote fallback must be opt-in because it changes the privacy and data-residency boundary.
- Warm workers must be reset before any future multi-user reuse.

## Observability

The patch exposes `/workstation-inference hot-path` with:

- generation ID, model/source counts, load and refresh state;
- last refresh error and retry time;
- endpoint health cache state and probe-in-flight status.

The benchmark script measures only adapter overhead and labels its scope accordingly.
