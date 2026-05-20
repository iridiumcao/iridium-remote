import { useEffect, useId, useMemo, useRef, useState } from 'react'

type ToolbarSelectOption = {
  label: string
  value: string
}

type ToolbarSelectProps = {
  label: string
  options: ToolbarSelectOption[]
  value: string
  isDark: boolean
  onChange: (value: string) => void
}

export function ToolbarSelect({
  label,
  options,
  value,
  isDark,
  onChange,
}: ToolbarSelectProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const listboxId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const selectedIndex = useMemo(
    () => Math.max(0, options.findIndex((option) => option.value === value)),
    [options, value],
  )
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    optionRefs.current[highlightedIndex]?.focus()
  }, [highlightedIndex, isOpen])

  const selectedOption = options[selectedIndex] ?? options[0]

  const openMenu = (nextIndex = selectedIndex) => {
    setHighlightedIndex(nextIndex)
    setIsOpen(true)
  }

  const closeMenu = () => {
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  const selectOption = (nextValue: string) => {
    onChange(nextValue)
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  const handleButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        openMenu(Math.min(selectedIndex + 1, options.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        openMenu(Math.max(selectedIndex - 1, 0))
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        openMenu(selectedIndex)
        break
      default:
        break
    }
  }

  const handleListboxKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setHighlightedIndex((current) => Math.min(current + 1, options.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setHighlightedIndex((current) => Math.max(current - 1, 0))
        break
      case 'Home':
        event.preventDefault()
        setHighlightedIndex(0)
        break
      case 'End':
        event.preventDefault()
        setHighlightedIndex(options.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        selectOption(options[highlightedIndex]?.value ?? value)
        break
      case 'Escape':
        event.preventDefault()
        closeMenu()
        break
      default:
        break
    }
  }

  return (
    <div className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`} ref={containerRef}>
      <span className="mb-2 block">{label}</span>
      <div className="relative">
        <button
          ref={buttonRef}
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={label}
          className={`flex min-w-[9rem] items-center justify-between gap-3 rounded-sm border px-3 py-2 text-left ${
            isDark
              ? 'border-white/10 bg-slate-900 text-slate-100 hover:bg-slate-800'
              : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
          }`}
          onClick={() => {
            if (isOpen) {
              closeMenu()
              return
            }

            openMenu(selectedIndex)
          }}
          onKeyDown={handleButtonKeyDown}
          role="combobox"
          type="button"
        >
          <span>{selectedOption?.label ?? value}</span>
          <svg
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 16 16"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </button>

        {isOpen ? (
          <div
            className={`absolute right-0 z-30 mt-2 min-w-full overflow-hidden rounded-sm border p-1 shadow-xl ${
              isDark
                ? 'border-white/10 bg-slate-900 text-slate-100 shadow-black/40'
                : 'border-slate-200 bg-white text-slate-900 shadow-slate-300/60'
            }`}
            id={listboxId}
            onKeyDown={handleListboxKeyDown}
            role="listbox"
            tabIndex={-1}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value
              const isHighlighted = index === highlightedIndex

              return (
                <button
                  key={option.value}
                  ref={(node) => {
                    optionRefs.current[index] = node
                  }}
                  aria-selected={isSelected}
                  className={`block w-full rounded-sm px-3 py-2 text-left transition ${
                    isHighlighted
                      ? isDark
                        ? 'bg-cyan-400/15 text-white'
                        : 'bg-cyan-50 text-slate-900'
                      : isDark
                        ? 'hover:bg-white/5'
                        : 'hover:bg-slate-100'
                  }`}
                  onClick={() => {
                    selectOption(option.value)
                  }}
                  role="option"
                  tabIndex={isHighlighted ? 0 : -1}
                  type="button"
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
