// markdown-it-task-lists não publica tipos.
declare module 'markdown-it-task-lists' {
  import type { PluginWithOptions } from 'markdown-it'
  const taskLists: PluginWithOptions<{ enabled?: boolean; label?: boolean; labelAfter?: boolean }>
  export default taskLists
}
