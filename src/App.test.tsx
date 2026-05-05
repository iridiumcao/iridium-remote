import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./components/TerminalWorkspace', () => ({
  TerminalWorkspace: () => (
    <div data-allow-native-context-menu="true">Terminal Workspace</div>
  ),
}))

describe('App', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the shell and empty connection state', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Iridium Remote' })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('No saved connections yet')).toBeInTheDocument()
    })
  })

  it('prevents the browser context menu outside the terminal panel', async () => {
    render(<App />)

    const heading = screen.getByRole('heading', { name: 'Iridium Remote' })
    const event = createEvent.contextMenu(heading)
    fireEvent(heading, event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('keeps the terminal panel context menu enabled', async () => {
    render(<App />)

    const terminal = screen.getByText('Terminal Workspace')
    const event = createEvent.contextMenu(terminal)
    fireEvent(terminal, event)

    expect(event.defaultPrevented).toBe(false)
  })
})
