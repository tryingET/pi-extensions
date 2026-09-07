---
summary: "Private extension implementation and activation procedure."
read_when:
  - "Private extension implementation and activation procedure."
system4d:
  container: "Private pi-typescript-tool package in pi-extensions."
  compass: "Typed trusted-code execution with explicit limits."
  engine: "Review -> implement -> package checks -> owner activation."
  fog: "In-process vm and typechecking are not security boundaries."
---

# Extension procedure

1. Confirm exact task scope at the owning monorepo.
2. Review trust boundaries in README and source/contract/tests.
3. Implement only the accepted capability scope and add failure-path tests.
4. Run the real package `npm run check` with managed scratch override.
5. Review actual artifact content and provider-free smoke evidence.
6. When separately authorized, owner installs this local package, reloads Pi and
   exercises one successful `typescript` fs.list call and one type-error call.
7. Keep live evidence distinct from package/unit evidence. No publishing is
   configured or requested; private:true and releaseConfigMode:none remain.
