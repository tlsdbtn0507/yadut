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

- Auth.js + Google OAuth 로그인 추가
- 특정 Google 이메일 allowlist 기반 인가 적용
- 미로그인 사용자를 위한 로그인 페이지와 세션 게이트 추가
- allowlist 밖 Google 계정에 대한 접근 거부 화면 추가
- `/api/runtime-config`에서 ThinkPad URL과 WS token을 클라이언트에 내려주는 구조 제거
- 웹 클라이언트의 직접 WebSocket 연결 제거
- Vercel API route가 로그인/인가를 확인한 뒤 ThinkPad Funnel HTTP endpoint로 명령 전달
- 지원 기능:
  - 텍스트 채팅
  - 이미지 첨부
  - 맥북 화면 캡처
  - 이미지 기반 캘린더 등록
- iOS 앱:
  - WKWebView로 Vercel 앱 표시
  - 앱 실행 및 foreground 복귀 시 Face ID 로컬 잠금
  - 공유 시트로 받은 텍스트/이미지/파일을 WebView에 전달

## v1.5: SSE Processing Feel

목표는 "아르커스가 처리 중"이라는 감각을 실제 서버 이벤트와 연결하는 것이다.

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

## v2: Native Expansion

목표는 WebView 앱을 점진적으로 네이티브 Arcus 클라이언트로 확장하는 것이다.

- 공유 시트 입력 고도화
- 푸시 알림 검토
- 음성 명령 검토
- 네이티브 카메라/사진 선택 검토
- 작업 히스토리 도입 검토
- 긴 작업을 위한 jobId 기반 작업 생성/구독 모델 검토

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
