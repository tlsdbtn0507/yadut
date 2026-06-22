export type ChatKeyEvent = {
  key: string
  shiftKey: boolean
  isComposing: boolean
  keyCode: number
  compositionSessionActive: boolean
}

export function shouldSubmitChatKey(event: ChatKeyEvent): boolean {
  return (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.isComposing &&
    event.keyCode !== 229 &&
    !event.compositionSessionActive
  )
}
