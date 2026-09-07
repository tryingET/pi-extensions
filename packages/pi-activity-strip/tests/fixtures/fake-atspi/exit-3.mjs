// Stands in for the helper on a host without AT-SPI bindings.
console.log(
  JSON.stringify({ ok: false, error: "AT-SPI bindings unavailable: No module named 'gi'" }),
);
process.exit(3);
