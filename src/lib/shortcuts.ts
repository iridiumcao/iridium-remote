export type ShortcutAction =
  | 'new_connection'
  | 'open_settings'
  | 'search'
  | 'focus_search'
  | 'toggle_fullscreen'
  | 'close_tab'
  | 'close_all_tabs'
  | 'next_tab'
  | 'prev_tab'
  | 'tab_1'
  | 'tab_2'
  | 'tab_3'
  | 'tab_4'
  | 'tab_5'
  | 'tab_6'
  | 'tab_7'
  | 'tab_8'
  | 'tab_9'
  | 'terminal_find'
  | 'terminal_zoom_in'
  | 'terminal_zoom_out'
  | 'terminal_zoom_reset'

export const defaultShortcuts: Record<ShortcutAction, string> = {
  new_connection: 'Mod+N',
  open_settings: 'Mod+,',
  search: 'Mod+K',
  focus_search: 'Mod+Shift+F',
  toggle_fullscreen: 'F11',
  close_tab: 'Mod+W',
  close_all_tabs: 'Mod+Shift+W',
  next_tab: 'Mod+Tab',
  prev_tab: 'Mod+Shift+Tab',
  tab_1: 'Mod+1',
  tab_2: 'Mod+2',
  tab_3: 'Mod+3',
  tab_4: 'Mod+4',
  tab_5: 'Mod+5',
  tab_6: 'Mod+6',
  tab_7: 'Mod+7',
  tab_8: 'Mod+8',
  tab_9: 'Mod+9',
  terminal_find: 'Mod+F',
  terminal_zoom_in: 'Mod+=',
  terminal_zoom_out: 'Mod+-',
  terminal_zoom_reset: 'Mod+0',
}

export const getModifierKeyName = () => {
  return navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl'
}

export const formatShortcut = (shortcut: string) => {
  return shortcut.replace('Mod', getModifierKeyName())
}

export const isModKey = (event: KeyboardEvent | { ctrlKey: boolean; metaKey: boolean }) => {
  const isMac = navigator.platform.toLowerCase().includes('mac')
  return isMac ? event.metaKey : event.ctrlKey
}

export const checkShortcut = (event: KeyboardEvent, shortcutPattern: string): boolean => {
  const parts = shortcutPattern.split('+').map((p) => p.trim().toLowerCase())
  const requiresMod = parts.includes('mod')
  const requiresShift = parts.includes('shift')
  const requiresAlt = parts.includes('alt')

  if (requiresMod !== isModKey(event)) return false
  if (requiresShift !== event.shiftKey) return false
  if (requiresAlt !== event.altKey) return false

  const keyPart = parts.find((p) => p !== 'mod' && p !== 'shift' && p !== 'alt')
  if (!keyPart) return false

  const eventKey = event.key.toLowerCase()

  // Handle some special key name mappings if necessary
  if (keyPart === eventKey) return true

  // For letters and numbers, we can also check code to avoid issues with different keyboard layouts
  if (eventKey === keyPart) return true
  
  if (keyPart === 'k' && eventKey === 'p' && shortcutPattern === 'Mod+K') {
    // Some leniency for Mod+P being equivalent to Mod+K if needed? But usually exact match is better.
  }
  
  return false
}

export const eventMatchesAction = (
  event: KeyboardEvent,
  action: ShortcutAction,
  userShortcuts: Record<string, string>
): boolean => {
  const pattern = userShortcuts[action] || defaultShortcuts[action]
  if (!pattern) return false
  // For 'search', we might also support Mod+P in addition to Mod+K
  if (action === 'search' && pattern === 'Mod+K' && checkShortcut(event, 'Mod+P')) {
    return true
  }
  return checkShortcut(event, pattern)
}
