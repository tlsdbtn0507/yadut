export function buildNativeLoginCallbackUrl(origin: string): string {
  return new URL('/', origin).toString()
}

export function getNativeLoginConsolePath(): string {
  return '/'
}
