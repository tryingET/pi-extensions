## 18. DataExposureIR, privacy, and truthful claims

### 18.1 Machine-readable exposure record

Each session/lease exposes:

```ts
interface DataExposureIRV1 {
  guestNetwork: "absent" | "mediated" | "open" | "unknown";
  controllerInjectedCredentials: "none" | "present" | "unknown";
  modelProviderLocality: "local" | "remote" | "unknown";
  modelProviderId?: string;
  hostConnectorGrants: readonly HostConnectorExposureV1[];
  rawToolOutputRetention: RetentionExposureV1;
  changeSetRetention: RetentionExposureV1;
  quarantineRetention: RetentionExposureV1;
  sourceMayContainSensitiveData: true;
  endToEndInformationFlowConfinement: false;
}
```

Unknown provider locality remains unknown. A loopback URL may be evidence for local transport only after the exact provider adapter confirms it; string heuristics are insufficient.

### 18.2 Release 0.1 claims

- guest network interface: absent;
- controller-injected host credentials: none;
- repository may contain sensitive data: yes;
- tool results return to Pi and its active model provider: yes;
- host connectors are separate authority and disclosure surfaces;
- end-to-end DLP: not claimed.

### 18.3 Retention privacy

Raw output, change sets, and quarantine receive separate retention policies and status. Telemetry is content-minimized. Command/path digests are not assumed private when the input space is guessable; use typed categories and keyed local pseudonyms where correlation is required.
