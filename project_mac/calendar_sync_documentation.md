# JARVIS Mac_Eye Calendar Sync Documentation

## Overview

The `Mac_Eye` project acts as a bridge between an external client (ThinkPad) and the macOS system. Its primary current feature is receiving screenshot images of work schedules from the ThinkPad, extracting the schedule data using AI (either a local Gemma 4 model via LM Studio or Google's Gemini API), and synchronizing those schedules with the macOS Calendar ("직장" calendar).

This document outlines the architecture, flow, and specific technical implementations of this feature.

---

## 1. System Architecture

The system consists of two main components running on the macOS machine:

1.  **FastAPI Server (`mac_eye.py`)**: Acts as the receiving endpoint for the ThinkPad. It handles file uploads and exposes an endpoint to trigger the synchronization process.
2.  **Sync Logic (`calendar_sync.py`)**: Handles the core business logic. It takes a saved image, sends it to an AI model for OCR and semantic extraction (JSON formatting), and then uses AppleScript to update the macOS Calendar.

---

## 2. API Endpoints (`mac_eye.py`)

The FastAPI application runs on `0.0.0.0:8000`, making it accessible on the local network to the ThinkPad.

### `POST /upload`
*   **Purpose**: Receives image files (screenshots) from the ThinkPad.
*   **Input**: `multipart/form-data` with a file field named `file`.
*   **Action**: Saves the file to the `./screenshots` directory. It prepends `remote_YYYYMMDD_HHMMSS_` to the original filename to prevent collisions and track when the file was received.
*   **Output**: JSON response indicating success, the new filename, and a message.

### `GET /sync_calendar/{filename}`
*   **Purpose**: Triggers the schedule extraction and calendar sync process for a specific uploaded file.
*   **Input**: `filename` (path parameter) - The name of the file saved in the `./screenshots` directory.
*   **Action**: Calls `sync_image_to_calendar(filepath)` from `calendar_sync.py`. (Note: The call to this function is present in `mac_eye.py`, but the file was truncated in the read operation, assuming standard usage).
*   **Output**: The server processes the request and presumably returns a success/error status based on the synchronization outcome.

---

## 3. Core Sync Logic (`calendar_sync.py`)

This file contains the logic for reading the image, interacting with AI models, and executing AppleScript commands.

### 3.1 Data Extraction

The system supports two AI backends for image analysis. The AI's job is to read the schedule image, determine the shifts, and output a structured JSON array.

*   **Prompt Engineering**: Both models use a similar prompt that enforces specific rules:
    *   Injects the current year dynamically.
    *   Enforces the date/time format required by AppleScript (`YYYY-MM-DD [오전/오후] HH:MM:SS`).
    *   Instructs the AI to categorize shifts into "오픈" (Open), "미들" (Middle), or "마감" (Close) based on the times.
    *   Requires a JSON array output.

*   **`extract_schedule_from_image_gemma(image_path)`**:
    *   Uses a local LM Studio instance (`http://192.168.55.150:1234/v1/chat/completions`) running `gemma-4-26b-a4b-it`.
    *   Encodes the image to Base64 and sends it in the payload.
    *   Uses regex to extract the JSON array from the response.

*   **`extract_schedule_from_image_gemini(image_path)`**:
    *   Uses the `google.generativeai` library and the `gemini-3.1-flash-image-preview` model.
    *   Requires `GEMINI_API_KEY` in the `.env` file.
    *   Uses regex to extract the JSON array from the response.

### 3.2 macOS Calendar Integration

*   **`add_event_to_calendar(summary, start_time, end_time=None)`**:
    *   Takes the parsed details from the AI (summary, start, end).
    *   Constructs and executes an **AppleScript** using `subprocess.run`.
    *   **Logic**:
        1.  Calculates the start and end of the day based on the provided `start_time`.
        2.  Checks the "직장" (Work) calendar for any existing events on that specific day.
        3.  **Update Rule**: If an event already exists on that day, it *modifies* the first existing event with the new summary, start time, and end time.
        4.  **Create Rule**: If no event exists on that day, it creates a *new* event.
    *   **Feedback**: Returns `True` on success and logs whether it was an update or creation. Returns `False` on failure.

---

## 4. Workflow Diagram (ThinkPad to Calendar)

1.  **ThinkPad**: Captures schedule screenshot.
2.  **ThinkPad -> Mac**: Sends HTTP `POST /upload` with the image.
3.  **Mac (`mac_eye.py`)**: Saves image as `remote_timestamp_filename.jpg` in `./screenshots`. Returns filename to ThinkPad.
4.  **ThinkPad -> Mac**: Sends HTTP `GET /sync_calendar/{filename}`.
5.  **Mac (`calendar_sync.py`)**:
    *   Reads the image.
    *   Sends image + prompt to AI (Gemma or Gemini).
    *   AI returns JSON: `[{"summary": "마감", "start_time": "...", "end_time": "..."}]`
    *   Iterates through JSON list.
    *   Calls AppleScript for each item to check for existing events on that day and either update or create the event in the "직장" calendar.
6.  **Mac (`mac_eye.py`)**: Returns success status to ThinkPad.

---

## 5. Known Deviations from Original Plan

While the original intention might have been simpler, the current implementation includes a sophisticated "Update vs. Create" logic in the AppleScript. By calculating the 24-hour window of the target date, the system prevents duplicate entries for the same day, choosing instead to overwrite the existing shift. This is a robust feature for handling schedule changes, even if it wasn't strictly part of the initial design.
