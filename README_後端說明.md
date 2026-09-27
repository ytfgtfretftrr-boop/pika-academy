# ⚡ 皮卡學院 (Pika Academy) 官方網站 - 後端伺服器使用說明

歡迎來到 **皮卡學院** 官方網站後端系統！本後端採用 **Python 3 原生標準庫**（`http.server` + `sqlite3` + `json`）打造，**完全無需安裝任何第三方套件 (不需要 pip / npm)**，開箱即用！

---

## 📁 檔案架構說明

```text
皮卡學院官方網站/
├── index.html            # 官方網站前台介面 (串接 YouTube API / OAuth / 後端 API)
├── server.py             # 本地 Python 後端伺服器 (提供 RESTful API & 靜態網頁託管)
├── pika_academy.db       # SQLite 資料庫 (儲存提問、按讚數、回覆)
├── 啟動後端伺服器.bat     # 一鍵啟動腳本 (點擊即可啟動)
├── functions/            # Cloudflare Pages 雲端 Serverless 後端
│   └── api/
│       └── questions.js  # 雲端無伺服器 API 路由
└── README_後端說明.md    # 本說明文件
```

---

## 🚀 方式一：本地運行 (電腦端直接執行)

### 1. 啟動伺服器
- **最簡單方式**：直接雙擊資料夾內的 **`啟動後端伺服器.bat`** 即可！
- 或在終端機中輸入：
  ```bash
  python server.py
  ```

### 2. 開啟網站
- 瀏覽器開啟：[http://localhost:5000](http://localhost:5000)
- 進入「觀眾問答互動專區」，上方會顯示綠色燈號：`● 後端資料庫已連線 (即時同步)`。
- 所有留言、點讚、站長回覆都會**永久保存於 `pika_academy.db` 資料庫**中！

---

## ☁️ 方式二：部署到自己的網域 (Cloudflare Pages 免費雲端後端)

如果你想讓世界各地的觀眾隨時在線上連到你的專屬網域：

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 點擊左側 **「Workers 與 Pages」** ➜ **「建立」** ➜ **「Pages」** ➜ **「上傳資產」**。
3. 專案名稱輸入 `pika-academy`（或自訂）。
4. 將整個 **`皮卡學院官方網站`** 資料夾直接拖曳上傳！
5. 上傳完成後，Cloudflare 會自動將 `index.html` 作為前端，並自動將 `functions/api/questions.js` 作為雲端 Serverless 後端 API！
6. 進入專案設定，綁定你自己的自訂網域即可大功告成！

---

## 🛠️ API 端點規格清單

| 方法 | 端點路徑 | 說明 |
| :--- | :--- | :--- |
| `GET` | `/api/health` | 後端健康狀態檢查 |
| `GET` | `/api/questions` | 獲取所有觀眾提問清單 |
| `POST` | `/api/questions` | 發布新的觀眾提問 |
| `POST` | `/api/questions/:id/like` | 對指定問題按讚 (+1) |
| `POST` | `/api/questions/:id/reply` | 皮卡站長在線解答問題 |
| `DELETE` | `/api/questions/:id` | 刪除指定問題 (管理員功能) |
