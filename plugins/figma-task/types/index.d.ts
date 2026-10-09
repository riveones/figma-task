export type StepStatus = 'todo' | 'doing' | 'done' | 'blocked'

export type Product = 'portal' | 'ecom'

export type TaskRecord = {
  key: string
  product: Product
  steps: Record<string, { status: StepStatus; note?: string }>
  pageUrl?: string
  widgetLinks?: string[]
  updatedAt: number
}

/* A reply drafted by the model; the person posts it from the pane. */
export type Draft = {
  fileKey: string
  commentId: string
  message: string
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'figma-task': { tasks: Record<string, TaskRecord>; current: string; offered: string[]; drafts: Draft[] }
  }
}
