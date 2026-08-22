# Protocol source and generated DTOs

`pi/tool_boundary/v1/boundary.proto` is the reviewed wire source. `npm run proto:generate` writes ESM JavaScript and TypeScript declarations to `generated/` using the pinned Buf toolchain.

Generated objects are transport DTOs only. Runtime code converts them immediately into closed semantic domain types. Protobuf serialization is never request, policy, plan, attestation, or disposition identity.
