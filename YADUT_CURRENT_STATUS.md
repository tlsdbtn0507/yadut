# Yadut Current Status

Last updated: 2026-06-08 KST

## Purpose

이 문서는 현재까지 개발된 야두트/아르커스 시스템의 실제 구현 상태와 지금 사용할 수 있는 기능을 정리한다.

장기 방향과 앞으로의 개발 기준은 `YADUT_ROADMAP.md`를 따른다. 이 문서는 roadmap과 구분해서 **현재 상태 기록** 역할을 한다.

## Current Architecture

현재 시스템은 네 개의 주요 영역으로 나뉜다.

```text
project_web
  Next.js 기반 ARCUS 웹 콘솔

project_ios
  SwiftUI 기반 iOS ARCUS 앱 실험체

project_thinkpad
  FastAPI + Telegram Bot 기반 ThinkPad 브리지

project_mac
  FastAPI 기반 Mac_Eye 서버
```

현재 공개 배포 웹앱은 Vercel에서 동작하고, 브라우저는 Vercel API route를 통해 ThinkPad Funnel HTTP endpoint로 명령을 전달한다. 모바일 브라우저에서도 Vercel 웹앱 접속과 이미지 기반 스케줄 등록을 통한 macOS 캘린더 일정 추가가 가능하다.

## Development Progress

### 1. Web Console

`project_web`에는 Next.js 기반 야두트 모바일 콘솔 UI가 구현되어 있다.

구현된 내용:

- ARCUS 채팅형 콘솔 화면
- 사이버 콘솔 스타일 헤더와 소켓 상태 표시
- 사용자/아르커스 메시지 버블
- 이미지 첨부 미리보기
- 파일 첨부 UI
- 텍스트 입력창 자동 높이 조정
- 전송 버튼
- 맥북 화면 캡처 버튼
- 처리 중 telemetry 애니메이션
- 메모리 업데이트 파싱 표시
- Vercel API route 기반 `/api/capture`
- 런타임 설정 API `/api/runtime-config`
- Auth.js + Google OAuth 기반 세션 게이트
- allowlist 기반 사용자 인가
- Vercel BFF API route 기반 `/api/arcus/message`

현재 사용 가능한 기능:

- Vercel 웹앱 접속
- 모바일 브라우저에서 Vercel 웹앱 접속
- Vercel BFF를 통한 텍스트 명령 전송
- 이미지 첨부 후 ThinkPad 브리지로 전달
- 맥북 화면 캡처 요청
- 이미지 기반 스케줄 등록 및 macOS 캘린더 추가
- 아르커스 응답 표시
- 메모리 업데이트 문구 표시

현재 제약:

- iOS 네이티브 WKWebView 래퍼는 아직 구현되지 않았다.
- Face ID 로컬 앱 잠금과 공유 시트 수신은 아직 구현되지 않았다.
- SSE 기반 처리 상태 스트리밍은 아직 구현되지 않았다.

### 2. ThinkPad Bridge

`project_thinkpad`에는 FastAPI 서버와 Telegram Bot 브리지가 구현되어 있다.

구현된 내용:

- `/` 상태 응답
- `/health` 헬스 체크
- `/ws` WebSocket endpoint
- WebSocket origin 검증
- WebSocket 첫 메시지 token 인증
- 텍스트 메시지 수신 및 Gemma 기반 의도 판단
- 이미지 첨부 수신
- 이미지 의도 분류
- 스케줄 이미지로 판단되면 MacBook 서버에 업로드 후 캘린더 동기화 요청
- 일반 이미지로 판단되면 MacBook `chat_with_image` 호출
- Telegram 텍스트 메시지 처리
- Telegram 사진 메시지 기반 캘린더 동기화
- Telegram 명령을 통한 맥북 화면 캡처
- Vercel 서버 전용 HTTP command endpoint
- `THINKPAD_BRIDGE_TOKEN` 기반 서버 간 요청 검증
- 웹 검색 의도 처리
- preference/soul 업데이트 승인 흐름

현재 사용 가능한 기능:

- ThinkPad 서버 실행 후 `/health` 확인
- WebSocket 인증 성공 시 웹/iOS 클라이언트와 양방향 메시지 처리
- Funnel HTTP endpoint를 통한 Vercel BFF 요청 처리
- 텍스트 질문에 대한 아르커스 응답
- 이미지 기반 일정 등록
- 이미지 기반 일반 대화
- Telegram을 통한 화면 캡처, 일정 이미지 업로드, 텍스트 대화

현재 제약:

- 과거 WebSocket 직접 연결 코드와 테스트가 일부 남아 있다.
- 장기적으로 SSE 처리 상태 이벤트를 추가할 예정이다.

### 3. Mac_Eye Server

`project_mac`에는 macOS 기능을 수행하는 FastAPI 서버가 구현되어 있다.

구현된 내용:

- `/` 상태 응답
- `/capture` macOS 화면 캡처
- `/download/{filename}` 캡처 파일 다운로드
- `/upload` 이미지 업로드
- `/chat_with_image` 이미지 기반 대화
- `/sync_calendar/{filename}` 이미지 분석 후 macOS 캘린더 동기화
- `/create_file` 파일 생성
- 요청 로깅 middleware

현재 사용 가능한 기능:

- 맥북 화면 캡처
- 캡처 이미지 다운로드
- ThinkPad에서 전달한 이미지 저장
- 이미지 기반 Gemini/AI 분석
- 스케줄 이미지 기반 캘린더 등록
- 단순 파일 생성

현재 제약:

- MacBook 서버는 public으로 열지 않는 방향이다.
- 앞으로는 Vercel이 MacBook을 직접 호출하지 않고 ThinkPad를 통해 내부 호출하는 구조로 정리해야 한다.
- macOS 화면 캡처는 실행 환경에 화면 기록 권한이 필요하다.

### 4. iOS App

`project_ios`에는 SwiftUI 기반 ARCUS 앱 실험체가 구현되어 있다.

구현된 내용:

- SwiftUI 앱 entrypoint
- ARCUS 메인 콘솔 ViewModel
- WebSocketManagerProtocol
- URLSessionWebSocketTask 기반 WebSocketManager
- ArcusRequest / ArcusResponse 스키마
- 텍스트/오디오/첨부 데이터 전송 모델
- 첨부 타입 모델
- 연결 상태 publisher
- 응답 message publisher
- SpeechManager 기반 음성 인식 및 오디오 레벨 측정
- 테스트용 ContentView WebSocket 화면
- WebSocketManagerTests, SpeechManagerTests 등 테스트 파일

현재 사용 가능한 기능:

- iOS 앱에서 ThinkPad WebSocket 주소로 직접 연결하는 실험
- SwiftUI 콘솔 상태 관리
- 텍스트 및 첨부 payload 생성
- 음성 인식 시작/중지 로직
- 오디오 레벨 측정

현재 제약:

- WKWebView 기반 Vercel 앱 래퍼는 아직 구현되지 않았다.
- Face ID 로컬 앱 잠금은 아직 구현되지 않았다.
- 공유 시트 수신은 아직 구현되지 않았다.
- TestFlight 배포 설정은 아직 정리되지 않았다.
- 현재 iOS 직접 WebSocket 구조는 roadmap v1의 최종 방향이 아니라 과거 실험/기반 코드에 가깝다.

## Currently Usable Feature Matrix

| 기능 | 현재 상태 | 사용 경로 | 비고 |
| --- | --- | --- | --- |
| 웹 콘솔 UI | 사용 가능 | `project_web` / Vercel | 모바일 친화 콘솔 구현됨 |
| 모바일 브라우저 접속 | 사용 가능 | Vercel 웹앱 | Tailscale 없이 접속 가능 |
| 텍스트 채팅 | 사용 가능 | Vercel BFF -> ThinkPad Funnel | 서버 전용 token으로 bridge 호출 |
| 이미지 첨부 대화 | 사용 가능 | Vercel BFF -> ThinkPad -> MacBook | 이미지 의도 분류 후 처리 |
| 스케줄 이미지 캘린더 등록 | 사용 가능 | Vercel BFF -> ThinkPad -> MacBook | macOS 캘린더 등록 가능 |
| 맥북 화면 캡처 | 사용 가능 | Web `/api/capture` 또는 Telegram | 실행 환경 권한 필요 |
| Telegram 아르커스 | 사용 가능 | ThinkPad Telegram Bot | 텍스트/사진/캡처 흐름 구현 |
| iOS SwiftUI 콘솔 | 부분 구현 | `project_ios` | 직접 WebSocket 실험 구조 |
| iOS WebView 앱 | 미구현 | 예정 | roadmap v1 대상 |
| Face ID 앱 잠금 | 미구현 | 예정 | roadmap v1 대상 |
| 공유 시트 수신 | 미구현 | 예정 | roadmap v1 대상 |
| Google OAuth 로그인 | 사용 가능 | Auth.js | allowlist 기반 인가 포함 |
| Tailscale 없는 Safari 사용 | 사용 가능 | Vercel + Funnel BFF | 모바일 브라우저 접속 가능 |
| SSE 처리 상태 스트리밍 | 미구현 | 예정 | roadmap v1.5 대상 |

## Known Technical Debt

- 과거 WebSocket 직접 연결 유틸과 테스트가 일부 남아 있다.
- `/api/runtime-config`는 더 이상 ThinkPad URL과 token을 클라이언트에 제공하지 않는다.
- `project_web/src/utils/apiHandler.ts`에는 직접 ThinkPad HTTP URL을 호출하는 과거 유틸이 남아 있다.
- iOS와 Web의 통신 모델이 아직 통합되지 않았다.
- WebSocket 기반 실험 코드와 HTTP BFF 구조가 공존하고 있다.

## Next Development Target

다음 큰 개발 단계는 `YADUT_ROADMAP.md`의 iOS 앱 항목과 v1.5 SSE 처리 상태 스트리밍이다.

우선순위:

1. iOS WKWebView 래퍼 구현
2. Face ID 로컬 앱 잠금 구현
3. 공유 시트 수신 구현
4. SSE 처리 상태 스트리밍 추가
5. 과거 WebSocket 직접 연결 코드 정리

## Relationship To Roadmap

이 문서는 현재 상태를 기록한다. 앞으로 기능이 구현되면 이 파일의 상태표와 사용 가능한 기능 목록을 갱신한다.

장기 방향, 버전별 목표, 보안 원칙은 `YADUT_ROADMAP.md`를 기준으로 한다.
