# @tryinget/pi-runtime-registry

Shared runtime instance registry for pi-interaction extensions.

## Purpose

Provides a central place for registering and discovering runtime instances across extensions. Extensions can:

- Register their runtime instances with capability descriptors
- Discover runtimes by owner or capability
- Query registry state for diagnostics

## Usage

```javascript
import { createRuntimeRegistry, getGlobalRuntimeRegistry } from "@tryinget/pi-runtime-registry";

// Use the global singleton for cross-extension discovery
const registry = getGlobalRuntimeRegistry();

// Register a runtime with capabilities
registry.register(
  "my-extension",
  "main-runtime",
  myRuntimeInstance,
  [
    { id: "picker", description: "Fuzzy picker interactions" },
    { id: "editor", description: "Editor ownership" }
  ]
);

// Find runtimes by capability
const pickerRuntimes = registry.findByCapability("picker");

// Get diagnostics
console.log(registry.diagnostics());
```

## API

### `createRuntimeRegistry(options?)`

Create a new registry instance.

### `getGlobalRuntimeRegistry()`

Get the process-wide singleton registry for cross-extension discovery.

### Registry Methods

- `register(ownerId, runtimeId, instance, capabilities?)` - Register a runtime
- `unregister(ownerId, runtimeId)` - Remove a runtime
- `get(ownerId, runtimeId)` - Get a specific runtime
- `getByOwner(ownerId)` - Get all runtimes for an owner
- `findByCapability(capabilityId)` - Find runtimes with a capability
- `list()` - List all runtimes
- `diagnostics()` - Get registry diagnostics
- `clear()` - Clear all runtimes
