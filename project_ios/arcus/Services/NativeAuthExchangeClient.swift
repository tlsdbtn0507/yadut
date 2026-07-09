import Foundation

struct NativeAuthExchangeClient {
    struct ExchangeRequest: Encodable {
        let idToken: String
    }

    struct ExchangeResponse: Decodable {
        let code: String
        let expiresInSeconds: Int
    }

    enum ExchangeError: LocalizedError {
        case invalidResponse
        case serverRejected(statusCode: Int)
        case missingCode

        var errorDescription: String? {
            switch self {
            case .invalidResponse:
                return "서버 응답을 읽을 수 없습니다."
            case .serverRejected(let statusCode):
                switch statusCode {
                case 401:
                    return "네이티브 로그인 검증에 실패했습니다."
                case 403:
                    return "허용되지 않은 Google 계정입니다."
                default:
                    return "서버가 네이티브 로그인을 거부했습니다. status=\(statusCode)"
                }
            case .missingCode:
                return "로그인 코드를 받지 못했습니다."
            }
        }
    }

    let exchangeURL: URL
    let session: URLSession

    init(
        exchangeURL: URL = ArcusWebConfig.nativeExchangeURL,
        session: URLSession = .shared
    ) {
        self.exchangeURL = exchangeURL
        self.session = session
    }

    func exchange(idToken: String) async throws -> String {
        var request = URLRequest(url: exchangeURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(ExchangeRequest(idToken: idToken))

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ExchangeError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            throw ExchangeError.serverRejected(statusCode: httpResponse.statusCode)
        }

        let decoded = try JSONDecoder().decode(ExchangeResponse.self, from: data)
        guard !decoded.code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ExchangeError.missingCode
        }

        return decoded.code
    }
}
