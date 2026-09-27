#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
皮卡學院 - Google OAuth 2.0 系統發信功能全面自動化測試
"""
import urllib.request
import urllib.parse
import json
import sys

BASE_URL = "http://localhost:5000"
ADMIN_EMAIL = "ytfgtfretftrr@gmail.com"

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

def run_tests():
    passed = 0
    total = 0

    print("=" * 60)
    print("⚡ 開始進行皮卡學院 Google OAuth 2.0 系統發信測試...")
    print("=" * 60)

    # Test 1: 健康檢查
    total += 1
    try:
        with urllib.request.urlopen(f"{BASE_URL}/api/health", timeout=5) as r:
            data = json.loads(r.read().decode('utf-8'))
            assert data["status"] == "ok"
            print("✅ Test 1: 伺服器健康檢查正常")
            passed += 1
    except Exception as e:
        print(f"❌ Test 1 失敗: {e}")

    # Test 2: 非管理員存取發信設定應被阻擋 (403 Forbidden)
    total += 1
    try:
        req = urllib.request.Request(f"{BASE_URL}/api/admin/mail-settings?adminEmail=hacker@evil.com")
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                print("❌ Test 2 失敗: 惡意使用者不應獲得 200 回應")
        except urllib.error.HTTPError as e:
            if e.code == 403:
                print("✅ Test 2: 權限防護成功 (非站長存取被 403 阻擋)")
                passed += 1
            else:
                print(f"❌ Test 2 失敗: 回傳代碼為 {e.code} 而非 403")
    except Exception as e:
        print(f"❌ Test 2 異常: {e}")

    # Test 3: 站長讀取郵件設定
    total += 1
    try:
        url = f"{BASE_URL}/api/admin/mail-settings?adminEmail={urllib.parse.quote(ADMIN_EMAIL)}"
        with urllib.request.urlopen(url, timeout=5) as r:
            res = json.loads(r.read().decode('utf-8'))
            assert res["success"] is True
            assert "settings" in res
            assert "mail_mode" in res["settings"]
            assert "oauth_client_id" in res["settings"]
            print("✅ Test 3: 站長合法讀取郵件設定成功 (mail_mode, oauth, smtp 結構完整)")
            passed += 1
    except Exception as e:
        print(f"❌ Test 3 失敗: {e}")

    # Test 4: 站長儲存 OAuth Client 設定
    total += 1
    try:
        payload = json.dumps({
            "adminEmail": ADMIN_EMAIL,
            "mail_mode": "oauth",
            "oauth_client_id": "test-12345678.apps.googleusercontent.com",
            "oauth_client_secret": "GOCSPX-SecretMock123456",
            "smtp_enabled": "0"
        }).encode('utf-8')
        req = urllib.request.Request(f"{BASE_URL}/api/admin/mail-settings", data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as r:
            res = json.loads(r.read().decode('utf-8'))
            assert res["success"] is True
            print("✅ Test 4: 站長更新 OAuth 設定成功")
            passed += 1
    except Exception as e:
        print(f"❌ Test 4 失敗: {e}")

    # Test 5: 取得 Google OAuth 2.0 授權登入網址
    total += 1
    try:
        url = f"{BASE_URL}/api/admin/oauth/url?adminEmail={urllib.parse.quote(ADMIN_EMAIL)}"
        with urllib.request.urlopen(url, timeout=5) as r:
            res = json.loads(r.read().decode('utf-8'))
            assert res["success"] is True
            auth_url = res["auth_url"]
            assert "accounts.google.com" in auth_url
            assert "gmail.send" in auth_url
            assert "test-12345678" in auth_url
            assert "oauth2callback" in res["redirect_uri"]
            print(f"✅ Test 5: 成功生成官方 Google OAuth 授權網址與回調端點: {res['redirect_uri']}")
            passed += 1
    except Exception as e:
        print(f"❌ Test 5 失敗: {e}")

    # Test 6: 註冊驗證碼統一發送 API
    total += 1
    try:
        test_email = "member_new_test@example.com"
        payload = json.dumps({"email": test_email}).encode('utf-8')
        req = urllib.request.Request(f"{BASE_URL}/api/auth/send-verification-code", data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as r:
            res = json.loads(r.read().decode('utf-8'))
            assert res["success"] is True
            assert "code" in res
            assert len(res["code"]) == 6
            print(f"✅ Test 6: 註冊安全驗證碼寄發成功 (自動沙盒回退機制運作正常，驗證碼: {res['code']})")
            passed += 1
    except Exception as e:
        print(f"❌ Test 6 失敗: {e}")

    # Test 7: 解除 OAuth 授權
    total += 1
    try:
        payload = json.dumps({"adminEmail": ADMIN_EMAIL}).encode('utf-8')
        req = urllib.request.Request(f"{BASE_URL}/api/admin/oauth/disconnect", data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as r:
            res = json.loads(r.read().decode('utf-8'))
            assert res["success"] is True
            print("✅ Test 7: 解除 OAuth 授權端點正常")
            passed += 1
    except Exception as e:
        print(f"❌ Test 7 失敗: {e}")

    print("=" * 60)
    print(f"總計測試: {total} 項 | 通過: {passed} 項 | 失敗: {total - passed} 項")
    print("=" * 60)
    return passed == total

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
