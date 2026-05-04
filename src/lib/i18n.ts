import type { Locale, SessionStatus } from './types'

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
  darkTheme: string
  lightTheme: string
  menuFile: string
  menuHelp: string
  menuAbout: string
  menuNewConnection: string
  aboutTitle: string
  aboutDescription: string
  versionLabel: string
  multiSessionDescription: string
  fileTransfer: string
  upload: string
  download: string
  localPath: string
  remotePath: string
  startTransfer: string
  transferDescription: string
  transferSuccess: string
  connectButtonLabel: string
  sessionClosed: string
  validationRequired: string
  validationPort: string
  saveFailed: string
  statusLabel: (status: SessionStatus) => string
  copyOf: (name: string) => string
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
    simplifiedChinese: 'Simplified Chinese',
    darkTheme: 'Dark',
    lightTheme: 'Light',
    menuFile: 'File',
    menuHelp: 'Help',
    menuAbout: 'About',
    menuNewConnection: 'New Connection',
    aboutTitle: 'About Iridium Remote',
    aboutDescription:
      'Iridium Remote is a Windows-first desktop SSH client built with Tauri, React, and Rust.',
    versionLabel: 'Version',
    multiSessionDescription: 'Open and manage multiple terminal sessions with tabs.',
    fileTransfer: 'File Transfer',
    upload: 'Upload',
    download: 'Download',
    localPath: 'Local path',
    remotePath: 'Remote path',
    startTransfer: 'Start Transfer',
    transferDescription:
      'Transfers use the system SFTP client. Save a password on the connection if the host requires one.',
    transferSuccess: 'Transfer completed.',
    connectButtonLabel: 'Connect',
    sessionClosed: 'Session closed.',
    validationRequired: 'Name, host, and username are required.',
    validationPort: 'Port must be a valid TCP port.',
    saveFailed: 'Unable to save the connection.',
    statusLabel: (status) =>
      ({
        idle: 'Idle',
        connecting: 'Connecting',
        connected: 'Connected',
        disconnected: 'Disconnected',
        error: 'Error',
      })[status],
    copyOf: (name) => `Copy of ${name}`,
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
    english: '英文',
    simplifiedChinese: '简体中文',
    darkTheme: '深色',
    lightTheme: '浅色',
    menuFile: '文件',
    menuHelp: '帮助',
    menuAbout: '关于',
    menuNewConnection: '新建连接',
    aboutTitle: '关于 Iridium Remote',
    aboutDescription: 'Iridium Remote 是一个基于 Tauri、React 和 Rust 的桌面 SSH 客户端。',
    versionLabel: '版本',
    multiSessionDescription: '使用标签页同时打开和管理多个终端会话。',
    fileTransfer: '文件传输',
    upload: '上传',
    download: '下载',
    localPath: '本地路径',
    remotePath: '远程路径',
    startTransfer: '开始传输',
    transferDescription: '文件传输使用系统 SFTP 客户端。如果主机需要密码，请先在连接中保存密码。',
    transferSuccess: '传输完成。',
    connectButtonLabel: '连接',
    sessionClosed: '会话已关闭。',
    validationRequired: '名称、主机和用户名为必填项。',
    validationPort: '端口必须是有效的 TCP 端口。',
    saveFailed: '无法保存连接。',
    statusLabel: (status) =>
      ({
        idle: '空闲',
        connecting: '连接中',
        connected: '已连接',
        disconnected: '已断开',
        error: '错误',
      })[status],
    copyOf: (name) => `${name} 副本`,
  },
}

export const getTranslations = (locale: Locale) => dictionaries[locale]
