#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
皮卡學院 (Pika Academy) - 官方後端伺服器
採用 Python 原生標準庫 (http.server + sqlite3 + json)，零依賴安裝，即開即用！
提供完整 RESTful API：觀眾問題持久化、按讚計數、站長在線回覆與即時資料庫同步。
"""

import http.server
import socketserver
import sqlite3
import json
import os
import sys
import re
import hashlib
import random
import urllib.parse
import urllib.request
import base64
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import Header
from datetime import datetime, timedelta

def hash_password(password: str, salt: str) -> str:
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    return hash_password(password, salt) == expected_hash

# 確保在 Windows 控制台 (cmd/powershell) 下不會因 cp950 編碼錯誤而崩潰
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

PORT = int(os.environ.get("PORT", 5000))
DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pika_academy.db")
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))
ADMIN_EMAIL = "ytfgtfretftrr@gmail.com"

# 嚴禁不實流言黑名單關鍵字
RUMOR_BLACKLIST = [
    "造謠", "抹黑", "誹謗", "不實消息", "假消息", "黑幕", "外流",
    "詐騙", "騙子", "私下收錢", "盜版", "盜用", "被抓", "倒閉",
    "被封殺", "假帳號", "內幕爆料"
]

def contains_rumor_content(text):
    if not text:
        return None
    lower = text.lower()
    for kw in RUMOR_BLACKLIST:
        if kw in lower:
            return kw
    return None

# ==========================================
# 1. 資料庫初始化 (SQLite)
# ==========================================
def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS questions (
            id TEXT PRIMARY KEY,
            author TEXT NOT NULL,
            category TEXT NOT NULL,
            content TEXT NOT NULL,
            date TEXT NOT NULL,
            likes INTEGER DEFAULT 0,
            status TEXT DEFAULT '待皮卡解答',
            reply TEXT DEFAULT '',
            avatar TEXT,
            is_verified INTEGER DEFAULT 0,
            is_approved INTEGER DEFAULT 1,
            report_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 確保現有資料表具備 is_approved 與 report_count
    cursor.execute("PRAGMA table_info(questions)")
    existing_cols = [c[1] for c in cursor.fetchall()]
    if 'is_approved' not in existing_cols:
        cursor.execute("ALTER TABLE questions ADD COLUMN is_approved INTEGER DEFAULT 1")
    if 'report_count' not in existing_cols:
        cursor.execute("ALTER TABLE questions ADD COLUMN report_count INTEGER DEFAULT 0")

    # 全域系統設定表 (如先審後發模式)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS site_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')
    cursor.execute("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('moderation_mode', '0')")

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS site_content (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS site_layout (
            page TEXT PRIMARY KEY,
            blocks TEXT NOT NULL,
            modal TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS site_announcement (
            id TEXT PRIMARY KEY,
            enabled INTEGER NOT NULL DEFAULT 1,
            mode TEXT NOT NULL DEFAULT 'always',
            start_time TEXT,
            end_time TEXT,
            delay_seconds INTEGER DEFAULT 0,
            text TEXT NOT NULL,
            link TEXT,
            theme TEXT DEFAULT 'yellow',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute("SELECT COUNT(*) FROM site_announcement WHERE id = 'global'")
    if cursor.fetchone()[0] == 0:
        cursor.execute('''
            INSERT INTO site_announcement (id, enabled, mode, start_time, end_time, delay_seconds, text, link, theme)
            VALUES ('global', 1, 'always', '', '', 0, '⚡ 歡迎來到皮卡學院官方網站！每週定期更新 Scratch 教學與精選遊戲實況～', '', 'yellow')
        ''')

    # 確保清除任何非真實的示範假留言 (q-1, q-2, q-3)，維護言論真實性
    cursor.execute("DELETE FROM questions WHERE id IN ('q-1', 'q-2', 'q-3')")

    # 會員資料庫資料表 (支援帳號註冊與站長後台檢視)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            role TEXT DEFAULT 'member',
            avatar TEXT,
            status TEXT DEFAULT 'active',
            birthday TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            address TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 確保現有 users 資料表具備 birthday, phone, address
    cursor.execute("PRAGMA table_info(users)")
    existing_user_cols = [c[1] for c in cursor.fetchall()]
    if 'birthday' not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN birthday TEXT DEFAULT ''")
    if 'phone' not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''")
    if 'address' not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN address TEXT DEFAULT ''")
    if 'google_id' not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN google_id TEXT DEFAULT ''")
    if 'discord_user' not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN discord_user TEXT DEFAULT ''")
    if 'scratch_user' not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN scratch_user TEXT DEFAULT ''")
    if 'youtube_user' not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN youtube_user TEXT DEFAULT ''")
    if 'github_user' not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN github_user TEXT DEFAULT ''")

    # 會員每次登入歷史紀錄資料表 (每次登入時間、IP、裝置)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_logins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            email TEXT NOT NULL,
            login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ip TEXT DEFAULT '',
            user_agent TEXT DEFAULT ''
        )
    ''')

    # 信箱註冊驗證碼資料表 (驗證碼、過期時間、是否已使用)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS email_verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            is_used INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 即時社群聊天與私密悄悄話資料表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            sender_name TEXT NOT NULL,
            sender_email TEXT DEFAULT '',
            sender_avatar TEXT DEFAULT '',
            content TEXT NOT NULL,
            is_private INTEGER DEFAULT 0,
            recipient_email TEXT DEFAULT '',
            reply TEXT DEFAULT '',
            reply_time TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chat_private_time ON chat_messages (is_private, created_at DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chat_sender ON chat_messages (sender_email)")

    # 寫入預設官方聊天室歡迎詞 (若無任何訊息時)
    cursor.execute("SELECT COUNT(*) FROM chat_messages")
    if cursor.fetchone()[0] == 0:
        cursor.execute('''
            INSERT INTO chat_messages (id, sender_name, sender_email, sender_avatar, content, is_private, recipient_email, reply, created_at)
            VALUES ('msg-welcome-01', '皮卡站長 ⚡', ?, 'https://yt3.ggpht.com/c7-XOamMdC1EGpIV18j6_czYvrmdw1B1BJQtUfnKB61qxkwxbm9A80yw4JJZnhfC-WowWsGtng=s800-c-k-c0x00ffffff-no-rj',
                    '⚡ 歡迎來到皮卡學院即時聊天室！大家可以在這裡暢聊遊戲、程式創作～如果有不想公開的私事或建議，也可以勾選「🔒 私密悄悄話」，全站就只有我和你看得到喔！', 0, '', '', CURRENT_TIMESTAMP)
        ''', (ADMIN_EMAIL,))

    # 系統設定資料表 (如 SMTP 發信伺服器設定)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS site_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 預設郵件發信配置 (支援 Google OAuth 2.0 與傳統 SMTP 模式)
    default_mail_settings = {
        "mail_mode": "oauth",  # 'oauth' 或 'smtp'
        "oauth_client_id": "",
        "oauth_client_secret": "",
        "oauth_refresh_token": "",
        "oauth_access_token": "",
        "oauth_token_expires_at": "",
        "oauth_authorized_email": "",
        "oauth_status": "disconnected",
        "smtp_enabled": "0",
        "smtp_host": "smtp.gmail.com",
        "smtp_port": "465",
        "smtp_security": "ssl",
        "smtp_user": ADMIN_EMAIL,
        "smtp_pass": "",
        "smtp_sender_name": "皮卡學院官方網站"
    }
    for k, v in default_mail_settings.items():
        cursor.execute("SELECT COUNT(*) FROM site_settings WHERE key = ?", (k,))
        if cursor.fetchone()[0] == 0:
            cursor.execute("INSERT INTO site_settings (key, value) VALUES (?, ?)", (k, v))

    # 確保站長官方管理員帳號已建置
    cursor.execute("SELECT COUNT(*) FROM users WHERE email = ?", (ADMIN_EMAIL,))
    if cursor.fetchone()[0] == 0:
        admin_salt = os.urandom(16).hex()
        admin_hash = hash_password("admin123", admin_salt)
        cursor.execute('''
            INSERT INTO users (id, username, email, password_hash, salt, role, avatar, status, birthday, phone, address)
            VALUES (?, ?, ?, ?, ?, 'admin', ?, 'active', '', '', '')
        ''', ('u-admin', '皮卡站長 (官方)', ADMIN_EMAIL, admin_hash, admin_salt,
              'https://yt3.ggpht.com/c7-XOamMdC1EGpIV18j6_czYvrmdw1B1BJQtUfnKB61qxkwxbm9A80yw4JJZnhfC-WowWsGtng=s800-c-k-c0x00ffffff-no-rj'))

    conn.commit()
    conn.close()

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

# ==========================================
# 郵件發送輔助模組 (Google OAuth 2.0 Gmail API + 傳統 SMTP)
# ==========================================
def get_mail_config():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM site_settings WHERE key LIKE 'smtp_%' OR key LIKE 'oauth_%' OR key = 'mail_mode'")
    rows = cursor.fetchall()
    conn.close()
    config = {
        "mail_mode": "oauth",
        "oauth_client_id": "",
        "oauth_client_secret": "",
        "oauth_refresh_token": "",
        "oauth_access_token": "",
        "oauth_token_expires_at": "",
        "oauth_authorized_email": "",
        "oauth_status": "disconnected",
        "smtp_enabled": "0",
        "smtp_host": "smtp.gmail.com",
        "smtp_port": "465",
        "smtp_security": "ssl",
        "smtp_user": ADMIN_EMAIL,
        "smtp_pass": "",
        "smtp_sender_name": "皮卡學院官方網站"
    }
    for r in rows:
        config[r["key"]] = r["value"]
    return config

def get_smtp_config():
    return get_mail_config()

def build_google_oauth_url(client_id: str, redirect_uri: str, state: str = "", scope: str = None) -> str:
    if not scope:
        if state in ("pika_oauth", "admin_mail"):
            scope = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email"
        else:
            scope = "openid email profile"
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope,
        "access_type": "offline" if "gmail" in scope else "online",
        "prompt": "consent",
        "state": state
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)

def fetch_google_user_profile(code: str, redirect_uri: str) -> tuple:
    config = get_mail_config()
    client_id = config.get("oauth_client_id", "").strip()
    client_secret = config.get("oauth_client_secret", "").strip()

    if not client_id or not client_secret:
        return False, "尚未在後台設定 Google OAuth Client ID 或 Client Secret！"

    token_url = "https://oauth2.googleapis.com/token"
    post_data = urllib.parse.urlencode({
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }).encode("utf-8")

    req = urllib.request.Request(token_url, data=post_data, headers={
        "Content-Type": "application/x-www-form-urlencoded"
    })

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_text = e.read().decode("utf-8", errors="ignore")
        return False, f"Google 換取 Token 失敗 ({e.code}): {err_text}"
    except Exception as e:
        return False, f"連線至 Google 伺服器失敗: {str(e)}"

    access_token = resp_data.get("access_token", "")
    if not access_token:
        return False, "Google 回應中無有效 access_token"

    try:
        userinfo_req = urllib.request.Request(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        with urllib.request.urlopen(userinfo_req, timeout=10) as u_resp:
            user_data = json.loads(u_resp.read().decode("utf-8"))
            return True, user_data
    except Exception as e:
        return False, f"取得 Google 使用者個人資料失敗: {str(e)}"

def exchange_oauth_code(code: str, redirect_uri: str) -> tuple:
    config = get_mail_config()
    client_id = config.get("oauth_client_id", "").strip()
    client_secret = config.get("oauth_client_secret", "").strip()

    if not client_id or not client_secret:
        return False, "尚未在後台設定 Google OAuth Client ID 或 Client Secret！"

    token_url = "https://oauth2.googleapis.com/token"
    post_data = urllib.parse.urlencode({
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }).encode("utf-8")

    req = urllib.request.Request(token_url, data=post_data, headers={
        "Content-Type": "application/x-www-form-urlencoded"
    })

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_text = e.read().decode("utf-8", errors="ignore")
        return False, f"Google 授權換取 Token 失敗 ({e.code}): {err_text}"
    except Exception as e:
        return False, f"連線至 Google 授權伺服器失敗: {str(e)}"

    access_token = resp_data.get("access_token", "")
    refresh_token = resp_data.get("refresh_token", "")
    expires_in = int(resp_data.get("expires_in", 3600))
    expires_at = (datetime.now() + timedelta(seconds=expires_in - 60)).isoformat()

    # 取得已授權使用者的 Google 信箱
    authorized_email = ""
    try:
        userinfo_req = urllib.request.Request(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        with urllib.request.urlopen(userinfo_req, timeout=10) as u_resp:
            user_data = json.loads(u_resp.read().decode("utf-8"))
            authorized_email = user_data.get("email", "")
    except Exception as e:
        print(f"[!] 取得 Google 使用者信箱失敗: {e}")
        authorized_email = ADMIN_EMAIL

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('oauth_access_token', ?)", (access_token,))
    if refresh_token:
        cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('oauth_refresh_token', ?)", (refresh_token,))
    cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('oauth_token_expires_at', ?)", (expires_at,))
    cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('oauth_authorized_email', ?)", (authorized_email,))
    cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('oauth_status', 'connected')")
    cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('mail_mode', 'oauth')")
    conn.commit()
    conn.close()

    return True, authorized_email or "授權成功"

def get_valid_oauth_access_token() -> tuple:
    config = get_mail_config()
    client_id = config.get("oauth_client_id", "").strip()
    client_secret = config.get("oauth_client_secret", "").strip()
    refresh_token = config.get("oauth_refresh_token", "").strip()
    access_token = config.get("oauth_access_token", "").strip()
    expires_at_str = config.get("oauth_token_expires_at", "").strip()

    if not refresh_token:
        return None, "Google OAuth 2.0 尚未授權發信（缺少 refresh_token），請先於後台點擊授權！"

    is_expired = True
    if access_token and expires_at_str:
        try:
            expires_at = datetime.fromisoformat(expires_at_str)
            if datetime.now() < expires_at:
                is_expired = False
        except Exception:
            is_expired = True

    if not is_expired and access_token:
        return access_token, None

    # 若 Token 已過期或不存在，透過 refresh_token 刷新 access_token
    if not client_id or not client_secret:
        return None, "未設定 Client ID 或 Client Secret，無法重新整理 Token"

    token_url = "https://oauth2.googleapis.com/token"
    post_data = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token"
    }).encode("utf-8")

    req = urllib.request.Request(token_url, data=post_data, headers={
        "Content-Type": "application/x-www-form-urlencoded"
    })

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_text = e.read().decode("utf-8", errors="ignore")
        return None, f"Google Token 刷新失敗 ({e.code}): {err_text}"
    except Exception as e:
        return None, f"連線至 Google 刷新 Token 失敗: {str(e)}"

    new_access_token = resp_data.get("access_token", "")
    expires_in = int(resp_data.get("expires_in", 3600))
    new_expires_at = (datetime.now() + timedelta(seconds=expires_in - 60)).isoformat()

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('oauth_access_token', ?)", (new_access_token,))
    cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('oauth_token_expires_at', ?)", (new_expires_at,))
    if resp_data.get("refresh_token"):
        cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('oauth_refresh_token', ?)", (resp_data["refresh_token"],))
    conn.commit()
    conn.close()

    return new_access_token, None

def send_gmail_api_email(to_email: str, subject: str, html_content: str, text_content: str = None) -> tuple:
    access_token, err = get_valid_oauth_access_token()
    if not access_token:
        return False, err

    config = get_mail_config()
    sender_name = config.get("smtp_sender_name", "皮卡學院官方網站").strip()
    sender_email = config.get("oauth_authorized_email", "").strip() or ADMIN_EMAIL

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = Header(subject, "utf-8")
        msg["From"] = f"{Header(sender_name, 'utf-8').encode()} <{sender_email}>"
        msg["To"] = to_email

        if not text_content:
            text_content = f"{subject}\n\n請在皮卡學院頁面輸入您的驗證碼。\n若此信件非您本人觸發，請直接忽略。"

        part1 = MIMEText(text_content, "plain", "utf-8")
        part2 = MIMEText(html_content, "html", "utf-8")
        msg.attach(part1)
        msg.attach(part2)

        raw_base64 = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
        send_url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
        payload = json.dumps({"raw": raw_base64}).encode("utf-8")

        req = urllib.request.Request(
            send_url,
            data=payload,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
        )

        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_body = json.loads(resp.read().decode("utf-8"))
            msg_id = resp_body.get("id", "")
            return True, f"郵件已透過 Google OAuth 2.0 (Gmail API) 成功寄送！(Message ID: {msg_id})"

    except urllib.error.HTTPError as e:
        err_text = e.read().decode("utf-8", errors="ignore")
        print(f"[!] Gmail API 發信失敗 ({e.code}): {err_text}")
        return False, f"Gmail API 發信失敗 ({e.code}): {err_text}"
    except Exception as e:
        print(f"[!] Gmail API 發信異常: {e}")
        return False, f"Gmail API 連線發信異常: {str(e)}"

def generate_verification_email_html(code: str, target_email: str, minutes: int = 10) -> str:
    return f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>皮卡學院 - 會員註冊安全驗證碼</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background: #111827; border: 1px solid #1f2937; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <!-- 頂部品牌 Header -->
          <tr>
            <td style="padding: 28px 32px; background: linear-gradient(135deg, #1f2937 0%, #111827 100%); border-bottom: 2px solid #facc15; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #facc15; letter-spacing: 1px;">
                ⚡ 皮卡學院 Pika Academy
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #9ca3af;">
                官方會員帳號安全驗證系統
              </p>
            </td>
          </tr>

          <!-- 郵件正文 -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #f3f4f6;">
                親愛的學員 您好：
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #9ca3af;">
                感謝您註冊加入「皮卡學院官方網站」！為了確保您的帳號安全與信箱所有權，請在註冊頁面輸入以下 <strong style="color: #facc15;">6 位數安全驗證碼</strong>：
              </p>

              <!-- 驗證碼高亮展示區塊 -->
              <div style="text-align: center; margin: 28px 0; padding: 24px; background: #030712; border: 1px dashed #eab308; border-radius: 12px;">
                <span style="display: block; font-size: 12px; color: #a1a1aa; margin-bottom: 8px; letter-spacing: 1px;">您的專屬安全驗證碼</span>
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 900; color: #facc15; letter-spacing: 8px;">
                  {code}
                </span>
                <span style="display: block; font-size: 12px; color: #f59e0b; margin-top: 10px;">
                  ⏳ 請於 {minutes} 分鐘內完成驗證，逾期將失效
                </span>
              </div>

              <div style="background: rgba(30, 41, 59, 0.6); border-left: 3px solid #facc15; padding: 12px 16px; border-radius: 4px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 12px; color: #cbd5e1; line-height: 1.6;">
                  🔒 <strong>安全提示</strong>：皮卡學院官方絕對不會主動向您索取此驗證碼或登入密碼。若非您本人申請註冊，請忽略此信件，您的資料不會受到任何影響。
                </p>
              </div>

              <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.6;">
                祝 學習愉快！<br>
                <strong>皮卡學院教學團隊 敬上</strong>
              </p>
            </td>
          </tr>

          <!-- 頁尾 Footer -->
          <tr>
            <td style="padding: 20px 32px; background: #030712; border-top: 1px solid #1f2937; text-align: center; font-size: 11px; color: #6b7280; line-height: 1.5;">
              此為系統自動發送之通知信件，請勿直接回覆本郵件。<br>
              © 2026 皮卡學院 Pika Academy. All Rights Reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

def send_smtp_email(to_email: str, subject: str, html_content: str, text_content: str = None) -> tuple:
    config = get_smtp_config()
    if config.get("smtp_enabled") != "1":
        return False, "SMTP 發信功能尚未啟用（處於本機模擬模式）"

    smtp_host = config.get("smtp_host", "").strip()
    try:
        smtp_port = int(config.get("smtp_port", 465))
    except Exception:
        smtp_port = 465
    smtp_user = config.get("smtp_user", "").strip()
    smtp_pass = config.get("smtp_pass", "").strip()
    smtp_security = config.get("smtp_security", "ssl").strip().lower()
    sender_name = config.get("smtp_sender_name", "皮卡學院官方網站").strip()

    if not smtp_host or not smtp_user or not smtp_pass:
        return False, "SMTP 發信伺服器、帳號或應用程式密碼尚未填寫完整"

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = Header(subject, "utf-8")
        msg["From"] = f"{Header(sender_name, 'utf-8').encode()} <{smtp_user}>"
        msg["To"] = to_email

        if not text_content:
            text_content = f"{subject}\n\n請在皮卡學院註冊頁面輸入您的驗證碼。\n若此信件非您本人觸發，請直接忽略。"

        part1 = MIMEText(text_content, "plain", "utf-8")
        part2 = MIMEText(html_content, "html", "utf-8")
        msg.attach(part1)
        msg.attach(part2)

        if smtp_security == "ssl" or smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
            server.ehlo()
            server.starttls()
            server.ehlo()

        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_user, [to_email], msg.as_string())
        server.quit()
        return True, "郵件已透過傳統 SMTP 成功寄送！"
    except Exception as e:
        err_msg = str(e)
        print(f"[!] SMTP 發信異常 ({to_email}): {err_msg}")
        return False, f"發信失敗: {err_msg}"

def send_system_email(to_email: str, subject: str, html_content: str, text_content: str = None) -> tuple:
    """
    皮卡學院官方統一郵件發送器
    依照 site_settings 設定之 mail_mode ('oauth' 或 'smtp') 自動分派發送管道。
    若未設定或未授權，則平滑回退為本機模擬模式。
    """
    config = get_mail_config()
    mode = config.get("mail_mode", "oauth")

    if mode == "oauth":
        refresh_token = config.get("oauth_refresh_token", "").strip()
        if not refresh_token:
            return False, "Google OAuth 2.0 尚未授權發信（處於本機模擬模式）"
        return send_gmail_api_email(to_email, subject, html_content, text_content)
    elif mode == "smtp":
        if config.get("smtp_enabled") != "1":
            return False, "SMTP 發信功能尚未啟用（處於本機模擬模式）"
        return send_smtp_email(to_email, subject, html_content, text_content)
    else:
        return False, "系統郵件發信模式未啟用（處於本機模擬模式）"

# ==========================================
# 2. HTTP 請求處理器 (RESTful API + 靜態網頁)
# ==========================================
class PikaBackendHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _set_cors_headers(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.end_headers()

    def do_OPTIONS(self):
        # 處理 CORS 預檢請求
        self._set_cors_headers(204)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # API: 健康檢查
        if path == "/api/health":
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "status": "ok",
                "service": "Pika Academy Backend",
                "time": datetime.now().isoformat()
            }).encode('utf-8'))
            return

        # API: 取得觀眾問題列表 (過濾未審核的不實流言)
        if path == "/api/questions":
            query = urllib.parse.parse_qs(parsed.query)
            include_pending = query.get("include_pending", ["0"])[0] == "1"

            conn = get_db()
            cursor = conn.cursor()
            if include_pending:
                cursor.execute("SELECT * FROM questions ORDER BY created_at DESC")
            else:
                cursor.execute("SELECT * FROM questions WHERE is_approved = 1 ORDER BY created_at DESC")
            rows = cursor.fetchall()
            questions = []
            for r in rows:
                questions.append({
                    "id": r["id"],
                    "author": r["author"],
                    "category": r["category"],
                    "content": r["content"],
                    "date": r["date"],
                    "likes": r["likes"],
                    "status": r["status"],
                    "reply": r["reply"] or "",
                    "avatar": r["avatar"],
                    "isGoogleVerified": bool(r["is_verified"]),
                    "isApproved": bool(r["is_approved"] if "is_approved" in r.keys() else 1),
                    "reportCount": int(r["report_count"] if "report_count" in r.keys() else 0)
                })

            cursor.execute("SELECT value FROM site_settings WHERE key = 'moderation_mode'")
            row_mod = cursor.fetchone()
            moderation_mode = bool(int(row_mod[0])) if row_mod else False
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "questions": questions,
                "moderationMode": moderation_mode
            }).encode('utf-8'))
            return

        # API: 站長取得所有註冊會員清單與資料
        if path == "/api/admin/users":
            query = urllib.parse.parse_qs(parsed.query)
            admin_email = query.get("adminEmail", [""])[0]
            if admin_email.lower() != ADMIN_EMAIL.lower():
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "無管理者權限，僅皮卡站長可檢視全站會員資料！"}).encode('utf-8'))
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''
                SELECT u.id, u.username, u.email, u.role, u.avatar, u.status, u.birthday, u.phone, u.address,
                       u.created_at, u.last_login,
                       COUNT(DISTINCT q.id) as question_count,
                       COUNT(DISTINCT ul.id) as login_count
                FROM users u
                LEFT JOIN questions q ON (q.author = u.username OR q.author = u.email)
                LEFT JOIN user_logins ul ON (ul.user_id = u.id OR ul.email = u.email)
                GROUP BY u.id
                ORDER BY u.created_at DESC
            ''')
            rows = cursor.fetchall()
            users = []
            for r in rows:
                users.append({
                    "id": r["id"],
                    "username": r["username"],
                    "email": r["email"],
                    "role": r["role"],
                    "avatar": r["avatar"] or "",
                    "status": r["status"] or "active",
                    "birthday": r["birthday"] or "",
                    "phone": r["phone"] or "",
                    "address": r["address"] or "",
                    "createdAt": r["created_at"],
                    "lastLogin": r["last_login"],
                    "questionCount": r["question_count"],
                    "loginCount": r["login_count"]
                })
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "users": users,
                "total": len(users)
            }).encode('utf-8'))
            return

        # API: 站長查看特定會員的所有登入歷史時間紀錄 /api/admin/users/<id>/logins
        admin_logins_match = re.match(r"^/api/admin/users/([^/]+)/logins$", path)
        if admin_logins_match:
            uid = admin_logins_match.group(1)
            query = urllib.parse.parse_qs(parsed.query)
            admin_email = query.get("adminEmail", [""])[0]
            if admin_email.lower() != ADMIN_EMAIL.lower():
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "無管理者權限"}).encode('utf-8'))
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT id, username, email FROM users WHERE id = ?", (uid,))
            user_row = cursor.fetchone()
            if not user_row:
                conn.close()
                self._set_cors_headers(404)
                self.wfile.write(json.dumps({"error": "找不到該會員"}).encode('utf-8'))
                return

            cursor.execute('''
                SELECT id, user_id, email, login_time, ip, user_agent
                FROM user_logins
                WHERE user_id = ? OR email = ?
                ORDER BY login_time DESC
            ''', (uid, user_row["email"]))
            rows = cursor.fetchall()
            logins = [{
                "id": r["id"],
                "loginTime": r["login_time"],
                "ip": r["ip"],
                "userAgent": r["user_agent"]
            } for r in rows]
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "user": {"id": uid, "username": user_row["username"], "email": user_row["email"]},
                "logins": logins,
                "total": len(logins)
            }).encode('utf-8'))
            return

        # API: 會員本人查看自己的登入歷史紀錄 /api/user/login-history
        if path == "/api/user/login-history":
            query = urllib.parse.parse_qs(parsed.query)
            account_id = query.get("userId", [""])[0]
            account_email = query.get("email", [""])[0].lower()

            if not account_id and not account_email:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "缺少會員識別資訊"}).encode('utf-8'))
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, user_id, email, login_time, ip, user_agent
                FROM user_logins
                WHERE user_id = ? OR email = ?
                ORDER BY login_time DESC
                LIMIT 50
            ''', (account_id, account_email))
            rows = cursor.fetchall()
            logins = [{
                "id": r["id"],
                "loginTime": r["login_time"],
                "ip": r["ip"],
                "userAgent": r["user_agent"]
            } for r in rows]
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "logins": logins,
                "total": len(logins)
            }).encode('utf-8'))
            return

        # API: 取得會員個人完整資料 (含各項綁定帳號狀態) /api/user/profile
        if path == "/api/user/profile":
            query = urllib.parse.parse_qs(parsed.query)
            account = (query.get("userId", [""])[0] or query.get("email", [""])[0]).strip().lower()
            if not account:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "缺少會員識別資訊"}).encode('utf-8'))
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE lower(id) = ? OR lower(email) = ?", (account, account))
            row = cursor.fetchone()
            conn.close()

            if not row:
                self._set_cors_headers(404)
                self.wfile.write(json.dumps({"error": "找不到該會員"}).encode('utf-8'))
                return

            user_obj = {
                "id": row["id"],
                "name": row["username"],
                "email": row["email"],
                "role": row["role"],
                "avatar": row["avatar"] or "",
                "birthday": row["birthday"] or "",
                "phone": row["phone"] or "",
                "address": row["address"] or "",
                "googleId": row["google_id"] or "",
                "discordUser": row["discord_user"] or "",
                "scratchUser": row["scratch_user"] or "",
                "youtubeUser": row["youtube_user"] or ""
            }
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({"success": True, "user": user_obj}).encode('utf-8'))
            return

        # API: 站長取得發信設定 /api/admin/mail-settings (相容 /api/admin/smtp-settings)
        if path in ("/api/admin/smtp-settings", "/api/admin/mail-settings"):
            query = urllib.parse.parse_qs(parsed.query)
            admin_email = query.get("adminEmail", [""])[0].strip().lower()
            if admin_email != ADMIN_EMAIL.lower():
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "無管理者權限，僅皮卡站長可檢視發信設定！"}).encode('utf-8'))
                return

            config = get_mail_config()
            has_pass = bool(config.get("smtp_pass", "").strip())
            has_client_secret = bool(config.get("oauth_client_secret", "").strip())
            has_refresh_token = bool(config.get("oauth_refresh_token", "").strip())

            safe_settings = {
                "mail_mode": config.get("mail_mode", "oauth"),
                # Google OAuth 2.0
                "oauth_client_id": config.get("oauth_client_id", ""),
                "has_client_secret": has_client_secret,
                "oauth_client_secret_masked": "••••••••••••••••" if has_client_secret else "",
                "oauth_connected": has_refresh_token,
                "oauth_authorized_email": config.get("oauth_authorized_email", ""),
                "oauth_status": "connected" if has_refresh_token else "disconnected",
                # 傳統 SMTP
                "smtp_enabled": config.get("smtp_enabled", "0"),
                "smtp_host": config.get("smtp_host", "smtp.gmail.com"),
                "smtp_port": config.get("smtp_port", "465"),
                "smtp_security": config.get("smtp_security", "ssl"),
                "smtp_user": config.get("smtp_user", ADMIN_EMAIL),
                "smtp_sender_name": config.get("smtp_sender_name", "皮卡學院官方網站"),
                "has_pass": has_pass,
                "smtp_pass_masked": "••••••••••••••••" if has_pass else ""
            }

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "settings": safe_settings
            }).encode('utf-8'))
            return

        # API: 直接 302 重新導向至 Google OAuth 登入頁面 /api/auth/google/login
        if path == "/api/auth/google/login":
            config = get_mail_config()
            client_id = config.get("oauth_client_id", "").strip() or "test-12345678.apps.googleusercontent.com"
            host = self.headers.get("Host", "localhost:5000")
            redirect_uri = f"http://{host}/api/auth/google/oauth2callback"
            auth_url = build_google_oauth_url(client_id, redirect_uri, state="user_login", scope="openid email profile")
            self.send_response(302)
            self.send_header("Location", auth_url)
            self.end_headers()
            return

        # API: GitHub OAuth 2.0 回調 Callback /api/auth/github/oauth2callback
        if path == "/api/auth/github/oauth2callback":
            query = urllib.parse.parse_qs(parsed.query)
            code = query.get("code", [""])[0]
            error = query.get("error", [""])[0]
            host = self.headers.get("Host", "localhost:5000")
            redirect_uri = f"http://{host}/api/auth/github/oauth2callback"

            html = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>GitHub OAuth 授權回調端點 - 皮卡學院</title>
  <style>
    body {{ background: #0b0f19; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
    .card {{ background: #111827; padding: 32px 28px; border-radius: 20px; border: 1px solid #374151; text-align: center; max-width: 480px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }}
    h1 {{ font-size: 20px; color: #fff; margin-bottom: 8px; }}
    p {{ color: #9ca3af; font-size: 13px; line-height: 1.6; }}
    .uri-box {{ background: #030712; padding: 12px; border-radius: 10px; font-family: monospace; font-size: 12px; color: #facc15; word-break: break-all; margin: 16px 0; text-align: left; }}
    a {{ display: inline-block; background: #238636; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 10px; font-weight: bold; font-size: 13px; margin-top: 10px; }}
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:36px;margin-bottom:12px;">🐱</div>
    <h1>GitHub OAuth 2.0 授權回調端點</h1>
    <p>此網址為 GitHub 應用程式授權完成後的安全接收通道 (Callback URL)。</p>
    <div class="uri-box">
      <span style="color:#64748b;font-size:10px;display:block;">已授權的重新導向 URI (Callback URL)：</span>
      {redirect_uri}
    </div>
    <p style="font-size:12px;color:#cbd5e1;">請在 GitHub App 建立頁面將上方網址複製貼入「重定向 URI」。</p>
    <a href="/index.html">返回皮卡學院首頁</a>
  </div>
</body>
</html>"""
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html.encode("utf-8"))
            return

        # API: 取得 Google OAuth 2.0 授權登入 / 綁定網址 (會員與訪客皆可使用) /api/auth/google/url
        if path == "/api/auth/google/url":
            query = urllib.parse.parse_qs(parsed.query)
            action = query.get("action", ["login"])[0]  # 'login' 或 'bind'
            user_id = query.get("userId", [""])[0]

            config = get_mail_config()
            client_id = config.get("oauth_client_id", "").strip()
            client_secret = config.get("oauth_client_secret", "").strip()
            is_configured = bool(client_id and client_secret and not client_id.startswith("test-") and not client_id.startswith("YOUR_"))

            host = self.headers.get("Host", "localhost:5000")
            redirect_uri = f"http://{host}/api/auth/google/oauth2callback"
            state = f"user_bind:{user_id}" if action == "bind" else "user_login"
            auth_url = build_google_oauth_url(client_id or "test-12345678.apps.googleusercontent.com", redirect_uri, state=state, scope="openid email profile")

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "configured": is_configured,
                "clientId": client_id,
                "auth_url": auth_url,
                "redirect_uri": redirect_uri
            }).encode('utf-8'))
            return

        # API: 站長取得 Google OAuth 2.0 發信授權網址 (舊相容端點)
        if path == "/api/admin/oauth/url":
            query = urllib.parse.parse_qs(parsed.query)
            admin_email = query.get("adminEmail", [""])[0].strip().lower()
            if admin_email != ADMIN_EMAIL.lower():
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "無管理者權限，僅皮卡站長可取得 OAuth 授權網址！"}).encode('utf-8'))
                return

            config = get_mail_config()
            client_id = config.get("oauth_client_id", "").strip()
            if not client_id:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "尚未設定 Google Client ID，請先在發信管理面板填寫並儲存！"}).encode('utf-8'))
                return

            host = self.headers.get("Host", "localhost:5000")
            redirect_uri = f"http://{host}/api/auth/google/oauth2callback"
            auth_url = build_google_oauth_url(client_id, redirect_uri, state="pika_oauth", scope="https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email")

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "auth_url": auth_url,
                "redirect_uri": redirect_uri
            }).encode('utf-8'))
            return

        # API: Google OAuth 2.0 回調 Callback
        if path == "/api/auth/google/oauth2callback":
            query = urllib.parse.parse_qs(parsed.query)
            code = query.get("code", [""])[0]
            error = query.get("error", [""])[0]
            state = query.get("state", ["pika_oauth"])[0]

            host = self.headers.get("Host", "localhost:5000")
            redirect_uri = f"http://{host}/api/auth/google/oauth2callback"

            if error:
                html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>授權失敗 - 皮卡學院</title>
<style>body{{background:#0b0f19;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}}
.card{{background:#111827;padding:32px;border-radius:16px;border:1px solid #ef4444;text-align:center;max-width:400px;}}
h2{{color:#ef4444;margin-top:0;}}button{{background:#ef4444;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;margin-top:15px;font-weight:bold;}}</style>
</head><body><div class="card">
<h2>❌ Google 授權失敗</h2>
<p>錯誤訊息：{error}</p>
<button onclick="window.close()">關閉視窗</button>
<script>
if(window.opener){{window.opener.postMessage({{type:'oauth_error',error:'{error}'}},'*');}}
setTimeout(()=>window.close(), 3000);
</script></div></body></html>"""
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(html.encode("utf-8"))
                return

            if not code:
                # 若直接在瀏覽器開啟回調網址（未帶 code），顯示說明導引介面
                html = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google OAuth 2.0 回調通道 - 皮卡學院</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      padding: 24px 16px;
      min-height: 100vh;
      background: #0b0f19;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
    }}
    .card {{
      max-width: 500px;
      width: 100%;
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 24px;
      padding: 32px 24px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
      text-align: center;
    }}
    .icon {{
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: rgba(250, 204, 21, 0.15);
      border: 1px solid rgba(250, 204, 21, 0.3);
      color: #facc15;
      font-size: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px auto;
    }}
    h1 {{
      font-size: 19px;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 8px 0;
    }}
    p {{
      color: #94a3b8;
      font-size: 13px;
      line-height: 1.6;
      margin: 0 0 16px 0;
    }}
    .uri-box {{
      background: #030712;
      border: 1px solid #1f2937;
      border-radius: 12px;
      padding: 12px;
      font-family: monospace;
      font-size: 12px;
      color: #facc15;
      word-break: break-all;
      margin: 16px 0;
      text-align: left;
    }}
    .tip-box {{
      background: rgba(250, 204, 21, 0.08);
      border: 1px dashed rgba(250, 204, 21, 0.35);
      border-radius: 12px;
      padding: 12px 14px;
      text-align: left;
      font-size: 12px;
      color: #cbd5e1;
      line-height: 1.5;
      margin-bottom: 24px;
    }}
    .btn-group {{
      display: flex;
      flex-direction: column;
      gap: 10px;
    }}
    .btn-primary {{
      background: #facc15;
      color: #030712;
      font-weight: 800;
      padding: 12px 20px;
      border-radius: 12px;
      text-decoration: none;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }}
    .btn-secondary {{
      background: #1f2937;
      color: #e2e8f0;
      font-weight: 600;
      padding: 12px 20px;
      border-radius: 12px;
      text-decoration: none;
      font-size: 13px;
    }}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚡</div>
    <h1>Google OAuth 2.0 授權回調端點</h1>
    <p>此網址為 Google 官方完成登入或綁定時的接收通道 (Redirect URI)。</p>
    
    <div class="uri-box">
      <span style="color:#64748b;font-size:10px;display:block;margin-bottom:4px;">已授權的重新導向 URI：</span>
      {redirect_uri}
    </div>

    <div class="tip-box">
      💡 <strong>設定指引</strong>：若您正在設定 Google Cloud 控制台，請直接將上方網址複製貼入「已授權的重新導向 URI」清單中。
    </div>

    <div class="btn-group">
      <a href="/api/auth/google/login" class="btn-primary">
        <span>🔗 啟動 Google 帳號授權登入</span>
      </a>
      <a href="/index.html" class="btn-secondary">
        <span>🏠 返回皮卡學院官方網站</span>
      </a>
    </div>
  </div>
</body>
</html>"""
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(html.encode("utf-8"))
                return

            # 分流 1: 站長發信授權 (Gmail API)
            if state in ("pika_oauth", "admin_mail"):
                success, detail = exchange_oauth_code(code, redirect_uri)
                if success:
                    email_display = detail
                    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>授權成功 - 皮卡學院</title>
<style>body{{background:#0b0f19;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}}
.card{{background:#111827;padding:32px;border-radius:16px;border:1px solid #facc15;text-align:center;max-width:420px;box-shadow:0 10px 25px rgba(0,0,0,0.5);}}
h2{{color:#facc15;margin-top:0;}}p{{color:#cbd5e1;font-size:14px;line-height:1.6;}}
.badge{{background:rgba(250,204,21,0.15);color:#facc15;padding:6px 12px;border-radius:8px;font-weight:bold;display:inline-block;margin:12px 0;}}
button{{background:#facc15;color:#000;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-weight:bold;margin-top:15px;}}</style>
</head><body><div class="card">
<h2>⚡ 發信授權成功！</h2>
<p>已成功取得 Google OAuth 2.0 發信憑證：</p>
<div class="badge">{email_display}</div>
<p>此視窗將於 2 秒後自動關閉...</p>
<button onclick="window.close()">立即關閉</button>
<script>
if(window.opener){{window.opener.postMessage({{type:'oauth_success',email:'{email_display}'}},'*');}}
setTimeout(()=>window.close(), 2000);
</script></div></body></html>"""
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(html.encode("utf-8"))
                else:
                    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>授權交換失敗 - 皮卡學院</title>
<style>body{{background:#0b0f19;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}}
.card{{background:#111827;padding:32px;border-radius:16px;border:1px solid #ef4444;text-align:center;max-width:450px;}}
h2{{color:#ef4444;margin-top:0;}}p{{color:#fca5a5;font-size:13px;word-break:break-all;}}
button{{background:#ef4444;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;margin-top:15px;font-weight:bold;}}</style>
</head><body><div class="card">
<h2>❌ Token 交換失敗</h2>
<p>{detail}</p>
<button onclick="window.close()">關閉視窗</button>
<script>
if(window.opener){{window.opener.postMessage({{type:'oauth_error',error:'{detail}'}},'*');}}
</script></div></body></html>"""
                    self.send_response(400)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(html.encode("utf-8"))
                return

            # 分流 2: 會員「Google 帳號綁定」 (state = user_bind:<userId>)
            if state.startswith("user_bind:"):
                target_uid = state.split(":", 1)[1].strip()
                success, detail = fetch_google_user_profile(code, redirect_uri)
                if not success:
                    err_msg = str(detail)
                    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>綁定失敗 - 皮卡學院</title>
<style>body{{background:#0b0f19;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}}
.card{{background:#111827;padding:32px;border-radius:16px;border:1px solid #ef4444;text-align:center;max-width:420px;}}
h2{{color:#ef4444;margin-top:0;}}p{{color:#fca5a5;font-size:13px;word-break:break-all;}}</style>
</head><body><div class="card">
<h2>❌ Google 帳號綁定失敗</h2>
<p>{err_msg}</p>
<script>
if(window.opener){{window.opener.postMessage({{type:'google_bind_error',error:'{err_msg}'}},'*');}}
setTimeout(()=>window.close(), 3000);
</script></div></body></html>"""
                    self.send_response(400)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(html.encode("utf-8"))
                    return

                g_sub = detail.get("sub", "")
                g_email = detail.get("email", "")
                g_avatar = detail.get("picture", "")

                conn = get_db()
                cur = conn.cursor()
                cur.execute("SELECT id, username FROM users WHERE google_id = ? AND id != ?", (g_sub, target_uid))
                dup = cur.fetchone()
                if dup:
                    conn.close()
                    err_msg = f"此 Google 帳號已被會員「{dup['username']}」綁定！"
                    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>綁定失敗 - 皮卡學院</title>
<style>body{{background:#0b0f19;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}}
.card{{background:#111827;padding:32px;border-radius:16px;border:1px solid #ef4444;text-align:center;max-width:420px;}}
h2{{color:#ef4444;margin-top:0;}}p{{color:#fca5a5;font-size:13px;}}</style>
</head><body><div class="card">
<h2>❌ Google 帳號已被綁定</h2>
<p>{err_msg}</p>
<script>
if(window.opener){{window.opener.postMessage({{type:'google_bind_error',error:'{err_msg}'}},'*');}}
setTimeout(()=>window.close(), 3000);
</script></div></body></html>"""
                    self.send_response(400)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(html.encode("utf-8"))
                    return

                cur.execute("UPDATE users SET google_id = ? WHERE id = ? OR lower(email) = ?", (g_sub, target_uid, g_email.lower()))
                conn.commit()
                conn.close()

                html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>綁定成功 - 皮卡學院</title>
<style>body{{background:#0b0f19;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}}
.card{{background:#111827;padding:32px;border-radius:16px;border:1px solid #facc15;text-align:center;max-width:420px;box-shadow:0 10px 25px rgba(0,0,0,0.5);}}
h2{{color:#facc15;margin-top:0;}}p{{color:#cbd5e1;font-size:14px;}}
.badge{{background:rgba(250,204,21,0.15);color:#facc15;padding:6px 12px;border-radius:8px;font-weight:bold;display:inline-block;margin:12px 0;}}</style>
</head><body><div class="card">
<h2>⚡ Google 帳號綁定成功！</h2>
<p>已成功綁定 Google OAuth 帳號：</p>
<div class="badge">{g_email}</div>
<p>視窗將自動關閉並同步個人中心...</p>
<script>
if(window.opener){{window.opener.postMessage({{type:'google_bind_success',googleId:'{g_sub}',email:'{g_email}'}},'*');}}
setTimeout(()=>window.close(), 1500);
</script></div></body></html>"""
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(html.encode("utf-8"))
                return

            # 分流 3: 會員 Google OAuth 登入 / 註冊 (state = user_login)
            if state == "user_login":
                success, detail = fetch_google_user_profile(code, redirect_uri)
                if not success:
                    err_msg = str(detail)
                    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>登入失敗 - 皮卡學院</title>
<style>body{{background:#0b0f19;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}}
.card{{background:#111827;padding:32px;border-radius:16px;border:1px solid #ef4444;text-align:center;max-width:420px;}}
h2{{color:#ef4444;margin-top:0;}}p{{color:#fca5a5;font-size:13px;}}</style>
</head><body><div class="card">
<h2>❌ Google 登入失敗</h2>
<p>{err_msg}</p>
<script>
if(window.opener){{window.opener.postMessage({{type:'google_login_error',error:'{err_msg}'}},'*');}}
setTimeout(()=>window.close(), 3000);
</script></div></body></html>"""
                    self.send_response(400)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(html.encode("utf-8"))
                    return

                g_sub = detail.get("sub", "")
                g_email = detail.get("email", "").lower()
                g_avatar = detail.get("picture", "")
                g_name = detail.get("name", "") or g_email.split("@")[0]

                conn = get_db()
                cur = conn.cursor()
                cur.execute("SELECT * FROM users WHERE google_id = ? OR lower(email) = ?", (g_sub, g_email))
                user_row = cur.fetchone()

                ip = self.headers.get("X-Forwarded-For", self.client_address[0])
                user_agent = self.headers.get("User-Agent", "Google OAuth")

                if user_row:
                    uid = user_row["id"]
                    u_role = user_row["role"]
                    u_name = user_row["username"]
                    u_avatar = user_row["avatar"] or g_avatar
                    u_birthday = user_row["birthday"] if ("birthday" in user_row.keys() and user_row["birthday"]) else ""
                    u_phone = user_row["phone"] if ("phone" in user_row.keys() and user_row["phone"]) else ""
                    u_address = user_row["address"] if ("address" in user_row.keys() and user_row["address"]) else ""
                    cur.execute("UPDATE users SET google_id = ?, avatar = ? WHERE id = ?", (g_sub, u_avatar, uid))
                else:
                    uid = f"u-{int(datetime.now().timestamp())}"
                    u_role = "admin" if g_email == ADMIN_EMAIL.lower() else "user"
                    u_name = g_name
                    u_avatar = g_avatar
                    u_birthday = ""
                    u_phone = ""
                    u_address = ""
                    pwd_salt = os.urandom(16).hex()
                    pwd_hash = hash_password(os.urandom(16).hex(), pwd_salt)
                    cur.execute('''
                        INSERT INTO users (id, username, email, password_hash, salt, role, avatar, status, google_id, birthday, phone, address)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, '', '', '')
                    ''', (uid, u_name, g_email, pwd_hash, pwd_salt, u_role, u_avatar, g_sub))

                cur.execute('''
                    INSERT INTO user_logins (user_id, email, ip, user_agent)
                    VALUES (?, ?, ?, ?)
                ''', (uid, g_email, ip, user_agent))
                conn.commit()
                conn.close()

                user_session = {
                    "id": uid,
                    "name": u_name,
                    "email": g_email,
                    "avatar": u_avatar,
                    "role": u_role,
                    "birthday": u_birthday,
                    "phone": u_phone,
                    "address": u_address,
                    "isGoogleVerified": True,
                    "isRegistered": True
                }
                user_json = json.dumps(user_session)

                html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>登入成功 - 皮卡學院</title>
<style>body{{background:#0b0f19;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}}
.card{{background:#111827;padding:32px;border-radius:16px;border:1px solid #facc15;text-align:center;max-width:420px;box-shadow:0 10px 25px rgba(0,0,0,0.5);}}
h2{{color:#facc15;margin-top:0;}}p{{color:#cbd5e1;font-size:14px;}}
.badge{{background:rgba(250,204,21,0.15);color:#facc15;padding:6px 12px;border-radius:8px;font-weight:bold;display:inline-block;margin:12px 0;}}</style>
</head><body><div class="card">
<h2>⚡ 登入成功！</h2>
<p>歡迎光臨皮卡學院，已透過 Google OAuth 成功驗證：</p>
<div class="badge">{u_name} ({g_email})</div>
<p>視窗將自動關閉並回到首頁...</p>
<script>
if(window.opener){{window.opener.postMessage({{type:'google_login_success',user:{user_json}}},'*');}}
setTimeout(()=>window.close(), 1500);
</script></div></body></html>"""
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(html.encode("utf-8"))
                return

        # API: 取得自訂網站文字與內容
        if path == "/api/site-content":
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT key, value FROM site_content")
            rows = cursor.fetchall()
            content = {r["key"]: r["value"] for r in rows}
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({"success": True, "content": content}).encode('utf-8'))
            return

        # API: 取得自訂頁面版面與視窗配置
        if path == "/api/site-layout":
            query = urllib.parse.parse_qs(parsed.query)
            page = query.get("page", ["index"])[0]

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT blocks, modal FROM site_layout WHERE page = ?", (page,))
            row = cursor.fetchone()
            conn.close()

            blocks = []
            modal = {}
            if row:
                try:
                    blocks = json.loads(row["blocks"])
                except Exception:
                    blocks = []
                try:
                    modal = json.loads(row["modal"])
                except Exception:
                    modal = {}

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({"success": True, "page": page, "blocks": blocks, "modal": modal}).encode('utf-8'))
            return

        # API: 取得全站頂部公告排程與設定
        if path == "/api/announcement":
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM site_announcement WHERE id = 'global'")
            row = cursor.fetchone()
            conn.close()

            if row:
                ann = {
                    "id": row["id"],
                    "enabled": bool(row["enabled"]),
                    "mode": row["mode"] or "always",
                    "startTime": row["start_time"] or "",
                    "endTime": row["end_time"] or "",
                    "delaySeconds": int(row["delay_seconds"] or 0),
                    "text": row["text"] or "",
                    "link": row["link"] or "",
                    "theme": row["theme"] or "yellow"
                }
            else:
                ann = {
                    "id": "global",
                    "enabled": True,
                    "mode": "always",
                    "startTime": "",
                    "endTime": "",
                    "delaySeconds": 0,
                    "text": "⚡ 歡迎來到皮卡學院官方網站！每週定期更新 Scratch 教學與精選遊戲實況～",
                    "link": "",
                    "theme": "yellow"
                }

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({"success": True, "announcement": ann}).encode('utf-8'))
            return

        # API: 取得即時聊天室與私密悄悄話訊息 (嚴格隱私過濾)
        if path == "/api/chat/messages":
            query = urllib.parse.parse_qs(parsed.query)
            user_email = query.get("userEmail", [""])[0].strip().lower()
            is_admin = (user_email == ADMIN_EMAIL.lower())

            conn = get_db()
            cursor = conn.cursor()
            if is_admin:
                cursor.execute('''
                    SELECT id, sender_name, sender_email, sender_avatar, content, is_private,
                           recipient_email, reply, reply_time, created_at
                    FROM chat_messages
                    ORDER BY created_at ASC
                    LIMIT 200
                ''')
            elif user_email:
                cursor.execute('''
                    SELECT id, sender_name, sender_email, sender_avatar, content, is_private,
                           recipient_email, reply, reply_time, created_at
                    FROM chat_messages
                    WHERE is_private = 0 OR lower(sender_email) = ? OR lower(recipient_email) = ?
                    ORDER BY created_at ASC
                    LIMIT 200
                ''', (user_email, user_email))
            else:
                cursor.execute('''
                    SELECT id, sender_name, sender_email, sender_avatar, content, is_private,
                           recipient_email, reply, reply_time, created_at
                    FROM chat_messages
                    WHERE is_private = 0
                    ORDER BY created_at ASC
                    LIMIT 200
                ''')

            rows = cursor.fetchall()
            messages = []
            for r in rows:
                messages.append({
                    "id": r["id"],
                    "senderName": r["sender_name"],
                    "senderEmail": r["sender_email"] if (is_admin or (user_email and r["sender_email"].lower() == user_email)) else "",
                    "senderAvatar": r["sender_avatar"] or "",
                    "content": r["content"],
                    "isPrivate": bool(r["is_private"]),
                    "reply": r["reply"] or "",
                    "replyTime": r["reply_time"] or "",
                    "createdAt": r["created_at"],
                    "isMe": bool(user_email and r["sender_email"] and r["sender_email"].lower() == user_email)
                })
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "messages": messages,
                "total": len(messages),
                "isAdmin": is_admin
            }).encode('utf-8'))
            return

        # 支援乾淨路徑 (如 /videos -> /videos.html, /qa -> /qa.html, /about -> /about.html)
        clean_path = path.lstrip('/')
        if not clean_path or clean_path == "":
            self.path = "/index.html"
        elif not os.path.exists(os.path.join(STATIC_DIR, clean_path)):
            if os.path.exists(os.path.join(STATIC_DIR, clean_path + ".html")):
                self.path = "/" + clean_path + ".html"
            else:
                self.path = "/index.html"

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        data = {}
        if body:
            try:
                data = json.loads(body)
            except Exception:
                pass

        # ==========================================
        # 認證與會員系統 API
        # ==========================================

        # API: 發送註冊驗證碼 /api/auth/send-verification-code
        if path == "/api/auth/send-verification-code":
            email = data.get("email", "").strip().lower()
            if not email or "@" not in email or "." not in email:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "請輸入有效的電子信箱 (Email)！"}).encode('utf-8'))
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
            if cursor.fetchone():
                conn.close()
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "此電子信箱已被註冊，請直接登入！"}).encode('utf-8'))
                return

            # 60 秒防刷檢查
            cursor.execute('''
                SELECT created_at FROM email_verifications
                WHERE email = ?
                ORDER BY id DESC LIMIT 1
            ''', (email,))
            last_record = cursor.fetchone()
            if last_record and last_record["created_at"]:
                try:
                    last_time = datetime.fromisoformat(last_record["created_at"].replace(" ", "T"))
                    diff = (datetime.now() - last_time).total_seconds()
                    if diff < 60:
                        wait_sec = int(60 - diff)
                        conn.close()
                        self._set_cors_headers(429)
                        self.wfile.write(json.dumps({"error": f"發送太頻繁，請等待 {wait_sec} 秒後再試！"}).encode('utf-8'))
                        return
                except Exception:
                    pass

            code = f"{random.randint(100000, 999999)}"
            now = datetime.now()
            now_str = now.isoformat()
            expires_at = (now + timedelta(minutes=10)).isoformat()

            cursor.execute('''
                INSERT INTO email_verifications (email, code, expires_at, is_used, created_at)
                VALUES (?, ?, ?, 0, ?)
            ''', (email, code, expires_at, now_str))
            conn.commit()
            conn.close()

            # 嘗試真實系統發信 (Google OAuth 2.0 / SMTP，若未啟用或未授權則平滑切換為本機模擬模式)
            html_body = generate_verification_email_html(code, email, 10)
            subject = f"【皮卡學院】您的註冊安全驗證碼：{code}"
            is_sent, send_detail = send_system_email(email, subject, html_body)

            print(f"[*] 📨 【皮卡學院信箱驗證】已產生驗證碼 [{code}] 預備寄發至 {email} -> 發信狀態: {send_detail}")

            self._set_cors_headers(200)
            resp_data = {
                "success": True,
                "message": f"驗證碼已寄發至 {email}！請前往電子信箱查收。",
                "emailSent": is_sent,
                "expiresInMinutes": 10
            }
            # 真實發信已啟用時絕對不回傳驗證碼至前端；若未發信成功則提示
            if not is_sent:
                resp_data["message"] = f"郵件發送中或未開通發信服務（{send_detail}）"
            self.wfile.write(json.dumps(resp_data).encode('utf-8'))
            return

        # API: 會員註冊 /api/auth/register
        if path == "/api/auth/register":
            username = data.get("username", "").strip()
            email = data.get("email", "").strip().lower()
            password = data.get("password", "").strip()
            code = data.get("code", "").strip()
            birthday = data.get("birthday", "").strip()
            phone = data.get("phone", "").strip()
            address = data.get("address", "").strip()

            if not username or not email or not password:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "暱稱、電子信箱與密碼皆為必填項目！"}).encode('utf-8'))
                return

            if not birthday:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "請選擇您的出生年月日（生日為必填項目）！"}).encode('utf-8'))
                return

            if not phone:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "請填寫聯絡電話（電話為必填項目）！"}).encode('utf-8'))
                return

            if not code:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "請填寫 6 位數信箱驗證碼！"}).encode('utf-8'))
                return

            if len(password) < 4:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "密碼長度至少需 4 個字元！"}).encode('utf-8'))
                return

            # 檢查暱稱是否包含造謠或惡意詞彙
            bad_word = contains_rumor_content(username)
            if bad_word:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": f"暱稱含有違規詞彙（『{bad_word}』），請使用正當稱呼！"}).encode('utf-8'))
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
            if cursor.fetchone():
                conn.close()
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "此電子信箱已被註冊，請直接登入！"}).encode('utf-8'))
                return

            # 驗證碼正確性與效期檢核
            cursor.execute('''
                SELECT id, code, expires_at, is_used FROM email_verifications
                WHERE email = ? AND code = ?
                ORDER BY id DESC LIMIT 1
            ''', (email, code))
            ver_row = cursor.fetchone()

            if not ver_row:
                conn.close()
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "驗證碼不正確，請確認後重新輸入！"}).encode('utf-8'))
                return

            if ver_row["is_used"]:
                conn.close()
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "此驗證碼已被使用過，請重新獲取！"}).encode('utf-8'))
                return

            if datetime.now().isoformat() > ver_row["expires_at"]:
                conn.close()
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "此驗證碼已過期（有效時限 10 分鐘），請重新獲取！"}).encode('utf-8'))
                return

            # 標記驗證碼為已使用
            cursor.execute("UPDATE email_verifications SET is_used = 1 WHERE id = ?", (ver_row["id"],))

            salt = os.urandom(16).hex()
            pwd_hash = hash_password(password, salt)
            uid = "u-" + datetime.now().strftime("%f")[:4] + "-" + os.urandom(2).hex()
            role = "admin" if email == ADMIN_EMAIL.lower() else "member"
            avatar = f"https://api.dicebear.com/7.x/bottts/svg?seed={urllib.parse.quote(username)}"
            now_str = datetime.now().isoformat()

            cursor.execute('''
                INSERT INTO users (id, username, email, password_hash, salt, role, avatar, status, birthday, phone, address, created_at, last_login)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
            ''', (uid, username, email, pwd_hash, salt, role, avatar, birthday, phone, address, now_str, now_str))

            # 記錄首次登入時間
            client_ip = self.client_address[0] if hasattr(self, 'client_address') and self.client_address else '127.0.0.1'
            user_agent = self.headers.get('User-Agent', '')
            cursor.execute('''
                INSERT INTO user_logins (user_id, email, login_time, ip, user_agent)
                VALUES (?, ?, ?, ?, ?)
            ''', (uid, email, now_str, client_ip, user_agent))

            conn.commit()
            conn.close()

            user_obj = {
                "id": uid,
                "name": username,
                "email": email,
                "role": role,
                "picture": avatar,
                "birthday": birthday,
                "phone": phone,
                "address": address,
                "isRegistered": True,
                "isGoogleVerified": False
            }

            self._set_cors_headers(201)
            self.wfile.write(json.dumps({
                "success": True,
                "message": "恭喜註冊成功！已為您自動登入皮卡學院。",
                "user": user_obj
            }).encode('utf-8'))
            return

        # API: 會員登入 /api/auth/login
        if path == "/api/auth/login":
            account = data.get("account", "").strip().lower()
            password = data.get("password", "").strip()

            if not account or not password:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "請輸入帳號信箱與密碼！"}).encode('utf-8'))
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE email = ? OR username = ?", (account, account))
            row = cursor.fetchone()

            if not row:
                conn.close()
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "找不到此帳號或尚未註冊，請先註冊！"}).encode('utf-8'))
                return

            if row["status"] == "suspended":
                conn.close()
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "⚠️ 此帳號因違反社群公約已被站方停權，無法登入！"}).encode('utf-8'))
                return

            if not verify_password(password, row["salt"], row["password_hash"]):
                conn.close()
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "密碼不正確，請重新輸入！"}).encode('utf-8'))
                return

            now_str = datetime.now().isoformat()
            cursor.execute("UPDATE users SET last_login = ? WHERE id = ?", (now_str, row["id"]))

            # 記錄每次登入時間
            client_ip = self.client_address[0] if hasattr(self, 'client_address') and self.client_address else '127.0.0.1'
            user_agent = self.headers.get('User-Agent', '')
            cursor.execute('''
                INSERT INTO user_logins (user_id, email, login_time, ip, user_agent)
                VALUES (?, ?, ?, ?, ?)
            ''', (row["id"], row["email"], now_str, client_ip, user_agent))

            conn.commit()
            conn.close()

            user_obj = {
                "id": row["id"],
                "name": row["username"],
                "email": row["email"],
                "role": row["role"],
                "picture": row["avatar"] or f"https://api.dicebear.com/7.x/bottts/svg?seed={urllib.parse.quote(row['username'])}",
                "birthday": row["birthday"] if "birthday" in row.keys() else "",
                "phone": row["phone"] if "phone" in row.keys() else "",
                "address": row["address"] if "address" in row.keys() else "",
                "isRegistered": True,
                "isGoogleVerified": False
            }

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "message": f"歡迎回來，{row['username']}！",
                "user": user_obj
            }).encode('utf-8'))
            return

        # API: 會員密碼變更 /api/user/change-password
        if path == "/api/user/change-password":
            account = (data.get("email") or data.get("account") or data.get("userId") or "").strip().lower()
            old_password = data.get("oldPassword", "").strip()
            new_password = data.get("newPassword", "").strip()

            if not account or not old_password or not new_password:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "請完整輸入舊密碼與新密碼！"}).encode('utf-8'))
                return

            if len(new_password) < 4:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "新密碼長度至少需 4 個字元！"}).encode('utf-8'))
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE email = ? OR id = ? OR username = ?", (account, account, account))
            row = cursor.fetchone()
            if not row:
                conn.close()
                self._set_cors_headers(404)
                self.wfile.write(json.dumps({"error": "找不到此會員帳號"}).encode('utf-8'))
                return

            if not verify_password(old_password, row["salt"], row["password_hash"]):
                conn.close()
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "目前舊密碼輸入錯誤，請重新確認！"}).encode('utf-8'))
                return

            new_salt = os.urandom(16).hex()
            new_hash = hash_password(new_password, new_salt)
            cursor.execute("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", (new_hash, new_salt, row["id"]))
            conn.commit()
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "message": "密碼變更成功！請牢記您的新密碼。"
            }).encode('utf-8'))
            return

        # API: 會員更新個人資料 (生日、電話、住家地址、暱稱) /api/user/profile
        if path == "/api/user/profile":
            account = (data.get("userId") or data.get("email") or "").strip().lower()
            username = data.get("username", "").strip()
            birthday = data.get("birthday", "").strip()
            phone = data.get("phone", "").strip()
            address = data.get("address", "").strip()

            if not account:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "缺少會員識別資訊！"}).encode('utf-8'))
                return

            if username:
                bad_word = contains_rumor_content(username)
                if bad_word:
                    self._set_cors_headers(400)
                    self.wfile.write(json.dumps({"error": f"暱稱含有違規詞彙（『{bad_word}』），請使用正當稱呼！"}).encode('utf-8'))
                    return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE id = ? OR email = ?", (account, account))
            row = cursor.fetchone()
            if not row:
                conn.close()
                self._set_cors_headers(404)
                self.wfile.write(json.dumps({"error": "找不到該會員"}).encode('utf-8'))
                return

            new_username = username if username else row["username"]
            cursor.execute('''
                UPDATE users
                SET username = ?, birthday = ?, phone = ?, address = ?
                WHERE id = ?
            ''', (new_username, birthday, phone, address, row["id"]))
            conn.commit()
            conn.close()

            user_obj = {
                "id": row["id"],
                "name": new_username,
                "email": row["email"],
                "role": row["role"],
                "picture": row["avatar"],
                "birthday": birthday,
                "phone": phone,
                "address": address,
                "isRegistered": True,
                "isGoogleVerified": False
            }

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "message": "個人資料已成功更新！",
                "user": user_obj
            }).encode('utf-8'))
            return

        # API: 會員綁定第三方帳號 (Google、Discord、Scratch、YouTube) /api/user/bind-accounts
        if path == "/api/user/bind-accounts":
            account = (data.get("userId") or data.get("email") or "").strip().lower()
            discord_user = data.get("discordUser", "").strip()
            scratch_user = data.get("scratchUser", "").strip()
            youtube_user = data.get("youtubeUser", "").strip()
            google_id = data.get("googleId", "").strip()

            if not account:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "缺少會員識別資訊！"}).encode('utf-8'))
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE lower(id) = ? OR lower(email) = ?", (account, account))
            row = cursor.fetchone()
            if not row:
                conn.close()
                self._set_cors_headers(404)
                self.wfile.write(json.dumps({"error": "找不到該會員"}).encode('utf-8'))
                return

            new_google_id = google_id if google_id else (row["google_id"] or "")
            cursor.execute('''
                UPDATE users
                SET discord_user = ?, scratch_user = ?, youtube_user = ?, google_id = ?
                WHERE id = ?
            ''', (discord_user, scratch_user, youtube_user, new_google_id, row["id"]))
            conn.commit()
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "message": "第三方帳號綁定資料已成功更新！",
                "bindings": {
                    "discordUser": discord_user,
                    "scratchUser": scratch_user,
                    "youtubeUser": youtube_user,
                    "googleId": new_google_id
                }
            }).encode('utf-8'))
            return

        # API: 解除會員 Google 帳號綁定 /api/user/unbind-google
        if path == "/api/user/unbind-google":
            account = (data.get("userId") or data.get("email") or "").strip().lower()
            if not account:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "缺少會員識別資訊！"}).encode('utf-8'))
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("UPDATE users SET google_id = '' WHERE lower(id) = ? OR lower(email) = ?", (account, account))
            conn.commit()
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "message": "已成功解除 Google 帳號綁定！"
            }).encode('utf-8'))
            return

        # API: 模擬 Google OAuth 綁定 (離線或無 GCP 憑證時可用) /api/auth/google/simulate-bind
        if path == "/api/auth/google/simulate-bind":
            account = (data.get("userId") or data.get("email") or "").strip().lower()
            sim_email = data.get("email", "").strip() or f"learner_{int(datetime.now().timestamp())}@gmail.com"
            sim_sub = f"g-oauth-{os.urandom(6).hex()}"

            if not account:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "缺少會員識別資訊！"}).encode('utf-8'))
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("UPDATE users SET google_id = ? WHERE lower(id) = ? OR lower(email) = ?", (sim_sub, account, account))
            conn.commit()
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "message": "Google 帳號 OAuth 綁定成功！",
                "googleId": sim_sub,
                "email": sim_email
            }).encode('utf-8'))
            return

        # API: 模擬 Google OAuth 登入 (離線或無 GCP 憑證時可用) /api/auth/google/simulate-login
        if path == "/api/auth/google/simulate-login":
            sim_email = (data.get("email") or f"learner_{int(datetime.now().timestamp())}@gmail.com").strip().lower()
            sim_name = data.get("name") or sim_email.split("@")[0]
            sim_sub = f"g-oauth-{os.urandom(6).hex()}"
            sim_avatar = f"https://api.dicebear.com/7.x/bottts/svg?seed={sim_email}"

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE lower(email) = ?", (sim_email,))
            row = cursor.fetchone()

            ip = self.headers.get("X-Forwarded-For", self.client_address[0])
            user_agent = self.headers.get("User-Agent", "Google OAuth Simulation")

            if row:
                uid = row["id"]
                u_role = row["role"]
                u_name = row["username"]
                u_avatar = row["avatar"] or sim_avatar
                cursor.execute("UPDATE users SET google_id = ? WHERE id = ?", (sim_sub, uid))
            else:
                uid = f"u-{int(datetime.now().timestamp())}"
                u_role = "admin" if sim_email == ADMIN_EMAIL.lower() else "user"
                u_name = sim_name
                u_avatar = sim_avatar
                salt = os.urandom(16).hex()
                pw_hash = hash_password(os.urandom(16).hex(), salt)
                cursor.execute('''
                    INSERT INTO users (id, username, email, password_hash, salt, role, avatar, status, google_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
                ''', (uid, u_name, sim_email, pw_hash, salt, u_role, u_avatar, sim_sub))

            cursor.execute('''
                INSERT INTO user_logins (user_id, email, ip, user_agent)
                VALUES (?, ?, ?, ?)
            ''', (uid, sim_email, ip, user_agent))
            conn.commit()
            conn.close()

            user_session = {
                "id": uid,
                "name": u_name,
                "email": sim_email,
                "avatar": u_avatar,
                "role": u_role,
                "isGoogleVerified": True,
                "isRegistered": True
            }

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "message": f"歡迎登入，{u_name}！",
                "user": user_session
            }).encode('utf-8'))
            return

        # API: 站長切換會員停權/啟用狀態 /api/admin/users/<id>/toggle-status
        toggle_user_match = re.match(r"^/api/admin/users/([^/]+)/toggle-status$", path)
        if toggle_user_match:
            uid = toggle_user_match.group(1)
            admin_email = data.get("adminEmail", "").strip().lower()
            if admin_email != ADMIN_EMAIL.lower():
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "無管理者權限"}).encode('utf-8'))
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT email, role, status FROM users WHERE id = ?", (uid,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                self._set_cors_headers(404)
                self.wfile.write(json.dumps({"error": "找不到該會員"}).encode('utf-8'))
                return
            if row["email"].lower() == ADMIN_EMAIL.lower() or row["role"] == "admin":
                conn.close()
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "無法停權站長最高管理員帳號！"}).encode('utf-8'))
                return

            new_status = "suspended" if row["status"] == "active" else "active"
            cursor.execute("UPDATE users SET status = ? WHERE id = ?", (new_status, uid))
            conn.commit()
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "id": uid,
                "status": new_status,
                "message": f"會員帳號狀態已更新為：{'已停權' if new_status == 'suspended' else '正常啟用'}"
            }).encode('utf-8'))
            return

        # API: 站長更新郵件發信設定 /api/admin/mail-settings (相容 /api/admin/smtp-settings)
        if path in ("/api/admin/smtp-settings", "/api/admin/mail-settings"):
            admin_email = data.get("adminEmail", "").strip().lower()
            if admin_email != ADMIN_EMAIL.lower():
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "無管理者權限，僅皮卡站長可儲存發信設定！"}).encode('utf-8'))
                return

            mail_mode = data.get("mail_mode", "oauth").strip()
            oauth_client_id = data.get("oauth_client_id", "").strip()
            oauth_client_secret = data.get("oauth_client_secret", "").strip()

            smtp_enabled = "1" if str(data.get("smtp_enabled", "0")) in ("1", "true", "True") else "0"
            smtp_host = data.get("smtp_host", "smtp.gmail.com").strip()
            smtp_port = str(data.get("smtp_port", "465")).strip()
            smtp_security = data.get("smtp_security", "ssl").strip().lower()
            smtp_user = data.get("smtp_user", ADMIN_EMAIL).strip()
            smtp_pass = data.get("smtp_pass", "").strip()
            smtp_sender_name = data.get("smtp_sender_name", "皮卡學院官方網站").strip()

            conn = get_db()
            cursor = conn.cursor()

            if mail_mode in ("oauth", "smtp"):
                cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('mail_mode', ?)", (mail_mode,))

            if oauth_client_id:
                cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('oauth_client_id', ?)", (oauth_client_id,))
            if oauth_client_secret and "••" not in oauth_client_secret and "KEEP" not in oauth_client_secret:
                cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('oauth_client_secret', ?)", (oauth_client_secret,))

            cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('smtp_enabled', ?)", (smtp_enabled,))
            cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('smtp_host', ?)", (smtp_host,))
            cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('smtp_port', ?)", (smtp_port,))
            cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('smtp_security', ?)", (smtp_security,))
            cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('smtp_user', ?)", (smtp_user,))
            cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('smtp_sender_name', ?)", (smtp_sender_name,))

            # 密碼只有在有提供且不是遮罩符號時才覆蓋
            if smtp_pass and "••" not in smtp_pass and "KEEP" not in smtp_pass:
                cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('smtp_pass', ?)", (smtp_pass,))

            conn.commit()
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "message": "郵件發信系統設定已成功儲存！"
            }).encode('utf-8'))
            return

        # API: 站長解除 Google OAuth 2.0 發信授權 /api/admin/oauth/disconnect
        if path == "/api/admin/oauth/disconnect":
            admin_email = data.get("adminEmail", "").strip().lower()
            if admin_email != ADMIN_EMAIL.lower():
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "無管理者權限，僅皮卡站長可解除授權！"}).encode('utf-8'))
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('oauth_refresh_token', '')")
            cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('oauth_access_token', '')")
            cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('oauth_token_expires_at', '')")
            cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('oauth_authorized_email', '')")
            cursor.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('oauth_status', 'disconnected')")
            conn.commit()
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "message": "已成功解除 Google OAuth 發信授權！"
            }).encode('utf-8'))
            return

        # API: 站長發送測試郵件 /api/admin/test-email
        if path == "/api/admin/test-email":
            admin_email = data.get("adminEmail", "").strip().lower()
            if admin_email != ADMIN_EMAIL.lower():
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "無管理者權限，僅皮卡站長可執行發信測試！"}).encode('utf-8'))
                return

            target = data.get("testEmail", "").strip() or ADMIN_EMAIL
            if "@" not in target or "." not in target:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "請輸入有效的測試收件信箱！"}).encode('utf-8'))
                return

            test_code = "888888"
            html_body = generate_verification_email_html(test_code, target, 10)
            config = get_mail_config()
            mode_label = "Google OAuth 2.0 (Gmail API)" if config.get("mail_mode") == "oauth" else "傳統 SMTP"
            subject = f"【皮卡學院】發信功能連線測試（{mode_label} 檢測信）"
            is_sent, send_detail = send_system_email(target, subject, html_body)

            status_code = 200 if is_sent else 400
            self._set_cors_headers(status_code)
            self.wfile.write(json.dumps({
                "success": is_sent,
                "message": f"測試信已成功送達至 {target}！\n({send_detail})" if is_sent else f"發送失敗：{send_detail}"
            }).encode('utf-8'))
            return

        # API: 觀眾發表新問題
        if path == "/api/questions":
            author = data.get("author", "").strip()
            category = data.get("category", "其他聊聊")
            content = data.get("content", "").strip()
            avatar = data.get("avatar")
            is_verified = 1 if data.get("isGoogleVerified") else 0

            if not author or not content:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "暱稱與內容不能為空"}).encode('utf-8'))
                return

            # 🛡️ 智能防不實流言與違規審查
            bad_word = contains_rumor_content(author + " " + content)
            if bad_word:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({
                    "error": f"⚠️ 內容含有未經查證之不實流言或違規詞彙（包含『{bad_word}』），無法發布！皮卡學院嚴格維護言論真實性與社群健康。"
                }).encode('utf-8'))
                return

            # 檢查是否開啟先審後發模式
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM site_settings WHERE key = 'moderation_mode'")
            row_mod = cursor.fetchone()
            moderation_mode = bool(int(row_mod[0])) if row_mod else False

            is_approved = 0 if moderation_mode else 1
            status = "待站長審核" if moderation_mode else "待皮卡解答"

            qid = "q-" + datetime.now().strftime("%f")[:4] + "-" + os.urandom(2).hex()
            date_str = "剛剛"

            cursor.execute('''
                INSERT INTO questions (id, author, category, content, date, likes, status, reply, avatar, is_verified, is_approved, report_count)
                VALUES (?, ?, ?, ?, ?, 1, ?, '', ?, ?, ?, 0)
            ''', (qid, author, category, content, date_str, status, avatar, is_verified, is_approved))
            conn.commit()
            conn.close()

            new_q = {
                "id": qid,
                "author": author,
                "category": category,
                "content": content,
                "date": date_str,
                "likes": 1,
                "status": status,
                "reply": "",
                "avatar": avatar,
                "isGoogleVerified": bool(is_verified),
                "isApproved": bool(is_approved),
                "reportCount": 0
            }

            self._set_cors_headers(201)
            self.wfile.write(json.dumps({
                "success": True,
                "question": new_q,
                "needsApproval": bool(moderation_mode),
                "message": "問題已提交！因開啟言論真實性審核模式，將於站長核實無不實流言後公開展示。" if moderation_mode else "問題已成功發布！"
            }).encode('utf-8'))
            return

        # API: 觀眾檢舉不實流言 /api/questions/<id>/report
        report_match = re.match(r"^/api/questions/([^/]+)/report$", path)
        if report_match:
            qid = report_match.group(1)
            reason = data.get("reason", "未經證實的不實流言")
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("UPDATE questions SET report_count = report_count + 1 WHERE id = ?", (qid,))
            cursor.execute("SELECT report_count FROM questions WHERE id = ?", (qid,))
            row = cursor.fetchone()
            if row:
                count = row["report_count"]
                # 若被檢舉達 3 次以上，系統自動先轉為隱藏待站長複審
                if count >= 3:
                    cursor.execute("UPDATE questions SET is_approved = 0, status = '爭議流言待複核' WHERE id = ?", (qid,))
                conn.commit()
                conn.close()
                self._set_cors_headers(200)
                self.wfile.write(json.dumps({
                    "success": True,
                    "id": qid,
                    "reportCount": count,
                    "message": "已收到您的檢舉！站方將嚴肅核實，杜絕不實流言。"
                }).encode('utf-8'))
            else:
                conn.close()
                self._set_cors_headers(404)
                self.wfile.write(json.dumps({"error": "找不到該問題"}).encode('utf-8'))
            return

        # API: 站長審核通過問題 /api/questions/<id>/approve
        approve_match = re.match(r"^/api/questions/([^/]+)/approve$", path)
        if approve_match:
            qid = approve_match.group(1)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("UPDATE questions SET is_approved = 1, status = '待皮卡解答', report_count = 0 WHERE id = ?", (qid,))
            conn.commit()
            conn.close()
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({"success": True, "id": qid, "message": "此問題已通過言論真實性審核並公開展示！"}).encode('utf-8'))
            return

        # API: 站長設定審核模式（先審後發開關）
        if path == "/api/moderation-setting":
            enabled = 1 if data.get("moderationMode") else 0
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO site_settings (key, value) VALUES ('moderation_mode', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            ''', (str(enabled),))
            conn.commit()
            conn.close()
            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "moderationMode": bool(enabled),
                "message": "防謠言審核模式（先審後發）已" + ("開啟！" if enabled else "關閉！")
            }).encode('utf-8'))
            return

        # API: 問題按讚 /api/questions/<id>/like
        like_match = re.match(r"^/api/questions/([^/]+)/like$", path)
        if like_match:
            qid = like_match.group(1)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("UPDATE questions SET likes = likes + 1 WHERE id = ?", (qid,))
            conn.commit()
            cursor.execute("SELECT likes FROM questions WHERE id = ?", (qid,))
            row = cursor.fetchone()
            conn.close()

            if row:
                self._set_cors_headers(200)
                self.wfile.write(json.dumps({"success": True, "id": qid, "likes": row["likes"]}).encode('utf-8'))
            else:
                self._set_cors_headers(404)
                self.wfile.write(json.dumps({"error": "找不到該問題"}).encode('utf-8'))
            return

        # API: 站長回覆問題 /api/questions/<id>/reply
        reply_match = re.match(r"^/api/questions/([^/]+)/reply$", path)
        if reply_match:
            qid = reply_match.group(1)
            reply_text = data.get("reply", "").strip()

            if not reply_text:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "回覆內容不能為空"}).encode('utf-8'))
                return

            formatted_reply = "皮卡學院：" + reply_text.replace("皮卡學院：", "")
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("UPDATE questions SET reply = ?, status = '皮卡已解答' WHERE id = ?", (formatted_reply, qid))
            conn.commit()
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({"success": True, "id": qid, "reply": formatted_reply, "status": "皮卡已解答"}).encode('utf-8'))
            return

        # API: 儲存自訂網站文字與內容 (僅皮卡站長有權修改)
        if path == "/api/site-content":
            admin_email = data.get("adminEmail", "").strip().lower()
            if admin_email != ADMIN_EMAIL.lower():
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "無管理者權限！僅皮卡站長有權修改網站內容。"}).encode('utf-8'))
                return

            content_map = data.get("content", {})
            if isinstance(content_map, dict):
                conn = get_db()
                cursor = conn.cursor()
                for k, v in content_map.items():
                    cursor.execute('''
                        INSERT INTO site_content (key, value, updated_at)
                        VALUES (?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
                    ''', (str(k), str(v)))
                conn.commit()
                conn.close()

                self._set_cors_headers(200)
                self.wfile.write(json.dumps({"success": True, "count": len(content_map)}).encode('utf-8'))
                return

        # API: 重設自訂網站文字回預設 (僅皮卡站長有權操作)
        if path == "/api/site-content/reset":
            admin_email = data.get("adminEmail", "").strip().lower()
            if admin_email != ADMIN_EMAIL.lower():
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "無管理者權限！僅皮卡站長有權重設文字內容。"}).encode('utf-8'))
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM site_content")
            conn.commit()
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({"success": True, "message": "已成功重設為預設文字"}).encode('utf-8'))
            return

        # API: 儲存自訂頁面版面與視窗配置 (僅皮卡站長有權操作)
        if path == "/api/site-layout":
            admin_email = data.get("adminEmail", "").strip().lower()
            if admin_email != ADMIN_EMAIL.lower():
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "無管理者權限！僅皮卡站長有權發布自訂版面與視窗。"}).encode('utf-8'))
                return

            page = data.get("page", "index")
            blocks = json.dumps(data.get("blocks", []))
            modal = json.dumps(data.get("modal", {}))

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO site_layout (page, blocks, modal, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(page) DO UPDATE SET blocks = excluded.blocks, modal = excluded.modal, updated_at = CURRENT_TIMESTAMP
            ''', (page, blocks, modal))
            conn.commit()
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({"success": True, "message": f"{page} 頁面版面與視窗已成功發布！"}).encode('utf-8'))
            return

        # API: 重設頁面版面與視窗 (僅皮卡站長有權操作)
        if path == "/api/site-layout/reset":
            admin_email = data.get("adminEmail", "").strip().lower()
            if admin_email != ADMIN_EMAIL.lower():
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "無管理者權限！僅皮卡站長有權重設版面。"}).encode('utf-8'))
                return

            page = data.get("page", "")
            conn = get_db()
            cursor = conn.cursor()
            if page:
                cursor.execute("DELETE FROM site_layout WHERE page = ?", (page,))
            else:
                cursor.execute("DELETE FROM site_layout")
            conn.commit()
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({"success": True, "message": "版面已重設回預設狀態"}).encode('utf-8'))
            return

        # API: 儲存全站頂部公告排程與設定 (僅皮卡站長有權操作)
        if path == "/api/announcement":
            admin_email = data.get("adminEmail", "").strip().lower()
            if admin_email != ADMIN_EMAIL.lower():
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "無管理者權限！僅皮卡站長有權修改公告設定與時機。"}).encode('utf-8'))
                return

            ann = data.get("announcement", data)
            enabled = 1 if ann.get("enabled", True) else 0
            mode = ann.get("mode", "always")
            start_time = ann.get("startTime", "")
            end_time = ann.get("endTime", "")
            try:
                delay_seconds = int(ann.get("delaySeconds", 0))
            except (ValueError, TypeError):
                delay_seconds = 0
            text = ann.get("text", "⚡ 歡迎來到皮卡學院官方網站！每週定期更新 Scratch 教學與精選遊戲實況～")
            link = ann.get("link", "")
            theme = ann.get("theme", "yellow")

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO site_announcement (id, enabled, mode, start_time, end_time, delay_seconds, text, link, theme, updated_at)
                VALUES ('global', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    enabled = excluded.enabled,
                    mode = excluded.mode,
                    start_time = excluded.start_time,
                    end_time = excluded.end_time,
                    delay_seconds = excluded.delay_seconds,
                    text = excluded.text,
                    link = excluded.link,
                    theme = excluded.theme,
                    updated_at = CURRENT_TIMESTAMP
            ''', (enabled, mode, start_time, end_time, delay_seconds, text, link, theme))
            conn.commit()
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "message": "頂部公告排程與顯示時機已成功更新！",
                "announcement": {
                    "id": "global",
                    "enabled": bool(enabled),
                    "mode": mode,
                    "startTime": start_time,
                    "endTime": end_time,
                    "delaySeconds": delay_seconds,
                    "text": text,
                    "link": link,
                    "theme": theme
                }
            }).encode('utf-8'))
            return

        # API: 發送即時聊天室訊息或私密悄悄話 /api/chat/messages
        if path == "/api/chat/messages":
            sender_name = data.get("senderName", "").strip() or "熱情同學"
            sender_email = data.get("senderEmail", "").strip().lower()
            sender_avatar = data.get("senderAvatar", "")
            content = data.get("content", "").strip()
            is_private = 1 if data.get("isPrivate") else 0
            recipient_email = data.get("recipientEmail", "").strip().lower() or (ADMIN_EMAIL.lower() if is_private else "")

            if not content:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "訊息內容不可為空！"}).encode('utf-8'))
                return

            if len(content) > 500:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "單則訊息請勿超過 500 字！"}).encode('utf-8'))
                return

            # 防不實流言與違規關鍵字審核
            bad_word = contains_rumor_content(sender_name + " " + content)
            if bad_word:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({
                    "error": f"⚠️ 內容含有不適當詞彙（包含『{bad_word}』），無法發布！請友善交流。"
                }).encode('utf-8'))
                return

            msg_id = "msg-" + datetime.now().strftime("%Y%m%d%H%M%S") + "-" + os.urandom(2).hex()

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO chat_messages (id, sender_name, sender_email, sender_avatar, content, is_private, recipient_email)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (msg_id, sender_name, sender_email, sender_avatar, content, is_private, recipient_email))
            conn.commit()
            conn.close()

            new_msg = {
                "id": msg_id,
                "senderName": sender_name,
                "senderAvatar": sender_avatar,
                "content": content,
                "isPrivate": bool(is_private),
                "reply": "",
                "replyTime": "",
                "createdAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "isMe": True
            }

            self._set_cors_headers(201)
            self.wfile.write(json.dumps({
                "success": True,
                "message": new_msg,
                "tip": "已送出私密悄悄話（僅站長與你可見）" if is_private else "訊息已發布至即時聊天室！"
            }).encode('utf-8'))
            return

        # API: 站長回覆聊天室/悄悄話訊息 /api/chat/messages/<id>/reply
        chat_reply_match = re.match(r"^/api/chat/messages/([^/]+)/reply$", path)
        if chat_reply_match:
            mid = chat_reply_match.group(1)
            admin_email = data.get("adminEmail", "").strip().lower()
            reply_text = data.get("reply", "").strip()

            if admin_email != ADMIN_EMAIL.lower():
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "無管理者權限，僅皮卡站長可回覆！"}).encode('utf-8'))
                return

            if not reply_text:
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "回覆內容不可為空！"}).encode('utf-8'))
                return

            formatted_reply = "皮卡站長：" + reply_text.replace("皮卡站長：", "")
            conn = get_db()
            cursor = conn.cursor()
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("UPDATE chat_messages SET reply = ?, reply_time = ? WHERE id = ?", (formatted_reply, now_str, mid))
            conn.commit()
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({
                "success": True,
                "id": mid,
                "reply": formatted_reply,
                "replyTime": now_str
            }).encode('utf-8'))
            return

        self._set_cors_headers(404)
        self.wfile.write(json.dumps({"error": "無效的 API 路由"}).encode('utf-8'))

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # API: 刪除問題 /api/questions/<id>
        del_match = re.match(r"^/api/questions/([^/]+)$", path)
        if del_match:
            qid = del_match.group(1)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM questions WHERE id = ?", (qid,))
            conn.commit()
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({"success": True, "id": qid}).encode('utf-8'))
            return

        # API: 站長刪除會員帳號 /api/admin/users/<id>
        del_user_match = re.match(r"^/api/admin/users/([^/]+)$", path)
        if del_user_match:
            uid = del_user_match.group(1)
            query = urllib.parse.parse_qs(parsed.query)
            admin_email = query.get("adminEmail", [""])[0]
            if admin_email.lower() != ADMIN_EMAIL.lower():
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "無管理者權限"}).encode('utf-8'))
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT email, role FROM users WHERE id = ?", (uid,))
            target_user = cursor.fetchone()
            if not target_user:
                conn.close()
                self._set_cors_headers(404)
                self.wfile.write(json.dumps({"error": "找不到該會員"}).encode('utf-8'))
                return
            if target_user["email"].lower() == ADMIN_EMAIL.lower() or target_user["role"] == "admin":
                conn.close()
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "無法刪除站長最高管理員帳號！"}).encode('utf-8'))
                return

            cursor.execute("DELETE FROM users WHERE id = ?", (uid,))
            conn.commit()
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({"success": True, "id": uid, "message": "會員帳號已成功自資料庫永久刪除！"}).encode('utf-8'))
            return

        # API: 刪除聊天室或悄悄話訊息 /api/chat/messages/<id>
        del_chat_match = re.match(r"^/api/chat/messages/([^/]+)$", path)
        if del_chat_match:
            mid = del_chat_match.group(1)
            query = urllib.parse.parse_qs(parsed.query)
            user_email = query.get("userEmail", [""])[0].strip().lower()

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT sender_email FROM chat_messages WHERE id = ?", (mid,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                self._set_cors_headers(404)
                self.wfile.write(json.dumps({"error": "找不到該訊息"}).encode('utf-8'))
                return

            # 站長或原發布者才有權刪除
            if user_email != ADMIN_EMAIL.lower() and (not row["sender_email"] or row["sender_email"].lower() != user_email):
                conn.close()
                self._set_cors_headers(403)
                self.wfile.write(json.dumps({"error": "無權限刪除此訊息！"}).encode('utf-8'))
                return

            cursor.execute("DELETE FROM chat_messages WHERE id = ?", (mid,))
            conn.commit()
            conn.close()

            self._set_cors_headers(200)
            self.wfile.write(json.dumps({"success": True, "id": mid, "message": "訊息已成功刪除"}).encode('utf-8'))
            return

        self._set_cors_headers(404)
        self.wfile.write(json.dumps({"error": "無效的 API 路由"}).encode('utf-8'))

# ==========================================
# 3. 啟動伺服器
# ==========================================
def run_server():
    init_db()
    handler = PikaBackendHandler
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("", PORT), handler) as httpd:
        print("=" * 60)
        print("  [*] 皮卡學院 (Pika Academy) 後端伺服器已啟動！")
        print(f"  -> 本機網址：http://localhost:{PORT}")
        print(f"  -> API 健康檢查：http://localhost:{PORT}/api/health")
        print(f"  -> 資料庫路徑：{DB_FILE}")
        print("=" * 60)
        print("按下 Ctrl + C 即可停止伺服器。\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[*] 正在關閉後端伺服器...")
            httpd.server_close()

if __name__ == "__main__":
    run_server()
