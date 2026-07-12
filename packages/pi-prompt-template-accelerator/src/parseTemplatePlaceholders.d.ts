/**
summary: "Defines typed positional, all-arguments, and slice placeholder usage returned by the template parser."
read_when:
  - "Changing the placeholder parser result shape or consuming its TypeScript contract."
*/
export interface TemplateSliceUsage {
  start: number;
  length?: number;
}

export interface TemplatePlaceholderUsage {
  positionalIndexes: number[];
  highestPositionalIndex: number;
  usesAllArgs: boolean;
  slices: TemplateSliceUsage[];
}

export function parseTemplatePlaceholders(templateText: string): TemplatePlaceholderUsage;
