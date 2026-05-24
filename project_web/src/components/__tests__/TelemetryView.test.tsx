import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { TelemetryView } from '../TelemetryView'
import { TelemetryMode, TelemetryStage } from '../../utils/telemetry'

describe('TelemetryView Component (TDD Step 5: Responsive Cyberpunk View)', () => {
  it('should render 3 nodes in TEXT mode and display active stage log', () => {
    const { container } = render(
      <TelemetryView
        mode={TelemetryMode.TEXT}
        currentStage={TelemetryStage.THINKPAD_GEMMA}
        durationMs={850}
      />
    )
    
    // Check nodes existence
    expect(screen.getByText('iOS')).toBeDefined()
    expect(screen.getByText('THK')).toBeDefined()
    expect(screen.getByText('ARC')).toBeDefined()
    
    // Nodes that shouldn't be in TEXT mode
    expect(screen.queryByText('MAC')).toBeNull()
    expect(screen.queryByText('GEM')).toBeNull()

    // Trace log check
    expect(screen.getByText('[BRIDGE] LAUNCHING GEMMA-4 COGNITION... 850ms')).toBeDefined()

    
    // Ensure glassmorphic container is rendered
    expect(container.querySelector('.container')).toBeDefined()
  })

  it('should render 5 nodes in IMAGE mode and apply correct styling', () => {
    render(
      <TelemetryView
        mode={TelemetryMode.IMAGE}
        currentStage={TelemetryStage.GEMINI_NEURAL}
        durationMs={3820}
      />
    )
    
    expect(screen.getByText('iOS')).toBeDefined()
    expect(screen.getByText('THK')).toBeDefined()
    expect(screen.getByText('MAC')).toBeDefined()
    expect(screen.getByText('GEM')).toBeDefined()
    expect(screen.getByText('ARC')).toBeDefined()

    expect(screen.getByText('[NEURAL] DEEP MULTI-MODAL SYNTHESIS... 3820ms')).toBeDefined()
  })
})

