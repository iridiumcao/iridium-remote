import { useState } from 'react'
import type { AppSettings, AppTheme } from '../lib/types'
import { Modal } from './Modal'
import { type ShortcutAction, defaultShortcuts, formatShortcut } from '../lib/shortcuts'
import { getTranslations } from '../lib/i18n'

type SettingsDialogProps = {
  onClose: () => void
  onSave: (settings: AppSettings) => Promise<void>
  open: boolean
  settings: AppSettings
  t: ReturnType<typeof getTranslations>
  theme: AppTheme
}

const actionLabels: Record<ShortcutAction, string> = {
  new_connection: 'New Connection',
  open_settings: 'Open Settings',
  search: 'Global Search',
  focus_search: 'Focus Connection Search',
  toggle_fullscreen: 'Toggle Fullscreen',
  close_tab: 'Close Current Tab',
  close_all_tabs: 'Close All Tabs',
  next_tab: 'Next Tab',
  prev_tab: 'Previous Tab',
  tab_1: 'Switch to Tab 1',
  tab_2: 'Switch to Tab 2',
  tab_3: 'Switch to Tab 3',
  tab_4: 'Switch to Tab 4',
  tab_5: 'Switch to Tab 5',
  tab_6: 'Switch to Tab 6',
  tab_7: 'Switch to Tab 7',
  tab_8: 'Switch to Tab 8',
  tab_9: 'Switch to Tab 9',
  terminal_find: 'Find in Terminal',
  terminal_zoom_in: 'Zoom In Terminal',
  terminal_zoom_out: 'Zoom Out Terminal',
  terminal_zoom_reset: 'Reset Terminal Zoom',
}

const formatKeydownEventToPattern = (event: React.KeyboardEvent): string | null => {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
    return null // Modifiers alone don't count
  }
  
  const isMac = navigator.platform.toLowerCase().includes('mac')
  const modActive = isMac ? event.metaKey : event.ctrlKey
  
  const parts = []
  if (modActive) parts.push('Mod')
  if (event.shiftKey) parts.push('Shift')
  if (event.altKey) parts.push('Alt')
  
  let key = event.key
  if (key === ' ') key = 'Space'
  if (key.length === 1) key = key.toUpperCase()
  
  parts.push(key)
  return parts.join('+')
}

export const SettingsDialog = ({
  onClose,
  onSave,
  open,
  settings,
  t,
  theme,
}: SettingsDialogProps) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings)
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(null)
  const [shortcutSearch, setShortcutSearch] = useState('')

  const isDark = theme === 'dark'
  
  const handleSave = async () => {
    await onSave(localSettings)
    onClose()
  }

  const handleKeyDownRecording = (e: React.KeyboardEvent) => {
    if (!recordingAction) return
    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      setRecordingAction(null)
      return
    }

    const pattern = formatKeydownEventToPattern(e)
    if (pattern) {
      setLocalSettings((prev) => ({
        ...prev,
        shortcuts: {
          ...prev.shortcuts,
          [recordingAction]: pattern,
        },
      }))
      setRecordingAction(null)
    }
  }

  const handleResetShortcut = (action: ShortcutAction) => {
    setLocalSettings((prev) => {
      const nextShortcuts = { ...prev.shortcuts }
      delete nextShortcuts[action]
      return { ...prev, shortcuts: nextShortcuts }
    })
  }

  const filteredActions = (Object.keys(defaultShortcuts) as ShortcutAction[]).filter(
    (action) => actionLabels[action].toLowerCase().includes(shortcutSearch.toLowerCase())
  )

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
          isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        {t.cancel}
      </button>
      <button
        type="button"
        onClick={() => { void handleSave() }}
        className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
          isDark
            ? 'bg-cyan-600 hover:bg-cyan-500'
            : 'bg-cyan-600 hover:bg-cyan-700 shadow-sm shadow-cyan-600/20'
        }`}
      >
        {t.save}
      </button>
    </>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Shortcuts"
      theme={theme}
      footer={footer}
      widthClass="max-w-2xl"
      bodyClassName="flex h-[60vh] p-0 overflow-hidden"
    >
      <div className={`flex-1 overflow-y-auto p-6 themed-scrollbar ${isDark ? 'themed-scrollbar-dark' : 'themed-scrollbar-light'}`}>
        <div className="space-y-4" onKeyDown={handleKeyDownRecording}>
          <div className="flex justify-between items-center">
            <h3 className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>Keyboard Shortcuts</h3>
            <input
              type="text"
              placeholder="Search actions..."
              value={shortcutSearch}
              onChange={(e) => setShortcutSearch(e.target.value)}
              className={`w-64 rounded-md border px-3 py-1.5 text-sm outline-none transition-colors ${
                isDark
                  ? 'border-slate-700 bg-slate-800 text-white placeholder-slate-400 focus:border-cyan-500'
                  : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
              }`}
            />
          </div>
          
          <div className={`rounded-md border ${isDark ? 'border-slate-700' : 'border-slate-200'} divide-y ${isDark ? 'divide-slate-700' : 'divide-slate-200'}`}>
            {filteredActions.map(action => {
              const isRecording = recordingAction === action
              const currentPattern = localSettings.shortcuts[action] || defaultShortcuts[action]
              const formattedPattern = formatShortcut(currentPattern)
              
              return (
                <div key={action} className="flex items-center justify-between p-3">
                  <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    {actionLabels[action] || action}
                  </span>
                  <div className="flex items-center gap-2">
                    {isRecording ? (
                      <div className={`px-3 py-1.5 text-xs rounded-md animate-pulse ${
                        isDark ? 'bg-cyan-500/20 text-cyan-300' : 'bg-cyan-50 text-cyan-700'
                      }`}>
                        Press keys now... (Esc to cancel)
                      </div>
                    ) : (
                      <button
                        onClick={() => setRecordingAction(action)}
                        className={`px-3 py-1.5 text-xs font-mono rounded-md border transition-colors ${
                          isDark 
                            ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700' 
                            : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {formattedPattern}
                      </button>
                    )}
                    
                    {localSettings.shortcuts[action] && !isRecording && (
                      <button
                        onClick={() => handleResetShortcut(action)}
                        title="Reset to default"
                        className={`p-1.5 rounded-md ${isDark ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                      >
                        ↺
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {filteredActions.length === 0 && (
              <div className={`p-4 text-center text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                No shortcuts found matching "{shortcutSearch}".
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
