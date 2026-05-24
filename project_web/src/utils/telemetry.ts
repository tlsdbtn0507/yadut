export enum TelemetryMode {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE'
}

export enum TelemetryStage {
  CLIENT_TX = 'CLIENT_TX',
  THINKPAD_GEMMA = 'THINKPAD_GEMMA',
  MACBOOK_UPLOAD = 'MACBOOK_UPLOAD',
  GEMINI_NEURAL = 'GEMINI_NEURAL',
  RESPONSE_RX = 'RESPONSE_RX'
}

export class TelemetryEngine {
  readonly mode: TelemetryMode
  currentStage: TelemetryStage = TelemetryStage.CLIENT_TX

  constructor(mode: TelemetryMode) {
    this.mode = mode
  }

  getNodes(): string[] {
    if (this.mode === TelemetryMode.TEXT) {
      return ['iOS', 'THK', 'ARC']
    }
    return ['iOS', 'THK', 'MAC', 'GEM', 'ARC']
  }

  nextStage(): void {
    if (this.mode === TelemetryMode.TEXT) {
      switch (this.currentStage) {
        case TelemetryStage.CLIENT_TX:
          this.currentStage = TelemetryStage.THINKPAD_GEMMA
          break
        case TelemetryStage.THINKPAD_GEMMA:
          // Skip macbookUpload and geminiNeural for plain text
          this.currentStage = TelemetryStage.RESPONSE_RX
          break
        case TelemetryStage.RESPONSE_RX:
        default:
          this.currentStage = TelemetryStage.RESPONSE_RX
          break
      }
    } else {
      switch (this.currentStage) {
        case TelemetryStage.CLIENT_TX:
          this.currentStage = TelemetryStage.THINKPAD_GEMMA
          break
        case TelemetryStage.THINKPAD_GEMMA:
          this.currentStage = TelemetryStage.MACBOOK_UPLOAD
          break
        case TelemetryStage.MACBOOK_UPLOAD:
          this.currentStage = TelemetryStage.GEMINI_NEURAL
          break
        case TelemetryStage.GEMINI_NEURAL:
          this.currentStage = TelemetryStage.RESPONSE_RX
          break
        case TelemetryStage.RESPONSE_RX:
        default:
          this.currentStage = TelemetryStage.RESPONSE_RX
          break
      }
    }
  }

  getTraceLog(durationMs: number): string {
    switch (this.currentStage) {
      case TelemetryStage.CLIENT_TX:
        return `[UPLINK] CONNECTING ON AD-HOC BEACON... ${durationMs}ms`
      case TelemetryStage.THINKPAD_GEMMA:
        return `[BRIDGE] LAUNCHING GEMMA-4 COGNITION... ${durationMs}ms`
      case TelemetryStage.MACBOOK_UPLOAD:
        return `[CORE] UPLOADING ATTACHMENT TO STORAGE... ${durationMs}ms`
      case TelemetryStage.GEMINI_NEURAL:
        return `[NEURAL] DEEP MULTI-MODAL SYNTHESIS... ${durationMs}ms`
      case TelemetryStage.RESPONSE_RX:
        return `[DOWNLINK] FORMATTING COMPLIANT DIALOGUE... ${durationMs}ms`
      default:
        return ''
    }
  }
}
