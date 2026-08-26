import SwiftUI
import WebKit

enum ArcusWebConfig {
    #if DEBUG
    private static let defaultAppBaseURLString = "http://127.0.0.1:3000"
    #else
    private static let defaultAppBaseURLString = "https://projectweb-beta-gilt.vercel.app"
    #endif

    static var appBaseURL: URL {
        #if DEBUG
        let urlString = ProcessInfo.processInfo.environment["ARCUS_DEV_BASE_URL"] ?? defaultAppBaseURLString
        #else
        let urlString = defaultAppBaseURLString
        #endif

        guard let url = URL(string: urlString), let scheme = url.scheme, let host = url.host else {
            preconditionFailure("ArcusWebConfig.appBaseURL must be a valid URL with scheme and host.")
        }

        guard scheme == "https" || scheme == "http" else {
            preconditionFailure("ArcusWebConfig.appBaseURL must use HTTP or HTTPS.")
        }

        guard !host.isEmpty else {
            preconditionFailure("ArcusWebConfig.appBaseURL host must not be empty.")
        }

        return url
    }

    static var nativeExchangeURL: URL {
        var components = URLComponents(url: appBaseURL, resolvingAgainstBaseURL: false)
        components?.path = "/api/native-auth/exchange"

        guard let url = components?.url else {
            preconditionFailure("Arcus native exchange URL must be valid.")
        }
        return url
    }

    static func nativeLoginURL(code: String) -> URL {
        var components = URLComponents(url: appBaseURL, resolvingAgainstBaseURL: false)
        components?.path = "/native-login"
        components?.queryItems = [URLQueryItem(name: "code", value: code)]

        guard let url = components?.url else {
            preconditionFailure("Arcus native-login URL must be valid.")
        }
        return url
    }
}

struct ArcusWebViewScreen: View {
    let initialURL: URL
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var reloadToken = UUID()

    init(initialURL: URL = ArcusWebConfig.appBaseURL) {
        self.initialURL = initialURL
    }

    var body: some View {
        ZStack {
            ArcusWebView(
                url: initialURL,
                reloadToken: reloadToken,
                isLoading: $isLoading,
                errorMessage: $errorMessage
            )
            .ignoresSafeArea()

            if isLoading {
                ProgressView()
                    .controlSize(.large)
                    .padding(20)
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            if let errorMessage {
                VStack(spacing: 12) {
                    Text("ARCUS 연결 실패")
                        .font(.headline)

                    Text(errorMessage)
                        .font(.footnote)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)

                    Button("다시 시도") {
                        self.errorMessage = nil
                        self.isLoading = true
                        self.reloadToken = UUID()
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding(20)
                .frame(maxWidth: 320)
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding()
            }
        }
    }
}

struct ArcusWebView: UIViewRepresentable {
    let url: URL
    let reloadToken: UUID
    @Binding var isLoading: Bool
    @Binding var errorMessage: String?

    func makeCoordinator() -> Coordinator {
        Coordinator(isLoading: $isLoading, errorMessage: $errorMessage)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true

        if #available(iOS 14.0, *) {
            configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        }

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .clear

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.lastLoadedToken != reloadToken else { return }

        context.coordinator.lastLoadedToken = reloadToken
        print("ARCUS WebView loading URL: \(url.absoluteString.prefix(240))")
        webView.load(URLRequest(url: url))
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var lastLoadedToken: UUID?
        private var isLoading: Binding<Bool>
        private var errorMessage: Binding<String?>

        init(isLoading: Binding<Bool>, errorMessage: Binding<String?>) {
            self.isLoading = isLoading
            self.errorMessage = errorMessage
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            isLoading.wrappedValue = true
            errorMessage.wrappedValue = nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            isLoading.wrappedValue = false
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            handleNavigationError(error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            handleNavigationError(error)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if navigationAction.targetFrame == nil {
                webView.load(navigationAction.request)
            }
            return nil
        }

        private func handleNavigationError(_ error: Error) {
            let nsError = error as NSError
            guard nsError.code != NSURLErrorCancelled else { return }

            isLoading.wrappedValue = false
            errorMessage.wrappedValue = error.localizedDescription
        }
    }
}

#Preview {
    ArcusWebViewScreen()
}
