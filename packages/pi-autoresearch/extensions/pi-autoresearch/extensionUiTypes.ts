// ---
// summary: "Declares the minimal host UI, TUI, context, and overlay component contracts used by autoresearch presentation code."
// read_when:
//   - "Changing widget context capabilities, custom UI factories, render invalidation, or overlay lifecycle typing."
// ---
export type AutoresearchWidgetUi = {
  setWidget?: (id: string, widget: unknown, options?: unknown) => void;
  notify?: (message: string, level?: "info" | "warning" | "error") => void;
  editor?: (title: string, text: string) => Promise<void> | void;
  custom?: <T>(factory: AutoresearchCustomFactory<T>, options?: unknown) => Promise<T>;
};

export type AutoresearchWidgetContext = {
  cwd: string;
  hasUI: boolean;
  ui: AutoresearchWidgetUi;
};

export type AutoresearchWidgetTui = {
  requestRender?: () => void;
};

export type AutoresearchCustomFactory<T> = (
  tui: AutoresearchWidgetTui,
  theme: unknown,
  keybindings: unknown,
  done: (result: T) => void,
) => unknown;

export type AutoresearchOverlayComponent = {
  render(width: number): string[];
  handleInput(data: string): void;
  invalidate(): void;
  dispose?: () => void;
};
