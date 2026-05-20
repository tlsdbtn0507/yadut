# ARCUS iOS App WebSocket & Model Design Spec

**Date:** 2026-05-17
**Topic:** WebSocket Communication & Data Models
**Status:** Draft (Pending User Approval)

## 1. Overview
The ARCUS iOS app communicates with a ThinkPad server via `URLSessionWebSocketTask`. This document defines the JSON schema and the reactive `WebSocketManager` that handles this communication using Combine and strict MVVM principles.

## 2. Architecture
- **Pattern:** MVVM (Model-View-ViewModel)
- **Reactive Framework:** Combine
- **Communication:** WebSocket (`URLSessionWebSocketTask`)
- **Testing:** TDD (Red-Green-Refactor)

## 3. Data Models (`MessageSchema.swift`)

### 3.1 Client Request (`ArcusRequest`)
Sent from the iOS app to the server.
| Field | Type | Description |
| :--- | :--- | :--- |
| `user_id` | String | Fixed to "1" for the current version. |
| `message_id` | String | Unique UUID for tracking the request. |
| `timestamp` | String | ISO8601 formatted date string. |
| `audio_data` | String | Base64 encoded audio file data. |

### 3.2 Server Response (`ArcusResponse`)
Received from the server.
| Field | Type | Description |
| :--- | :--- | :--- |
| `response_to_id` | String | Matches the `message_id` of the client's request. |
| `text` | String | The AI's text response. |
| `audio_data` | String? | Base64 encoded audio file data (Optional). |

## 4. WebSocket Manager (`WebSocketManager.swift`)

### 4.1 Protocol Interface
```swift
protocol WebSocketManagerProtocol {
    var connectionStatus: AnyPublisher<WebSocketStatus, Never> { get }
    var messagePublisher: AnyPublisher<ArcusResponse, Error> { get }
    
    func connect(url: URL)
    func disconnect()
    func send(audioData: Data)
}

enum WebSocketStatus {
    case disconnected
    case connecting
    case connected
    case error(Error)
}
```

### 4.2 Implementation Details
- **Connection Management:** Uses `URLSessionWebSocketTask`.
- **Reception Loop:** Recursive `receive()` calls to ensure continuous listening.
- **Error Handling:** Emits `.error` state on failure and schedules reconnection.
- **JSON Processing:** Uses `JSONEncoder` and `JSONDecoder` with `.iso8601` date strategy.

## 5. TDD & Validation Strategy

### 5.1 Unit Tests (Level 1)
- **Model Encoding/Decoding:** Verify JSON mapping and Base64 handling.
- **Request Generation:** Ensure `user_id` is "1" and `message_id` is a valid UUID.

### 5.2 Mock WebSocket Tests (Level 2)
- **Connection Lifecycle:** Verify state transitions (disconnected -> connecting -> connected).
- **Continuous Reception:** Mock multiple server messages and ensure `messagePublisher` emits all of them correctly.
- **Reconnection Logic:** Mock a network failure and verify the manager attempts to reconnect after a delay.

### 5.3 Stress & Integration Tests (Level 3)
- **Large Payload Test:** Send and receive large Base64 strings (simulating long audio files) to check for memory leaks or performance bottlenecks.
- **Concurrent Requests:** Verify that multiple messages can be handled in the stream without cross-talk (matching `response_to_id`).

## 6. Compound (Self-Correction)
- Ensure all tests are independent and reproducible.
- Strictly adhere to `URLSessionWebSocketTask` delegate methods for robust state tracking.
- Use `JSONDecoder.DataDecodingStrategy.base64` if possible, or handle manual string conversion carefully.
