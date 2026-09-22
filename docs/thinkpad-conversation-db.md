# ThinkPad 로컬 대화 저장 및 온톨로지 연결 경계

## 범위와 실행

대화 DB와 첨부 원본은 ThinkPad 파일시스템에만 영구 저장한다. 웹은 로그인 허용 목록을 통과한 BFF를 통해 읽고 쓴다. Vercel 파일시스템, 외부 DB, 브라우저 localStorage에는 대화를 저장하지 않는다. 기존 MacBook 분석·외부 검색 처리 흐름은 유지한다. 아직 PDF 내용 분석과 온톨로지 추출은 구현하지 않는다.

기존 ThinkPad 가상환경으로 `project_thinkpad`에서 `python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload`를 실행한다. 앱 lifespan에서 데이터 경로와 스키마를 초기화한다. 서버 시작은 단일 worker를 전제로 한다. 시작 시 이전 프로세스의 processing 요청을 interrupted로 바꾸므로 같은 DB에 여러 서버 프로세스를 띄우지 않는다.

| 설정 | 기본값/역할 |
|---|---|
| `YADUT_DATA_DIR` | `~/.local/share/yadut`, DB 디렉터리 |
| `YADUT_ATTACHMENT_DIR` | 데이터 디렉터리의 `attachments/`, 원본 보관 |
| `THINKPAD_BRIDGE_TOKEN` | 기존 서버 간 Bearer 인증 |
| 웹 `THINKPAD_FUNNEL_URL`, `THINKPAD_BRIDGE_TOKEN` | 기존 서버 전용 설정 재사용 |

경로는 현재 작업 디렉터리에 의존하지 않으며 저장소 내부 설정은 거부한다. 디렉터리 0700, DB·원본 파일 0600. DB 파일은 `conversations.sqlite3`. WAL과 SHM도 함께 생성될 수 있다. DB는 암호화하지 않으므로 운영체제 계정·디스크 보안은 별도 관리한다. 새 DB 의존성은 없다.

## 스키마 v1

- `conversations`: 불변 UUID, 제목, UTC ISO 8601 생성·수정 시각.
- `messages`: 내부 정렬 sequence, 클라이언트 message ID UNIQUE, conversation FK, user/assistant 역할, 원문 text, 생성·수정 시각, 전송 상태, revision, deleted_at, 실제 result JSON, request hash, 오류 코드/단계, reply_to UNIQUE.
- `attachments`: 불변 UUID, message FK, 종류, 원래 파일명, 서버 생성 상대 경로, MIME, 크기, 업로드 offset/완료 상태, 생성·수정 시각. 업로드 중에는 message FK가 NULL이며 메시지 저장 트랜잭션에서 귀속된다.
- `message_changes`: 증가하는 sequence, source message ID, revision, created/updated/deleted, UTC 시각. `(message_id, revision)` UNIQUE.
- `message_revisions`: `(message_id, revision)`별 원문·구조화 결과와 시각. 수정 전 기록을 조회할 수 있다. 명시적인 삭제 시 이력의 본문도 지우고 식별자·변경 근거만 남긴다.
- `message_extractions`: `(message_id, revision, processing_version)` PRIMARY KEY, pending/completed/failed/invalidated 상태와 마지막 처리 시각.

연결마다 foreign_keys와 busy_timeout=5000을 설정한다. WAL을 사용하며 쓰기는 짧은 BEGIN IMMEDIATE 트랜잭션으로 직렬화한다. 입력 값은 SQL 바인딩으로만 전달한다. 시작 시 user_version을 검사하고 v0→v1을 원자적으로 적용한다. 지원하지 않는 미래 버전은 거부한다.

## API 계약

모든 ThinkPad API는 기존 브리지 인증을 요구한다. 웹은 같은 상대 경로의 인증 BFF만 호출한다. 조회·다운로드는 no-store이며 브라우저에 ThinkPad 주소·토큰·디스크 경로를 반환하지 않는다.

| 메서드/경로 | 요청/응답 |
|---|---|
| POST `/api/conversations` | `{title?: string}` → 201, `{id,title,created_at,updated_at}` |
| GET `/api/conversations` | 수정 시각 내림차순 배열 |
| GET `/api/conversations/{id}` | 대화 메타데이터 + `messages` 배열, 저장 순서 |
| POST `/api/conversations/{id}/messages` | `{message_id,text,attachment_ids?: string[]}` → 201, 사용자 메시지. 동일 내용 재전송은 기존 메시지 |
| POST `/api/attachments` | `{name,mime_type,byte_size}` → 201, `{id,received:0,ready:0}` |
| PUT `/api/attachments/{id}?offset=N` | 최대 512 KiB의 원본 바이트 → `{id,received,ready}` |
| GET `/api/attachments/{id}` | 실제 메시지에 귀속된 첨부만 다운로드 |
| POST `/api/arcus/message/stream` | 기존 payload + `conversation_id`, 필수 `message_id`, `attachment_ids` → 기존 SSE |
| POST `/api/arcus/message` | conversation-aware 요청은 동일 저장·처리 경계를 사용하는 HTTP 응답 |

식별자는 영숫자로 시작하는 영숫자/`_`/`-`, 최대 128자. 브라우저는 UUID를 생성한다. 메시지 원문 최대 100,000자, 메시지당 첨부 최대 10개(현재 UI 선택은 기존처럼 1개). 첨부 하나 최대 20 MiB. 이미지 JPEG/PNG/WebP/GIF/HEIC/HEIF, PDF, UTF-8 text/plain을 허용한다. 파일 매직 바이트 검증은 기본 형식 검사이며 완전한 문서 유효성 검사나 악성코드 검사는 아니다.

오류는 인증 401, 누락 404, ID·내용 충돌/처리 중 409, 크기 413, 입력 422. 입력 검증 오류에 원문 payload를 반사하지 않는다. BFF는 upstream 내부 오류를 전달하지 않는다.

### 처리·재시도

1. 첨부 원본을 제한된 청크로 ThinkPad에 전송한다. 같은 ID·offset·bytes 재전송은 중복되지 않는다. 압축된 이미지 분석 payload와 원본 파일은 분리한다.
2. 사용자 메시지를 저장한 뒤 요청을 processing으로 원자적으로 claim한다. accepted는 그 뒤에만 발행된다.
3. 기존 진행 이벤트는 저장하지 않는다. 실제 terminal 결과의 text/result와 assistant ID를 커밋한 다음 completed를 발행한다.
4. 실패는 사용자 메시지의 status/error_code/error_stage로 기록한다. 실패 안내·환영 문구를 assistant 원문으로 저장하지 않는다.
5. 동일 ID·내용·payload를 재전송하면 완료 결과를 재생한다. 처리 중이면 409, 실패/중단 요청은 실패 상태를 반환한다. 외부 캘린더 작업 등을 자동 재실행하지 않는다.
6. SSE 연결이 끊겨도 이미 시작한 처리는 서버에서 계속된다. 대화를 다시 선택해 결과를 조회할 수 있다. 프로세스 자체가 종료되면 다음 시작에서 interrupted로 복구한다.

DB 저장과 외부 캘린더 실행은 분산 트랜잭션이 아니다. 외부 작업 성공 직후 서버가 죽으면 실행 결과가 불명확할 수 있다. 같은 ID를 자동 재실행하지 않으며 사용자가 외부 상태를 확인해야 한다.

현재 UI는 전송 중 새 대화/다른 대화 선택을 제한해 응답 혼입을 방지한다. 목록은 열 때와 열린 상태의 전송 완료 후 새로 조회한다. 파일 선택 원본은 SQLite BLOB으로 넣지 않는다. 미완료/미귀속 업로드는 사용 중인 파일과 구분되며 자동 삭제하지 않는다. 운영자가 오프라인 상태에서 DB 참조를 확인한 뒤 정리해야 한다.

## 향후 온톨로지 서비스 인터페이스

ThinkPad 로컬 Python 인터페이스 `services.conversation_sync`를 사용한다. 이번에는 외부 동기화 엔드포인트나 온톨로지 엔진을 추가하지 않는다.

- `changes_since(store, sequence, limit=100)`: 커서 이후 생성·수정·삭제 이벤트. 커서는 소비자가 저장한다.
- `extraction_source(store, message_id)`: 현재 revision의 원문·첨부 메타데이터·삭제 상태.
- `source_revision(store, message_id, revision)`: 특정 버전의 원문. 삭제된 본문은 반환하지 않는다.
- `pending_sources(store, processing_version, limit=100)`: 현재 revision이 해당 버전으로 처리 완료되지 않은 메시지.
- `finish_extraction(store, message_id, revision, processing_version, status='completed')`: 상태 기록. 동일 완료의 재시도는 False. 오래된/삭제된 revision은 Conflict.
- `revise_message(store, message_id, expected_revision, text)`: 로컬 정정 인터페이스. text=None은 삭제 표식과 본문 제거. 현재 UI에 편집·삭제 기능은 추가하지 않는다.

소비자는 사실에 `source_message_id`, `source_revision`, `processing_version`, 신뢰도, 직접 진술/추론 구분, 생성·수정 시각을 기록한다. 여러 근거는 별도 source 관계로 묶는다. 사실 DB에서 출처 기반 upsert를 먼저 커밋하고 이후 추출 완료를 기록한다. 중간 장애 시 동일 출처 upsert로 재처리해야 한다. 현재 인터페이스는 분산 시스템의 exactly-once를 보장하지 않는다.

원본 정정/삭제와 revision 증가·변경 이벤트·기존 extraction invalidation은 같은 DB 트랜잭션이다. 삭제 이벤트는 오래된 사실을 찾고 무효화/삭제하는 근거로 남는다. 향후 서비스는 삭제 이벤트도 처리해야 하며 pending_sources만 조회해서는 삭제 동기화를 할 수 없다.

## 수동 백업

자동 백업은 없다. DB와 첨부를 일관된 시점으로 함께 보관한다.

1. ThinkPad 서버를 정상 종료하고 해당 DB를 쓰는 다른 프로세스도 중단한다. 진행 중 외부 작업의 완료 여부를 확인한다.
2. 소유자만 접근 가능한 저장소 밖 백업 디렉터리를 만든다.
3. Python 표준 라이브러리 backup API로 복사한다(경로는 실제 운영 경로로 변경).

```python
from pathlib import Path
import sqlite3
import shutil

source = Path.home() / '.local/share/yadut'
backup = Path.home() / 'yadut-backup-YYYYMMDD'
backup.mkdir(mode=0o700)
with sqlite3.connect(source / 'conversations.sqlite3') as src:
    with sqlite3.connect(backup / 'conversations.sqlite3') as dst:
        src.backup(dst)
        assert dst.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert not dst.execute('PRAGMA foreign_key_check').fetchall()
shutil.copytree(source / 'attachments', backup / 'attachments')
(backup / 'conversations.sqlite3').chmod(0o600)
```

`YADUT_ATTACHMENT_DIR`를 별도로 지정했다면 해당 디렉터리를 복사한다. DB가 실행 중일 때 sqlite3 파일 하나만 복사하지 않는다. 백업은 개인정보 원본이므로 로그·Git·클라우드 저장소로 보내지 않는다.

## 복구

1. 서버를 중단한 상태로 유지한다. 기존 DB/첨부 전체를 별도 디렉터리로 이동해 보존한다.
2. 비어 있는 복구 데이터 디렉터리에 백업 DB와 첨부를 함께 복사한다. 과거 WAL/SHM을 백업 DB와 섞지 않는다.
3. 디렉터리 0700, 파일 0600과 소유자를 맞춘다. 환경변수 경로도 확인한다.
4. 위 integrity_check/foreign_key_check를 실행하고 첨부 상대 경로의 파일 존재·크기가 메타데이터와 일치하는지 확인한다.
5. 지원 스키마 버전의 서버를 시작하고 목록·메시지·원본 첨부를 확인한다. 삭제 전 백업을 복구하면 과거 개인정보도 되살아나므로 온톨로지 재동기화와 삭제 이력 정책을 함께 확인한다.

## 변경 파일과 검증 기록 (2026-09-22)

### 이번 작업 파일

- `.gitignore`, `implementation_plan.md`, 이 운영 문서.
- ThinkPad: `main.py`, `arcus_stream.py`, `routers/conversations.py`.
- ThinkPad 저장 모듈: `services/conversation_schema.py`, `conversation_store.py`, `conversation_processing.py`, `conversation_sync.py`, `attachment_store.py`.
- ThinkPad 테스트: `__tests__/test_conversation_store.py`, `test_conversation_api.py`, `test_attachment_store.py`.
- Web UI: `src/components/ArcusConsole.tsx`, `YadutSidebar.tsx`, `src/hooks/useConversations.ts`.
- Web 데이터/BFF: `src/utils/conversations.ts`, `arcusPayload.ts`, `arcusStream.ts`, `src/server/conversationProxy.ts`, `src/app/api/conversations/[[...path]]/route.ts`, `attachments/[[...path]]/route.ts`, 기존 `arcus/message/route.ts`, `arcus/message/stream/route.ts`.
- Web 테스트: `ConversationHistory.test.tsx`, `ConversationAttachment.test.tsx`, `conversationProxy.test.ts` 추가; 기존 `ArcusConsole.test.tsx`, `ArcusDesign.test.tsx`, `arcusPayload.test.ts`, 스트리밍 BFF `route.test.ts` 갱신.

기존 사용자 변경인 AGENTS.md, CSS, 모바일 zoom 테스트, start_all.sh, 배포 스크립트와 기타 미추적 파일은 보존했다. B안 UI 구조·스타일을 재설계하지 않았다.

### 실행 결과

- ThinkPad: `.venv/bin/python -m pytest tests __tests__ -q` → **50 passed**, 기존 라이브러리의 Starlette/httpx 사용 중단 예정 경고 1개.
- ThinkPad 전체 수집: `.venv/bin/python -m pytest -q` → 별도 vendored `gemini-superpowers/tests/test_app.py`, `test_models.py`에서 flask/bcrypt 미설치로 수집 오류. 해당 샘플 의존성은 이번 앱의 DB 의존성이 아니므로 추가하지 않았다.
- Web: `npm run test:run` → **96 passed, 1 failed**. 실패는 기준선에도 존재했던 `RealThinkPadConnection.test.ts`의 실제 하드웨어 WebSocket 연결 테스트이다. 외부 ThinkPad/MacBook 실제 연동의 성공 여부는 확인하지 않았다.
- Web: `npm run lint` → 통과.
- Web: `npm run build` → Next.js 16.2.6 / TypeScript / 정적 페이지 생성 통과. 최초 샌드박스 내부 포트 생성 제한으로 실패했던 빌드는 승인된 로컬 재실행에서 통과했다.
- `git diff --check` → 통과.
- 독립 코드 리뷰의 이미지 압축 경쟁 조건과 assistant 수정 후 재생 예외를 재현 테스트 후 수정했다.

실제 개인정보를 넣지 않고 임시 디렉터리의 합성 데이터로 검증했다. ThinkPad 서버 반영, 커밋, 푸시, 배포는 수행하지 않았다. 온톨로지 엔진은 다음 단계다.
