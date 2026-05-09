# Iridium Remote

[English](README.md) | 简体中文 | [繁體中文](README.zh-TW.md)

Iridium Remote 是一个以 **Windows 优先** 为目标的桌面 SSH 客户端，基于 **Tauri**、**React** 和 **Rust** 构建。它把已保存连接、标签式终端会话、可选的系统钥匙串密码存储，以及 SFTP 文件传输整合到同一个桌面应用中。

## 项目简介

Iridium Remote 面向日常远程运维与开发场景，重点提供：

- 保存并整理 SSH 连接
- 通过标签页同时打开多个终端会话
- 将密码保存在系统钥匙串，而不是 SQLite
- 在同一应用中完成 SFTP 文件上传和下载
- 持久化主题、语言、侧边栏布局等用户偏好

产品方向仍以 **Windows 优先** 为主，但现在会通过 GitHub Actions 发布 **Windows**、**macOS** 与 **Ubuntu** 的安装构建产物。

## 功能总览

| 模块 | 功能说明 |
| --- | --- |
| **连接管理** | 创建、编辑、复制、删除、分组、搜索、导入、导出 SSH 连接 |
| **终端会话** | 基于 PTY 的系统 `ssh`、多标签并发会话、每个标签独立输入输出、切换标签时不会注入异常输入，并能识别常见 shell 主题提示符以及时结束连接中状态 |
| **连接交互体验** | 可折叠分组、普通/紧凑侧边栏模式、紧凑模式右键操作菜单、双击连接直接打开新会话 |
| **认证方式** | 可选系统钥匙串密码保存、终端内原生密码提示、Linux Secret Service 钥匙串支持、支持系统 SSH 配置可用时的免交互密钥认证 |
| **文件传输** | 上传/下载文件与目录、本地文件/文件夹选择器、远程 SFTP 路径浏览器 |
| **偏好设置** | 明暗主题、英文 / 简体中文 / 繁體中文、持久化侧边栏状态与显示模式 |
| **稳定性** | 明确的会话状态提示、连接失败立即反馈、关闭后的会话清理、单实例桌面行为 |
| **数据安全** | 密码绝不会写入 SQLite，也不会进入导出的备份文件 |

## 详细功能

### 连接库

- 保存 SSH 主机信息：名称、主机、端口、用户名、可选分组
- 分组输入框可复用已有分组，也允许自由输入新分组
- 按连接名称、主机、用户名实时搜索
- 支持连接分组折叠/展开
- 侧边栏支持普通模式与紧凑模式切换
- 支持导入/导出 JSON 备份，包含：
  - 应用设置
  - 已保存连接元数据
  - **不包含** 已保存密码

### 终端工作区

- 同时打开多个 SSH 会话
- 通过标签页切换不同会话
- 每个标签保留各自的终端缓冲内容
- 双击连接行可直接打开一个新的会话标签
- 终端区域提供本地化的复制 / 粘贴 / 全选菜单
- 当 OpenSSH 在启动阶段返回错误时，`Connecting...` 会立即停止并显示错误信息
- 识别常见 shell 提示符样式，让成功连接后的标签及时从 `Connecting` 切换为 `Connected`

### 认证与安全

- 终端会话使用系统 OpenSSH `ssh`
- 密码提示保留在终端内，不弹出自定义密码对话框
- 可选择将密码保存到系统钥匙串
- 在 Linux / Ubuntu 构建中，已保存密码通过桌面 Secret Service 系统钥匙串存储
- 支持已保存密码认证，以及可用时的免交互 SSH 密钥认证

### 文件传输

- 上传文件或目录
- 下载文件或目录
- 使用原生对话框选择本地路径
- 通过内置 SFTP 远程路径选择器浏览远程文件和目录
- 复用已保存的连接元数据与可用凭据

### 桌面体验

- 全应用支持明亮 / 深色主题
- 桌面版通过 Settings 菜单切换语言和主题，浏览器回退模式则在左侧边栏提供跟随当前主题的应用内选择器
- 左侧连接列表滚动条会跟随当前主题
- 支持英文、简体中文、繁體中文界面
- 重复启动时优先聚焦现有窗口，保持单实例行为
- 应用日志写入系统应用日志目录

## 架构概览

| 层级 | 实现 |
| --- | --- |
| **前端** | React + TypeScript + Tailwind CSS + xterm.js |
| **桌面壳层** | Tauri |
| **后端** | Rust |
| **连接存储** | SQLite |
| **凭据存储** | 操作系统钥匙串 |
| **终端传输** | 系统 OpenSSH `ssh` |
| **文件传输** | `russh` + `russh-sftp` |

## 仓库文档导览

| 路径 | 说明 |
| --- | --- |
| `doc\requirement.md` | 产品需求与待办范围 |
| `doc\ui-design.md` | UI 结构与交互设计 |
| `doc\technical-design.md` | 运行架构与实现细节 |
| `doc\data-model.md` | 持久化模型与备份格式 |
| `doc\frontend-backend-contracts.md` | Tauri 命令与运行时事件约定 |
| `doc\development-setup.md` | 跨平台开发环境搭建指南 |
| `doc\tutorial.md` | 代码库导览 |

## 开发

### 环境要求

- Node.js 与 npm
- Rust 工具链
- Tauri 桌面开发依赖
- 以 Windows 桌面环境为主的开发/运行场景

### 常用命令

| 任务 | 命令 |
| --- | --- |
| 安装依赖 | `npm install` |
| 仅运行前端 | `npm run dev` |
| 运行桌面开发版 | `npm run tauri -- dev` |
| 代码检查 | `npm run lint` |
| 运行测试 | `npm run test` |
| 构建前端资源 | `npm run build` |
| 检查 Rust 后端 | `cargo check --manifest-path src-tauri\Cargo.toml` |
| 构建桌面应用 | `npm run tauri -- build` |

## 发布

- 跨平台发布流程定义在 `.github\workflows\release.yml`。
- 推送类似 `v0.1.2` 的版本标签会触发 GitHub Actions 发布流水线。
- 发布产物包括：
  - Windows：NSIS 安装包与 MSI 安装包
  - macOS：Apple Silicon 与 Intel 的 app / DMG 安装产物
  - Ubuntu：`.deb` 与 `.AppImage`

## 说明

- 当前产品重点仍是 **Windows 优先**，只是发布构建已经覆盖 Windows、macOS 与 Ubuntu。
- 为了便于 UI 开发，浏览器模式下仍提供 mock 前端客户端。
- Windows 下的调试构建可能会显示控制台窗口；发布构建会隐藏控制台窗口。
- 发布安装包可通过 `npm run tauri -- build` 生成。

## 许可证

本项目基于 [Apache License 2.0](LICENSE) 发布。
