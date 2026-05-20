import XCTest
import Combine
@testable import arcus

final class ArcusModelTests: XCTestCase {
    
    // 1. Encoding Test: ArcusRequest -> JSON
    func testArcusRequestEncoding() throws {
        let audioData = "test-audio-base64".data(using: .utf8)!
        let base64String = audioData.base64EncodedString()
        let timestamp = "2026-05-17T12:00:00Z"
        let messageId = UUID().uuidString
        
        let request = ArcusRequest(
            messageId: messageId,
            timestamp: timestamp,
            audioData: base64String
        )
        
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        let data = try encoder.encode(request)
        
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        
        XCTAssertEqual(json["user_id"] as? String, "1")
        XCTAssertEqual(json["message_id"] as? String, messageId)
        XCTAssertEqual(json["timestamp"] as? String, timestamp)
        XCTAssertEqual(json["audio_data"] as? String, base64String)
    }
    
    // 2. Decoding Test: JSON -> ArcusResponse
    func testArcusResponseDecoding() throws {
        let responseToId = UUID().uuidString
        let text = "Hello, I am ARCUS."
        let audioData = "response-audio-base64"
        
        let jsonString = """
        {
            "response_to_id": "\(responseToId)",
            "text": "\(text)",
            "audio_data": "\(audioData)"
        }
        """
        
        let jsonData = jsonString.data(using: .utf8)!
        let decoder = JSONDecoder()
        let response = try decoder.decode(ArcusResponse.self, from: jsonData)
        
        XCTAssertEqual(response.responseToId, responseToId)
        XCTAssertEqual(response.text, text)
        XCTAssertEqual(response.audioData, audioData)
    }
    
    // 3. Optional Audio Data Decoding Test
    func testArcusResponseDecodingWithoutAudio() throws {
        let responseToId = UUID().uuidString
        let text = "No audio here."
        
        let jsonString = """
        {
            "response_to_id": "\(responseToId)",
            "text": "\(text)"
        }
        """
        
        let jsonData = jsonString.data(using: .utf8)!
        let decoder = JSONDecoder()
        let response = try decoder.decode(ArcusResponse.self, from: jsonData)
        
        XCTAssertEqual(response.responseToId, responseToId)
        XCTAssertEqual(response.text, text)
        XCTAssertNil(response.audioData)
    }
}
