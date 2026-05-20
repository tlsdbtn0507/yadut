import Foundation
import Combine
import SwiftUI

class MainConsoleViewModel: ObservableObject {
    // UI에 바인딩될 상태들
    @Published var isListening = false
    @Published var thinkingLog = "SYSTEM READY"
    @Published var latency = "0ms"
    @Published var messages: [ChatMessage] = []
    @Published var inputText = ""
    @Published var connectionStatus: WebSocketStatus = .disconnected
    @Published var audioLevel: CGFloat = 0.0
    
    private let webSocketManager: WebSocketManagerProtocol
    private var cancellables = Set<AnyCancellable>()
    
    init(webSocketManager: WebSocketManagerProtocol = WebSocketManager()) {
        self.webSocketManager = webSocketManager
        setupBindings()
    }
    
    private func setupBindings() {
        // 1. 연결 상태 구독
        webSocketManager.connectionStatus
            .receive(on: DispatchQueue.main)
            .sink { [weak self] status in
                self?.connectionStatus = status
                self?.updateHUD(with: status)
            }
            .store(in: &cancellables)
        
        // 2. 서버 응답 메시지 구독
        webSocketManager.messagePublisher
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { completion in
                if case .failure(let error) = completion {
                    print("Message stream error: \(error)")
                }
            }, receiveValue: { [weak self] response in
                let newMsg = ChatMessage(text: response.text, isUser: false)
                self?.messages.append(newMsg)
                self?.thinkingLog = "RESPONSE RECEIVED"
            })
            .store(in: &cancellables)
    }
    
    private func updateHUD(with status: WebSocketStatus) {
        switch status {
        case .connected:
            thinkingLog = "CONNECTION ESTABLISHED"
            latency = "24ms" // TODO: 실제 핑 측정 로직
        case .connecting:
            thinkingLog = "ESTABLISHING UPLINK..."
        case .disconnected:
            thinkingLog = "SYSTEM OFFLINE"
            latency = "---"
        case .error(let message):
            thinkingLog = "ERROR: \(message)"
        }
    }
    
    func connect() {
        // 실제 서버 URL이 준비되면 여기에 입력
        guard let url = URL(string: "ws://100.122.25.31:8000/ws") else { return }
        webSocketManager.connect(url: url)
    }
    
    func startListening() {
        withAnimation(.spring()) {
            isListening = true
            thinkingLog = "LISTENING..."
        }
        // TODO: Speech 프레임워크 시작 로직
    }
    
    func stopListening() {
        withAnimation(.spring()) {
            isListening = false
            thinkingLog = "PROCESSING AUDIO..."
        }
        // TODO: 오디오 데이터 수집 후 webSocketManager.send(audioData:) 호출
    }
    
    func sendMessage() {
        guard !inputText.isEmpty else { return }
        
        let userMsg = ChatMessage(text: inputText, isUser: true)
        messages.append(userMsg)
        
        // 서버에 텍스트 메시지 전송
        webSocketManager.send(text: inputText)
        
        thinkingLog = "UPLOADING DATA..."
        inputText = ""
    }
}

struct ChatMessage: Identifiable {
    let id = UUID()
    let text: String
    let isUser: Bool
}
