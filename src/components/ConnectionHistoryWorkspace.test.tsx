import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { getTranslations } from '../lib/i18n'
import type { ConnectionHistoryHostDetails, ConnectionHistoryOverview } from '../lib/types'
import { ConnectionHistoryWorkspace } from './ConnectionHistoryWorkspace'

const overview: ConnectionHistoryOverview = {
  hosts: [
    {
      historyKey: 'alpha',
      connectionId: 'connection-alpha',
      connectionName: 'Alpha',
      host: 'alpha.example.com',
      port: 22,
      username: 'root',
      deleted: false,
      latestConnectionAt: '2026-02-01T00:00:00Z',
      totalConnectionCount: 1,
      totalDurationSeconds: 300,
    },
    {
      historyKey: 'beta',
      connectionId: 'connection-beta',
      connectionName: 'Beta',
      host: 'beta.example.com',
      port: 22,
      username: 'deploy',
      deleted: false,
      latestConnectionAt: '2026-03-01T00:00:00Z',
      totalConnectionCount: 4,
      totalDurationSeconds: 120,
    },
    {
      historyKey: 'gamma',
      connectionId: 'connection-gamma',
      connectionName: 'Gamma',
      host: 'gamma.example.com',
      port: 22,
      username: 'ops',
      deleted: false,
      latestConnectionAt: '2026-01-01T00:00:00Z',
      totalConnectionCount: 2,
      totalDurationSeconds: 60,
    },
  ],
  dailyUsage: [],
}

const hostDetails: ConnectionHistoryHostDetails = {
  host: overview.hosts[0]!,
  sessions: [],
  durationBuckets: [],
  summarizedSessionCount: 0,
  summarizedDurationSeconds: 0,
}

describe('ConnectionHistoryWorkspace', () => {
  it('sorts cross-host share views by metric by default and can switch to latest-connection order', async () => {
    const user = userEvent.setup()
    const onLoadOverview = vi.fn(async () => overview)
    const onLoadHostDetails = vi.fn(async () => hostDetails)

    render(
      <ConnectionHistoryWorkspace
        active
        collapsedSections={[]}
        locale="en"
        onLoadHostDetails={onLoadHostDetails}
        onLoadOverview={onLoadOverview}
        onToggleSection={vi.fn()}
        t={getTranslations('en')}
        theme="dark"
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('history-duration-share-card')).toBeInTheDocument()
    })

    const durationCard = screen.getByTestId('history-duration-share-card')
    expect(
      within(durationCard)
        .getAllByText(/Alpha|Beta|Gamma/)
        .map((node) => node.textContent),
    ).toEqual(['Alpha', 'Beta', 'Gamma'])

    await user.click(within(durationCard).getByRole('button', { name: 'By latest connection' }))

    expect(
      within(durationCard)
        .getAllByText(/Alpha|Beta|Gamma/)
        .map((node) => node.textContent),
    ).toEqual(['Beta', 'Alpha', 'Gamma'])

    const durationBars = within(durationCard).getAllByTestId(/history-duration-share-card-bar-/)
    expect(durationBars[0]).toHaveStyle({ width: '40%' })
    expect(durationBars[1]).toHaveStyle({ width: '100%' })
    expect(durationBars[2]).toHaveStyle({ width: '20%' })

    await user.click(screen.getByRole('button', { name: /Cross-host connection count share/ }))

    const countCard = await screen.findByTestId('history-count-share-card')
    expect(
      within(countCard)
        .getAllByText(/Alpha|Beta|Gamma/)
        .map((node) => node.textContent),
    ).toEqual(['Beta', 'Alpha', 'Gamma'])
  })
})
