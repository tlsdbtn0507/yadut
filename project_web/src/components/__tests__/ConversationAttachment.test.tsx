import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
// Next's image module interop is handled by Next in production; use the DOM image in jsdom.
vi.mock('next/image', () => ({ default: (props: { src: string; alt: string }) => createElement('img', { src: props.src, alt: props.alt }) }))
vi.mock('../../utils/imageCompression', () => ({ compressImageFile: vi.fn() }))
import { compressImageFile } from '../../utils/imageCompression'
import ArcusConsole from '../ArcusConsole'

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('original image preparation', () => {
  it('prevents send until compression finishes and ignores an older selection', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    let finishFirst: ((value: { dataUrl: string; mimeType: 'image/jpeg' }) => void) | undefined
    vi.mocked(compressImageFile).mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve }))
      .mockResolvedValueOnce({ dataUrl: 'data:image/jpeg;base64,SECOND', mimeType: 'image/jpeg' })
    const { container } = render(<ArcusConsole />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '분석해줘' } })
    const input = container.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [new File(['first'], 'first.jpg', { type: 'image/jpeg' })] } })
    expect(screen.getByRole('button', { name: '전송' })).toBeDisabled()
    fireEvent.change(input, { target: { files: [new File(['second'], 'second.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(screen.getByAltText('첨부 이미지 미리보기')).toHaveAttribute('src', 'data:image/jpeg;base64,SECOND'))
    await act(async () => { finishFirst?.({ dataUrl: 'data:image/jpeg;base64,FIRST', mimeType: 'image/jpeg' }) })
    expect(screen.getByAltText('첨부 이미지 미리보기')).toHaveAttribute('src', 'data:image/jpeg;base64,SECOND')
  })
})
