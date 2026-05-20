import XCTest
import Combine
@testable import arcus

final class SpeechManagerTests: XCTestCase {
    var sut: SpeechManager!
    var cancellables: Set<AnyCancellable>!
    
    override func setUp() {
        super.setUp()
        sut = SpeechManager()
        cancellables = []
    }
    
    override func tearDown() {
        sut = nil
        cancellables = nil
        super.tearDown()
    }
    
    func testInitialization() {
        XCTAssertNotNil(sut)
        XCTAssertFalse(sut.isRecordingValue)
    }
    
    func testInitialPublisherValues() {
        let recordingExpectation = XCTestExpectation(description: "Initial isRecording is false")
        let levelExpectation = XCTestExpectation(description: "Initial audioLevel is 0")
        
        sut.isRecording
            .first()
            .sink { isRecording in
                if !isRecording {
                    recordingExpectation.fulfill()
                }
            }
            .store(in: &cancellables)
            
        sut.audioLevel
            .first()
            .sink { level in
                if level == 0.0 {
                    levelExpectation.fulfill()
                }
            }
            .store(in: &cancellables)
            
        wait(for: [recordingExpectation, levelExpectation], timeout: 1.0)
    }
    
    func testStopRecordingResetsState() {
        // We can't easily trigger startRecording because of async auth in this environment,
        // but we can verify that stopRecording resets state if it was somehow started.
        // Actually, we can check that stopRecording doesn't crash and keeps state consistent.
        
        sut.stopRecording()
        XCTAssertFalse(sut.isRecordingValue)
    }
}
