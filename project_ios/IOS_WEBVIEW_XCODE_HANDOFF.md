# iOS WebView Xcode Handoff

## 목적

이 문서는 Xcode 안에서 야두트 iOS 앱을 수정할 때 따라야 할 프로젝트 방향과 WKWebView 구현 계획을 정리한다.

현재 가장 급한 목표는 기존 `project_ios` SwiftUI 앱을 수정해 Vercel에 배포된 ARCUS 웹앱을 iOS WKWebView로 표시하는 것이다. 이 작업은 야두트 v1 로드맵의 최우선 과제다.

## 프로젝트 방향

야두트 iOS 앱의 v1 방향은 네이티브 채팅 클라이언트를 새로 만드는 것이 아니라, 이미 동작하는 `project_web` ARCUS 콘솔을 iOS 앱 안에서 안정적으로 표시하는 것이다.

최종 네트워크 방향은 다음과 같다.

```text
iPhone WKWebView
  -> Vercel Web App
  -> Auth.js Google OAuth
  -> Vercel API Routes
  -> ThinkPad Tailscale Funnel
  -> MacBook private tailnet APIs
```

중요한 보안 원칙:

- iOS 앱은 ThinkPad 또는 MacBook에 직접 연결하지 않는다.
- iOS 앱 안에 `THINKPAD_BRIDGE_TOKEN`을 넣지 않는다.
- iOS 앱 안에 ThinkPad Funnel URL을 직접 넣지 않는다.
- iOS 앱은 Vercel 웹앱 URL만 로드한다.
- Google OAuth 로그인과 allowlist 인가는 WebView 안의 Vercel/Auth.js 흐름을 그대로 사용한다.

## 현재 iOS 코드 상태

현재 `project_ios`는 SwiftUI 기반 ARCUS 앱 실험체다.

주요 파일:

- `arcus/arcusApp.swift`
  - 현재 앱 entrypoint
  - 지금은 `MainConsoleView()`를 표시한다.
- `arcus/Views/MainConsoleView.swift`
  - 기존 네이티브 콘솔 UI
  - WebSocket 기반 실험 UI와 첨부 UI가 포함되어 있다.
- `arcus/MainConsoleViewModel.swift`
  - 기존 WebSocket 기반 ViewModel
  - `ws://100.122.25.31:8000/ws` 직접 연결 코드가 있다.
- `arcus/WebSocketManager.swift`
  - 직접 WebSocket 연결 실험 코드
- `arcus/ContentView.swift`
  - WebSocket 테스트 화면
- `CustomInfo.plist`
  - 현재 ATS arbitrary loads와 마이크 권한 관련 설정이 있다.

이번 WebView 작업에서는 기존 WebSocket 실험 코드를 삭제하지 않는다. 우선 앱 첫 화면만 WebView로 교체해 빠르게 v1 목표를 달성한다.

## 이번 작업의 범위

이번 작업에서 할 일:

1. SwiftUI에서 사용할 WKWebView 래퍼를 만든다.
2. 앱 실행 시 Vercel ARCUS 웹앱을 로드한다.
3. 로딩 상태와 실패 상태를 최소한으로 표시한다.
4. WebView 안에서 Google OAuth 로그인 플로우가 진행되도록 한다.
5. 기존 네이티브 WebSocket 콘솔 코드는 보존한다.

이번 작업에서 하지 말아야 할 일:

- Face ID 로컬 잠금 구현
- 공유 시트 수신 구현
- SSE endpoint 구현
- 기존 WebSocket 코드 대규모 삭제
- ThinkPad/MacBook 직접 연결 복구
- iOS 앱에 서버 토큰 저장
- Vercel 배포 또는 환경변수 변경

## 권장 파일 구조

새 파일:

- `arcus/Views/ArcusWebView.swift`
  - SwiftUI `View`
  - `UIViewRepresentable` 기반 `WKWebView` 래퍼
  - 로딩/에러 상태 관리용 coordinator

수정 파일:

- `arcus/arcusApp.swift`
  - `MainConsoleView()` 대신 `ArcusWebViewScreen()`을 표시한다.

선택 수정 파일:

- `CustomInfo.plist`
  - Vercel URL이 `https`라면 ATS 예외는 필요하지 않다.
  - 이번 작업에서는 기존 설정을 굳이 제거하지 않는다.

## 구현 설계

`ArcusWebView.swift`는 세 부분으로 나눈다.

1. `ArcusWebConfig`
   - Vercel 앱 URL을 보관한다.
   - URL 문자열은 한 곳에서만 관리한다.

2. `ArcusWebView`
   - `UIViewRepresentable`
   - `makeUIView(context:)`에서 `WKWebView` 생성
   - `updateUIView(_:context:)`에서 최초 URL 로드
   - `WKWebViewConfiguration`에 기본 웹 기능 설정

3. `ArcusWebViewScreen`
   - 실제 앱 entrypoint에서 표시할 SwiftUI 화면
   - WebView를 full-screen으로 표시
   - 로딩 중에는 상단 또는 중앙에 최소한의 progress 표시
   - 실패 시 재시도 버튼을 제공

권장 코드 형태:

```swift
import SwiftUI
import WebKit

enum ArcusWebConfig {
    static let appURL = URL(string: "https://YOUR_VERCEL_APP_URL")!
}

struct ArcusWebViewScreen: View {
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var reloadToken = UUID()

    var body: some View {
        ZStack {
            ArcusWebView(
                url: ArcusWebConfig.appURL,
                reloadToken: reloadToken,
                isLoading: $isLoading,
                errorMessage: $errorMessage
            )
            .ignoresSafeArea()

            if isLoading {
                ProgressView()
                    .controlSize(.large)
            }

            if let errorMessage {
                VStack(spacing: 12) {
                    Text("ARCUS 연결 실패")
                        .font(.headline)
                    Text(errorMessage)
                        .font(.footnote)
                        .multilineTextAlignment(.center)
                    Button("다시 시도") {
                        self.errorMessage = nil
                        self.isLoading = true
                        self.reloadToken = UUID()
                    }
                }
                .padding()
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding()
            }
        }
    }
}
```

`arcusApp.swift`는 다음처럼 단순하게 바꾼다.

```swift
import SwiftUI

@main
struct arcusApp: App {
    var body: some Scene {
        WindowGroup {
            ArcusWebViewScreen()
        }
    }
}
```

## URL 설정

`ArcusWebConfig.appURL`에는 Vercel에 배포된 ARCUS 웹앱의 실제 HTTPS URL을 넣는다.

주의:

- 로컬 개발 URL을 기본값으로 넣지 않는다.
- `http://` URL을 기본값으로 넣지 않는다.
- ThinkPad Funnel URL을 넣지 않는다.
- 배포 환경변수나 서버 토큰을 iOS 앱에 넣지 않는다.

개발 중 임시로 URL을 바꿔야 할 경우에도 `ArcusWebConfig`만 수정한다.

## Xcode 작업 순서

1. Xcode에서 `project_ios/arcus.xcodeproj`를 연다.
2. `arcus` scheme을 선택한다.
3. `arcus/Views/ArcusWebView.swift`를 새로 만든다.
4. target membership이 `arcus`에 체크되어 있는지 확인한다.
5. `arcus/arcusApp.swift`에서 첫 화면을 `ArcusWebViewScreen()`으로 바꾼다.
6. `ArcusWebConfig.appURL`에 Vercel ARCUS 웹앱 HTTPS URL을 넣는다.
7. iPhone Simulator를 선택해 빌드한다.
8. WebView가 전체 화면으로 표시되는지 확인한다.
9. Google OAuth 로그인 화면이 열리는지 확인한다.
10. 로그인 후 ARCUS 콘솔이 표시되는지 확인한다.

## 검증 체크리스트

- 앱이 빌드된다.
- 앱 실행 시 네이티브 WebSocket 콘솔이 아니라 WebView가 열린다.
- WebView가 Vercel ARCUS 웹앱을 로드한다.
- Google OAuth 로그인 플로우가 WebView 안에서 시작된다.
- 로그인 완료 후 ARCUS 콘솔 화면이 표시된다.
- WebView 안에서 텍스트 입력창이 iOS 키보드와 충돌하지 않는다.
- 이미지 첨부는 우선 웹앱의 기존 파일 입력 동작 기준으로 확인한다.
- ThinkPad token 또는 Funnel URL이 Swift 코드에 추가되지 않았다.

## 자주 날 수 있는 문제

### WebView가 빈 화면으로 보이는 경우

- `ArcusWebConfig.appURL`이 실제 HTTPS URL인지 확인한다.
- Simulator에서 Safari로 같은 URL이 열리는지 확인한다.
- Xcode console의 navigation error를 확인한다.

### 로그인 후 원래 화면으로 돌아오지 않는 경우

- Vercel/Auth.js의 redirect URL 설정을 확인한다.
- 이 문제는 iOS 앱 코드보다 web auth 설정 문제일 가능성이 높다.
- Vercel 환경변수는 AI 에이전트가 직접 변경하지 않는다. 필요한 키와 scope만 사용자에게 안내한다.

### 파일 첨부가 WebView에서 동작하지 않는 경우

- `WKWebView`의 파일 input 동작과 iOS 권한을 확인한다.
- 이번 작업에서는 공유 시트 네이티브 연동까지 구현하지 않는다.
- 공유 시트는 WebView 안정화 이후 별도 작업으로 진행한다.

### 기존 WebSocket 코드가 거슬리는 경우

- 이번 작업에서는 삭제하지 않는다.
- `MainConsoleView`, `MainConsoleViewModel`, `WebSocketManager`는 과거 실험 코드로 남긴다.
- WebView가 안정화된 뒤 별도 정리 작업에서 제거하거나 보관 위치를 바꾼다.

## 다음 작업 순서

WebView 구현 후 우선순위:

1. SSE 처리 상태 스트리밍
2. 공유 시트 수신
3. Face ID 로컬 앱 잠금
4. 과거 WebSocket 직접 연결 코드 정리

## 작업 원칙

- 작은 파일로 분리한다.
- 한 번에 WebView만 완성한다.
- Swift 코드에는 명확한 타입을 사용한다.
- `any` 같은 느슨한 타입 개념을 TypeScript 쪽에 도입하지 않는다.
- Python 서버를 수정할 일이 생기면 타입 힌트를 유지한다.
- 배포, Vercel 환경변수, production alias 변경은 사용자의 명시 승인이 없으면 하지 않는다.
