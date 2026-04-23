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
