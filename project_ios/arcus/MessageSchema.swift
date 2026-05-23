import Foundation

/// 클라이언트에서 서버로 보내는 요청 스키마
struct ArcusRequest: Encodable {
    let userId: String = "1" // 현재 버전에서는 1로 고정
    let messageId: String
    let timestamp: String
    let text: String?
    let audioData: String?
    let attachmentData: String?
    let attachmentName: String?
    let attachmentType: String?
    
    init(
        messageId: String,
        timestamp: String,
        text: String? = nil,
        audioData: String? = nil,
        attachmentData: String? = nil,
        attachmentName: String? = nil,
        attachmentType: String? = nil
    ) {
        self.messageId = messageId
        self.timestamp = timestamp
        self.text = text
        self.audioData = audioData
        self.attachmentData = attachmentData
        self.attachmentName = attachmentName
        self.attachmentType = attachmentType
    }
    
    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case messageId = "message_id"
        case timestamp
        case text
        case audioData = "audio_data"
        case attachmentData = "attachment_data"
        case attachmentName = "attachment_name"
        case attachmentType = "attachment_type"
    }
}

/// 서버에서 클라이언트로 받는 응답 스키마
struct ArcusResponse: Decodable {
    let responseToId: String
    let text: String
    let audioData: String?
    
    enum CodingKeys: String, CodingKey {
        case responseToId = "response_to_id"
        case text
        case audioData = "audio_data"
    }
}
