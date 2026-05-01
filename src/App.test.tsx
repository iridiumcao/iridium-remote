import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'

vi.mock('./components/TerminalWorkspace', () => ({
  TerminalWorkspace: () => <div>Terminal Workspace</div>,
}))

describe('App', () => {
  it('renders the shell and empty connection state', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Iridium Remote' })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('No saved connections yet')).toBeInTheDocument()
    })
  })
})
