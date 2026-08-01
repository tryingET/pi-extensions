export type TemplateRenderEngine = "none" | "pi-vars" | "nunjucks" | "invalid";

export interface TemplateFrontmatter {
  attributes: Record<string, string>;
  body: string;
  frontmatter: string;
  hasFrontmatter: boolean;
}

export interface TemplateRenderOptions {
  args?: unknown[];
  data?: Record<string, unknown>;
  currentCompany?: unknown;
  context?: unknown;
  templateName?: unknown;
  allowLegacyPiVarsAutoDetect?: boolean;
  appendContextSection?: boolean;
}

export interface TemplateRenderContext extends Record<string, unknown> {
  args: string[];
  arguments: string;
  current_company: string;
  context: string;
  template_name: string;
}

export interface TemplateRenderContract {
  engine: TemplateRenderEngine;
  explicitEngine: TemplateRenderEngine | null;
  body: string;
  hasFrontmatter: boolean;
  error: string | null;
  usedRenderKeys: string[];
}

export interface RenderedTemplate extends TemplateRenderContract {
  rendered: string;
  renderContext: TemplateRenderContext;
}

export type PreparedTemplate =
  | (RenderedTemplate & {
      ok: true;
      prepared: string;
      contextAppended: boolean;
    })
  | {
      ok: false;
      error: string;
    };

export function parseTemplateFrontmatter(raw: unknown): TemplateFrontmatter;

export function stripFrontmatter(raw: unknown): string;

export function normalizeRenderEngine(value: unknown): TemplateRenderEngine | null;

export function detectTemplateRenderEngine(
  raw: unknown,
  options?: Pick<TemplateRenderOptions, "allowLegacyPiVarsAutoDetect">,
): TemplateRenderContract;

export function substitutePiVars(content: unknown, args: unknown): string;

export function buildRenderContext(options?: TemplateRenderOptions): TemplateRenderContext;

export function renderTemplateContent(
  raw: unknown,
  options?: TemplateRenderOptions,
): RenderedTemplate;

export function prepareTemplateForExecution(
  raw: unknown,
  options?: TemplateRenderOptions,
): PreparedTemplate;
