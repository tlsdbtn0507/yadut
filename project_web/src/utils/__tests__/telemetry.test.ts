import { describe, it, expect } from 'vitest'
import { TelemetryEngine, TelemetryMode, TelemetryStage } from '../telemetry'

describe('Telemetry Engine (TDD Step 3: Bifurcated 3-Node vs 5-Node Telemetry)', () => {
  it('should initialize correctly for TEXT mode with 3 nodes and start at clientTx', () => {
    const engine = new TelemetryEngine(TelemetryMode.TEXT)
    
    expect(engine.mode).toBe(TelemetryMode.TEXT)
    expect(engine.currentStage).toBe(TelemetryStage.CLIENT_TX)
    expect(engine.getNodes()).toEqual(['iOS', 'THK', 'ARC'])
  })

  it('should initialize correctly for IMAGE mode with 5 nodes and start at clientTx', () => {
    const engine = new TelemetryEngine(TelemetryMode.IMAGE)
    
    expect(engine.mode).toBe(TelemetryMode.IMAGE)
    expect(engine.currentStage).toBe(TelemetryStage.CLIENT_TX)
    expect(engine.getNodes()).toEqual(['iOS', 'THK', 'MAC', 'GEM', 'ARC'])
  })

  it('should transition correctly in TEXT mode by skipping macbook and gemini stages', () => {
    const engine = new TelemetryEngine(TelemetryMode.TEXT)
    
    expect(engine.currentStage).toBe(TelemetryStage.CLIENT_TX)
    
    // Transition 1: clientTx -> thinkpadGemma
    engine.nextStage()
    expect(engine.currentStage).toBe(TelemetryStage.THINKPAD_GEMMA)
    
    // Transition 2: thinkpadGemma -> responseRx (skips macbookUpload and geminiNeural)
    engine.nextStage()
    expect(engine.currentStage).toBe(TelemetryStage.RESPONSE_RX)
    
    // Transition 3: Completed, stays at responseRx
    engine.nextStage()
    expect(engine.currentStage).toBe(TelemetryStage.RESPONSE_RX)
  })

  it('should transition step-by-step through all 5 nodes in IMAGE mode', () => {
    const engine = new TelemetryEngine(TelemetryMode.IMAGE)
    
    expect(engine.currentStage).toBe(TelemetryStage.CLIENT_TX)
    
    // 1 -> 2
    engine.nextStage()
    expect(engine.currentStage).toBe(TelemetryStage.THINKPAD_GEMMA)
    
    // 2 -> 3
    engine.nextStage()
    expect(engine.currentStage).toBe(TelemetryStage.MACBOOK_UPLOAD)
    
    // 3 -> 4
    engine.nextStage()
    expect(engine.currentStage).toBe(TelemetryStage.GEMINI_NEURAL)
    
    // 4 -> 5
    engine.nextStage()
    expect(engine.currentStage).toBe(TelemetryStage.RESPONSE_RX)
    
    // 5 -> stays at responseRx
    engine.nextStage()
    expect(engine.currentStage).toBe(TelemetryStage.RESPONSE_RX)
  })

  it('should generate cybernetic trace logs matching the active node and duration', () => {
    const engine = new TelemetryEngine(TelemetryMode.IMAGE)
    
    expect(engine.getTraceLog(120)).toContain('[UPLINK] CONNECTING ON AD-HOC BEACON... 120ms')
    
    engine.nextStage() // thinkpadGemma
    expect(engine.getTraceLog(850)).toContain('[BRIDGE] LAUNCHING GEMMA-4 COGNITION... 850ms')
    
    engine.nextStage() // macbookUpload
    expect(engine.getTraceLog(2350)).toContain('[CORE] UPLOADING ATTACHMENT TO STORAGE... 2350ms')
    
    engine.nextStage() // geminiNeural
    expect(engine.getTraceLog(3820)).toContain('[NEURAL] DEEP MULTI-MODAL SYNTHESIS... 3820ms')
    
    engine.nextStage() // responseRx
    expect(engine.getTraceLog(4980)).toContain('[DOWNLINK] FORMATTING COMPLIANT DIALOGUE... 4980ms')
  })
})
