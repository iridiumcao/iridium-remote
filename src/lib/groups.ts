const GROUP_WORD_START_PATTERN = /(^|[\s\-_/\\()[\]{}.,]+)([\p{L}\p{N}])/gu

export const UNGROUPED_GROUP_KEY = '__ungrouped__'

const toTitleCase = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(
      GROUP_WORD_START_PATTERN,
      (_match: string, prefix: string, character: string) =>
        `${prefix}${character.toLocaleUpperCase()}`,
    )

export const normalizeGroupName = (value?: string | null) => {
  const trimmed = value?.trim()
  return trimmed ? toTitleCase(trimmed) : null
}

export const getGroupKey = (groupName?: string | null) =>
  normalizeGroupName(groupName) ?? UNGROUPED_GROUP_KEY

export const collectGroupNames = (groupNames: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      groupNames.filter((groupName): groupName is string => groupName !== null && groupName !== undefined).map(
        normalizeGroupName,
      ),
    ),
  )
    .filter((groupName): groupName is string => Boolean(groupName))
    .sort((left, right) => left.localeCompare(right))

export const normalizeCollapsedGroups = (groupNames: string[]) =>
  collectGroupNames(groupNames)
