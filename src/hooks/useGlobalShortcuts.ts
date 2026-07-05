import { useEffect } from 'react'
import { eventMatchesAction, type ShortcutAction } from '../lib/shortcuts'
import type { AppSettings } from '../lib/types'

type ShortcutHandlers = Partial<Record<ShortcutAction, (event: KeyboardEvent) => void>>

export const useGlobalShortcuts = (
  settings: AppSettings,
  handlers: ShortcutHandlers,
  isActive: boolean = true
) => {
  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger if the user is typing in a generic input or textarea, 
      // EXCEPT if it's a Mod-prefixed shortcut. Most Mod shortcuts (like Mod+N) should work globally.
      // We will allow Mod+ shortcuts even in inputs, unless they conflict (like Mod+C/V),
      // but those usually don't match our actions. For Tab cycling, we don't block.
      
      for (const [actionName, handler] of Object.entries(handlers)) {
        if (!handler) continue
        
        const action = actionName as ShortcutAction
        if (eventMatchesAction(event, action, settings.shortcuts || {})) {
          // Prevent default browser behavior (e.g., Mod+W closing browser tab, Mod+N opening window)
          event.preventDefault()
          handler(event)
          return // Stop after first match
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [settings, handlers, isActive])
}
