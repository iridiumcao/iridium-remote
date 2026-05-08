export const APP_VERSION = __APP_VERSION__

export const GITHUB_OWNER = 'iridiumcao'
export const GITHUB_REPO = 'iridium-remote'

export const PROJECT_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`
export const REPORT_ISSUE_URL = `${PROJECT_URL}/issues`
export const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`

export const formatVersionTag = (version: string) => (version.startsWith('v') ? version : `v${version}`)
