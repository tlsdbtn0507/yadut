import SwiftUI
import GoogleSignIn

struct NativeGoogleAuthGate: View {
    @State private var initialWebURL: URL?
    @State private var isSigningIn = false
    @State private var errorMessage: String?
    private let exchangeClient = NativeAuthExchangeClient()

    var body: some View {
        Group {
            if let initialWebURL {
                ArcusWebViewScreen(initialURL: initialWebURL)
            } else {
                signInView
            }
        }
        .task {
            print("ARCUS Web base URL: \(ArcusWebConfig.appBaseURL.absoluteString)")
            await restoreExistingSignInIfPossible()
        }
    }

    private var signInView: some View {
        VStack(spacing: 16) {
            Text("ARCUS")
                .font(.largeTitle)
                .fontWeight(.semibold)

            Button {
                Task {
                    await signIn()
                }
            } label: {
                Text(isSigningIn ? "로그인 중..." : "Google로 계속")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(isSigningIn)

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(24)
        .frame(maxWidth: 360)
    }

    @MainActor
    private func restoreExistingSignInIfPossible() async {
        guard initialWebURL == nil,
              !isSigningIn,
              let idToken = GIDSignIn.sharedInstance.currentUser?.idToken?.tokenString else {
            return
        }

        await exchangeAndOpenWebSession(idToken: idToken)
    }

    @MainActor
    private func signIn() async {
        guard let rootViewController = UIApplication.shared.arcusRootViewController else {
            errorMessage = "로그인 화면을 열 수 없습니다."
            return
        }

        isSigningIn = true
        errorMessage = nil

        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: rootViewController)
            guard let idToken = result.user.idToken?.tokenString else {
                errorMessage = "Google idToken을 받지 못했습니다."
                isSigningIn = false
                return
            }

            print("ARCUS native Google sign-in succeeded. idToken acquired.")
            await exchangeAndOpenWebSession(idToken: idToken)
        } catch {
            errorMessage = error.localizedDescription
            isSigningIn = false
        }
    }

    @MainActor
    private func exchangeAndOpenWebSession(idToken: String) async {
        isSigningIn = true
        errorMessage = nil

        do {
            let code = try await exchangeClient.exchange(idToken: idToken)
            let loginURL = ArcusWebConfig.nativeLoginURL(code: code)

            print("ARCUS native exchange succeeded. code prefix: \(code.prefix(8))...")
            print("ARCUS native login URL: \(loginURL.absoluteString.prefix(240))")
            initialWebURL = loginURL
        } catch {
            errorMessage = error.localizedDescription
        }

        isSigningIn = false
    }
}

extension UIApplication {
    var arcusRootViewController: UIViewController? {
        connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }?
            .windows
            .first { $0.isKeyWindow }?
            .rootViewController
    }
}

#Preview {
    NativeGoogleAuthGate()
}
