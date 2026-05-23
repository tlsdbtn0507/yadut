 import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct MainConsoleView: View {
    @StateObject private var viewModel = MainConsoleViewModel()
    
    // State variables for attachment sheets/pickers
    @State private var showAttachmentSourceSheet = false
    @State private var showPhotosPicker = false
    @State private var showFilePicker = false
    @State private var showAttachmentMenu = false
    
    // For PhotosPicker (requires PhotosUI)
    @State private var selectedPhotoItem: PhotosPickerItem? = nil
    
    // Simulating audio levels for the high-fidelity sound visualizer
    @State private var mockAudioLevels: [CGFloat] = Array(repeating: 0.1, count: 12)
    @State private var timer: Timer? = nil
    
    // SF / Cyberpunk animation states
    @State private var isUplinkPulsing = false
    @State private var hologramRotationOuter = 0.0
    @State private var hologramRotationInner = 0.0
    @State private var scanlineOffset: CGFloat = -200
    
    var body: some View {
        ZStack {
            // Cyberpunk Obsidian Dark Space Background
            Color(red: 0.02, green: 0.03, blue: 0.05)
                .ignoresSafeArea()
            
            // Nebula Aurora Glow
            RadialGradient(
                gradient: Gradient(colors: [
                    Color(red: 0.05, green: 0.12, blue: 0.28).opacity(0.15),
                    Color.clear
                ]),
                center: .top,
                startRadius: 0,
                endRadius: 500
            )
            .ignoresSafeArea()
            
            RadialGradient(
                gradient: Gradient(colors: [
                    Color(red: 0.22, green: 0.08, blue: 0.38).opacity(0.1),
                    Color.clear
                ]),
                center: .bottom,
                startRadius: 0,
                endRadius: 600
            )
            .ignoresSafeArea()
            
            // Scanning Laser Line Overlay
            VStack {
                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [.clear, Color.blue.opacity(0.12), .clear],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(height: 3)
                    .offset(y: scanlineOffset)
                Spacer()
            }
            .ignoresSafeArea()
            
            // Main HUD Layout
            VStack(spacing: 0) {
                // 1. Top SF Dashboard Header (High-Fidelity HUD)
                hudArea
                    .padding(.top, 10)
                
                Spacer()
                
                // 2. Center Content: Holographic Transmission vs Chat History
                if viewModel.isListening {
                    listeningHologramArea
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .scale(scale: 0.95)),
                            removal: .opacity.combined(with: .scale(scale: 1.05))
                        ))
                } else {
                    chatMessageArea
                        .transition(.opacity)
                }
                
                Spacer()
                
                // 3. Floating Premium Input & Control Area
                controlArea
            }
            
            // Custom Gemini-style Dark Dropdown Menu Overlay
            if showAttachmentMenu {
                // Transparent backdrop to dismiss overlay on tap
                Color.black.opacity(0.01)
                    .ignoresSafeArea()
                    .onTapGesture {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showAttachmentMenu = false
                        }
                    }
                
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        
                        VStack(alignment: .leading, spacing: 0) {
                            // Option 1: File Upload (sf: paperclip)
                            Button(action: {
                                withAnimation {
                                    showAttachmentMenu = false
                                    showFilePicker = true
                                }
                            }) {
                                HStack(spacing: 12) {
                                    Image(systemName: "paperclip")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.white.opacity(0.8))
                                        .frame(width: 18)
                                    
                                    Text("파일 업로드")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(.white)
                                    
                                    Spacer()
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                                .background(Color.white.opacity(0.01))
                            }
                            .buttonStyle(MenuRowButtonStyle())
                            
                            Divider()
                                .background(Color.white.opacity(0.08))
                            
                            // Option 2: Add File from Drive (sf: triangle)
                            Button(action: {
                                withAnimation {
                                    showAttachmentMenu = false
                                    showFilePicker = true
                                }
                            }) {
                                HStack(spacing: 12) {
                                    Image(systemName: "triangle")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.white.opacity(0.8))
                                        .frame(width: 18)
                                    
                                    Text("Drive에서 파일 추가")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(.white)
                                    
                                    Spacer()
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                                .background(Color.white.opacity(0.01))
                            }
                            .buttonStyle(MenuRowButtonStyle())
                            
                            Divider()
                                .background(Color.white.opacity(0.08))
                            
                            // Option 3: Upload More (sf: ellipsis) - triggers photo library
                            Button(action: {
                                withAnimation {
                                    showAttachmentMenu = false
                                    showPhotosPicker = true
                                }
                            }) {
                                HStack(spacing: 12) {
                                    Image(systemName: "ellipsis")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.white.opacity(0.8))
                                        .frame(width: 18)
                                    
                                    Text("업로드 더보기")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(.white)
                                    
                                    Spacer()
                                    
                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundColor(.white.opacity(0.3))
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                                .background(Color.white.opacity(0.01))
                            }
                            .buttonStyle(MenuRowButtonStyle())
                        }
                        .frame(width: 210)
                        .background(
                            RoundedRectangle(cornerRadius: 16)
                                .fill(Color(red: 0.1, green: 0.11, blue: 0.13).opacity(0.96))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(Color.white.opacity(0.12), lineWidth: 0.8)
                        )
                        .shadow(color: Color.black.opacity(0.35), radius: 12, x: 0, y: 6)
                        .padding(.trailing, 20)
                        // Aligned perfectly above the text capsule & optional preview bar
                        .padding(.bottom, viewModel.selectedAttachment != nil ? 134 : 78)
                    }
                }
                .transition(.asymmetric(
                    insertion: .opacity.combined(with: .scale(scale: 0.92, anchor: .bottomTrailing)),
                    removal: .opacity.combined(with: .scale(scale: 0.92, anchor: .bottomTrailing))
                ))
            }
        }
        .onAppear {
            viewModel.connect()
            
            // Start looping HUD pulse animations
            withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
                isUplinkPulsing = true
            }
            
            // Ambient planetary/hologram rotation
            withAnimation(.linear(duration: 25.0).repeatForever(autoreverses: false)) {
                hologramRotationOuter = 360.0
            }
            
            withAnimation(.linear(duration: 18.0).repeatForever(autoreverses: false)) {
                hologramRotationInner = -360.0
            }
            
            // Sweep scanline endlessly
            withAnimation(.linear(duration: 4.5).repeatForever(autoreverses: false)) {
                scanlineOffset = UIScreen.main.bounds.height + 100
            }
            
            // Dynamic Audio Waveform simulator
            startWaveformSimulation()
        }
        .onDisappear {
            timer?.invalidate()
        }
        .photosPicker(
            isPresented: $showPhotosPicker,
            selection: $selectedPhotoItem,
            matching: .images,
            photoLibrary: .shared()
        )
        .fileImporter(
            isPresented: $showFilePicker,
            allowedContentTypes: [.data, .content, .item],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                guard let url = urls.first else { return }
                if url.startAccessingSecurityScopedResource() {
                    defer { url.stopAccessingSecurityScopedResource() }
                    do {
                        let data = try Data(contentsOf: url)
                        let fileName = url.lastPathComponent
                        let isImage = ["png", "jpg", "jpeg", "gif", "heic"].contains(url.pathExtension.lowercased())
                        let type: AttachmentType = isImage ? .image : .file
                        viewModel.selectedAttachment = SelectedAttachment(
                            type: type,
                            data: data,
                            name: fileName
                        )
                    } catch {
                        print("Failed to read file contents: \(error)")
                    }
                }
            case .failure(let error):
                print("File selection failed: \(error)")
            }
        }
        .onChange(of: selectedPhotoItem) { oldValue, newValue in
            guard let item = newValue else { return }
            item.loadTransferable(type: Data.self) { result in
                DispatchQueue.main.async {
                    switch result {
                    case .success(let data):
                        if let data = data {
                            let fileName = "IMG_\(Int(Date().timeIntervalSince1970)).jpg"
                            viewModel.selectedAttachment = SelectedAttachment(
                                type: .image,
                                data: data,
                                name: fileName
                            )
                        }
                    case .failure(let error):
                        print("Failed to load photo data: \(error)")
                    }
                    selectedPhotoItem = nil
                }
            }
        }
    }
    
    // MARK: - 1. Dynamic Waveform Simulation
    private func startWaveformSimulation() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { _ in
            guard viewModel.isListening else { return }
            withAnimation(.interactiveSpring(response: 0.12, dampingFraction: 0.5)) {
                for i in 0..<mockAudioLevels.count {
                    mockAudioLevels[i] = CGFloat.random(in: 0.15...0.95)
                }
            }
        }
    }
    
    // MARK: - 2. HUD Dashboard Component
    private var hudArea: some View {
        VStack(spacing: 8) {
            HStack(alignment: .top) {
                // Left Block: Project & Build Info
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text("ARCUS INTELLIGENCE")
                            .font(.system(size: 11, weight: .black, design: .monospaced))
                            .foregroundColor(Color(red: 0.0, green: 0.78, blue: 1.0))
                            .shadow(color: Color.blue.opacity(0.3), radius: 3)
                        
                        Text("ACTIVE CORE")
                            .font(.system(size: 8, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(Color.blue.opacity(0.3))
                            .cornerRadius(3)
                    }
                    
                    HStack(spacing: 4) {
                        Text("LOG:")
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundColor(.white.opacity(0.4))
                        Text(viewModel.thinkingLog.uppercased())
                            .font(.system(size: 9, weight: .medium, design: .monospaced))
                            .foregroundColor(connectionColor)
                    }
                }
                
                Spacer()
                
                // Right Block: Connection Status & Telemetry
                VStack(alignment: .trailing, spacing: 4) {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(connectionColor)
                            .frame(width: 5, height: 5)
                            .shadow(color: connectionColor, radius: isUplinkPulsing ? 4 : 1)
                            .scaleEffect(isUplinkPulsing ? 1.3 : 1.0)
                        
                        Text(connectionLabel)
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundColor(connectionColor)
                    }
                    
                    Text("PING: \(viewModel.latency)")
                        .font(.system(size: 8, design: .monospaced))
                        .foregroundColor(.white.opacity(0.4))
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.white.opacity(0.02))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .strokeBorder(Color.white.opacity(0.06), lineWidth: 0.5)
                )
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            
            // Futuristic Grid Divider
            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(Color.white.opacity(0.05))
                    .frame(height: 1)
                
                Rectangle()
                    .fill(Color.blue.opacity(0.4))
                    .frame(width: 80, height: 1)
                    .offset(x: isUplinkPulsing ? 120 : 20)
                    .animation(.easeInOut(duration: 4.0).repeatForever(autoreverses: true), value: isUplinkPulsing)
            }
            .padding(.horizontal, 20)
        }
    }
    
    // Connection helpers
    private var connectionColor: Color {
        switch viewModel.connectionStatus {
        case .connected:
            return Color(red: 0.0, green: 0.95, blue: 0.37)
        case .connecting:
            return Color.yellow
        default:
            return Color.red
        }
    }
    
    private var connectionLabel: String {
        switch viewModel.connectionStatus {
        case .connected:
            return "UPLINK SECURED"
        case .connecting:
            return "SYNCING BEACON"
        default:
            return "DISCONNECTED"
        }
    }
    
    // MARK: - 3. Hologram Voice Listening Panel
    private var listeningHologramArea: some View {
        VStack(spacing: 40) {
            ZStack {
                // 1. Outer Orbit Grid
                Circle()
                    .stroke(
                        LinearGradient(colors: [Color.blue.opacity(0.3), Color.clear, Color.purple.opacity(0.2)], startPoint: .top, endPoint: .bottom),
                        style: StrokeStyle(lineWidth: 1.5, dash: [4, 18])
                    )
                    .frame(width: 270, height: 270)
                    .rotationEffect(.degrees(hologramRotationOuter))
                
                // 2. Inner Orbit Radar
                Circle()
                    .stroke(
                        LinearGradient(colors: [Color.cyan.opacity(0.4), Color.clear], startPoint: .leading, endPoint: .trailing),
                        style: StrokeStyle(lineWidth: 1, dash: [20, 10])
                    )
                    .frame(width: 210, height: 210)
                    .rotationEffect(.degrees(hologramRotationInner))
                
                // 3. Central Ambient Aura Glow
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [Color.cyan.opacity(0.12), Color.clear],
                            center: .center,
                            startRadius: 0,
                            endRadius: 100
                        )
                    )
                    .frame(width: 200, height: 200)
                    .scaleEffect(isUplinkPulsing ? 1.15 : 0.95)
                
                // 4. Glowing Sci-Fi Core Sphere
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(red: 0.08, green: 0.15, blue: 0.35).opacity(0.8), Color.black.opacity(0.9)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 140, height: 140)
                        .shadow(color: Color.cyan.opacity(0.3), radius: 15)
                    
                    Circle()
                        .strokeBorder(
                            LinearGradient(colors: [Color.cyan.opacity(0.6), Color.blue.opacity(0.15)], startPoint: .top, endPoint: .bottom),
                            lineWidth: 1.5
                        )
                        .frame(width: 140, height: 140)
                    
                    // Hexagonal Quantum Core Pattern
                    Image(systemName: "hexagon.fill")
                        .font(.system(size: 54))
                        .foregroundColor(Color.cyan)
                        .opacity(0.15)
                        .scaleEffect(isUplinkPulsing ? 1.05 : 0.95)
                    
                    // Real-Time High-Fidelity Audio Waveform Visualization
                    HStack(spacing: 5) {
                        ForEach(0..<mockAudioLevels.count, id: \.self) { index in
                            RoundedRectangle(cornerRadius: 3)
                                .fill(
                                    LinearGradient(
                                        colors: [Color.white, Color.cyan.opacity(0.8), Color.blue],
                                        startPoint: .top,
                                        endPoint: .bottom
                                    )
                                )
                                .frame(width: 4, height: max(8, 70 * mockAudioLevels[index]))
                        }
                    }
                    .frame(width: 110, height: 80)
                }
            }
            .padding(.top, 20)
            
            VStack(spacing: 8) {
                Text("TRANSMITTING AUDIOMETRY DATA...")
                    .font(.system(size: 10, weight: .black, design: .monospaced))
                    .foregroundColor(Color.cyan)
                    .shadow(color: Color.cyan.opacity(0.5), radius: 6)
                
                Text("Arcus core is analyzing your pitch patterns")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundColor(.white.opacity(0.5))
            }
        }
    }
    
    // MARK: - 4. Scrollable Chat Message Area
    private var chatMessageArea: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if viewModel.messages.isEmpty && !viewModel.isArcusThinking {
                        emptyStateView
                    } else {
                        ForEach(viewModel.messages) { message in
                            chatBubble(message: message)
                                .id(message.id)
                        }
                        
                        // Arcus Typing / Thinking Indicator Bubble
                        if viewModel.isArcusThinking {
                            typingIndicatorBubble
                                .id("typingIndicator")
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 15)
                .padding(.bottom, 25)
            }
            .onChange(of: viewModel.messages.count) { oldValue, newValue in
                scrollToBottom(proxy: proxy)
            }
            .onChange(of: viewModel.isArcusThinking) { oldValue, newValue in
                if newValue {
                    scrollToBottom(proxy: proxy)
                }
            }
        }
        .frame(maxHeight: .infinity)
    }
    
    private func scrollToBottom(proxy: ScrollViewProxy) {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            if viewModel.isArcusThinking {
                proxy.scrollTo("typingIndicator", anchor: .bottom)
            } else if let lastId = viewModel.messages.last?.id {
                proxy.scrollTo(lastId, anchor: .bottom)
            }
        }
    }
    
    // MARK: - 4b. High-Fidelity Glassmorphic Typing Indicator Bubble
    private var typingIndicatorBubble: some View {
        HStack(alignment: .top, spacing: 10) {
            // Arcus Avatar Icon
            Image(systemName: "cpu.fill")
                .font(.system(size: 12))
                .foregroundColor(viewModel.processStage.color)
                .frame(width: 26, height: 26)
                .background(
                    Circle()
                        .fill(viewModel.processStage.color.opacity(0.15))
                )
                .overlay(
                    Circle()
                        .stroke(viewModel.processStage.color.opacity(0.25), lineWidth: 0.75)
                )
                .shadow(color: viewModel.processStage.color.opacity(0.2), radius: 4)
            
            VStack(alignment: .leading, spacing: 4) {
                // Identity Label
                Text("ARCUS SYSTEM CORE")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundColor(viewModel.processStage.color.opacity(0.8))
                    .padding(.horizontal, 4)
                
                // Bubble Main Frame containing dynamic telemetry
                VStack(alignment: .leading, spacing: 8) {
                    // Stage Header (Icon + Monospace Title + Step Indicators)
                    HStack(spacing: 6) {
                        Image(systemName: viewModel.processStage.icon)
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(viewModel.processStage.color)
                        
                        Text(viewModel.processStage.title)
                            .font(.system(size: 8.5, weight: .black, design: .monospaced))
                            .foregroundColor(viewModel.processStage.color)
                        
                        Spacer()
                        
                        // Three-Dot Stage Progress Lights
                        HStack(spacing: 3) {
                            ForEach(0..<3) { idx in
                                Circle()
                                    .fill(viewModel.processStage.rawValue == idx ? viewModel.processStage.color : Color.white.opacity(0.15))
                                    .frame(width: 4, height: 4)
                                    .scaleEffect(viewModel.processStage.rawValue == idx ? 1.2 : 1.0)
                            }
                        }
                    }
                    .frame(width: 200)
                    
                    // Main Status Label with Wave Pulsing Dots
                    HStack(spacing: 6) {
                        HStack(spacing: 3) {
                            TypingIndicatorDot(color: viewModel.processStage.color, delay: 0.0)
                            TypingIndicatorDot(color: viewModel.processStage.color, delay: 0.15)
                            TypingIndicatorDot(color: viewModel.processStage.color, delay: 0.3)
                        }
                        
                        Text(viewModel.processStage.description)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.white.opacity(0.9))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(
                    ChatBubbleShape(isUser: false)
                        .fill(
                            LinearGradient(
                                colors: [Color.blue.opacity(0.09), Color(red: 0.05, green: 0.08, blue: 0.18).opacity(0.55)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                )
                .overlay(
                    ChatBubbleShape(isUser: false)
                        .strokeBorder(
                            LinearGradient(
                                colors: [viewModel.processStage.color.opacity(0.35), Color.blue.opacity(0.08)],
                                startPoint: .top,
                                endPoint: .bottom
                            ),
                            lineWidth: 0.8
                        )
                )
                .shadow(color: viewModel.processStage.color.opacity(0.08), radius: 8, x: 0, y: 4)
            }
            
            Spacer()
        }
    }
    
    // Empty state when there are no messages
    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Spacer()
                .frame(height: 60)
            
            Image(systemName: "bolt.shield.fill")
                .font(.system(size: 42))
                .foregroundColor(Color.blue.opacity(0.4))
                .padding()
                .background(
                    Circle()
                        .fill(Color.blue.opacity(0.04))
                        .frame(width: 80, height: 80)
                )
                .overlay(
                    Circle()
                        .stroke(Color.blue.opacity(0.12), lineWidth: 1)
                )
            
            VStack(spacing: 6) {
                Text("SECURE CONNECTION INITIALIZED")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(.white.opacity(0.7))
                
                Text("Initiate a conversation or start your voice command link.")
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.45))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }
            
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
    
    // MARK: - 5. High-Fidelity Glassmorphic Chat Bubble
    private func chatBubble(message: ChatMessage) -> some View {
        let isUser = message.isUser
        let text = message.text
        
        return HStack(alignment: .top, spacing: 10) {
            if isUser { Spacer() }
            
            if !isUser {
                // Arcus Avatar Icon
                Image(systemName: "cpu.fill")
                    .font(.system(size: 12))
                    .foregroundColor(Color.cyan)
                    .frame(width: 26, height: 26)
                    .background(
                        Circle()
                            .fill(Color.blue.opacity(0.15))
                    )
                    .overlay(
                        Circle()
                            .stroke(Color.cyan.opacity(0.25), lineWidth: 0.75)
                    )
                    .shadow(color: Color.cyan.opacity(0.2), radius: 4)
            }
            
            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                // Identity Label
                Text(isUser ? "USER CLIENT" : "ARCUS SYSTEM CORE")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundColor(isUser ? .white.opacity(0.4) : Color.cyan.opacity(0.8))
                    .padding(.horizontal, 4)
                
                // Bubble Main Frame
                VStack(alignment: isUser ? .trailing : .leading, spacing: 8) {
                    if let attachment = message.attachment {
                        bubbleAttachmentView(attachment, isUser: isUser)
                    }
                    
                    if !text.isEmpty {
                        Text(text)
                            .font(.system(size: 14.5, weight: .medium))
                            .foregroundColor(.white)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(
                    ChatBubbleShape(isUser: isUser)
                        .fill(
                            isUser ?
                            LinearGradient(
                                colors: [Color.white.opacity(0.045), Color.white.opacity(0.015)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ) :
                            LinearGradient(
                                colors: [Color.blue.opacity(0.09), Color(red: 0.05, green: 0.08, blue: 0.18).opacity(0.55)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                )
                .overlay(
                    ChatBubbleShape(isUser: isUser)
                        .strokeBorder(
                            isUser ?
                            LinearGradient(
                                colors: [Color.white.opacity(0.18), Color.white.opacity(0.04)],
                                startPoint: .top,
                                endPoint: .bottom
                            ) :
                            LinearGradient(
                                colors: [Color.cyan.opacity(0.35), Color.blue.opacity(0.08)],
                                startPoint: .top,
                                endPoint: .bottom
                            ),
                            lineWidth: 0.8
                        )
                )
                .shadow(
                    color: isUser ? Color.clear : Color.blue.opacity(0.08),
                    radius: 8, x: 0, y: 4
                )
            }
            
            if isUser {
                // User Avatar Icon
                Image(systemName: "person.fill")
                    .font(.system(size: 12))
                    .foregroundColor(.white)
                    .frame(width: 26, height: 26)
                    .background(
                        Circle()
                            .fill(Color.white.opacity(0.08))
                    )
                    .overlay(
                        Circle()
                            .stroke(Color.white.opacity(0.18), lineWidth: 0.75)
                    )
            }
            
            if !isUser { Spacer() }
        }
    }
    
    // Bubble media renderer
    private func bubbleAttachmentView(_ attachment: SelectedAttachment, isUser: Bool) -> some View {
        Group {
            if attachment.type == .image, let uiImage = UIImage(data: attachment.data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: 200)
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(isUser ? Color.white.opacity(0.18) : Color.cyan.opacity(0.35), lineWidth: 0.8)
                    )
                    .shadow(color: isUser ? Color.clear : Color.cyan.opacity(0.12), radius: 6)
            } else {
                HStack(spacing: 8) {
                    Image(systemName: attachment.type == .image ? "photo.fill" : "doc.text.fill")
                        .font(.system(size: 16))
                        .foregroundColor(isUser ? .white.opacity(0.8) : Color.cyan)
                    
                    VStack(alignment: .leading, spacing: 2) {
                        Text(attachment.name)
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                            .lineLimit(1)
                        
                        Text(attachment.type == .image ? "IMAGE PACKET" : "DATA STREAM")
                            .font(.system(size: 8, weight: .black, design: .monospaced))
                            .foregroundColor(isUser ? .white.opacity(0.5) : Color.cyan.opacity(0.8))
                    }
                }
                .padding(8)
                .background(Color.white.opacity(0.04))
                .cornerRadius(6)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color.white.opacity(0.08), lineWidth: 0.5)
                )
            }
        }
        .padding(.bottom, 2)
    }
    
    // Horizontal Attachment Preview Bar above Textfield
    private func attachmentPreviewBar(_ attachment: SelectedAttachment) -> some View {
        HStack(spacing: 12) {
            if attachment.type == .image, let uiImage = UIImage(data: attachment.data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 38, height: 38)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(Color.cyan.opacity(0.4), lineWidth: 0.8)
                    )
            } else {
                ZStack {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.white.opacity(0.06))
                        .frame(width: 38, height: 38)
                    
                    Image(systemName: attachment.type == .image ? "photo.fill" : "doc.text.fill")
                        .font(.system(size: 14))
                        .foregroundColor(Color.cyan)
                }
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.name)
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(.white)
                    .lineLimit(1)
                
                Text(attachment.type == .image ? "IMAGE STREAM" : "DATA PACKET")
                    .font(.system(size: 8, weight: .black, design: .monospaced))
                    .foregroundColor(Color.cyan.opacity(0.8))
            }
            
            Spacer()
            
            Button(action: {
                withAnimation(.spring()) {
                    viewModel.selectedAttachment = nil
                }
            }) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundColor(.white.opacity(0.4))
            }
            .buttonStyle(PlainButtonStyle())
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(
                    LinearGradient(
                        colors: [Color.blue.opacity(0.12), Color.black.opacity(0.4)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color.cyan.opacity(0.25), lineWidth: 0.75)
        )
        .shadow(color: Color.cyan.opacity(0.08), radius: 6)
    }
    
    // MARK: - 6. Premium Glassmorphic Bottom Control Area
    private var controlArea: some View {
        VStack(spacing: 0) {
            if !viewModel.isListening {
                // Floating attachment preview bar
                if let attachment = viewModel.selectedAttachment {
                    attachmentPreviewBar(attachment)
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .move(edge: .bottom)),
                            removal: .opacity.combined(with: .scale(scale: 0.9))
                        ))
                        .padding(.horizontal, 20)
                        .padding(.bottom, 10)
                }
                
                HStack(spacing: 12) {
                    // Futuristic Glowing Mic Button
                    Button(action: { viewModel.startListening() }) {
                        ZStack {
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: [Color.blue.opacity(0.15), Color.blue.opacity(0.02)],
                                        startPoint: .top,
                                        endPoint: .bottom
                                    )
                                )
                                .frame(width: 46, height: 46)
                            
                            Circle()
                                .strokeBorder(Color.blue.opacity(0.3), lineWidth: 0.8)
                                .frame(width: 46, height: 46)
                            
                            Image(systemName: "mic.fill")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(Color.cyan)
                                .shadow(color: Color.cyan.opacity(0.4), radius: 5)
                        }
                    }
                    .buttonStyle(MicButtonStyle())
                    
                    // Glassmorphic Smart Input Textfield Bar
                    HStack {
                        TextField("Transmit direct data stream...", text: $viewModel.inputText)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .accentColor(Color.cyan)
                        
                        // Futuristic Attachment Paperclip Button
                        Button(action: {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                showAttachmentMenu.toggle()
                            }
                        }) {
                            Image(systemName: showAttachmentMenu ? "xmark" : "paperclip")
                                .font(.system(size: showAttachmentMenu ? 14 : 17, weight: .bold))
                                .foregroundColor(viewModel.selectedAttachment != nil || showAttachmentMenu ? Color.cyan : .white.opacity(0.4))
                                .padding(.horizontal, 6)
                                .shadow(color: viewModel.selectedAttachment != nil || showAttachmentMenu ? Color.cyan.opacity(0.3) : .clear, radius: 4)
                                .scaleEffect(viewModel.selectedAttachment != nil || showAttachmentMenu ? 1.15 : 1.0)
                                .rotationEffect(.degrees(showAttachmentMenu ? 90 : 0))
                                .animation(.spring(response: 0.25, dampingFraction: 0.6), value: showAttachmentMenu)
                        }
                        
                        Button(action: { viewModel.sendMessage() }) {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.system(size: 30))
                                .foregroundColor((viewModel.inputText.isEmpty && viewModel.selectedAttachment == nil) ? Color.white.opacity(0.15) : Color.cyan)
                                .shadow(color: (viewModel.inputText.isEmpty && viewModel.selectedAttachment == nil) ? .clear : Color.cyan.opacity(0.5), radius: 8)
                                .padding(.trailing, 6)
                                .animation(.easeOut(duration: 0.18), value: viewModel.inputText.isEmpty)
                        }
                        .disabled(viewModel.inputText.isEmpty && viewModel.selectedAttachment == nil)
                    }
                    .frame(height: 46)
                    .background(
                        RoundedRectangle(cornerRadius: 23)
                            .fill(
                                LinearGradient(
                                    colors: [Color.white.opacity(0.035), Color.white.opacity(0.005)],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                            )
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 23)
                            .strokeBorder(Color.white.opacity(0.12), lineWidth: 0.8)
                    )
                }
                .padding(.horizontal, 20)
            } else {
                // Interactive Recording Stop Console Button
                VStack(spacing: 12) {
                    Text("TRANSMITTING LINK ACTIVE — TAP TO TERMINATE")
                        .font(.system(size: 8.5, weight: .black, design: .monospaced))
                        .foregroundColor(Color.red.opacity(0.8))
                        .shadow(color: Color.red.opacity(0.3), radius: 4)
                        .opacity(isUplinkPulsing ? 1.0 : 0.6)
                    
                    Button(action: { viewModel.stopListening() }) {
                        ZStack {
                            Circle()
                                .stroke(Color.red.opacity(0.2), lineWidth: 2)
                                .frame(width: 80, height: 80)
                                .scaleEffect(isUplinkPulsing ? 1.15 : 0.95)
                            
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: [Color.red, Color(red: 0.7, green: 0.05, blue: 0.05)],
                                        startPoint: .top,
                                        endPoint: .bottom
                                    )
                                )
                                .frame(width: 58, height: 58)
                                .shadow(color: Color.red.opacity(0.45), radius: 12)
                            
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.white)
                                .frame(width: 18, height: 18)
                        }
                    }
                }
                .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
        }
        .padding(.bottom, 24)
        .padding(.top, 14)
        .background(
            LinearGradient(
                colors: [.clear, Color.black.opacity(0.65), Color.black.opacity(0.9)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        )
    }
}

// Specialized button press scaling animation
struct MicButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

// MARK: - Custom Insettable Chat Bubble Shape
struct ChatBubbleShape: InsettableShape {
    var isUser: Bool
    var insetAmount: CGFloat = 0
    
    func path(in rect: CGRect) -> Path {
        let insetRect = rect.insetBy(dx: insetAmount, dy: insetAmount)
        let path = UIBezierPath(
            roundedRect: insetRect,
            byRoundingCorners: isUser ? [.topLeft, .topRight, .bottomLeft] : [.topLeft, .topRight, .bottomRight],
            cornerRadii: CGSize(width: max(0, 16 - insetAmount), height: max(0, 16 - insetAmount))
        )
        return Path(path.cgPath)
    }
    
    func inset(by amount: CGFloat) -> ChatBubbleShape {
        var copy = self
        copy.insetAmount += amount
        return copy
    }
}

// MARK: - Typing Indicator Dot Component for elegant waveform typing effects
struct TypingIndicatorDot: View {
    @State private var pulse = false
    var color: Color = .cyan
    let delay: Double
    
    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 5, height: 5)
            .scaleEffect(pulse ? 1.3 : 0.7)
            .opacity(pulse ? 1.0 : 0.35)
            .onAppear {
                withAnimation(
                    .easeInOut(duration: 0.6)
                    .repeatForever(autoreverses: true)
                    .delay(delay)
                ) {
                    pulse = true
                }
            }
    }
}

struct MenuRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Color.white.opacity(0.08) : Color.clear)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

#Preview {
    MainConsoleView()
}
