import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTranslations } from '../lib/i18n'
import { SessionRecordingUnlockDialog } from './SessionRecordingUnlockDialog'

describe('SessionRecordingUnlockDialog', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })
  const renderDialog = (isSubmitting = false) => {
    const onVerify = vi.fn(async () => undefined)
    const onPause = vi.fn(async () => undefined)
    render(<SessionRecordingUnlockDialog open theme="dark" t={getTranslations('en')}
      isSubmitting={isSubmitting} error={null} onClearError={vi.fn()} onVerify={onVerify} onPause={onPause} />)
    return { onVerify, onPause, user: userEvent.setup() }
  }

  it('offers exactly two actions without showing the skip explanation in the dialog body', async () => {
    const { user, onPause } = renderDialog()
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Skip Recording', 'OK'])
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip Recording' })).not.toHaveAttribute('title')
    await user.keyboard('{Escape}')
    expect(screen.getByRole('heading')).toBeInTheDocument()
    expect(onPause).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Skip Recording' }))
    expect(onPause).toHaveBeenCalledOnce()
  })

  it('shows the scope tooltip after hovering briefly and cancels it when the pointer leaves', () => {
    vi.useFakeTimers()
    renderDialog()
    const button = screen.getByRole('button', { name: 'Skip Recording' })
    fireEvent.mouseEnter(button)
    act(() => vi.advanceTimersByTime(299))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('Skip recording for all sessions in this app run.')
    expect(tooltip).toHaveTextContent('Verify your password again after restart.')
    expect(button).toHaveAttribute('aria-describedby', tooltip.id)
    fireEvent.mouseLeave(button)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.mouseEnter(button)
    fireEvent.mouseLeave(button)
    act(() => vi.advanceTimersByTime(300))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows the tooltip on keyboard focus and dismisses it with Escape without closing the dialog', async () => {
    const { user, onPause } = renderDialog()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Skip Recording' })).toHaveFocus()
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.getByRole('heading')).toBeInTheDocument()
    expect(onPause).not.toHaveBeenCalled()
    await user.tab()
    expect(screen.getByRole('button', { name: 'OK' })).toHaveFocus()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('validates input and supports verification with Enter', async () => {
    const { user, onVerify } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(onVerify).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Encryption password'), 'super-secret{Enter}')
    expect(onVerify).toHaveBeenCalledWith('super-secret')
  })

  it('blocks both actions and Enter while verification is pending', () => {
    const { onVerify, onPause } = renderDialog(true)
    expect(screen.getByRole('button', { name: 'OK' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Skip Recording' })).toBeDisabled()
    fireEvent.keyDown(screen.getByLabelText('Encryption password'), { key: 'Enter' })
    expect(onVerify).not.toHaveBeenCalled()
    expect(onPause).not.toHaveBeenCalled()
  })
})
