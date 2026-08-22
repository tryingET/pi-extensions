# Deterministic CBOR profile v1

Hashed semantic artifacts use RFC 8949 core deterministic encoding with this stricter application profile:

- definite-length items only;
- integers encoded in preferred shortest form;
- no floating-point values;
- no duplicate map keys;
- maps use fixed unsigned-integer field keys sorted by deterministic encoded bytes;
- text is valid UTF-8 and has already passed the semantic type's normalization policy;
- tags are forbidden unless a future profile assigns one explicitly;
- unknown fields are rejected before encoding;
- the digest field is omitted from its own semantic body.

Digest:

```text
SHA256(UTF8(domain_string_with_NUL) || deterministic_cbor(body))
```

Domains are unique per artifact kind and major version. Protobuf wire bytes are never hashed as semantic identity.
