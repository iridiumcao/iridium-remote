import type { ConnectionListDisplayMode, Locale, SessionStatus } from './types'

type Dictionary = {
  appTagline: string
  appTitle: string
  ready: string
  newConnection: string
  createConnection: string
  createConnectionTitle: string
  copyConnectionTitle: (name: string) => string
  editConnectionTitle: (name: string) => string
  save: string
  saving: string
  cancel: string
  close: string
  name: string
  group: string
  ungrouped: string
  host: string
  port: string
  username: string
  passwordOptional: string
  passwordOptionalHint: string
  savedPasswordStored: string
  savedPasswordKeepHint: string
  removeSavedPassword: string
  connections: string
  savedSshEndpoints: string
  add: string
  noSavedConnectionsYet: string
  noSavedConnectionsDescription: string
  selectConnectionToStart: string
  selectConnectionDescription: string
  selectConnectionAndConnect: string
  readyToConnect: string
  connecting: string
  connectingDescription: string
  connect: string
  reconnect: string
  disconnect: string
  active: string
  tabs: string
  terminalWorkspace: string
  deleteConnectionTitle: string
  deleteConnectionDescription: (name: string) => string
  deleteConnectionPrompt: (name: string) => string
  edit: string
  duplicate: string
  delete: string
  keyringBadge: string
  language: string
  theme: string
  english: string
  simplifiedChinese: string
  traditionalChinese: string
  darkTheme: string
  lightTheme: string
  menuFile: string
  menuSettings: string
  menuHelp: string
  menuCheckForUpdate: string
  menuStarOnGitHub: string
  menuReportIssue: string
  menuAbout: string
  menuNewConnection: string
  menuConnectionHistory: string
  menuSessionLogs: string
  menuSessionRecording: string
  exit: string
  aboutTitle: string
  aboutDescription: string
  aboutAuthorLabel: string
  aboutProjectUrlLabel: string
  aboutLicenseLabel: string
  openProjectUrl: string
  versionLabel: string
  multiSessionDescription: string
  fileTransfer: string
  upload: string
  download: string
  localPath: string
  remotePath: string
  browse: string
  browseFile: string
  browseFolder: string
  select: string
  openFolder: string
  remoteBrowserTitle: string
  remoteBrowserDescription: string
  loadingRemotePaths: string
  noRemotePaths: string
  parentFolder: string
  useCurrentFolder: string
  selectCurrentFolder: string
  startTransfer: string
  transferDescription: string
  transferSuccess: string
  connectButtonLabel: string
  sessionClosed: string
  importConnections: string
  exportConnections: string
  displayMode: string
  searchConnections: string
  moreActions: string
  noMatchingConnections: string
  compactMode: string
  normalMode: string
  groupCount: (count: number) => string
  groupToggle: (collapsed: boolean, groupName: string) => string
  importConnectionsSuccess: (imported: number, skipped: number, settingsApplied: boolean) => string
  exportConnectionsSuccess: string
  importConnectionsFailed: string
  exportConnectionsFailed: string
  checkingForUpdates: string
  updateAvailable: (latestVersion: string, currentVersion: string) => string
  updateUpToDate: (currentVersion: string) => string
  downloadUpdate: (latestVersion: string) => string
  updateCheckFailed: string
  sessionRecordingTitle: string
  sessionRecordingDescription: string
  enableSessionRecording: string
  sessionRecordingMode: string
  inputOnlyRecording: string
  fullSessionRecording: string
  sessionRecordingPassword: string
  confirmSessionRecordingPassword: string
  sessionRecordingPasswordHint: string
  sessionRecordingPasswordLoaded: string
  sessionRecordingPasswordMissing: string
  sessionRecordingWarning: string
  sessionRecordingStorage: string
  sessionRecordingMaxFileSize: string
  sessionRecordingMaxTotalStorage: string
  sessionRecordingRetentionDays: string
  sessionRecordingLogDirectory: string
  sessionRecordingCurrentUsage: string
  sessionRecordingSaveSuccess: string
  recordingIndicator: string
  inputRecordingIndicator: string
  sessionLogViewerTitle: string
  sessionLogViewerDescription: string
  selectSessionLogs: string
  selectedSessionLogs: string
  decryptSessionLogs: string
  exportSessionLogs: string
  sessionLogsPreview: string
  sessionLogsPreviewTruncated: string
  noSessionLogsSelected: string
  sessionLogsExported: string
  connectionHistoryTitle: string
  connectionHistoryDescription: string
  connectionHistorySearchHosts: string
  connectionHistoryHostList: string
  connectionHistoryNoHosts: string
  connectionHistoryNoHostsDescription: string
  connectionHistoryTotalConnections: string
  connectionHistoryTotalDuration: string
  connectionHistoryLatestConnection: string
  connectionHistorySessions: string
  connectionHistoryNoSessions: string
  connectionHistoryStartTime: string
  connectionHistoryEndTime: string
  connectionHistoryDuration: string
  connectionHistoryCloseStatus: string
  connectionHistoryStatusNormal: string
  connectionHistoryStatusAbnormal: string
  connectionHistoryEstimated: string
  connectionHistoryDeletedConnection: string
  connectionHistoryRangeLast7Days: string
  connectionHistoryRangeLast30Days: string
  connectionHistoryRangeLast90Days: string
  connectionHistoryRangeAllTime: string
  connectionHistoryDurationShareChart: string
  connectionHistoryCountShareChart: string
  connectionHistoryDistributionChart: string
  connectionHistoryChartEmpty: string
  connectionHistoryBucketUnder5Minutes: string
  connectionHistoryBucket5To30Minutes: string
  connectionHistoryBucket30MinutesTo2Hours: string
  connectionHistoryBucketOver2Hours: string
  connectionHistoryOlderSessionsSummarized: (count: number) => string
  durationDaysShort: string
  durationHoursShort: string
  durationMinutesShort: string
  durationSecondsShort: string
  validationRequired: string
  validationPort: string
  validationPasswordLength: string
  validationPasswordConfirm: string
  validationPositiveNumber: string
  saveFailed: string
  terminalCopy: string
  terminalPaste: string
  terminalSelectAll: string
  statusLabel: (status: SessionStatus) => string
  copyOf: (name: string) => string
  displayModeLabel: (mode: ConnectionListDisplayMode) => string
}

const dictionaries: Record<Locale, Dictionary> = {
  en: {
    appTagline: 'Another Remote Tool',
    appTitle: 'Iridium Remote',
    ready: 'Ready',
    newConnection: 'New Connection',
    createConnection: 'Create Connection',
    createConnectionTitle: 'Create Connection',
    copyConnectionTitle: (name) => `Copy ${name}`,
    editConnectionTitle: (name) => `Edit ${name}`,
    save: 'Save',
    saving: 'Saving...',
    cancel: 'Cancel',
    close: 'Close',
    name: 'Name',
    group: 'Group',
    ungrouped: 'Ungrouped',
    host: 'Host',
    port: 'Port',
    username: 'Username',
    passwordOptional: 'Password (optional)',
    passwordOptionalHint: 'If provided, the password is saved to the system keyring.',
    savedPasswordStored: 'A password is currently saved in the system keyring.',
    savedPasswordKeepHint: 'Leave the password blank to keep the saved value.',
    removeSavedPassword: 'Remove saved password',
    connections: 'Connections',
    savedSshEndpoints: 'Saved SSH endpoints',
    add: 'Add',
    noSavedConnectionsYet: 'No saved connections yet',
    noSavedConnectionsDescription: 'Create your first server profile to open a terminal session.',
    selectConnectionToStart: 'Select a connection to start',
    selectConnectionDescription: 'Choose a saved host from the left panel to open the terminal.',
    selectConnectionAndConnect: 'Select a connection and connect',
    readyToConnect: 'Ready to connect',
    connecting: 'Connecting',
    connectingDescription: 'Starting the SSH session and waiting for the remote shell.',
    connect: 'Connect',
    reconnect: 'Reconnect',
    disconnect: 'Disconnect',
    active: 'Active',
    tabs: 'Sessions',
    terminalWorkspace: 'Terminal Workspace',
    deleteConnectionTitle: 'Delete Connection',
    deleteConnectionDescription: (name) =>
      `Delete ${name}. This removes the saved connection metadata from the local app.`,
    deleteConnectionPrompt: (name) => `You are about to remove ${name}.`,
    edit: 'Edit',
    duplicate: 'Copy',
    delete: 'Delete',
    keyringBadge: 'keyring',
    language: 'Language',
    theme: 'Theme',
    english: 'English',
    simplifiedChinese: '简体中文',
    traditionalChinese: '繁體中文',
    darkTheme: 'Dark',
    lightTheme: 'Light',
    menuFile: 'File',
    menuSettings: 'Settings',
    menuHelp: 'Help',
    menuCheckForUpdate: 'Check for Updates...',
    menuStarOnGitHub: '❤️ Star on GitHub',
    menuReportIssue: 'Report Issue',
    menuAbout: 'About',
    menuNewConnection: 'New Connection',
    menuConnectionHistory: 'Connection History',
    menuSessionLogs: 'Session Logs',
    menuSessionRecording: 'Session Recording',
    exit: 'Exit',
    aboutTitle: 'About Iridium Remote',
    aboutDescription:
      'Iridium Remote is a cross-platform desktop SSH client built with Tauri, React, and Rust.',
    aboutAuthorLabel: 'Author',
    aboutProjectUrlLabel: 'Project URL',
    aboutLicenseLabel: 'License',
    openProjectUrl: 'Open Project',
    versionLabel: 'Version',
    multiSessionDescription: 'Open and manage multiple terminal sessions with tabs.',
    fileTransfer: 'File Transfer',
    upload: 'Upload',
    download: 'Download',
    localPath: 'Local path',
    remotePath: 'Remote path',
    browse: 'Browse',
    browseFile: 'Browse file',
    browseFolder: 'Browse folder',
    select: 'Select',
    openFolder: 'Open',
    remoteBrowserTitle: 'Browse Remote Path',
    remoteBrowserDescription: 'Browse files and folders on the remote host.',
    loadingRemotePaths: 'Loading remote paths...',
    noRemotePaths: 'No files or folders were found here.',
    parentFolder: 'Up to parent folder',
    useCurrentFolder: 'Use current folder',
    selectCurrentFolder: 'Select current folder',
    startTransfer: 'Start Transfer',
    transferDescription:
      'Transfers use the system SFTP client. Save a password on the connection if the host requires one.',
    transferSuccess: 'Transfer completed.',
    connectButtonLabel: 'Connect',
    sessionClosed: 'Session closed.',
    importConnections: 'Import',
    exportConnections: 'Export',
    displayMode: 'Display mode',
    searchConnections: 'Search connections',
    moreActions: 'More actions',
    noMatchingConnections: 'No connections match your search.',
    compactMode: 'Compact',
    normalMode: 'Normal',
    groupCount: (count) => `${count}`,
    groupToggle: (collapsed, groupName) =>
      `${collapsed ? 'Expand' : 'Collapse'} ${groupName}`,
    importConnectionsSuccess: (imported, skipped, settingsApplied) =>
      `Imported ${imported} connection${imported === 1 ? '' : 's'} and skipped ${skipped} duplicate${
        skipped === 1 ? '' : 's'
      }${settingsApplied ? ', and restored app settings.' : '.'}`,
    exportConnectionsSuccess: 'Exported settings and connections to a backup file.',
    importConnectionsFailed: 'Unable to import the selected backup file.',
    exportConnectionsFailed: 'Unable to export the connection backup file.',
    checkingForUpdates: 'Checking GitHub for the latest release...',
    updateAvailable: (latestVersion, currentVersion) =>
      `Update available: v${latestVersion} is newer than your current version v${currentVersion}.`,
    updateUpToDate: (currentVersion) => `You are up to date. Current version: v${currentVersion}.`,
    downloadUpdate: (latestVersion) => `Download v${latestVersion}`,
    updateCheckFailed: 'Failed to check for updates.',
    sessionRecordingTitle: 'Session Recording',
    sessionRecordingDescription:
      'Encrypt terminal recordings locally with chunked writes and runtime-only passwords.',
    enableSessionRecording: 'Enable Session Recording',
    sessionRecordingMode: 'Recording mode',
    inputOnlyRecording: 'Input Only',
    fullSessionRecording: 'Full Session Recording',
    sessionRecordingPassword: 'Encryption password',
    confirmSessionRecordingPassword: 'Confirm password',
    sessionRecordingPasswordHint:
      'Passwords are kept only for the current app run and must be entered again after restart.',
    sessionRecordingPasswordLoaded: 'An encryption password is currently loaded for this app run.',
    sessionRecordingPasswordMissing:
      'No encryption password is loaded. Recording cannot start until you enter it again.',
    sessionRecordingWarning:
      'Full session recording may capture sensitive information, including secrets displayed in terminal output.',
    sessionRecordingStorage: 'Storage policy',
    sessionRecordingMaxFileSize: 'Max log file size (MB)',
    sessionRecordingMaxTotalStorage: 'Max total storage (GB)',
    sessionRecordingRetentionDays: 'Retention period (days)',
    sessionRecordingLogDirectory: 'Log directory',
    sessionRecordingCurrentUsage: 'Current usage',
    sessionRecordingSaveSuccess: 'Updated the session recording settings.',
    recordingIndicator: '● Recording',
    inputRecordingIndicator: '● Input Recording',
    sessionLogViewerTitle: 'Session Logs',
    sessionLogViewerDescription:
      'Open one or more encrypted .irlog files, preview their contents, and export them as plain text.',
    selectSessionLogs: 'Select Session Logs',
    selectedSessionLogs: 'Selected logs',
    decryptSessionLogs: 'Decrypt Preview',
    exportSessionLogs: 'Export as .txt',
    sessionLogsPreview: 'Preview',
    sessionLogsPreviewTruncated: 'Preview truncated. Export the logs to save the full text.',
    noSessionLogsSelected: 'No session log files selected yet.',
    sessionLogsExported: 'Exported the decrypted session logs.',
    connectionHistoryTitle: 'Connection History & Statistics',
    connectionHistoryDescription:
      'Review recent per-host connection sessions, totals, and simple usage charts.',
    connectionHistorySearchHosts: 'Search hosts',
    connectionHistoryHostList: 'Hosts',
    connectionHistoryNoHosts: 'No connection history yet.',
    connectionHistoryNoHostsDescription:
      'Finished SSH sessions will appear here after they have been recorded.',
    connectionHistoryTotalConnections: 'Total connections',
    connectionHistoryTotalDuration: 'Total duration',
    connectionHistoryLatestConnection: 'Latest connection',
    connectionHistorySessions: 'Sessions',
    connectionHistoryNoSessions: 'No detailed sessions match the current filter.',
    connectionHistoryStartTime: 'Start time',
    connectionHistoryEndTime: 'End time',
    connectionHistoryDuration: 'Duration',
    connectionHistoryCloseStatus: 'Close status',
    connectionHistoryStatusNormal: 'Normal',
    connectionHistoryStatusAbnormal: 'Abnormal interruption',
    connectionHistoryEstimated: 'Estimated',
    connectionHistoryDeletedConnection: 'Deleted connection',
    connectionHistoryRangeLast7Days: 'Last 7 days',
    connectionHistoryRangeLast30Days: 'Last 30 days',
    connectionHistoryRangeLast90Days: 'Last 90 days',
    connectionHistoryRangeAllTime: 'All time',
    connectionHistoryDurationShareChart: 'Cross-host duration share',
    connectionHistoryCountShareChart: 'Cross-host connection count share',
    connectionHistoryDistributionChart: 'Selected host duration distribution',
    connectionHistoryChartEmpty: 'No chart data is available for the current filter.',
    connectionHistoryBucketUnder5Minutes: '< 5 minutes',
    connectionHistoryBucket5To30Minutes: '5 to 30 minutes',
    connectionHistoryBucket30MinutesTo2Hours: '30 minutes to 2 hours',
    connectionHistoryBucketOver2Hours: '> 2 hours',
    connectionHistoryOlderSessionsSummarized: (count) =>
      `${count} older session${count === 1 ? '' : 's'} are summarized in totals and charts.`,
    durationDaysShort: 'd',
    durationHoursShort: 'h',
    durationMinutesShort: 'm',
    durationSecondsShort: 's',
    validationRequired: 'Name, host, and username are required.',
    validationPort: 'Port must be a valid TCP port.',
    validationPasswordLength: 'The session recording password must be at least 8 characters.',
    validationPasswordConfirm: 'The session recording passwords do not match.',
    validationPositiveNumber: 'Recording storage values must be positive whole numbers.',
    saveFailed: 'Unable to save the connection.',
    terminalCopy: 'Copy',
    terminalPaste: 'Paste',
    terminalSelectAll: 'Select All',
    statusLabel: (status) =>
      ({
        idle: 'Idle',
        connecting: 'Connecting',
        connected: 'Connected',
        disconnected: 'Disconnected',
        error: 'Error',
      })[status],
    copyOf: (name) => `Copy of ${name}`,
    displayModeLabel: (mode) => (mode === 'compact' ? 'Compact' : 'Normal'),
  },
  'zh-CN': {
    appTagline: '更顺手的远程工具',
    appTitle: 'Iridium Remote',
    ready: '就绪',
    newConnection: '新建连接',
    createConnection: '创建连接',
    createConnectionTitle: '创建连接',
    copyConnectionTitle: (name) => `复制 ${name}`,
    editConnectionTitle: (name) => `编辑 ${name}`,
    save: '保存',
    saving: '保存中...',
    cancel: '取消',
    close: '关闭',
    name: '名称',
    group: '分组',
    ungrouped: '未分组',
    host: '主机',
    port: '端口',
    username: '用户名',
    passwordOptional: '密码（可选）',
    passwordOptionalHint: '如果填写，密码会保存到系统钥匙串。',
    savedPasswordStored: '当前连接已经保存了系统钥匙串密码。',
    savedPasswordKeepHint: '密码留空可保留当前已保存的值。',
    removeSavedPassword: '删除已保存密码',
    connections: '连接',
    savedSshEndpoints: '已保存的 SSH 连接',
    add: '添加',
    noSavedConnectionsYet: '还没有保存的连接',
    noSavedConnectionsDescription: '创建第一个服务器配置后即可打开终端会话。',
    selectConnectionToStart: '选择一个连接开始使用',
    selectConnectionDescription: '从左侧面板选择已保存主机以打开终端。',
    selectConnectionAndConnect: '选择连接并发起连接',
    readyToConnect: '准备连接',
    connecting: '连接中',
    connectingDescription: '正在启动 SSH 会话并等待远程 shell。',
    connect: '连接',
    reconnect: '重新连接',
    disconnect: '断开连接',
    active: '活动中',
    tabs: '会话',
    terminalWorkspace: '终端工作区',
    deleteConnectionTitle: '删除连接',
    deleteConnectionDescription: (name) => `删除 ${name}。这会移除本地保存的连接信息。`,
    deleteConnectionPrompt: (name) => `即将删除 ${name}。`,
    edit: '编辑',
    duplicate: '复制',
    delete: '删除',
    keyringBadge: '钥匙串',
    language: '语言',
    theme: '主题',
    english: 'English',
    simplifiedChinese: '简体中文',
    traditionalChinese: '繁體中文',
    darkTheme: '深色',
    lightTheme: '浅色',
    menuFile: '文件',
    menuSettings: '设置',
    menuHelp: '帮助',
    menuCheckForUpdate: '检查更新...',
    menuStarOnGitHub: '❤️ 在 GitHub 上点赞',
    menuReportIssue: '反馈问题',
    menuAbout: '关于',
    menuNewConnection: '新建连接',
    menuConnectionHistory: '连接历史',
    menuSessionLogs: '会话日志',
    menuSessionRecording: '会话录制',
    exit: '退出',
    aboutTitle: '关于 Iridium Remote',
    aboutDescription: 'Iridium Remote 是一个基于 Tauri、React 和 Rust 的桌面 SSH 客户端。',
    aboutAuthorLabel: '作者',
    aboutProjectUrlLabel: '项目地址',
    aboutLicenseLabel: '许可证',
    openProjectUrl: '打开项目地址',
    versionLabel: '版本',
    multiSessionDescription: '使用标签页同时打开和管理多个终端会话。',
    fileTransfer: '文件传输',
    upload: '上传',
    download: '下载',
    localPath: '本地路径',
    remotePath: '远程路径',
    browse: '浏览',
    browseFile: '选择文件',
    browseFolder: '选择文件夹',
    select: '选择',
    openFolder: '打开',
    remoteBrowserTitle: '浏览远程路径',
    remoteBrowserDescription: '浏览远程主机上的文件和文件夹。',
    loadingRemotePaths: '正在加载远程路径...',
    noRemotePaths: '这里没有可用的文件或文件夹。',
    parentFolder: '返回上级文件夹',
    useCurrentFolder: '使用当前文件夹',
    selectCurrentFolder: '选择当前文件夹',
    startTransfer: '开始传输',
    transferDescription: '文件传输使用系统 SFTP 客户端。如果主机需要密码，请先在连接中保存密码。',
    transferSuccess: '传输完成。',
    connectButtonLabel: '连接',
    sessionClosed: '会话已关闭。',
    importConnections: '导入',
    exportConnections: '导出',
    displayMode: '显示模式',
    searchConnections: '搜索连接',
    moreActions: '更多操作',
    noMatchingConnections: '没有匹配搜索条件的连接。',
    compactMode: '紧凑',
    normalMode: '普通',
    groupCount: (count) => `${count}`,
    groupToggle: (collapsed, groupName) => `${collapsed ? '展开' : '折叠'} ${groupName}`,
    importConnectionsSuccess: (imported, skipped, settingsApplied) =>
      `已导入 ${imported} 个连接，跳过 ${skipped} 个重复连接${settingsApplied ? '，并恢复应用设置。' : '。'}`,
    exportConnectionsSuccess: '已导出包含设置和连接的备份文件。',
    importConnectionsFailed: '无法导入所选备份文件。',
    exportConnectionsFailed: '无法导出连接备份文件。',
    checkingForUpdates: '正在检查 GitHub 上的最新版本...',
    updateAvailable: (latestVersion, currentVersion) =>
      `发现新版本：v${latestVersion} 高于当前版本 v${currentVersion}。`,
    updateUpToDate: (currentVersion) => `当前已是最新版本。当前版本：v${currentVersion}。`,
    downloadUpdate: (latestVersion) => `下载 v${latestVersion}`,
    updateCheckFailed: '检查更新失败。',
    sessionRecordingTitle: '会话录制',
    sessionRecordingDescription: '使用分块加密的本地日志记录终端会话，录制密码仅保留在当前应用运行期间。',
    enableSessionRecording: '启用会话录制',
    sessionRecordingMode: '录制模式',
    inputOnlyRecording: '仅输入',
    fullSessionRecording: '完整会话录制',
    sessionRecordingPassword: '加密密码',
    confirmSessionRecordingPassword: '确认密码',
    sessionRecordingPasswordHint: '密码不会被永久保存，重启应用后需要重新输入。',
    sessionRecordingPasswordLoaded: '当前应用运行期间已加载加密密码。',
    sessionRecordingPasswordMissing: '当前未加载加密密码，重新输入后才能开始录制。',
    sessionRecordingWarning: '完整会话录制可能会捕获终端输出中的敏感信息，包括密钥和机密数据。',
    sessionRecordingStorage: '存储策略',
    sessionRecordingMaxFileSize: '单个日志文件上限（MB）',
    sessionRecordingMaxTotalStorage: '总存储上限（GB）',
    sessionRecordingRetentionDays: '保留天数',
    sessionRecordingLogDirectory: '日志目录',
    sessionRecordingCurrentUsage: '当前占用',
    sessionRecordingSaveSuccess: '已更新会话录制设置。',
    recordingIndicator: '● 正在录制',
    inputRecordingIndicator: '● 输入录制',
    sessionLogViewerTitle: '会话日志',
    sessionLogViewerDescription: '打开一个或多个加密的 .irlog 文件，预览内容并导出为纯文本。',
    selectSessionLogs: '选择会话日志',
    selectedSessionLogs: '已选择日志',
    decryptSessionLogs: '解密预览',
    exportSessionLogs: '导出为 .txt',
    sessionLogsPreview: '预览',
    sessionLogsPreviewTruncated: '预览内容已截断，请导出日志以保存完整文本。',
    noSessionLogsSelected: '尚未选择会话日志文件。',
    sessionLogsExported: '已导出解密后的会话日志。',
    connectionHistoryTitle: '连接历史与统计',
    connectionHistoryDescription: '查看每个主机的近期连接明细、累计统计和简要占比图。',
    connectionHistorySearchHosts: '搜索主机',
    connectionHistoryHostList: '主机列表',
    connectionHistoryNoHosts: '还没有连接历史。',
    connectionHistoryNoHostsDescription: '完成过的 SSH 会话会在这里显示出来。',
    connectionHistoryTotalConnections: '总连接次数',
    connectionHistoryTotalDuration: '总连接时长',
    connectionHistoryLatestConnection: '最近连接时间',
    connectionHistorySessions: '连接明细',
    connectionHistoryNoSessions: '当前筛选条件下没有可展示的明细记录。',
    connectionHistoryStartTime: '开始时间',
    connectionHistoryEndTime: '结束时间',
    connectionHistoryDuration: '时长',
    connectionHistoryCloseStatus: '关闭状态',
    connectionHistoryStatusNormal: '正常结束',
    connectionHistoryStatusAbnormal: '异常中断',
    connectionHistoryEstimated: '估算',
    connectionHistoryDeletedConnection: '已删除主机',
    connectionHistoryRangeLast7Days: '最近 7 天',
    connectionHistoryRangeLast30Days: '最近 30 天',
    connectionHistoryRangeLast90Days: '最近 90 天',
    connectionHistoryRangeAllTime: '全部时间',
    connectionHistoryDurationShareChart: '不同主机连接时长占比',
    connectionHistoryCountShareChart: '不同主机连接次数占比',
    connectionHistoryDistributionChart: '当前主机连接时长分布',
    connectionHistoryChartEmpty: '当前筛选条件下没有可展示的图表数据。',
    connectionHistoryBucketUnder5Minutes: '5 分钟以内',
    connectionHistoryBucket5To30Minutes: '5 到 30 分钟',
    connectionHistoryBucket30MinutesTo2Hours: '30 分钟到 2 小时',
    connectionHistoryBucketOver2Hours: '2 小时以上',
    connectionHistoryOlderSessionsSummarized: (count) =>
      `另有 ${count} 条更早的连接已汇总到统计和图表中。`,
    durationDaysShort: '天',
    durationHoursShort: '小时',
    durationMinutesShort: '分',
    durationSecondsShort: '秒',
    validationRequired: '名称、主机和用户名为必填项。',
    validationPort: '端口必须是有效的 TCP 端口。',
    validationPasswordLength: '会话录制密码至少需要 8 个字符。',
    validationPasswordConfirm: '两次输入的会话录制密码不一致。',
    validationPositiveNumber: '录制存储参数必须是正整数。',
    saveFailed: '无法保存连接。',
    terminalCopy: '复制',
    terminalPaste: '粘贴',
    terminalSelectAll: '全选',
    statusLabel: (status) =>
      ({
        idle: '空闲',
        connecting: '连接中',
        connected: '已连接',
        disconnected: '已断开',
        error: '错误',
      })[status],
    copyOf: (name) => `${name} 副本`,
    displayModeLabel: (mode) => (mode === 'compact' ? '紧凑' : '普通'),
  },
  'zh-TW': {
    appTagline: '更順手的遠端工具',
    appTitle: 'Iridium Remote',
    ready: '就緒',
    newConnection: '新增連線',
    createConnection: '建立連線',
    createConnectionTitle: '建立連線',
    copyConnectionTitle: (name) => `複製 ${name}`,
    editConnectionTitle: (name) => `編輯 ${name}`,
    save: '儲存',
    saving: '儲存中...',
    cancel: '取消',
    close: '關閉',
    name: '名稱',
    group: '群組',
    ungrouped: '未分組',
    host: '主機',
    port: '連接埠',
    username: '使用者名稱',
    passwordOptional: '密碼（選填）',
    passwordOptionalHint: '如果填寫，密碼會儲存到系統鑰匙圈。',
    savedPasswordStored: '目前連線已經儲存了系統鑰匙圈密碼。',
    savedPasswordKeepHint: '密碼留空可保留目前已儲存的值。',
    removeSavedPassword: '刪除已儲存密碼',
    connections: '連線',
    savedSshEndpoints: '已儲存的 SSH 連線',
    add: '新增',
    noSavedConnectionsYet: '還沒有儲存的連線',
    noSavedConnectionsDescription: '建立第一個伺服器設定後即可開啟終端機會話。',
    selectConnectionToStart: '選擇一個連線開始使用',
    selectConnectionDescription: '從左側面板選擇已儲存主機以開啟終端機。',
    selectConnectionAndConnect: '選擇連線並發起連線',
    readyToConnect: '準備連線',
    connecting: '連線中',
    connectingDescription: '正在啟動 SSH 會話並等待遠端 shell。',
    connect: '連線',
    reconnect: '重新連線',
    disconnect: '斷開連線',
    active: '活動中',
    tabs: '會話',
    terminalWorkspace: '終端工作區',
    deleteConnectionTitle: '刪除連線',
    deleteConnectionDescription: (name) => `刪除 ${name}。這會移除本地儲存的連線資訊。`,
    deleteConnectionPrompt: (name) => `即將刪除 ${name}。`,
    edit: '編輯',
    duplicate: '建立副本',
    delete: '刪除',
    keyringBadge: '鑰匙圈',
    language: '語言',
    theme: '主題',
    english: 'English',
    simplifiedChinese: '简体中文',
    traditionalChinese: '繁體中文',
    lightTheme: '淺色',
    darkTheme: '深色',
    menuFile: '檔案',
    menuSettings: '設定',
    menuNewConnection: '新增連線...',
    menuConnectionHistory: '連線歷史',
    menuHelp: '說明',
    menuCheckForUpdate: '檢查更新...',
    menuStarOnGitHub: '在 GitHub 上給我們評星',
    menuReportIssue: '回報問題',
    menuAbout: '關於',
    menuSessionLogs: '會話日誌',
    menuSessionRecording: '會話錄製',
    exit: '結束',
    aboutTitle: '關於 Iridium Remote',
    aboutDescription: '一個輕量、現代的桌面 SSH 客戶端',
    aboutAuthorLabel: '作者',
    aboutProjectUrlLabel: '專案首頁',
    aboutLicenseLabel: '授權',
    versionLabel: '版本',
    openProjectUrl: '造訪專案首頁',
    multiSessionDescription: 'Iridium 支援多標籤頁會話，並將連線資料安全地儲存在本地 SQLite 資料庫與系統鑰匙圈中。',
    fileTransfer: '檔案傳輸',
    upload: '上傳',
    download: '下載',
    localPath: '本地路徑',
    remotePath: '遠端路徑',
    browse: '瀏覽',
    browseFile: '選擇檔案',
    browseFolder: '選擇資料夾',
    select: '選取',
    openFolder: '開啟',
    remoteBrowserTitle: '瀏覽遠端路徑',
    remoteBrowserDescription: '瀏覽遠端主機上的檔案和資料夾。',
    loadingRemotePaths: '正在載入遠端路徑...',
    noRemotePaths: '這裡沒有可用的檔案或資料夾。',
    parentFolder: '返回上層資料夾',
    useCurrentFolder: '使用目前資料夾',
    selectCurrentFolder: '選擇目前資料夾',
    startTransfer: '開始傳輸',
    transferDescription: '檔案傳輸使用系統 SFTP 客戶端。如果主機需要密碼，請先在連線中儲存密碼。',
    transferSuccess: '傳輸完成。',
    connectButtonLabel: '連線',
    sessionClosed: '會話已關閉。',
    importConnections: '匯入連線...',
    exportConnections: '匯出連線...',
    displayMode: '顯示模式',
    searchConnections: '搜尋連線',
    moreActions: '更多操作',
    noMatchingConnections: '沒有符合搜尋條件的連線。',
    compactMode: '緊湊',
    normalMode: '普通',
    groupCount: (count) => `${count}`,
    groupToggle: (collapsed, groupName) => `${collapsed ? '展開' : '摺疊'} ${groupName}`,
    importConnectionsSuccess: (imported, skipped, settingsApplied) =>
      `已匯入 ${imported} 個連線，跳過 ${skipped} 個重複連線${settingsApplied ? '，並恢復應用設定。' : '。'}`,
    exportConnectionsSuccess: '已匯出包含設定和連線的備份檔案。',
    importConnectionsFailed: '無法匯入所選備份檔案。',
    exportConnectionsFailed: '無法匯出連線備份檔案。',
    checkingForUpdates: '正在檢查 GitHub 上的最新版本...',
    updateAvailable: (latestVersion, currentVersion) =>
      `有可用更新：v${latestVersion} 高於目前版本 v${currentVersion}。`,
    updateUpToDate: (currentVersion) => `目前已是最新版本。當前版本：v${currentVersion}。`,
    downloadUpdate: (latestVersion) => `下載 v${latestVersion}`,
    updateCheckFailed: '檢查更新失敗。',
    sessionRecordingTitle: '會話錄製',
    sessionRecordingDescription: '以分塊加密的本地日誌記錄終端機會話，錄製密碼只保留在目前應用程式執行期間。',
    enableSessionRecording: '啟用會話錄製',
    sessionRecordingMode: '錄製模式',
    inputOnlyRecording: '僅輸入',
    fullSessionRecording: '完整會話錄製',
    sessionRecordingPassword: '加密密碼',
    confirmSessionRecordingPassword: '確認密碼',
    sessionRecordingPasswordHint: '密碼不會被永久儲存，重新啟動應用程式後需要再次輸入。',
    sessionRecordingPasswordLoaded: '目前應用程式執行期間已載入加密密碼。',
    sessionRecordingPasswordMissing: '目前尚未載入加密密碼，重新輸入後才能開始錄製。',
    sessionRecordingWarning: '完整會話錄製可能會擷取終端機輸出中的敏感資訊，包括金鑰與機密資料。',
    sessionRecordingStorage: '儲存策略',
    sessionRecordingMaxFileSize: '單一日誌檔案上限（MB）',
    sessionRecordingMaxTotalStorage: '總儲存上限（GB）',
    sessionRecordingRetentionDays: '保留天數',
    sessionRecordingLogDirectory: '日誌目錄',
    sessionRecordingCurrentUsage: '目前用量',
    sessionRecordingSaveSuccess: '已更新會話錄製設定。',
    recordingIndicator: '● 正在錄製',
    inputRecordingIndicator: '● 輸入錄製',
    sessionLogViewerTitle: '會話日誌',
    sessionLogViewerDescription: '開啟一個或多個加密的 .irlog 檔案，預覽內容並匯出為純文字。',
    selectSessionLogs: '選擇會話日誌',
    selectedSessionLogs: '已選取日誌',
    decryptSessionLogs: '解密預覽',
    exportSessionLogs: '匯出為 .txt',
    sessionLogsPreview: '預覽',
    sessionLogsPreviewTruncated: '預覽內容已截斷，請匯出日誌以儲存完整文字。',
    noSessionLogsSelected: '尚未選取任何會話日誌檔案。',
    sessionLogsExported: '已匯出解密後的會話日誌。',
    connectionHistoryTitle: '連線歷史與統計',
    connectionHistoryDescription: '檢視每個主機的近期連線明細、累計統計與簡要占比圖。',
    connectionHistorySearchHosts: '搜尋主機',
    connectionHistoryHostList: '主機清單',
    connectionHistoryNoHosts: '還沒有連線歷史。',
    connectionHistoryNoHostsDescription: '完成過的 SSH 會話會顯示在這裡。',
    connectionHistoryTotalConnections: '總連線次數',
    connectionHistoryTotalDuration: '總連線時長',
    connectionHistoryLatestConnection: '最近連線時間',
    connectionHistorySessions: '連線明細',
    connectionHistoryNoSessions: '目前篩選條件下沒有可顯示的明細紀錄。',
    connectionHistoryStartTime: '開始時間',
    connectionHistoryEndTime: '結束時間',
    connectionHistoryDuration: '時長',
    connectionHistoryCloseStatus: '關閉狀態',
    connectionHistoryStatusNormal: '正常結束',
    connectionHistoryStatusAbnormal: '異常中斷',
    connectionHistoryEstimated: '估算',
    connectionHistoryDeletedConnection: '已刪除主機',
    connectionHistoryRangeLast7Days: '最近 7 天',
    connectionHistoryRangeLast30Days: '最近 30 天',
    connectionHistoryRangeLast90Days: '最近 90 天',
    connectionHistoryRangeAllTime: '全部時間',
    connectionHistoryDurationShareChart: '不同主機連線時長占比',
    connectionHistoryCountShareChart: '不同主機連線次數占比',
    connectionHistoryDistributionChart: '目前主機連線時長分布',
    connectionHistoryChartEmpty: '目前篩選條件下沒有可顯示的圖表資料。',
    connectionHistoryBucketUnder5Minutes: '5 分鐘以內',
    connectionHistoryBucket5To30Minutes: '5 到 30 分鐘',
    connectionHistoryBucket30MinutesTo2Hours: '30 分鐘到 2 小時',
    connectionHistoryBucketOver2Hours: '2 小時以上',
    connectionHistoryOlderSessionsSummarized: (count) =>
      `另有 ${count} 筆更早的連線已彙總到統計與圖表中。`,
    durationDaysShort: '天',
    durationHoursShort: '小時',
    durationMinutesShort: '分',
    durationSecondsShort: '秒',
    validationRequired: '名稱、主機和使用者名稱為必填項。',
    validationPort: '連接埠必須是有效的 TCP 連接埠。',
    validationPasswordLength: '會話錄製密碼至少需要 8 個字元。',
    validationPasswordConfirm: '兩次輸入的會話錄製密碼不一致。',
    validationPositiveNumber: '錄製儲存參數必須是正整數。',
    saveFailed: '無法儲存連線。',
    terminalCopy: '複製',
    terminalPaste: '貼上',
    terminalSelectAll: '全選',
    statusLabel: (status) =>
      ({
        idle: '空閒',
        connecting: '連線中',
        connected: '已連線',
        disconnected: '已斷開',
        error: '錯誤',
      })[status],
    copyOf: (name) => `${name} 副本`,
    displayModeLabel: (mode) => (mode === 'compact' ? '緊湊' : '普通'),
  },
}

const localeDisplayNames: Record<Locale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
}

export const getTranslations = (locale: Locale) => dictionaries[locale]

export const getLocaleDisplayName = (locale: Locale) => localeDisplayNames[locale]
