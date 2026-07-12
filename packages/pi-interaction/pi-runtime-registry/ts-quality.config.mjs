/**
 * summary: "selects the package-local biome and typescript configurations for runtime registry quality checks."
 * read_when:
 *   - "configuring or troubleshooting ts-quality for the runtime registry package."
 */
export default {
  biome: {
    configPath: "./biome.jsonc",
  },
  typescript: {
    configPath: "./tsconfig.json",
  },
};
