export interface ParsedMemoryResult {
  text: string
  memoryUpdates: string[]
}

export function parseMemory(input: string): ParsedMemoryResult {
  if (!input) {
    return { text: '', memoryUpdates: [] }
  }

  const memoryUpdates: string[] = []
  // Matches [MEMORY_UPDATE: contents] or [MEMORY_UPDATE:]
  // Captured group matches everything inside after the colon, stripping surrounding spaces.
  const regex = /\[MEMORY_UPDATE:\s*(.*?)\s*\]/g
  
  let match
  // Extract all memory updates before removing them from text
  while ((match = regex.exec(input)) !== null) {
    memoryUpdates.push(match[1])
  }

  // Replace all tags with empty string to clean the main text
  const cleanText = input.replace(regex, '')

  return {
    text: cleanText,
    memoryUpdates
  }
}
