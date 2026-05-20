import XCTest
import Combine
@testable import arcus

final class WebSocketManagerTests: XCTestCase {
    var sut: WebSocketManager!
    var cancellables: Set<AnyCancellable>!
    
    override func setUp() {
        super.setUp()
        sut = WebSocketManager()
        cancellables = []
    }
    
    override func tearDown() {
        sut = nil
        cancellables = nil
        super.tearDown()
    }
    
    // 1. 연결 시도 시 상태가 .connecting으로 변하는지 확인
    func testConnectionStatusTransitionToConnecting() {
        let expectation = XCTestExpectation(description: "Status transitions to .connecting")
        var receivedStatuses: [WebSocketStatus] = []
        
        sut.connectionStatus
            .dropFirst() // 초기값 .disconnected 무시
            .sink { status in
                receivedStatuses.append(status)
                if status == .connecting {
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)
        
        sut.connect(url: URL(string: "ws://localhost:8080")!)
        
        wait(for: [expectation], timeout: 1.0)
        XCTAssertEqual(receivedStatuses.first, .connecting)
    }
    
    // 2. 연결 종료 시 상태가 .disconnected로 변하는지 확인
    func testDisconnectionStatus() {
        let expectation = XCTestExpectation(description: "Status transitions to .disconnected")
        
        sut.connect(url: URL(string: "ws://localhost:8080")!)
        
        sut.connectionStatus
            .filter { $0 == .disconnected }
            .sink { _ in
                expectation.fulfill()
            }
            .store(in: &cancellables)
        
        sut.disconnect()
        
        wait(for: [expectation], timeout: 1.0)
    }
    // 4. 자동 재연결 로직 검증
    func testAutoReconnection() {
        let expectation = XCTestExpectation(description: "Should attempt to reconnect after error")
        let url = URL(string: "ws://localhost:8080")!

        // 연결 상태가 .connecting으로 다시 돌아오는지 확인 (재연결 시도)
        sut.connectionStatus
            .dropFirst() // 초기 .disconnected
            .filter { $0 == .connecting }
            .sink { _ in
                expectation.fulfill()
            }
            .store(in: &cancellables)

        sut.connect(url: url)

        // 강제로 에러 발생 시뮬레이션 (Delegate 직접 호출)
        // URLSession은 직접 생성하여 전달
        let dummySession = URLSession(configuration: .default)
        let dummyTask = dummySession.dataTask(with: url)
        sut.urlSession(dummySession, task: dummyTask, didCompleteWithError: NSError(domain: "test", code: -1))

        // reconnectTimer가 5초이므로 타임아웃을 넉넉히 잡거나, 테스트를 위해 타이머를 앞당길 필요가 있음
        // 여기서는 로직의 흐름을 확인하기 위해 7초 대기
        wait(for: [expectation], timeout: 10.0)
    }

    // 5. 대용량 페이로드 스트레스 테스트 (Level 3)
    func testLargePayloadStress() throws {
        let largeBase64 = String(repeating: "A", count: 1024 * 1024 * 2) // 2MB 수준으로 조정
        let jsonString = """
        {
            "response_to_id": "stress-test-id",
            "text": "Extremely long audio data incoming",
            "audio_data": "\(largeBase64)"
        }
        """

        let jsonData = jsonString.data(using: .utf8)!
        let decoder = JSONDecoder()

        // 성능 측정 및 안정성 검증
        measure {
            do {
                let response = try decoder.decode(ArcusResponse.self, from: jsonData)
                XCTAssertEqual(response.responseToId, "stress-test-id")
            } catch {
                XCTFail("Decoding failed for large payload")
            }
        }
    }
    }

