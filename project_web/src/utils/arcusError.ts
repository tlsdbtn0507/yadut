import type { ArcusStreamEventType } from './arcusStream'

const ERROR_MESSAGES: Record<string, string> = {
  client_to_bff: '아르커스 요청 서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.',
  bff_to_thinkpad: '씽크패드 서버에 연결하지 못했습니다. 서버 상태를 확인해 주세요.',
  thinkpad_processing: '씽크패드에서 요청을 분석하는 중 오류가 발생했습니다.',
  web_search: '웹 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  macbook_upload: '맥북 서버로 이미지를 전달하는 중 오류가 발생했습니다.',
  image_analysis: '맥북에서 이미지를 분석하는 중 오류가 발생했습니다.',
  calendar_sync: '맥북 캘린더에 일정을 반영하는 중 오류가 발생했습니다.',
}

export function getArcusFailureMessage(
  errorStage?: string,
  lastEventType: ArcusStreamEventType | 'client_to_bff' = 'client_to_bff',
): string {
  const stage = errorStage ?? lastEventType
  const normalizedStage = stage === 'accepted' || stage === 'intent_identified'
    ? 'thinkpad_processing'
    : stage

  return ERROR_MESSAGES[normalizedStage]
    ?? '아르커스가 요청을 처리하는 중 오류가 발생했습니다. 다시 시도해 주세요.'
}
