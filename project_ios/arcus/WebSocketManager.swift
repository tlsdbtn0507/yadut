import Foundation
import Combine

/// 웹소켓 연결 상태 정의
enum WebSocketStatus: Equatable {
    case disconnected
    case connecting
    case connected
    case error(String)
    
    static func == (lhs: WebSocketStatus, rhs: WebSocketStatus) -> Bool {
        switch (lhs, rhs) {
        case (.disconnected, .disconnected), (.connecting, .connecting), (.connected, .connected):
            return true
        case (.error(let l), .error(let r)):
            return l == r
        default:
            return false
        }
    }
}
enum AttachmentType: String, Codable, Equatable {
    case image
    case file
}

struct SelectedAttachment: Equatable {
    let type: AttachmentType
    let data: Data
    let name: String
}

/// WebSocketManager 인터페이스
protocol WebSocketManagerProtocol {
    var connectionStatus: AnyPublisher<WebSocketStatus, Never> { get }
    var messagePublisher: AnyPublisher<ArcusResponse, Error> { get }
    
    func connect(url: URL)
    func disconnect()
    func send(audioData: Data)
    func send(text: String, attachment: SelectedAttachment?)
}

extension WebSocketManagerProtocol {
    func send(text: String) {
        send(text: text, attachment: nil)
    }
}

/// WebSocketManager 실제 구현체
class WebSocketManager: NSObject, WebSocketManagerProtocol {
    private var webSocketTask: URLSessionWebSocketTask?
    private var session: URLSession!
    
    private let statusSubject = CurrentValueSubject<WebSocketStatus, Never>(.disconnected)
    private let messageSubject = PassthroughSubject<ArcusResponse, Error>()
    
    private var reconnectTimer: Timer?
    private var currentURL: URL?
    
    var connectionStatus: AnyPublisher<WebSocketStatus, Never> {
        statusSubject.eraseToAnyPublisher()
    }
    
    var messagePublisher: AnyPublisher<ArcusResponse, Error> {
        messageSubject.eraseToAnyPublisher()
    }
    
    override init() {
        super.init()
        self.session = URLSession(configuration: .default, delegate: self, delegateQueue: .main)
    }
    
    func connect(url: URL) {
        currentURL = url
        reconnectTimer?.invalidate()
        
        statusSubject.send(.connecting)
        webSocketTask = session.webSocketTask(with: url)
        webSocketTask?.resume()
        
        receive()
    }
    
    func disconnect() {
        reconnectTimer?.invalidate()
        currentURL = nil
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        statusSubject.send(.disconnected)
    }
    
    func send(text: String, attachment: SelectedAttachment?) {
        guard statusSubject.value == .connected else { return }
        
        let request = ArcusRequest(
            messageId: UUID().uuidString,
            timestamp: ISO8601DateFormatter().string(from: Date()),
            text: text.isEmpty ? nil : text,
            audioData: nil,
            attachmentData: attachment?.data.base64EncodedString(),
            attachmentName: attachment?.name,
            attachmentType: attachment?.type.rawValue
        )
        sendRequest(request)
    }
    
    func send(audioData: Data) {
        guard statusSubject.value == .connected else { return }
        
        let request = ArcusRequest(
            messageId: UUID().uuidString,
            timestamp: ISO8601DateFormatter().string(from: Date()),
            text: nil,
            audioData: audioData.base64EncodedString()
        )
        sendRequest(request)
    }
    
    private func sendRequest(_ request: ArcusRequest) {
        do {
            let data = try JSONEncoder().encode(request)
            if let jsonString = String(data: data, encoding: .utf8) {
                webSocketTask?.send(.string(jsonString)) { error in
                    if let error = error {
                        print("Send error: \(error)")
                    }
                }
            }
        } catch {
            print("Encoding error: \(error)")
        }
    }
    
    private func receive() {
        webSocketTask?.receive { [weak self] result in
            switch result {
            case .success(let message):
                self?.handleMessage(message)
                self?.receive() // 재귀 호출
            case .failure(let error):
                // 에러 발생 시 상태 업데이트 (단, 수동 종료가 아닐 때만)
                if self?.statusSubject.value != .disconnected {
                    self?.statusSubject.send(.error(error.localizedDescription))
                }
            }
        }
    }
    
    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        switch message {
        case .string(let text):
            if let data = text.data(using: .utf8) {
                decodeAndPublish(data)
            }
        case .data(let data):
            decodeAndPublish(data)
        @unknown default:
            break
        }
    }
    
    private func decodeAndPublish(_ data: Data) {
        do {
            let response = try JSONDecoder().decode(ArcusResponse.self, from: data)
            messageSubject.send(response)
        } catch {
            print("Decoding error: \(error)")
            // Fallback: If it's not valid JSON, treat the raw data as a text message.
            if let rawString = String(data: data, encoding: .utf8) {
                let fallbackResponse = ArcusResponse(responseToId: "", text: rawString, audioData: nil)
                messageSubject.send(fallbackResponse)
            }
        }
    }
    
    private func scheduleReconnect() {
        guard let url = currentURL else { return }
        reconnectTimer?.invalidate()
        reconnectTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: false) { [weak self] _ in
            self?.connect(url: url)
        }
    }
}

extension WebSocketManager: URLSessionWebSocketDelegate {
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        print("DEBUG: WebSocket Connected!")
        statusSubject.send(.connected)
        receive() // 연결이 확인된 후 수신 시작
    }
    
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            print("DEBUG: Connection Error: \(error.localizedDescription)")
            statusSubject.send(.error(error.localizedDescription))
            scheduleReconnect()
        } else if statusSubject.value != .disconnected {
            print("DEBUG: Connection Closed by Server")
            statusSubject.send(.disconnected)
            scheduleReconnect()
        }
    }
}
