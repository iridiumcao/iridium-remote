# Iridium Remote

[English](README.md) | [简体中文](README.zh-CN.md) | 繁體中文

Iridium Remote 是一個桌面 SSH 用戶端，將 **Windows**、**Ubuntu（Linux）** 和 **macOS** 視為同等的一線支援平台，使用 **Tauri**、**React** 與 **Rust** 建構。它將已儲存連線、分頁式終端工作區、可選的系統金鑰圈密碼儲存，以及 SFTP 檔案傳輸整合在同一個桌面應用程式中。

![](doc/img/Pl4DWWhxtF.png)

## 專案簡介

Iridium Remote 面向日常遠端維運與開發流程，重點提供：

- 儲存並整理 SSH 連線
- 透過分頁同時開啟多個終端工作階段
- 將密碼保存到系統金鑰圈，而不是 SQLite
- 在同一個應用程式中完成 SFTP 上傳與下載
- 持久化主題、語言、側邊欄版面等使用者偏好

現在將 **Windows**、**Ubuntu（Linux）** 和 **macOS** 視為同等的一線支援平台，並透過 GitHub Actions 為這三個平台發佈安裝建置產物。

## 功能總覽

| 模組 | 功能說明 |
| --- | --- |
| **連線管理** | 建立、編輯、複製、刪除、分組、搜尋、匯入、匯出 SSH 連線 |
| **終端工作階段** | 基於 PTY 的系統 `ssh`、多分頁並行工作階段、每個分頁獨立輸入輸出、切換分頁時不會注入異常輸入，並能辨識常見 shell 主題提示符以即時結束連線中狀態 |
| **連線互動體驗** | 可折疊分組、一般/緊湊側邊欄模式、緊湊模式右鍵操作選單、雙擊連線直接開啟新工作階段 |
| **驗證方式** | 可選系統金鑰圈密碼儲存、終端內原生密碼提示、Linux Secret Service 金鑰圈支援、支援系統 SSH 設定可用時的免互動金鑰驗證 |
| **檔案傳輸** | 上傳/下載檔案與目錄、本機檔案/資料夾選擇器、遠端 SFTP 路徑瀏覽器 |
| **偏好設定** | 明暗主題、英文 / 简体中文 / 繁體中文、持久化側邊欄狀態與顯示模式 |
| **穩定性** | 清楚的工作階段狀態提示、連線失敗立即回饋、關閉後的工作階段清理、單一實例桌面行為 |
| **資料安全** | 密碼絕不寫入 SQLite，也不會出現在匯出的備份檔中 |

## 詳細功能

### 連線庫

- 儲存 SSH 主機資訊：名稱、主機、連接埠、使用者名稱、可選分組
- 分組輸入欄位可重用既有分組，也允許自由輸入新分組
- 依連線名稱、主機、使用者名稱即時搜尋
- 支援連線分組折疊/展開
- 側邊欄支援一般模式與緊湊模式切換
- 支援匯入/匯出 JSON 備份，包含：
  - 應用程式設定
  - 已儲存連線中繼資料
  - **不包含** 已儲存密碼

### 終端工作區

- 同時開啟多個 SSH 工作階段
- 透過分頁切換不同工作階段
- 每個分頁保留各自的終端緩衝內容
- 雙擊連線列即可直接開啟新的工作階段分頁
- 終端區域提供本地化的複製 / 貼上 / 全選選單
- 當 OpenSSH 在啟動階段回傳錯誤時，`Connecting...` 會立即停止並顯示錯誤訊息
- 辨識常見 shell 提示符樣式，讓成功連線後的分頁能及時從 `Connecting` 切換為 `Connected`

### 驗證與安全

- 終端工作階段使用系統 OpenSSH `ssh`
- 密碼提示保留在終端內，不開啟自訂密碼對話框
- 可選擇將密碼儲存到系統金鑰圈
- 在 Linux / Ubuntu 建置中，已儲存密碼透過桌面 Secret Service 系統金鑰圈保存
- 支援已儲存密碼驗證，以及可用時的免互動 SSH 金鑰驗證

### 檔案傳輸

- 上傳檔案或目錄
- 下載檔案或目錄
- 使用原生對話框選擇本機路徑
- 透過內建 SFTP 遠端路徑選擇器瀏覽遠端檔案與目錄
- 重用已儲存的連線中繼資料與可用憑證

### 桌面體驗

- 全應用支援明亮 / 深色主題
- 桌面版透過 Settings 選單切換語言與主題，瀏覽器回退模式則在左側側邊欄提供會跟隨目前主題的應用內選擇器
- 左側連線清單捲軸會跟隨目前主題
- 支援英文、简体中文、繁體中文介面
- 重複啟動時優先聚焦現有視窗，維持單一實例行為
- 應用程式日誌寫入系統應用程式日誌目錄

## 架構概覽

| 層級 | 實作 |
| --- | --- |
| **前端** | React + TypeScript + Tailwind CSS + xterm.js |
| **桌面殼層** | Tauri |
| **後端** | Rust |
| **連線儲存** | SQLite |
| **憑證儲存** | 作業系統金鑰圈 |
| **終端傳輸** | 系統 OpenSSH `ssh` |
| **檔案傳輸** | `russh` + `russh-sftp` |

## 儲存庫文件導覽

| 路徑 | 說明 |
| --- | --- |
| `doc\requirement.md` | 產品需求與待辦範圍 |
| `doc\ui-design.md` | UI 結構與互動設計 |
| `doc\technical-design.md` | 執行架構與實作細節 |
| `doc\data-model.md` | 持久化模型與備份格式 |
| `doc\frontend-backend-contracts.md` | Tauri 命令與執行期事件約定 |
| `doc\development-setup.md` | 跨平台開發環境設定指南 |
| `doc\tutorial.md` | 程式碼庫導覽 |

## 開發

### 環境需求

- Node.js 與 npm
- Rust 工具鏈
- Tauri 桌面開發相依
- 任一受支援平台的桌面環境：Windows、macOS 或 Ubuntu

### 常用命令

| 工作 | 命令 |
| --- | --- |
| 安裝相依 | `npm install` |
| 僅執行前端 | `npm run dev` |
| 執行桌面開發版 | `npm run tauri -- dev` |
| 程式碼檢查 | `npm run lint` |
| 執行測試 | `npm run test` |
| 建置前端資源 | `npm run build` |
| 檢查 Rust 後端 | `cargo check --manifest-path src-tauri\Cargo.toml` |
| 建置桌面應用程式 | `npm run tauri -- build` |

## 發佈

- 跨平台發佈流程定義於 `.github\workflows\release.yml`。
- 推送像 `v0.1.3` 這樣的版本標籤會觸發 GitHub Actions 發佈流程。
- 發佈產物包括：
  - Windows：NSIS 安裝程式與 MSI 套件
  - macOS：Apple Silicon 與 Intel 的 app / DMG 建置產物
  - Ubuntu：`.deb` 與 `.AppImage`

## 說明

- **Windows**、**Ubuntu（Linux）** 和 **macOS** 現在都是同等的一線支援平台。
- 為了方便 UI 開發，瀏覽器模式下仍提供 mock 前端用戶端。
- Windows 下的偵錯建置可能會顯示主控台視窗；發佈建置會隱藏主控台視窗。
- 發佈安裝包可透過 `npm run tauri -- build` 產生。

## 授權

本專案採用 [Apache License 2.0](LICENSE) 授權。

<p align="center">
  <img src="doc/img/logo.png" alt="Iridium Remote logo" width="240" />
</p>