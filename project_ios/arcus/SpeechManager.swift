import Foundation
import Combine
import Speech
import AVFoundation

protocol SpeechManagerProtocol {
    var isRecording: AnyPublisher<Bool, Never> { get }
    var transcription: AnyPublisher<String, Never> { get }
    var audioLevel: AnyPublisher<Float, Never> { get }
    
    func startRecording() throws
    func stopRecording()
}

class SpeechManager: NSObject, SpeechManagerProtocol, SFSpeechRecognizerDelegate {
    private let isRecordingSubject = CurrentValueSubject<Bool, Never>(false)
    private let transcriptionSubject = PassthroughSubject<String, Never>()
    private let audioLevelSubject = CurrentValueSubject<Float, Never>(0.0)
    
    var isRecording: AnyPublisher<Bool, Never> { isRecordingSubject.eraseToAnyPublisher() }
    var transcription: AnyPublisher<String, Never> { transcriptionSubject.eraseToAnyPublisher() }
    var audioLevel: AnyPublisher<Float, Never> { audioLevelSubject.eraseToAnyPublisher() }
    
    var isRecordingValue: Bool { isRecordingSubject.value }
    
    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    
    override init() {
        super.init()
        speechRecognizer?.delegate = self
    }
    
    func startRecording() throws {
        guard !isRecordingSubject.value else { return }
        
        // Request authorization
        SFSpeechRecognizer.requestAuthorization { [weak self] authStatus in
            guard authStatus == .authorized else {
                print("Speech recognition not authorized")
                return
            }
            
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                guard granted else {
                    print("Microphone permission not granted")
                    return
                }
                
                DispatchQueue.main.async {
                    do {
                        try self?.setupAndStartRecording()
                    } catch {
                        print("Failed to start recording: \(error)")
                    }
                }
            }
        }
    }
    
    private func setupAndStartRecording() throws {
        // 1. Cancel existing task
        recognitionTask?.cancel()
        recognitionTask = nil
        
        // 2. Configure Audio Session
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        
        let engine = getAudioEngine()
        let inputNode = engine.inputNode
        
        // 3. Create Recognition Request
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else {
            throw NSError(domain: "SpeechManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unable to create recognition request"])
        }
        recognitionRequest.shouldReportPartialResults = true
        
        // 4. Start Recognition Task
        recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }
            
            var isFinal = false
            if let result = result {
                self.transcriptionSubject.send(result.bestTranscription.formattedString)
                isFinal = result.isFinal
            }
            
            if error != nil || isFinal {
                self.stopRecording()
            }
        }
        
        // 5. Configure Input Tap
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0) // Ensure no existing tap
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] (buffer, _) in
            self?.recognitionRequest?.append(buffer)
            self?.calculateAudioLevel(from: buffer)
        }
        
        // 6. Start Engine
        engine.prepare()
        try engine.start()
        
        isRecordingSubject.send(true)
    }
    
    func stopRecording() {
        guard isRecordingSubject.value else { return }
        
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        
        recognitionRequest = nil
        recognitionTask = nil
        
        isRecordingSubject.send(false)
        audioLevelSubject.send(0.0)
        
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            print("Failed to deactivate audio session: \(error)")
        }
    }
    
    private func getAudioEngine() -> AVAudioEngine {
        if let engine = audioEngine {
            return engine
        }
        let engine = AVAudioEngine()
        audioEngine = engine
        return engine
    }
    
    private func calculateAudioLevel(from buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData else { return }
        
        let channelCount = Int(buffer.format.channelCount)
        let frameLength = Int(buffer.frameLength)
        var sumOfSquares: Float = 0
        
        for i in 0..<channelCount {
            let samples = UnsafeBufferPointer(start: channelData[i], count: frameLength)
            sumOfSquares += samples.reduce(0) { $0 + $1 * $1 }
        }
        
        let rms = sqrt(sumOfSquares / Float(frameLength * channelCount))
        // Normalize RMS to 0-1. 0.1 to 0.3 is typical range for speech RMS.
        let level = min(max(rms * 5.0, 0), 1)
        
        DispatchQueue.main.async {
            self.audioLevelSubject.send(level)
        }
    }
    
    // MARK: - SFSpeechRecognizerDelegate
    
    func speechRecognizer(_ speechRecognizer: SFSpeechRecognizer, availabilityDidChange available: Bool) {
        if !available {
            stopRecording()
        }
    }
}
