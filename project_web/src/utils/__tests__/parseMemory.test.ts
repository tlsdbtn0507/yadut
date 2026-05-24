import { describe, it, expect } from 'vitest'
import { parseMemory } from '../parseMemory'

describe('Memory Parser (TDD Step 2: Memory Update Tag Extraction)', () => {
  it('should return empty updates and unchanged text when no tag exists', () => {
    const input = '안녕하세요, 마스터. 오늘 일정을 안내해 드립니다.'
    const result = parseMemory(input)
    
    expect(result.text).toBe(input)
    expect(result.memoryUpdates).toEqual([])
  })

  it('should extract a single MEMORY_UPDATE tag and clean the main text', () => {
    const input = '마스터, 요청하신 사항을 반영했습니다. [MEMORY_UPDATE: 마스터는 아침 8시에 기상함]'
    const result = parseMemory(input)
    
    // The tag must be stripped cleanly
    expect(result.text).toBe('마스터, 요청하신 사항을 반영했습니다. ')
    expect(result.memoryUpdates).toEqual(['마스터는 아침 8시에 기상함'])
  })

  it('should extract multiple MEMORY_UPDATE tags and clean the main text', () => {
    const input = '알겠습니다. [MEMORY_UPDATE: 선호도: 에스프레소] 작업 진행하겠습니다. [MEMORY_UPDATE: 알림 주기: 1시간]'
    const result = parseMemory(input)
    
    expect(result.text).toBe('알겠습니다.  작업 진행하겠습니다. ')
    expect(result.memoryUpdates).toEqual([
      '선호도: 에스프레소',
      '알림 주기: 1시간'
    ])
  })

  it('should handle empty or malformed brackets safely without crashing', () => {
    const input = '마스터 [MEMORY_UPDATE: ] 안녕하세요. [MEMORY_UPDATE:]'
    const result = parseMemory(input)
    
    expect(result.text).toBe('마스터  안녕하세요. ')
    expect(result.memoryUpdates).toEqual(['', ''])
  })
})
