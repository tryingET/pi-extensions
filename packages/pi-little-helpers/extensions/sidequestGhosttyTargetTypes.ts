// summary: type-only shape of an exactly resolved controller Ghostty D-Bus target.
// read_when:
//   - changing controller Ghostty target typing without changing resolution or dispatch.

export type ControllerGhosttyDbusTarget = {
  busName: string;
  ownerPid: number;
  surfaceId: string;
  wellKnownName: string;
  objectPath: string;
};
