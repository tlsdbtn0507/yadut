# Speech Recognition & UI Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate real-time speech-to-text functionality and refine the UI to a technical HUD style with a dedicated listening mode and side-by-side input controls.

**Architecture:** 
- `SpeechManager`: A singleton or injected manager that handles `AVAudioEngine` for recording and `SFSpeechRecognizer` for transcription.
- `MainConsoleViewModel`: Orchestrates state between the WebSocket engine and the Speech manager.
- `MainConsoleView`: Reactive SwiftUI view that switches between 'Chat Mode' and 'Listening Mode' based on the voice input state.

**Tech Stack:** 
- SwiftUI, Combine
- Speech Framework (`SFSpeechRecognizer`)
- AVFoundation (`AVAudioEngine`, `AVAudioSession`)
- Python CESP CLI (for Audio Feedback)

---

### Task 1: Add Privacy Permissions to Project

**Files:**
- Modify: `arcus.xcodeproj/project.pbxproj`

- [ ] **Step 1: Add Microphone and Speech Recognition usage descriptions**
- [ ] **Step 2: Commit**

### Task 2: Implement SpeechManager

**Files:**
- Create: `arcus/SpeechManager.swift`
- Test: `arcusTests/SpeechManagerTests.swift`

- [ ] **Step 1: Define SpeechManagerProtocol and Implementation**
- [ ] **Step 2: Write basic tests for state management**
- [ ] **Step 3: Commit**

### Task 3: Refine UI Layout (Side-by-Side Input & Listening Mode)

**Files:**
- Modify: `arcus/Views/MainConsoleView.swift`

- [ ] **Step 1: Move Mic button next to TextField**
- [ ] **Step 2: Implement Large Responsive Core for Listening Mode**
- [ ] **Step 3: Commit**

### Task 4: Integrate Speech with ViewModel & Audio Feedback

**Files:**
- Modify: `arcus/MainConsoleViewModel.swift`

- [ ] **Step 1: Bind SpeechManager to ViewModel**
- [ ] **Step 2: Implement Task Completion Audio Feedback**
- [ ] **Step 3: Commit**
