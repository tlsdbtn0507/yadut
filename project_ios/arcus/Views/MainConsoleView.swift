import SwiftUI

struct MainConsoleView: View {
    @StateObject private var viewModel = MainConsoleViewModel()
    
    // 오디오 파형 시뮬레이션을 위한 값 (나중에 ViewModel에서 실제 레벨을 줄 예정)
    @State private var mockAudioLevel: CGFloat = 0.5
    
    var body: some View {
        ZStack {
            // 배경: 깊이 있는 흑연색
            Color(red: 0.07, green: 0.07, blue: 0.07)
                .ignoresSafeArea()
            
            VStack(spacing: 0) {
                // 1. Top HUD Area
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("ARCUS v1.0.4")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundColor(.blue)
                        
                        Text("> \(viewModel.thinkingLog)")
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundColor(.white.opacity(0.8))
                    }
                    
                    Spacer()
                    
                    VStack(alignment: .trailing, spacing: 4) {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(viewModel.connectionStatus == .connected ? Color.green : (viewModel.connectionStatus == .connecting ? Color.yellow : Color.blue))
                                .frame(width: 6, height: 6)
                            Text(viewModel.connectionStatus == .connected ? "UPLINK ACTIVE" : (viewModel.connectionStatus == .connecting ? "ESTABLISHING" : "STANDBY"))
                                .font(.system(size: 10, design: .monospaced))
                        }
                        .foregroundColor(.white.opacity(0.6))
                        
                        Text("LATENCY: \(viewModel.latency)")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(.white.opacity(0.4))
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 10)
                
                Spacer()
                
                // 2. Center Content: Listening vs Chat List
                if viewModel.isListening {
                    // 음성 인식 모드
                    ZStack {
                        Circle()
                            .stroke(Color.blue.opacity(0.1), lineWidth: 2)
                            .frame(width: 280 + (mockAudioLevel * 100), height: 280 + (mockAudioLevel * 100))
                        
                        Circle()
                            .stroke(Color.blue.opacity(0.2), lineWidth: 1)
                            .frame(width: 220 + (mockAudioLevel * 50), height: 220 + (mockAudioLevel * 50))
                        
                        ZStack {
                            Circle()
                                .fill(Color.blue.opacity(0.1))
                                .frame(width: 150, height: 150)
                            
                            Image(systemName: "hexagon.fill")
                                .font(.system(size: 60))
                                .foregroundColor(.blue)
                                .shadow(color: .blue.opacity(0.8), radius: 20)
                            
                            HStack(spacing: 4) {
                                ForEach(0..<8) { i in
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(Color.white.opacity(0.8))
                                        .frame(width: 3, height: CGFloat.random(in: 10...60) * mockAudioLevel)
                                }
                            }
                        }
                    }
                    .transition(.scale.combined(with: .opacity))
                } else {
                    // 대화 목록 모드
                    ScrollViewReader { proxy in
                        ScrollView {
                            VStack(alignment: .leading, spacing: 15) {
                                ForEach(viewModel.messages) { message in
                                    chatBubble(text: message.text, isUser: message.isUser)
                                        .id(message.id)
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                        .onChange(of: viewModel.messages.count) { _ in
                            if let lastId = viewModel.messages.last?.id {
                                withAnimation { proxy.scrollTo(lastId, anchor: .bottom) }
                            }
                        }
                    }
                    .frame(maxHeight: .infinity)
                }
                
                Spacer()
                
                // 3. Bottom Control Area
                VStack(spacing: 20) {
                    if !viewModel.isListening {
                        HStack(spacing: 12) {
                            Button(action: { viewModel.startListening() }) {
                                Image(systemName: "mic.fill")
                                    .font(.system(size: 18))
                                    .foregroundColor(.white)
                                    .frame(width: 44, height: 44)
                                    .background(Circle().fill(Color.white.opacity(0.1)))
                                    .overlay(Circle().stroke(Color.white.opacity(0.2), lineWidth: 0.5))
                            }
                            
                            TextField("Message ARCUS...", text: $viewModel.inputText)
                                .font(.system(size: 14))
                                .foregroundColor(.white)
                                .padding(.horizontal, 15)
                                .padding(.vertical, 12)
                                .background(Color.white.opacity(0.05))
                                .cornerRadius(22)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 22)
                                        .stroke(Color.white.opacity(0.15), lineWidth: 0.5)
                                )
                            
                            Button(action: { viewModel.sendMessage() }) {
                                Image(systemName: "arrow.up.circle.fill")
                                    .font(.system(size: 32))
                                    .foregroundColor(viewModel.inputText.isEmpty ? .gray : .blue)
                            }
                        }
                        .padding(.horizontal, 20)
                    } else {
                        VStack(spacing: 15) {
                            Text("LISTENING TO YOUR VOICE")
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundColor(.blue)
                            
                            Button(action: { viewModel.stopListening() }) {
                                ZStack {
                                    Circle()
                                        .stroke(Color.red.opacity(0.3), lineWidth: 2)
                                        .frame(width: 80, height: 80)
                                    
                                    RoundedRectangle(cornerRadius: 4)
                                        .fill(Color.red)
                                        .frame(width: 24, height: 24)
                                }
                            }
                        }
                    }
                }
                .padding(.bottom, 25)
            }
        }
        .onAppear {
            viewModel.connect() // 시작 시 웹소켓 연결 시도
            
            Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
                if viewModel.isListening {
                    withAnimation(.linear(duration: 0.1)) {
                        mockAudioLevel = CGFloat.random(in: 0.3...1.0)
                    }
                }
            }
        }
    }
    
    // 공통 채팅 버블 컴포넌트
    @ViewBuilder
    private func chatBubble(text: String, isUser: Bool) -> some View {
        HStack {
            if isUser { Spacer() }
            
            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                if !isUser {
                    Text("ARCUS")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundColor(.blue)
                        .padding(.leading, 8)
                }
                
                Text(text)
                    .font(.system(size: 14))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(isUser ? Color.white.opacity(0.05) : Color.blue.opacity(0.05))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18)
                            .stroke(isUser ? Color.white.opacity(0.2) : Color.blue.opacity(0.3), lineWidth: 0.5)
                    )
                    .foregroundColor(.white)
            }
            
            if !isUser { Spacer() }
        }
    }
}

#Preview {
    MainConsoleView()
}
