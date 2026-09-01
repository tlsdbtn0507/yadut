# 아르커스 SSE 처리 상태 스트리밍 설계

## 목표

일반 대화, 웹 검색, 이미지 분석, 스케줄 등록 요청을 Web/iOS WebView에서 Vercel BFF를 거쳐 ThinkPad로 전달한다. ThinkPad가 실제로 요청을 접수하고 의도를 파악하며 역할을 수행하는 시점을 SSE로 전달해 UI에 사용자용 한국어 상태만 표시한다.

화면 캡처 버튼과 `/api/capture`는 이번 범위에서 제외한다.

## 전송 구조

```text
Web / iOS WebView
  POST /api/arcus/message/stream
    Vercel BFF: 세션·이메일 allowlist 확인
      POST ThinkPad /api/arcus/message/stream
        ThinkPad: 접수, 의도 판단, 역할 수행
      SSE stream 전달
  한국어 처리 상태 표시
```

이미지 payload를 POST body로 보내야 하므로 GET 전용 `EventSource` 대신 `fetch()`와 `ReadableStream`을 사용한다. 기존 `/api/arcus/message`는 ThinkPad가 처리 시작 전에 SSE 미지원을 명시한 경우에만 HTTP fallback으로 사용한다.

## 이벤트 계약

```json
{
  "type": "intent_identified",
  "request_id": "web-123",
  "action": "SCHEDULE_SYNC",
  "message": "요청을 파악했습니다. 캘린더에 일정을 등록합니다."
}
```

- `type`: 클라이언트 상태 전환용 이벤트 코드
- `request_id`: 요청 추적 ID
- `action`: ThinkPad 내부 역할 코드. UI에 표시하지 않는다.
- `message`: UI에 표시하는 사용자용 한국어 상태
- `result`: `completed`의 최종 응답
- `error_code`, `error_stage`: `failed`의 오류 식별자

이벤트 종류:

- `accepted`
- `thinkpad_processing`
- `intent_identified`
- `web_search`
- `macbook_upload`
- `image_analysis`
- `calendar_sync`
- `completed`
- `failed`

내부 action은 `NONE`, `CLARIFY`, `WEB_SEARCH`, `IMAGE_CHAT`, `SCHEDULE_SYNC`를 유지한다.

## 요청별 흐름

일반 대화:

```text
accepted
thinkpad_processing: 요청 내용을 파악하고 있습니다.
intent_identified: 답변을 준비하고 있습니다.
completed
```

웹 검색:

```text
accepted
thinkpad_processing: 요청 내용을 파악하고 있습니다.
intent_identified: 웹 검색이 필요한 요청으로 파악했습니다.
web_search: 관련 정보를 검색하고 있습니다.
completed
```

이미지 분석:

```text
accepted
thinkpad_processing: 이미지와 요청 내용을 파악하고 있습니다.
intent_identified: 이미지를 분석하는 요청으로 파악했습니다.
macbook_upload: 이미지를 분석 서버로 전달하고 있습니다.
image_analysis: 이미지 내용을 분석하고 있습니다.
completed
```

스케줄 등록:

```text
accepted
thinkpad_processing: 이미지와 요청 내용을 파악하고 있습니다.
intent_identified: 캘린더 일정 등록 요청으로 파악했습니다.
macbook_upload: 스케줄 이미지를 전달하고 있습니다.
calendar_sync: 분석한 일정을 캘린더에 반영하고 있습니다.
completed
```

## 서버 동작

ThinkPad의 기존 공통 처리 함수에 선택적 비동기 이벤트 콜백을 추가한다. HTTP, WebSocket, Telegram 호출자의 기존 반환 동작은 유지한다. SSE endpoint만 공통 함수를 실행하면서 이벤트를 queue로 받아 직렬화한다.

인증 실패는 stream 시작 전 `401`로 반환한다. 처리 중 예외는 `failed` 이벤트로 전송하고 stream을 닫는다. 이벤트는 실제 의도 판단과 외부 호출 시점에만 방출하며 타이머로 생성하지 않는다.

Vercel BFF는 기존 로그인·allowlist 확인과 서버 전용 bridge token을 재사용한다. ThinkPad의 `text/event-stream` body를 그대로 전달한다. ThinkPad가 처리 전 `404`, `405`, `415`, `501`로 SSE 미지원을 명시한 경우에만 기존 HTTP endpoint로 한 번 fallback한다. 결과가 불명확한 네트워크 단절에는 일정 중복 등록을 막기 위해 자동 재실행하지 않는다.

## UI 동작

`runThinkingSimulation`과 600ms 타이머를 제거한다. 클라이언트 parser는 분할 chunk와 한 chunk 안의 복수 이벤트를 모두 처리한다.

UI에는 이벤트의 `message`만 표시한다. `type`, `action`, `error_code`, `error_stage` 원문은 표시하지 않는다. `completed.result.message`는 최종 채팅 말풍선으로 추가하고 `failed.message`는 사용자용 오류로 표시한다.

## 완료 기준

- 일반 대화, 검색, 이미지 분석, 스케줄 등록이 실제 처리 순서대로 이벤트를 보낸다.
- UI 단계는 서버 이벤트가 도착할 때만 바뀐다.
- UI에는 한국어 상태만 보이고 내부 코드는 보이지 않는다.
- 기존 HTTP endpoint가 유지된다.
- ThinkPad pytest, Web Vitest, ESLint, Next.js production build가 통과한다.
- 로컬 관찰에서 SSE 이벤트가 실제 chunk로 순차 도착한다.

## 제외 범위

- 화면 캡처 버튼과 `/api/capture`
- `jobId` 저장·재연결
- 처리 시작 후 자동 재실행
- 배포와 Vercel 환경변수 변경
- iOS 네이티브 UI 변경
