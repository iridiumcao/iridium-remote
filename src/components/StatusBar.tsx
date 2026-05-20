import type { getTranslations } from '../lib/i18n'
import type { AppTheme } from '../lib/types'

type StatusBarProps = {
  locale: string
  onSelectLocale: (locale: string) => void
  languageOptions: { label: string; value: string }[]

  themeValue: AppTheme
  onSelectTheme: (theme: AppTheme) => void
  themeOptions: { label: string; value: string }[]

  timeZone: string
  onSelectTimeZone: (tz: string) => void
  timeZoneOptions: { label: string; value: string }[]

  theme: AppTheme
  t: ReturnType<typeof getTranslations>
}

const StatusBarSelect = ({
  value,
  onChange,
  options,
  title,
}: {
  value: string
  onChange: (value: string) => void
  options: { label: string; value: string }[]
  title: string
}) => {
  return (
    <div className="relative flex items-center h-full hover:bg-white/10 px-2 cursor-pointer transition-colors" title={title}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-transparent outline-none cursor-pointer text-xs focus:ring-0 [&>option]:bg-slate-800 [&>option]:text-white h-full"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export const StatusBar = ({
  locale,
  onSelectLocale,
  languageOptions,
  themeValue,
  onSelectTheme,
  themeOptions,
  timeZone,
  onSelectTimeZone,
  timeZoneOptions,
  theme,
  t,
}: StatusBarProps) => {
  const isDark = theme === 'dark'

  return (
    <div
      className={`flex items-center h-6 shrink-0 px-2 text-xs select-none ${
        isDark ? 'bg-[#007acc] text-white' : 'bg-[#007acc] text-white'
      }`}
    >
      <div className="flex-1 flex items-center h-full gap-2">
        {/* Left side items if any */}
      </div>

      <div className="flex items-center h-full">
        <StatusBarSelect
          value={locale}
          onChange={(val) => onSelectLocale(val)}
          options={languageOptions}
          title={t.language}
        />
        <StatusBarSelect
          value={themeValue}
          onChange={(val) => onSelectTheme(val as AppTheme)}
          options={themeOptions}
          title={t.theme}
        />
        <StatusBarSelect
          value={timeZone}
          onChange={(val) => onSelectTimeZone(val)}
          options={timeZoneOptions}
          title={t.connectionHistoryTimeZone}
        />
      </div>
    </div>
  )
}
