# 아르커스 SSE 처리 상태 스트리밍 구현 계획

> **에이전트 작업자용:** REQUIRED SUB-SKILL: `superpowers:executing-plans`를 사용해 작업별로 실행한다. 각 단계는 체크박스로 추적한다.

**목표:** ThinkPad의 실제 의도 판단과 역할 수행 상태를 POST SSE로 전달하고 Web/iOS WebView UI에 사용자용 한국어 상태만 표시한다.

**아키텍처:** ThinkPad 공통 요청 처리 함수가 선택적 이벤트 콜백으로 실제 처리 이벤트를 방출한다. FastAPI SSE endpoint가 이벤트를 직렬화하고, Next.js BFF가 인증 후 stream을 전달하며, React 클라이언트가 `fetch()` 응답을 점진적으로 파싱한다.

**기술 스택:** Python 3, FastAPI, `StreamingResponse`, asyncio, Next.js 16.2.6 Route Handlers, React 19, TypeScript, Vitest, pytest

**명세:** `docs/superpowers/specs/2026-08-26-arcus-sse-processing-status-design.md`

## 전역 제약

- 화면 캡처 버튼과 `/api/capture`는 수정하지 않는다.
- UI에는 사용자용 한국어 상태만 표시한다.
- `action`, `type`, `error_code`, `error_stage` 원문은 UI에 노출하지 않는다.
- 기존 `/api/arcus/message` HTTP 경로를 유지한다.
- stream 처리 시작 후 자동 재실행하지 않는다.
- 새 외부 dependency를 추가하지 않는다.
- Vercel 배포와 환경변수 변경을 수행하지 않는다.
- 사용자 승인 없는 커밋을 만들지 않는다.

---

### 작업 1: ThinkPad SSE 이벤트 계약

**파일:**
- 생성: `project_thinkpad/arcus_stream.py`
- 생성: `project_thinkpad/tests/test_arcus_stream.py`

**인터페이스:**
- 생성: `ArcusEvent` TypedDict
- 생성: `EventEmitter = Callable[[ArcusEvent], Awaitable[None]]`
- 생성: `build_event(type, request_id, message, action=None, **extra) -> ArcusEvent`
- 생성: `encode_sse(event) -> str`

- [ ] **1.1 실패 테스트 작성**

```python
def test_encode_sse_preserves_korean_message():
    event = build_event(
        "intent_identified",
        "web-1",
        "캘린더 일정 등록 요청으로 파악했습니다.",
        action="SCHEDULE_SYNC",
    )

    encoded = encode_sse(event)

    assert encoded.startswith("event: intent_identified\n")
    assert '"message": "캘린더 일정 등록 요청으로 파악했습니다."' in encoded
    assert encoded.endswith("\n\n")
```

- [ ] **1.2 RED 확인**

실행: `pytest project_thinkpad/tests/test_arcus_stream.py -v`

예상: `ModuleNotFoundError: No module named 'arcus_stream'`

- [ ] **1.3 최소 구현 작성**

```python
import json
from collections.abc import Awaitable, Callable
from typing import NotRequired, TypedDict


class ArcusEvent(TypedDict):
    type: str
    request_id: str
    message: str
    action: NotRequired[str]
    result: NotRequired[dict[str, object]]
    error_code: NotRequired[str]
    error_stage: NotRequired[str]


EventEmitter = Callable[[ArcusEvent], Awaitable[None]]


def build_event(event_type: str, request_id: str, message: str, **extra: object) -> ArcusEvent:
    return ArcusEvent(type=event_type, request_id=request_id, message=message, **extra)


def encode_sse(event: ArcusEvent) -> str:
    data = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event['type']}\ndata: {data}\n\n"
```

- [ ] **1.4 GREEN 확인**

실행: `pytest project_thinkpad/tests/test_arcus_stream.py -v`

예상: PASS

### 작업 2: ThinkPad 실제 처리 이벤트와 SSE endpoint

**파일:**
- 수정: `project_thinkpad/main.py`
- 수정: `project_thinkpad/tests/test_logic.py`

**인터페이스:**
- `process_arcus_message(..., emit_event: EventEmitter | None = None) -> str`
- `POST /api/arcus/message/stream`
- 기존 `POST /api/arcus/message` 반환 유지

- [ ] **2.1 일반 대화 이벤트 실패 테스트 작성**

```python
@pytest.mark.asyncio
@patch("main.ask_gemma_brain")
async def test_process_arcus_message_emits_text_intent(mock_ask):
    mock_ask.return_value = {"message": "안녕하세요", "action": "NONE"}
    events = []

    async def emit(event):
        events.append(event)

    result = await process_arcus_message(text="안녕", message_id="web-1", emit_event=emit)

    assert result == "안녕하세요"
    assert [event["type"] for event in events] == ["thinkpad_processing", "intent_identified"]
    assert events[-1]["message"] == "답변을 준비하고 있습니다."
```

- [ ] **2.2 스케줄 이벤트 실패 테스트 작성**

```python
@pytest.mark.asyncio
@patch("httpx.AsyncClient.post")
@patch("httpx.AsyncClient.get")
async def test_process_arcus_message_emits_schedule_steps(mock_get, mock_post):
    events = []

    async def emit(event):
        events.append(event)

    result = await process_arcus_message(
        text="이 근무표를 캘린더에 등록해줘",
        attachment_type="image",
        attachment_data=base64.b64encode(b"image").decode(),
        message_id="web-schedule",
        emit_event=emit,
    )

    assert [event["type"] for event in events] == [
        "thinkpad_processing",
        "intent_identified",
        "macbook_upload",
        "calendar_sync",
    ]
    assert result == "Calendar updated"
```

- [ ] **2.3 RED 확인**

실행: `pytest project_thinkpad/tests/test_logic.py -k "emits_text_intent or emits_schedule_steps" -v`

예상: `process_arcus_message()`가 `emit_event` 인자를 받지 않아 FAIL

- [ ] **2.4 공통 처리 함수에 실제 이벤트 추가**

```python
async def emit_if_present(
    emit_event: EventEmitter | None,
    event_type: str,
    request_id: str,
    message: str,
    **extra: object,
) -> None:
    if emit_event:
        await emit_event(build_event(event_type, request_id, message, **extra))
```

이미지 분류 전 `thinkpad_processing`, 분류 직후 `intent_identified`, MacBook 호출 직전 `macbook_upload`, 이미지 분석 직전 `image_analysis`, 캘린더 호출 직전 `calendar_sync`를 호출한다. 텍스트는 Gemma 호출 전 `thinkpad_processing`, decision 직후 `intent_identified`, 검색 직전 `web_search`를 호출한다.

- [ ] **2.5 SSE endpoint 실패 테스트 작성**

```python
@pytest.mark.asyncio
@patch("main.process_arcus_message")
async def test_arcus_stream_endpoint_emits_accepted_and_completed(mock_process):
    mock_process.return_value = "안녕하세요"

    response = await arcus_message_stream_endpoint(
        ArcusMessageRequest(text="안녕", message_id="web-1"),
        authorization="Bearer SERVER_TOKEN",
    )
    body = "".join([chunk async for chunk in response.body_iterator])

    assert "event: accepted" in body
    assert "event: completed" in body
    assert '"message":"안녕하세요"' in body
```

- [ ] **2.6 RED 확인 후 queue 기반 stream 구현**

```python
@app.post("/api/arcus/message/stream")
async def arcus_message_stream_endpoint(...):
    if not is_bridge_authorized(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    async def event_stream():
        queue: asyncio.Queue[ArcusEvent | None] = asyncio.Queue()

        async def emit(event: ArcusEvent) -> None:
            await queue.put(event)

        async def process() -> None:
            try:
                await emit(build_event("accepted", payload.message_id, "요청을 접수했습니다."))
                message = await process_arcus_message(..., emit_event=emit)
                await emit(build_event("completed", payload.message_id, message, result={"message": message}))
            except Exception:
                await emit(build_event("failed", payload.message_id, "요청 처리 중 오류가 발생했습니다.", error_code="processing_failed", error_stage="thinkpad_processing"))
            finally:
                await queue.put(None)

        task = asyncio.create_task(process())
        while (event := await queue.get()) is not None:
            yield encode_sse(event)
        await task

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

- [ ] **2.7 ThinkPad GREEN 및 회귀 확인**

실행: `pytest project_thinkpad/tests/test_logic.py project_thinkpad/tests/test_arcus_stream.py -v`

예상: PASS

### 작업 3: Next.js 인증 SSE proxy

**파일:**
- 생성: `project_web/src/app/api/arcus/message/stream/route.ts`
- 생성: `project_web/src/app/api/arcus/message/stream/__tests__/route.test.ts`

**인터페이스:**
- `POST /api/arcus/message/stream`
- 입력은 기존 `ArcusMessagePayload`
- 출력은 `text/event-stream`

- [ ] **3.1 인증과 stream 전달 실패 테스트 작성**

```typescript
it('proxies authenticated ThinkPad SSE without buffering', async () => {
  global.fetch = vi.fn(async () => new Response(
    'event: accepted\ndata: {"type":"accepted","message":"요청을 접수했습니다."}\n\n',
    { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } },
  )) as typeof fetch

  const response = await POST(new Request('http://localhost/api/arcus/message/stream', {
    method: 'POST',
    body: JSON.stringify({ text: '안녕', message_id: 'web-1' }),
  }))

  expect(response.headers.get('Content-Type')).toContain('text/event-stream')
  await expect(response.text()).resolves.toContain('요청을 접수했습니다.')
})
```

- [ ] **3.2 RED 확인**

실행: `npm test -- src/app/api/arcus/message/stream/__tests__/route.test.ts`

예상: route module 없음으로 FAIL

- [ ] **3.3 기존 BFF 인증·환경변수 helper를 재사용해 route 구현**

```typescript
return new Response(upstream.body, {
  status: upstream.status,
  headers: {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
  },
})
```

fallback은 upstream이 `404`, `405`, `415`, `501`일 때만 기존 ThinkPad HTTP endpoint를 호출하고 단일 `completed` 또는 `failed` SSE frame으로 변환한다.

- [ ] **3.4 GREEN 확인**

실행: `npm test -- src/app/api/arcus/message/stream/__tests__/route.test.ts`

예상: PASS

### 작업 4: 클라이언트 SSE parser와 한국어 상태 매핑

**파일:**
- 생성: `project_web/src/utils/arcusStream.ts`
- 생성: `project_web/src/utils/__tests__/arcusStream.test.ts`
- 수정: `project_web/src/utils/telemetry.ts`
- 수정: `project_web/src/utils/__tests__/telemetry.test.ts`

**인터페이스:**
- `ArcusStreamEvent` 타입
- `readArcusStream(response, onEvent) -> Promise<void>`
- `getTelemetryStage(event) -> TelemetryStage`

- [ ] **4.1 분할 chunk parser 실패 테스트 작성**

```typescript
it('parses Korean SSE data split across chunks', async () => {
  const response = streamResponse([
    'event: accepted\ndata: {"type":"accepted","message":"요청을 ',
    '접수했습니다."}\n\nevent: completed\ndata: {"type":"completed","message":"완료"}\n\n',
  ])
  const events: ArcusStreamEvent[] = []

  await readArcusStream(response, (event) => events.push(event))

  expect(events.map((event) => event.message)).toEqual(['요청을 접수했습니다.', '완료'])
})
```

- [ ] **4.2 RED 확인**

실행: `npm test -- src/utils/__tests__/arcusStream.test.ts`

예상: `readArcusStream` 없음으로 FAIL

- [ ] **4.3 buffer 기반 parser 최소 구현**

```typescript
const reader = response.body?.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (reader) {
  const { done, value } = await reader.read()
  buffer += decoder.decode(value, { stream: !done })
  const frames = buffer.split('\n\n')
  buffer = frames.pop() ?? ''
  for (const frame of frames) {
    const data = frame.split('\n').find((line) => line.startsWith('data: '))
    if (data) onEvent(JSON.parse(data.slice(6)) as ArcusStreamEvent)
  }
  if (done) break
}
```

- [ ] **4.4 telemetry 매핑 테스트와 구현**

`accepted`, `thinkpad_processing`, `intent_identified`는 ThinkPad 단계, `macbook_upload`, `image_analysis`, `calendar_sync`는 MacBook 단계, `completed`는 응답 단계, `failed`는 실패 단계로 매핑한다. 표시 문자열은 오직 `event.message`를 사용한다.

- [ ] **4.5 GREEN 확인**

실행: `npm test -- src/utils/__tests__/arcusStream.test.ts src/utils/__tests__/telemetry.test.ts`

예상: PASS

### 작업 5: ArcusConsole 실제 이벤트 연결

**파일:**
- 수정: `project_web/src/components/ArcusConsole.tsx`
- 생성: `project_web/src/components/__tests__/ArcusConsole.test.tsx`

**인터페이스:**
- 기존 `handleSend`가 `/api/arcus/message/stream` 사용
- `runThinkingSimulation` 제거
- 화면 캡처 `handleCaptureScreen` 변경 없음

- [ ] **5.1 UI 실패 테스트 작성**

```typescript
it('shows only Korean server status and final response', async () => {
  mockArcusStream([
    { type: 'intent_identified', action: 'SCHEDULE_SYNC', message: '캘린더 일정 등록 요청으로 파악했습니다.' },
    { type: 'calendar_sync', action: 'SCHEDULE_SYNC', message: '일정을 캘린더에 반영하고 있습니다.' },
    { type: 'completed', message: '일정 등록이 완료되었습니다.', result: { message: '일정 등록이 완료되었습니다.' } },
  ])

  render(<ArcusConsole />)
  await sendMessage('이 근무표를 등록해줘')

  expect(screen.getByText('일정을 캘린더에 반영하고 있습니다.')).toBeInTheDocument()
  expect(screen.queryByText('SCHEDULE_SYNC')).not.toBeInTheDocument()
  expect(await screen.findByText('일정 등록이 완료되었습니다.')).toBeInTheDocument()
})
```

- [ ] **5.2 RED 확인**

실행: `npm test -- src/components/__tests__/ArcusConsole.test.tsx`

예상: 기존 가상 telemetry 때문에 서버 상태가 표시되지 않아 FAIL

- [ ] **5.3 실제 stream 연결 구현**

`handleSend`는 사용자 메시지를 추가한 뒤 즉시 `isThinking=true`로 설정하고 stream 요청을 시작한다. 각 이벤트마다 `telemetryStage`와 `telemetryLog=event.message`를 갱신한다. `completed`에서 최종 메시지를 추가하고 `failed`에서 사용자용 오류를 추가한다. 두 종료 이벤트에서만 `isThinking=false`로 변경한다.

- [ ] **5.4 화면 캡처 비회귀 확인**

`handleCaptureScreen`, `/api/capture` 호출, 캡처 버튼 markup에 diff가 없는지 `git diff -- project_web/src/app/api/capture/route.ts`와 관련 테스트로 확인한다.

- [ ] **5.5 GREEN 확인**

실행: `npm test -- src/components/__tests__/ArcusConsole.test.tsx`

예상: PASS

### 작업 6: 전체 검증과 로드맵 반영

**파일:**
- 수정: `YADUT_ROADMAP.md`는 모든 검증 통과 후 SSE 항목만 완료 처리

- [ ] **6.1 ThinkPad 전체 테스트**

실행: `pytest project_thinkpad/tests -v`

예상: 전체 PASS

- [ ] **6.2 Web 전체 테스트**

실행: `npm run test:run`

작업 디렉터리: `project_web`

예상: 전체 PASS

- [ ] **6.3 정적 검증**

실행: `npm run lint`

작업 디렉터리: `project_web`

예상: exit 0

- [ ] **6.4 production build**

실행: `npm run build`

작업 디렉터리: `project_web`

예상: exit 0

- [ ] **6.5 로컬 stream chunk 확인**

로컬 ThinkPad와 Web 서버가 실행 가능한 경우 `curl -N` 또는 Node stream reader로 `accepted`, 처리 이벤트, `completed`가 순차 도착하는지 확인한다. 실제 외부 서버가 없으면 FastAPI와 Route Handler 테스트의 지연 stream fixture 결과를 근거로 기록하고 실서버 검증은 완료로 주장하지 않는다.

- [ ] **6.6 완료 감사**

다음을 모두 확인한 뒤에만 완료로 판단한다.

```text
[ ] 화면 캡처 관련 파일 변경 없음
[ ] 일반 대화 실제 이벤트
[ ] 웹 검색 실제 이벤트
[ ] 이미지 분석 실제 이벤트
[ ] 스케줄 등록 실제 이벤트
[ ] UI 내부 코드 비노출
[ ] HTTP fallback 유지
[ ] 전체 테스트·lint·build 통과
```
