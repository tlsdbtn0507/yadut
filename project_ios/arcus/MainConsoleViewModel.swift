import Foundation
import Combine
import SwiftUI

class MainConsoleViewModel: ObservableObject {
    /// 아르커스 인공지능 신호 처리 파이프라인 단계 (5단계 고도화 터미널 체인)
    enum ArcusProcessStage: Int, CaseIterable {
        case clientTx = 0
        case thinkpadGemma = 1
        case macbookUpload = 2
        case geminiNeural = 3
        case responseRx = 4
        
        var title: String {
            switch self {
            case .clientTx: return "1. UPLINK TRANSMISSION"
            case .thinkpadGemma: return "2. THINKPAD NEURAL COGNITION"
            case .macbookUpload: return "3. MACBOOK HOST BRIDGE"
            case .geminiNeural: return "4. GEMINI VISION SYNAPSE"
            case .responseRx: return "5. DOWNLINK RESPONSE GENERATION"
            }
        }
        
        var description: String {
            switch self {
            case .clientTx: return "씽크패드로 비디오/텍스트 신호 송신 중..."
            case .thinkpadGemma: return "Gemma 4 비전 모델로 유저 의도 판단 중..."
            case .macbookUpload: return "맥북 서버로 데이터 업로드 및 환경 분석 중..."
            case .geminiNeural: return "Gemini 3.1 모델 기반 고밀도 이미지 분석 중..."
            case .responseRx: return "아르커스 정체성 필터 적용 및 응답 전송 중..."
            }
        }
        
        var icon: String {
            switch self {
            case .clientTx: return "arrow.up.circle.fill"
            case .thinkpadGemma: return "brain.head.profile"
            case .macbookUpload: return "laptopcomputer"
            case .geminiNeural: return "eye.circle.fill"
            case .responseRx: return "checkmark.circle.fill"
            }
        }
        
        var color: Color {
            switch self {
            case .clientTx: return Color(red: 0.0, green: 0.78, blue: 1.0) // Cyan
            case .thinkpadGemma: return Color.purple // Brain Purple
            case .macbookUpload: return Color.orange // Host Orange
            case .geminiNeural: return Color(red: 1.0, green: 0.35, blue: 0.35) // Deep Red/Pink
            case .responseRx: return Color(red: 0.0, green: 0.95, blue: 0.37) // Connected Green
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
    @Published var processStage: ArcusProcessStage = .clientTx
    @Published var selectedAttachment: SelectedAttachment? = nil
    
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
    
    /// 아르커스 신호 분석 단계를 시뮬레이션하여 유저에게 가시화합니다. (고밀도 유동 지연 적용)
    private func startThinkingSimulation() {
        isArcusThinking = true
        processStage = .clientTx
        
        stageTimer?.cancel()
        
        // 실제 인프라 지연 상황을 반영한 유기적이고 고밀도 타이밍 설정
        let stageDelays: [Double] = [0.6, 1.4, 0.8, 1.8, 0.5]
        var currentStageIndex = 0
        
        func runNextStage() {
            guard isArcusThinking else { return }
            if currentStageIndex < ArcusProcessStage.allCases.count - 1 {
                currentStageIndex += 1
                if let nextStage = ArcusProcessStage(rawValue: currentStageIndex) {
                    withAnimation(.easeInOut(duration: 0.35)) {
                        self.processStage = nextStage
                    }
                    let delay = stageDelays[currentStageIndex]
                    stageTimer = Just(())
                        .delay(for: .seconds(delay), scheduler: DispatchQueue.main)
                        .sink { _ in
                            runNextStage()
                        }
                }
            } else {
                // 최종 응답 수신 대기 상태 유지
                self.processStage = .responseRx
            }
        }
        
        let firstDelay = stageDelays[0]
        stageTimer = Just(())
            .delay(for: .seconds(firstDelay), scheduler: DispatchQueue.main)
            .sink { _ in
                runNextStage()
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
        guard !inputText.isEmpty || selectedAttachment != nil else { return }
        
        let userMsg = ChatMessage(text: inputText, isUser: true, attachment: selectedAttachment)
        messages.append(userMsg)
        
        // 서버에 텍스트 및 첨부 파일 전송
        webSocketManager.send(text: inputText, attachment: selectedAttachment)
        
        startThinkingSimulation()
        updateHUD(with: connectionStatus)
        inputText = ""
        selectedAttachment = nil
    }
}

struct ChatMessage: Identifiable {
    let id = UUID()
    let text: String
    let isUser: Bool
    let attachment: SelectedAttachment?
    
    init(text: String, isUser: Bool, attachment: SelectedAttachment? = nil) {
        self.text = text
        self.isUser = isUser
        self.attachment = attachment
    }
}
