import Foundation
import Combine
import SwiftUI

class MainConsoleViewModel: ObservableObject {
    /// 아르커스 인공지능 신호 처리 파이프라인 단계
    enum ArcusProcessStage: Int {
        case transmitting = 0
        case processing = 1
        case receiving = 2
        
        var title: String {
            switch self {
            case .transmitting: return "TRANSMITTING DATA STREAM"
            case .processing: return "THINKPAD COGNITIVE ANALYSIS"
            case .receiving: return "DOWNLOADING RESPONSE"
            }
        }
        
        var description: String {
            switch self {
            case .transmitting: return "씽크패드로 신호 송신 중..."
            case .processing: return "씽크패드 분석 및 의도 파악 중..."
            case .receiving: return "답변 데이터 동기화 중..."
            }
        }
        
        var icon: String {
            switch self {
            case .transmitting: return "antenna.radiowaves.left.and.right"
            case .processing: return "brain.head.profile"
            case .receiving: return "arrow.triangle.2.circlepath"
            }
        }
        
        var color: Color {
            switch self {
            case .transmitting: return Color(red: 0.0, green: 0.78, blue: 1.0) // Cyber blue/cyan
            case .processing: return Color.purple // Brain Purple
            case .receiving: return Color(red: 0.0, green: 0.95, blue: 0.37) // Connected Green
            }
        }
    }

    // UI에 바인딩될 상태들
    @Published var isListening = false
    @Published var thinkingLog = "SYSTEM OFFLINE // STANDBY"
    @Published var latency = "---"
    @Published var messages: [ChatMessage] = []
    @Published var inputText = ""
    @Published var connectionStatus: WebSocketStatus = .disconnected
    @Published var audioLevel: CGFloat = 0.0
    @Published var isArcusThinking = false
    @Published var processStage: ArcusProcessStage = .transmitting
    
    private let webSocketManager: WebSocketManagerProtocol
    private var cancellables = Set<AnyCancellable>()
    private var stageTimer: AnyCancellable?
    
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
                
                // 연결 끊기거나 에러 발생 시 입력중 상태 해제 및 타이머 종료
                if status == .disconnected || self?.isErrorStatus(status) == true {
                    self?.isArcusThinking = false
                    self?.stageTimer?.cancel()
                }
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
                self?.isArcusThinking = false
                self?.stageTimer?.cancel()
                self?.thinkingLog = "SECURE UPLINK ESTABLISHED"
            })
            .store(in: &cancellables)
    }
    
    private func isErrorStatus(_ status: WebSocketStatus) -> Bool {
        if case .error = status { return true }
        return false
    }
    
    private func updateHUD(with status: WebSocketStatus) {
        switch status {
        case .connected:
            thinkingLog = "SECURE UPLINK ESTABLISHED"
            latency = "24ms" // TODO: 실제 핑 측정 로직
        case .connecting:
            thinkingLog = "ESTABLISHING UPLINK BEACON..."
            latency = "---"
        case .disconnected:
            thinkingLog = "SYSTEM OFFLINE // STANDBY"
            latency = "---"
        case .error(let message):
            thinkingLog = "ERROR: \(message)"
            latency = "---"
        }
    }
    
    /// 아르커스 신호 분석 단계를 시뮬레이션하여 유저에게 가시화합니다.
    private func startThinkingSimulation() {
        isArcusThinking = true
        processStage = .transmitting
        
        stageTimer?.cancel()
        stageTimer = Timer.publish(every: 1.2, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self = self, self.isArcusThinking else {
                    self?.stageTimer?.cancel()
                    return
                }
                
                switch self.processStage {
                case .transmitting:
                    self.processStage = .processing
                case .processing:
                    self.processStage = .receiving
                case .receiving:
                    // 사이클 반복 (서버 응답 대기 지연 시)
                    self.processStage = .transmitting
                }
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
            thinkingLog = "VOICE BEACON RECORDING..."
        }
        // TODO: Speech 프레임워크 시작 로직
    }
    
    func stopListening() {
        withAnimation(.spring()) {
            isListening = false
            startThinkingSimulation()
            updateHUD(with: connectionStatus)
        }
        // TODO: 오디오 데이터 수집 후 webSocketManager.send(audioData:) 호출
    }
    
    func sendMessage() {
        guard !inputText.isEmpty else { return }
        
        let userMsg = ChatMessage(text: inputText, isUser: true)
        messages.append(userMsg)
        
        // 서버에 텍스트 메시지 전송
        webSocketManager.send(text: inputText)
        
        startThinkingSimulation()
        updateHUD(with: connectionStatus)
        inputText = ""
    }
}

struct ChatMessage: Identifiable {
    let id = UUID()
    let text: String
    let isUser: Bool
}
