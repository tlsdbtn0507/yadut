import React from 'react'
import { TelemetryEngine, TelemetryMode, TelemetryStage } from '../utils/telemetry'
import styles from './TelemetryView.module.css'

export interface TelemetryViewProps {
  mode: TelemetryMode
  currentStage: TelemetryStage
  durationMs: number
}

export function TelemetryView({ mode, currentStage, durationMs }: TelemetryViewProps) {
  // Instanciate engine temporarily to fetch static helpers
  const engine = new TelemetryEngine(mode)
  engine.currentStage = currentStage
  
  const nodes = engine.getNodes()
  const traceLog = engine.getTraceLog(durationMs)

  // Map TelemetryStage to index to calculate active/completed nodes
  const stageOrder = [
    TelemetryStage.CLIENT_TX,
    TelemetryStage.THINKPAD_GEMMA,
    TelemetryStage.MACBOOK_UPLOAD,
    TelemetryStage.GEMINI_NEURAL,
    TelemetryStage.RESPONSE_RX
  ]

  // If TEXT mode, map the stages to node index
  const getNodeState = (nodeName: string): 'active' | 'completed' | 'pending' => {
    const currentStageIndex = stageOrder.indexOf(currentStage)
    
    if (mode === TelemetryMode.TEXT) {
      // Nodes: ['iOS', 'THK', 'ARC']
      if (nodeName === 'iOS') {
        return currentStageIndex === 0 ? 'active' : 'completed'
      }
      if (nodeName === 'THK') {
        if (currentStageIndex === 1) return 'active'
        return currentStageIndex > 1 ? 'completed' : 'pending'
      }
      if (nodeName === 'ARC') {
        return currentStageIndex >= 4 ? 'active' : 'pending'
      }
    } else {
      // Nodes: ['iOS', 'THK', 'MAC', 'GEM', 'ARC']
      const nodeIndex = nodes.indexOf(nodeName)
      if (nodeIndex === currentStageIndex) {
        return 'active'
      }
      return nodeIndex < currentStageIndex ? 'completed' : 'pending'
    }
    return 'pending'
  }

  return (
    <div className={styles.container}>
      {/* 3-Node / 5-Node Flowchart */}
      <div className={styles.nodeChain}>
        {nodes.map((node, index) => {
          const state = getNodeState(node)
          const isNodeActive = state === 'active'
          const isNodeCompleted = state === 'completed'
          
          return (
            <React.Fragment key={node}>
              {/* Connector line between nodes */}
              {index > 0 && (
                <div 
                  className={`${styles.connectorLine} ${
                    isNodeActive || isNodeCompleted ? styles.connectorLineActive : ''
                  }`} 
                />
              )}
              
              {/* Circle Node */}
              <div 
                className={`${styles.node} ${
                  isNodeActive ? styles.nodeActive : ''
                } ${
                  isNodeCompleted ? styles.nodeCompleted : ''
                }`}
              >
                {node}
              </div>
            </React.Fragment>
          )
        })}
      </div>

      {/* Cybernetic Terminal Trace Log */}
      <div className={styles.terminal}>
        <span className={styles.prompt}>&gt;</span>
        <span>{traceLog}</span>
      </div>
    </div>
  )
}
