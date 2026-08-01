export interface TemplateFrontmatterResult {
  attributes: Record<string, string>;
  body: string;
  frontmatter: string;
  hasFrontmatter: boolean;
}

export interface TemplateRenderDetection {
  engine: "none" | "pi-vars" | "nunjucks" | "invalid";
  explicitEngine: "none" | "pi-vars" | "nunjucks" | "invalid" | null;
  body: string;
  hasFrontmatter: boolean;
  error: string | null;
  usedRenderKeys: string[];
}

export declare function parseTemplateFrontmatter(raw: unknown): TemplateFrontmatterResult;
export declare function stripFrontmatter(raw: unknown): string;
export declare function normalizeRenderEngine(
  value: unknown,
): "none" | "pi-vars" | "nunjucks" | "invalid" | null;
export declare function detectTemplateRenderEngine(
  raw: unknown,
  options?: { allowLegacyPiVarsAutoDetect?: boolean },
): TemplateRenderDetection;
