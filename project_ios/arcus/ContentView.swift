import SwiftUI
import Foundation
import Combine

// 1. 빨간줄 해결: ObservableObject 채택 및 정확한 Message 타입 사용
class TestWebSocketManager: ObservableObject {
    @Published var statusMessage: String = "Disconnected"
    @Published var lastReceivedMessage: String = "No data received yet"
    
    private var webSocketTask: URLSessionWebSocketTask?
    private let serverURL = URL(string: "ws://100.122.25.31:8000/ws")!
    
    func connect() {
        statusMessage = "Connecting..."
        let session = URLSession(configuration: .default)
        webSocketTask = session.webSocketTask(with: serverURL)
        webSocketTask?.resume()
        
        statusMessage = "Connected"
        listenForMessages()
    }
    
    func disconnect() {
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        statusMessage = "Disconnected"
    }
    
    func sendPing() {
        webSocketTask?.send(.string("Ping from iOS Simulator")) { error in
            if let error = error {
                DispatchQueue.main.async {
                    self.statusMessage = "Send Error: \(error.localizedDescription)"
                }
            }
        }
    }
    
    private func listenForMessages() {
        webSocketTask?.receive { [weak self] result in
            switch result {
            case .success(let message):
                DispatchQueue.main.async {
                    // AI가 틀렸던 부분 수정: URLSessionWebSocketTask.Message 규격 매칭
                    switch message {
                    case .string(let text):
                        self?.lastReceivedMessage = text
                    case .data(let data):
                        self?.lastReceivedMessage = "Binary Data: \(data.count) bytes"
                    @unknown default:
                        break
                    }
                }
                // 연속 수신을 위해 루프 재가동
                self?.listenForMessages()
                
            case .failure(let error):
                DispatchQueue.main.async {
                    self?.statusMessage = "Connection Lost: \(error.localizedDescription)"
                }
            }
        }
    }
}

// 2. 화면 UI 컴포넌트 (연쇄 폭발하던 에러 해결본)
struct ContentView: View {
    @StateObject private var socketManager = TestWebSocketManager()
    
    var body: some View {
        VStack(spacing: 30) {
            Text("ARCUS Network Tester")
                .font(.title2)
                .bold()
            
            VStack(spacing: 10) {
                Text("Status")
                    .foregroundColor(.gray)
                Text(socketManager.statusMessage)
                    .font(.headline)
                    .foregroundColor(socketManager.statusMessage == "Connected" ? .green : .red)
                    .multilineTextAlignment(.center)
                    .padding()
            }
            
            VStack(spacing: 10) {
                Text("Last Received Message")
                    .foregroundColor(.gray)
                Text(socketManager.lastReceivedMessage)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(10)
            }
            
            HStack(spacing: 20) {
                Button(action: { socketManager.connect() }) {
                    Text("Connect")
                        .bold()
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                }
                
                Button(action: { socketManager.disconnect() }) {
                    Text("Disconnect")
                        .bold()
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.red)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                }
            }
            
            Button(action: { socketManager.sendPing() }) {
                Text("Send 'Ping'")
            }
            .disabled(socketManager.statusMessage != "Connected")
        }
        .padding()
    }
}
