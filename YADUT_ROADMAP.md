# Yadut Roadmap

## Purpose

야두트의 목표는 현재 `project_web`의 ARCUS 콘솔 UI를 iOS WebView 앱으로 감싸고, TestFlight 내부 배포를 통해 아이폰에서 자유롭게 사용하는 것이다.

동시에 Safari, iOS WebView, 데스크톱 브라우저 모두 Tailscale VPN 없이 안전하게 아르커스 기능을 사용할 수 있어야 한다.

## Operating Rule

이 문서는 야두트 프로젝트의 장기 아키텍처 기준이다.

작업 우선순위는 다음과 같다.

1. 사용자의 최신 명시 지시
2. `CLAUDE.md` 및 프로젝트 규칙
3. `YADUT_ROADMAP.md`
4. 기존 코드 패턴

새 지시가 이 문서와 충돌하면, 구현 전에 다음을 확인한다.

- 이번 지시를 우선해서 roadmap을 수정할지
- 기존 roadmap을 유지하고 지시를 조정할지

## Immediate Priority

현재 가장 급한 작업은 iOS WebView 기반 사용 흐름을 안정화하는 것이다. `project_ios`는 WKWebView로 Vercel ARCUS 웹앱을 표시하고, 네이티브 Google 로그인으로 웹 세션을 생성하는 기본 흐름까지 연결되었다.

현재 실행 우선순위는 다음과 같다.

1. 이미지 첨부 안정화
2. iOS 백그라운드 전환에도 작업 결과를 복구하는 jobId 기반 비동기 처리 추가
3. SSE 처리 상태 스트리밍 추가
4. 공유 시트 수신 구현
5. Face ID 로컬 앱 잠금 구현
6. 과거 WebSocket 직접 연결 코드 정리

## Architecture Direction

방향은 **프록시 안정화 우선**이다.

클라이언트는 ThinkPad 또는 MacBook에 직접 연결하지 않는다. Safari와 iOS WebView는 Vercel 웹앱/API만 호출한다.

```text
iPhone WebView / Safari / Desktop Browser
  -> Vercel Web App
  -> Auth.js Google OAuth
  -> Vercel API Routes
  -> ThinkPad Tailscale Funnel
  -> MacBook private tailnet APIs
```

공개 진입점은 ThinkPad 하나만 둔다. MacBook은 public으로 열지 않고 ThinkPad가 내부 bridge 역할을 한다.

## v1: Secure HTTP BFF

목표는 어느 기기에서든 Tailscale 없이 안전하게 야두트를 쓰는 것이다.

현재 배포 상태에서는 모바일 브라우저로 Vercel 웹앱에 접속할 수 있고, 이미지 기반 스케줄 등록을 통해 macOS 캘린더에 일정을 추가할 수 있다.

- [x] ~~Auth.js + Google OAuth 로그인 추가~~
- [x] ~~특정 Google 이메일 allowlist 기반 인가 적용~~
- [x] ~~미로그인 사용자를 위한 로그인 페이지와 세션 게이트 추가~~
- [x] ~~allowlist 밖 Google 계정에 대한 접근 거부 화면 추가~~
- [x] ~~/api/runtime-config에서 ThinkPad URL과 WS token을 클라이언트에 내려주는 구조 제거~~
- [x] ~~웹 클라이언트의 직접 WebSocket 연결 제거~~
- [x] ~~Vercel API route가 로그인/인가를 확인한 뒤 ThinkPad Funnel HTTP endpoint로 명령 전달하는 코드 경로 추가~~
- [x] 지원 기능:
  - [x] ~~텍스트 채팅 BFF 요청/응답 경로 구현~~
  - [x] ~~이미지 첨부 payload 정리 및 BFF 전달 경로 구현~~
  - [x] ~~텍스트 채팅 개발환경 E2E 검증~~
  - [x] ~~이미지 첨부 개발환경 E2E 검증~~
  - [x] ~~Vercel Preview에서 Google 로그인 후 채팅 E2E 검증~~
  - [x] ~~`THINKPAD_FUNNEL_URL`, `THINKPAD_BRIDGE_TOKEN` 배포/로컬/ThinkPad 환경변수 최종 정리~~
  - [x] ~~ThinkPad 서버 재시작 후 Funnel endpoint 실요청 검증~~
  - [x] ~~맥북 화면 캡처~~
  - [x] ~~이미지 기반 캘린더 등록~~
- [ ] iOS 앱:
  - [x] ~~WKWebView로 Vercel 앱 표시~~
  - [x] ~~네이티브 Google 로그인 후 Vercel 웹 세션 생성~~
  - [ ] 공유 시트로 받은 텍스트/이미지/파일을 WebView에 전달
  - [ ] 앱 실행 및 foreground 복귀 시 Face ID 로컬 잠금
- [x] ~~이미지 첨부 안정화:~~
  - [x] ~~웹에서 이미지 전송 전 JPEG 리사이즈/압축 적용~~
  - [x] ~~Web → BFF → ThinkPad payload에 `attachment_mime` 추가~~
  - [x] ~~ThinkPad 이미지 분류/업로드/분석 경로에서 하드코딩된 MIME 제거~~
  - [x] ~~BFF와 ThinkPad의 이미지 실패 응답을 `error_code`, `error_stage` 기준으로 정규화~~
  - [x] ~~iOS WebView UI에서 이미지 압축 실패, payload 과대, ThinkPad 처리 실패를 구분해 표시~~

## v1.5: SSE Processing Feel

목표는 "아르커스가 처리 중"이라는 감각을 실제 서버 이벤트와 연결하는 것이다.

iOS WebView 기본 흐름과 이미지 첨부 안정화 직후 착수할 다음 우선순위 작업이다. 이미지 첨부 안정화에서 추가하는 `attachment_mime`, `error_code`, `error_stage`는 SSE 이벤트 payload에서도 재사용한다.

- v1 HTTP API는 유지
- 채팅/이미지 처리용 SSE endpoint 추가
- 이벤트 예시:
  - `accepted`
  - `thinkpad_processing`
  - `macbook_capture`
  - `calendar_sync`
  - `completed`
  - `failed`
- 현재 클라이언트 telemetry 애니메이션을 SSE 이벤트 기반으로 전환
- SSE 실패 시 HTTP fallback 유지

## v2: iOS 백그라운드 작업 복구

목표는 iOS 앱 또는 WebView가 background로 전환되거나 종료되어도, 이미 서버가 수신한 아르커스 요청을 ThinkPad에서 계속 처리하고 앱 복귀 시 결과를 복구하는 것이다.

이 버전은 iOS 앱 프로세스에서 임의의 긴 작업을 계속 실행하는 기능이 아니다. iOS는 WebView와 네트워크 연결을 중단할 수 있으므로, 작업 실행은 ThinkPad 서버가 맡고 iOS/WebView는 작업 생성과 결과 조회를 담당한다.

- 요청 수신 직후 `202 Accepted`와 `job_id` 반환
- ThinkPad에서 `accepted`, `processing`, `completed`, `failed` 상태와 최종 결과 보관
- 로그인/인가된 클라이언트만 자신의 작업 상태와 결과를 조회할 수 있는 API 추가
- iOS 앱 실행 및 foreground 복귀 시 최근 미완료 작업과 완료 결과 재조회
- `message_id` 기반 멱등성 규칙으로 중복 전송 방지
- SSE는 앱이 foreground인 동안의 처리 상태 표시로 사용하며, background 안정성은 상태 조회로 보완

## v3: Native Expansion

목표는 WebView 앱을 점진적으로 네이티브 Arcus 클라이언트로 확장하는 것이다.

- 공유 시트 입력 고도화
- 푸시 알림 검토
- 음성 명령 검토
- 네이티브 카메라/사진 선택 검토
- 작업 히스토리 도입 검토
- 푸시 알림, 영구 작업 저장소, 재시도 큐 검토

## App Store 심사 준비

목표는 야두트를 단순 웹사이트 래퍼가 아닌, 독립적인 iOS 앱 경험으로 완성하고 App Store 심사를 통과할 수 있는 운영 요건을 갖추는 것이다.

- [ ] WKWebView를 넘어서는 네이티브 기능 제공: 공유 시트, Face ID, 사진/카메라, 푸시 알림 등
- [ ] Google 로그인과 동등한 `Sign in with Apple` 제공
- [ ] 심사 전용 데모 계정 또는 데모 모드 제공 및 심사 기간 ThinkPad/MacBook 백엔드 가동
- [ ] 개인정보 처리방침, App Privacy 라벨, Vercel → ThinkPad → MacBook/AI 데이터 전달 경로 정리
- [ ] 야두트 계정 생성 구조를 도입하는 경우 앱 내 계정 삭제 제공
- [ ] iOS background mode를 장시간 요청 유지 목적으로 사용하지 않고, ThinkPad 서버 작업과 결과 복구 구조 유지
- [ ] 실제 iPhone 안정성, 앱 메타데이터, 스크린샷, 심사 노트 최종 점검

## Security Principles

- 브라우저와 iOS WebView에 ThinkPad bridge token을 절대 노출하지 않는다.
- 클라이언트는 Vercel API만 호출한다.
- Vercel API는 로그인 세션과 이메일 allowlist를 모두 확인한다.
- Vercel에서 ThinkPad로 호출할 때만 서버 전용 `THINKPAD_BRIDGE_TOKEN`을 사용한다.
- ThinkPad public Funnel endpoint는 유효한 서버 토큰 없는 요청을 거부한다.
- MacBook은 public endpoint로 열지 않는다.

## Initial Technology Choices

- Web auth: Auth.js
- OAuth provider: Google
- Authorization: single-user email allowlist
- Public tunnel: Tailscale Funnel
- iOS distribution: Apple Developer Program + TestFlight internal testing
- iOS shell: SwiftUI + WKWebView
- Local app lock: Face ID via LocalAuthentication
- v1 transport: HTTP request/response
- v1.5 transport: SSE
