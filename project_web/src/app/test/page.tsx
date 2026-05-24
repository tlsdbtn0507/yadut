'use client'

import React, { useState } from 'react'
import { TelemetryView } from '../../components/TelemetryView'
import { TelemetryMode, TelemetryStage } from '../../utils/telemetry'
import { apiHandler } from '../../utils/apiHandler'
import styles from './page.module.css'

export default function TestHome() {
  const [mode, setMode] = useState<TelemetryMode>(TelemetryMode.TEXT)
  const [currentStage, setCurrentStage] = useState<TelemetryStage>(TelemetryStage.CLIENT_TX)
  const [durationMs, setDurationMs] = useState<number>(0)
  const [isSimulating, setIsSimulating] = useState<boolean>(false)
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    'ARCUS SYSTEM V3.1.2 INITIALIZED...',
    'SECURE WEBSOCKET HANDSHAKE PROTOCOL: ACTIVE',
    'READY FOR MASTER REQUESTS.'
  ])

  // Simulate Telemetry Flow step-by-step
  const startSimulation = async () => {
    if (isSimulating) return
    setIsSimulating(true)
    setCurrentStage(TelemetryStage.CLIENT_TX)
    setDurationMs(120)
    
    const logs = [`[UPLINK] CONNECTING ON AD-HOC BEACON... 120ms`]
    setConsoleLogs(prev => [...prev, ...logs])

    // Delay mapping mimicking biological/network load
    const delays = mode === TelemetryMode.TEXT 
      ? [
          { stage: TelemetryStage.THINKPAD_GEMMA, dur: 850, log: '[BRIDGE] LAUNCHING GEMMA-4 COGNITION... 850ms' },
          { stage: TelemetryStage.RESPONSE_RX, dur: 2000, log: '[DOWNLINK] FORMATTING COMPLIANT DIALOGUE... 2000ms' }
        ]
      : [
          { stage: TelemetryStage.THINKPAD_GEMMA, dur: 850, log: '[BRIDGE] LAUNCHING GEMMA-4 COGNITION... 850ms' },
          { stage: TelemetryStage.MACBOOK_UPLOAD, dur: 2350, log: '[CORE] UPLOADING ATTACHMENT TO STORAGE... 2350ms' },
          { stage: TelemetryStage.GEMINI_NEURAL, dur: 3820, log: '[NEURAL] DEEP MULTI-MODAL SYNTHESIS... 3820ms' },
          { stage: TelemetryStage.RESPONSE_RX, dur: 4980, log: '[DOWNLINK] FORMATTING COMPLIANT DIALOGUE... 4980ms' }
        ]

    for (const step of delays) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      setCurrentStage(step.stage)
      setDurationMs(step.dur)
      setConsoleLogs(prev => [...prev, step.log])
    }
    
    setIsSimulating(false)
  }

  // Trigger Mock APIs
  const handleCaptureMock = async () => {
    setConsoleLogs(prev => [...prev, '> TRIGGERING MACBOOK CAPTURE REQUEST...'])
    const res = await apiHandler.captureScreen()
    if (res.success) {
      setConsoleLogs(prev => [...prev, `[SUCCESS] CAPTURED IMAGE URL: ${res.imageUrl}`])
    } else {
      setConsoleLogs(prev => [...prev, `[ERROR] ${res.error}`])
    }
  }

  const handleCalendarMock = async (success: boolean) => {
    setConsoleLogs(prev => [...prev, '> SYNCHRONIZING CALENDAR SCHEDULE...'])
    if (success) {
      const res = await apiHandler.syncCalendar('BASE64_STUB_DATA')
      setConsoleLogs(prev => [...prev, `[ARCUS] ${res.message}`])
    } else {
      // Trigger API failure to test Arcus soul fallback
      const originalFetch = window.fetch
      window.fetch = () => Promise.reject(new Error('Network loss'))
      const res = await apiHandler.syncCalendar('BASE64_STUB_DATA')
      setConsoleLogs(prev => [...prev, `[ARCUS] ${res.message}`])
      window.fetch = originalFetch
    }
  }

  return (
    <div className={styles.terminalContainer}>
      {/* Glow Cyber Header */}
      <header className={styles.header}>
        <div className={styles.pulseDot}></div>
        <h1 className={styles.title}>YADUT // ARCUS PERSISTENT CORE</h1>
        <p className={styles.subtitle}>Secured Web Console Portal (Tailscale Link)</p>
      </header>

      {/* Main Grid Viewport */}
      <main className={styles.mainGrid}>
        
        {/* Left Control Panel */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>TELEMETRY CONTROL PANEL</h2>
          
          <div className={styles.controlGroup}>
            <label className={styles.label}>TRANSMISSION MODE</label>
            <div className={styles.toggleContainer}>
              <button 
                className={`${styles.toggleBtn} ${mode === TelemetryMode.TEXT ? styles.activeBtn : ''}`}
                onClick={() => !isSimulating && setMode(TelemetryMode.TEXT)}
                disabled={isSimulating}
              >
                TEXT (3-Node)
              </button>
              <button 
                className={`${styles.toggleBtn} ${mode === TelemetryMode.IMAGE ? styles.activeBtn : ''}`}
                onClick={() => !isSimulating && setMode(TelemetryMode.IMAGE)}
                disabled={isSimulating}
              >
                IMAGE (5-Node)
              </button>
            </div>
          </div>

          <div className={styles.btnGrid}>
            <button 
              className={styles.primaryBtn}
              onClick={startSimulation}
              disabled={isSimulating}
            >
              {isSimulating ? 'TRANSMITTING...' : 'START RUN_TIME SIMULATION'}
            </button>
            
            <button 
              className={styles.secondaryBtn}
              onClick={handleCaptureMock}
            >
              TRIGGER SCREEN CAPTURE
            </button>

            <button 
              className={styles.secondaryBtn}
              onClick={() => handleCalendarMock(true)}
            >
              CALENDAR SYNC (SUCCESS)
            </button>

            <button 
              className={styles.dangerBtn}
              onClick={() => handleCalendarMock(false)}
            >
              CALENDAR SYNC (FAIL)
            </button>
          </div>
        </section>

        {/* Right Active Telemetry Panel */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>ACTIVE TRANSMISSION STREAM</h2>
          
          {/* Mount TDD Stage 5 Telemetry Component */}
          <div className={styles.telemetryWrapper}>
            <TelemetryView 
              mode={mode} 
              currentStage={currentStage} 
              durationMs={durationMs} 
            />
          </div>

          {/* Real-time Sub-millisecond Terminal Log Output */}
          <div className={styles.logConsole}>
            <div className={styles.consoleHeader}>
              <span>MONITORED PORT: 8000 (SECURE_HANDSHAKE)</span>
              <button onClick={() => setConsoleLogs([])} className={styles.clearBtn}>CLEAR</button>
            </div>
            <div className={styles.logBody}>
              {consoleLogs.map((log, index) => (
                <div key={index} className={styles.logLine}>
                  <span className={styles.logTime}>[{(16.3 + index * 0.4).toFixed(1)}s]</span>
                  <span className={styles.logContent}>{log}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>

      {/* Cyberpunk Footer */}
      <footer className={styles.footer}>
        <span>Tailscale MacBook Link: 100.84.129.54</span>
        <span>Tailscale ThinkPad Link: 100.122.25.31</span>
        <span>DESIGNED BY ARCUS COGNITIVE SYSTEM</span>
      </footer>
    </div>
  )
}
