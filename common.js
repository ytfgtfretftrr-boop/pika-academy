/**
 * 皮卡學院 (Pika Academy) - 共用腳本與全域認證模組
 */

const API_KEY = 'AIzaSyAAxeGTdstq0aID8iz_tjtg0SslpsUOB24';
const CHANNEL_ID = 'UC845CxI3wszf2zrXyFJK0nw'; // 正確大小寫頻道 ID
const ADMIN_EMAIL = 'ytfgtfretftrr@gmail.com';
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

// 後端 API 根路徑 (若為 http 協議則直接使用當前來源，本地檔案開啟則導向 localhost:5000)
const API_BASE = window.location.protocol.startsWith('http') ? window.location.origin : 'http://localhost:5000';

let currentUser = null;

// 格式化數字 (例如 12345 -> 1.2 萬)
function formatCount(num) {
  if (!num) return '0';
  const n = parseInt(num, 10);
  if (n >= 10000) return (n / 10000).toFixed(1) + ' 萬';
  if (n >= 1000) return (n / 1000).toFixed(1) + ' 千';
  return n.toLocaleString();
}

// 格式化日期
function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 簡易 Toast 提示訊息
function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-green-900/90 border-green-600 text-green-200' :
             type === 'error' ? 'bg-red-900/90 border-red-600 text-red-200' :
             'bg-gray-900/95 border-yellow-500/60 text-yellow-300';

  toast.className = `${bg} border px-4 py-3 rounded-xl shadow-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transform transition-all duration-300 translate-y-4 opacity-0 pointer-events-auto`;
  toast.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'circle-check text-green-400' : type === 'error' ? 'circle-xmark text-red-400' : 'bolt text-yellow-400'}"></i> <span>${message}</span>`;
  
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('translate-y-4', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==========================================
// Google OAuth 2.0 登入認證管理
// ==========================================
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

function initGoogleAuth() {
  try {
    const savedUser = localStorage.getItem('pika_user');
    if (savedUser) {
      currentUser = JSON.parse(savedUser);
      updateAuthUI();
      setTimeout(checkUserProfileCompletion, 600);
    }
  } catch (e) {}

  if (window.google && GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.includes('YOUR_GOOGLE_CLIENT_ID')) {
    try {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse
      });
      const signinDiv = document.getElementById('g-login-container');
      if (signinDiv) {
        google.accounts.id.renderButton(signinDiv, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill'
        });
      }
    } catch (e) {
      console.error('Google Auth Init Error:', e);
    }
  }
}

function handleCredentialResponse(response) {
  const payload = parseJwt(response.credential);
  if (payload) {
    currentUser = {
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
      sub: payload.sub,
      isGoogleVerified: true
    };
    localStorage.setItem('pika_user', JSON.stringify(currentUser));
    closeOAuthModal();
    updateAuthUI();
    if (typeof onAuthSuccess === 'function') onAuthSuccess();
    showToast(`歡迎登入，${currentUser.name}！`, 'success');
    setTimeout(checkUserProfileCompletion, 600);
  }
}

window.handleGoogleAuthClick = function() {
  if (window.google && GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.includes('YOUR_GOOGLE_CLIENT_ID')) {
    try {
      google.accounts.id.prompt();
      return;
    } catch (e) {}
  }
  openOAuthModal();
};

window.openOAuthModal = function() {
  const modal = document.getElementById('oauth-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
};

window.closeOAuthModal = function() {
  const modal = document.getElementById('oauth-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
};

window.switchAuthTab = function(tab) {
  const tabLogin = document.getElementById('auth-tab-login');
  const tabRegister = document.getElementById('auth-tab-register');
  const formLogin = document.getElementById('native-login-form');
  const formRegister = document.getElementById('native-register-form');

  if (tab === 'login') {
    if (tabLogin) tabLogin.className = "py-2 text-xs font-bold rounded-lg transition bg-yellow-400 text-gray-950";
    if (tabRegister) tabRegister.className = "py-2 text-xs font-bold rounded-lg transition text-gray-400 hover:text-white";
    if (formLogin) formLogin.classList.remove('hidden');
    if (formRegister) formRegister.classList.add('hidden');
  } else {
    if (tabLogin) tabLogin.className = "py-2 text-xs font-bold rounded-lg transition text-gray-400 hover:text-white";
    if (tabRegister) tabRegister.className = "py-2 text-xs font-bold rounded-lg transition bg-yellow-400 text-gray-950";
    if (formLogin) formLogin.classList.add('hidden');
    if (formRegister) formRegister.classList.remove('hidden');
  }
};

window.toggleOptionalRegFields = function() {
  const fields = document.getElementById('reg-optional-fields');
  const icon = document.getElementById('reg-optional-icon');
  if (fields) {
    if (fields.classList.contains('hidden')) {
      fields.classList.remove('hidden');
      if (icon) icon.classList.add('rotate-180');
    } else {
      fields.classList.add('hidden');
      if (icon) icon.classList.remove('rotate-180');
    }
  }
};

window.latestVerificationCode = '';
let sendCodeCountdownTimer = null;

window.sendVerificationCode = async function() {
  const emailInput = document.getElementById('reg-email');
  const email = emailInput?.value.trim().toLowerCase();
  const btn = document.getElementById('btn-send-code');
  const btnText = document.getElementById('btn-send-code-text');

  if (!email || !email.includes('@') || !email.includes('.')) {
    showToast('請先填寫正確的電子信箱 (Email)！', 'error');
    if (emailInput) emailInput.focus();
    return;
  }

  if (btn) btn.disabled = true;
  if (btnText) btnText.innerText = '發送中...';

  try {
    const res = await fetch(`${API_BASE}/api/auth/send-verification-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || '驗證碼發送失敗，請稍後再試！', 'error');
      if (btn) btn.disabled = false;
      if (btnText) btnText.innerText = '取得驗證碼';
      return;
    }

    window.latestVerificationCode = '';
    showToast(data.message || `📨 驗證信已寄發至 ${email}，請前往信箱查收！`, 'success');

    // 依使用者指示，嚴禁在網頁直接洩漏顯示驗證碼，永遠隱藏提示卡
    const noticeCard = document.getElementById('reg-code-notice');
    if (noticeCard) {
      noticeCard.classList.add('hidden');
    }

    const codeInput = document.getElementById('reg-code');
    if (codeInput) codeInput.focus();

    // 啟動 60 秒倒數計時
    let countdown = 60;
    if (btnText) btnText.innerText = `${countdown}s 後重發`;
    if (sendCodeCountdownTimer) clearInterval(sendCodeCountdownTimer);
    sendCodeCountdownTimer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(sendCodeCountdownTimer);
        sendCodeCountdownTimer = null;
        if (btn) btn.disabled = false;
        if (btnText) btnText.innerText = '重新取得';
      } else {
        if (btnText) btnText.innerText = `${countdown}s 後重發`;
      }
    }, 1000);

  } catch (err) {
    showToast('無法連接後端伺服器，請確認伺服器已啟動', 'error');
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerText = '取得驗證碼';
  }
};

window.autoFillVerificationCode = function() {
  // 安全策略：已停用前端明文自動填入
};

window.submitNativeRegister = async function(e) {
  if (e && e.preventDefault) e.preventDefault();
  const username = document.getElementById('reg-username')?.value.trim();
  const email = document.getElementById('reg-email')?.value.trim();
  const code = document.getElementById('reg-code')?.value.trim();
  const password = document.getElementById('reg-password')?.value.trim();
  const birthday = document.getElementById('reg-birthday')?.value.trim() || '';
  const phone = document.getElementById('reg-phone')?.value.trim() || '';
  const address = document.getElementById('reg-address')?.value.trim() || '';
  const truthCheck = document.getElementById('reg-truth-check');

  if (!username || !email || !password) {
    showToast('請完整填寫暱稱、信箱與密碼！', 'error');
    return;
  }
  if (!birthday) {
    showToast('請選擇出生年月日（生日為必填項目）！', 'error');
    document.getElementById('reg-birthday')?.focus();
    return;
  }
  if (!phone) {
    showToast('請填寫聯絡電話（電話為必填項目）！', 'error');
    document.getElementById('reg-phone')?.focus();
    return;
  }
  if (!code) {
    showToast('請填寫 6 位數信箱驗證碼！', 'error');
    document.getElementById('reg-code')?.focus();
    return;
  }
  if (code.length !== 6) {
    showToast('信箱驗證碼需為 6 位數字！', 'error');
    document.getElementById('reg-code')?.focus();
    return;
  }
  if (truthCheck && !truthCheck.checked) {
    showToast('請勾選保證註冊資訊真實且無造謠意圖！', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, code, birthday, phone, address })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || '註冊失敗，請檢查輸入內容！', 'error');
      return;
    }

    currentUser = data.user;
    localStorage.setItem('pika_user', JSON.stringify(currentUser));
    closeOAuthModal();
    updateAuthUI();
    if (typeof onAuthSuccess === 'function') onAuthSuccess();
    showToast(data.message || `歡迎加入皮卡學院，${currentUser.name}！`, 'success');
  } catch (err) {
    showToast('無法連接後端伺服器，請確認伺服器已啟動', 'error');
  }
};

window.submitNativeLogin = async function(e) {
  if (e && e.preventDefault) e.preventDefault();
  const account = document.getElementById('login-account')?.value.trim();
  const password = document.getElementById('login-password')?.value.trim();

  if (!account || !password) {
    showToast('請輸入電子信箱與密碼！', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || '登入失敗，請確認帳號密碼！', 'error');
      return;
    }

    currentUser = data.user;
    localStorage.setItem('pika_user', JSON.stringify(currentUser));
    closeOAuthModal();
    updateAuthUI();
    if (typeof onAuthSuccess === 'function') onAuthSuccess();
    showToast(data.message || `歡迎回來，${currentUser.name}！`, 'success');
    setTimeout(checkUserProfileCompletion, 600);
  } catch (err) {
    showToast('無法連接後端伺服器，請確認伺服器已啟動', 'error');
  }
};

window.simulateLogin = function(type) {
  if (type === 'admin') {
    currentUser = {
      name: '皮卡學院 (站長)',
      email: ADMIN_EMAIL,
      picture: 'https://yt3.ggpht.com/c7-XOamMdC1EGpIV18j6_czYvrmdw1B1BJQtUfnKB61qxkwxbm9A80yw4JJZnhfC-WowWsGtng=s800-c-k-c0x00ffffff-no-rj',
      isGoogleVerified: true,
      birthday: '1995-01-01',
      phone: '0912-345-678'
    };
  } else {
    currentUser = {
      name: '熱心小學員',
      email: 'viewer@gmail.com',
      picture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
      isGoogleVerified: true,
      birthday: '2000-01-01',
      phone: '0988-888-888'
    };
  }
  localStorage.setItem('pika_user', JSON.stringify(currentUser));
  closeOAuthModal();
  updateAuthUI();
  if (typeof onAuthSuccess === 'function') onAuthSuccess();
  showToast(`登入成功！身分：${currentUser.name}`, 'success');
};

window.handleLogout = function() {
  currentUser = null;
  localStorage.removeItem('pika_user');
  updateAuthUI();
  if (typeof onAuthSuccess === 'function') onAuthSuccess();
  showToast('已登出帳號！', 'info');
};

// ==========================================
// 會員個人資料完善檢查（Google 註冊/登入後必填生日與電話）
// ==========================================
window.checkUserProfileCompletion = function() {
  if (!currentUser) return;
  // 檢查是否缺少生日或電話（無論是一般註冊還是 Gmail 登入）
  const needsBirthday = !currentUser.birthday || String(currentUser.birthday).trim() === '';
  const needsPhone = !currentUser.phone || String(currentUser.phone).trim() === '';
  if (needsBirthday || needsPhone) {
    showProfileCompletionModal();
  }
};

window.showProfileCompletionModal = function() {
  if (!currentUser) return;
  let modal = document.getElementById('profile-completion-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    return;
  }

  modal = document.createElement('div');
  modal.id = 'profile-completion-modal';
  modal.className = 'fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-300';
  modal.innerHTML = `
    <div class="bg-gray-900 border border-yellow-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
      <div class="text-center mb-5">
        <div class="w-14 h-14 mx-auto mb-3 rounded-2xl bg-yellow-400/20 border border-yellow-400/40 flex items-center justify-center text-2xl text-yellow-400 shadow-lg shadow-yellow-400/10">
          🎂
        </div>
        <h3 class="text-lg font-extrabold text-white tracking-wide">請完善會員個人資料</h3>
        <p class="text-xs text-gray-300 mt-2 leading-relaxed">
          歡迎光臨皮卡學院！為確保帳號真實與安全保障，<strong class="text-yellow-400 font-bold">生日</strong>與<strong class="text-yellow-400 font-bold">聯絡電話</strong>為必填項目，請在下方完成補填：
        </p>
      </div>

      <form id="profile-completion-form" onsubmit="submitProfileCompletion(event)" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-gray-200 mb-1.5">
            🎂 出生年月日 (生日) <span class="text-red-400 font-bold">* (必填)</span>
          </label>
          <div class="relative">
            <input type="date" id="complete-profile-birthday" required
                   value="${currentUser.birthday || ''}"
                   class="w-full bg-gray-950 border border-gray-700 text-gray-100 text-xs sm:text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition">
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-200 mb-1.5">
            📞 聯絡電話 <span class="text-red-400 font-bold">* (必填)</span>
          </label>
          <div class="relative">
            <input type="tel" id="complete-profile-phone" required placeholder="例如：0912-345-678"
                   value="${currentUser.phone || ''}"
                   class="w-full bg-gray-950 border border-gray-700 text-gray-100 text-xs sm:text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition placeholder-gray-500">
          </div>
        </div>

        <div class="pt-2">
          <button type="submit" id="btn-submit-profile-completion"
                  class="w-full bg-gradient-to-r from-yellow-500 to-amber-400 hover:from-yellow-400 text-gray-950 font-bold py-3 px-4 rounded-xl transition flex items-center justify-center gap-2 text-xs sm:text-sm shadow-xl shadow-yellow-500/20 active:scale-95 cursor-pointer">
            <i class="fa-solid fa-check"></i>
            <span id="btn-submit-profile-completion-text">確認送出並完成建檔</span>
          </button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
};

window.submitProfileCompletion = async function(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!currentUser) return;

  const birthday = document.getElementById('complete-profile-birthday')?.value.trim();
  const phone = document.getElementById('complete-profile-phone')?.value.trim();

  if (!birthday) {
    showToast('請選擇您的出生年月日（生日為必填項目）！', 'error');
    document.getElementById('complete-profile-birthday')?.focus();
    return;
  }
  if (!phone) {
    showToast('請填寫聯絡電話（電話為必填項目）！', 'error');
    document.getElementById('complete-profile-phone')?.focus();
    return;
  }

  const btn = document.getElementById('btn-submit-profile-completion');
  const btnText = document.getElementById('btn-submit-profile-completion-text');
  if (btn) btn.disabled = true;
  if (btnText) btnText.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> 資料儲存中...';

  try {
    const res = await fetch(`${API_BASE}/api/user/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        email: currentUser.email,
        username: currentUser.name,
        birthday: birthday,
        phone: phone,
        address: currentUser.address || ''
      })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || '儲存失敗，請稍後再試！', 'error');
      if (btn) btn.disabled = false;
      if (btnText) btnText.innerText = '確認送出並完成建檔';
      return;
    }

    currentUser.birthday = birthday;
    currentUser.phone = phone;
    localStorage.setItem('pika_user', JSON.stringify(currentUser));

    const modal = document.getElementById('profile-completion-modal');
    if (modal) modal.remove();

    showToast('🎉 個人資料已成功完善！會員註冊流程完成。', 'success');
    if (window.renderUserProfileModal) window.renderUserProfileModal();
  } catch (err) {
    showToast('無法連接後端伺服器，請確認伺服器已啟動', 'error');
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerText = '確認送出並完成建檔';
  }
};

function updateAuthUI() {
  const loginBtn = document.getElementById('google-login-btn');
  const profileMenu = document.getElementById('user-profile-menu');
  const avatarEl = document.getElementById('user-avatar');
  const nameEl = document.getElementById('user-name');
  const adminTag = document.getElementById('admin-tag');
  const adminUsersBtn = document.getElementById('admin-users-btn');

  const isAdmin = currentUser && currentUser.email === ADMIN_EMAIL;

  if (currentUser) {
    if (loginBtn) loginBtn.classList.add('hidden');
    if (profileMenu) {
      profileMenu.classList.remove('hidden');
      profileMenu.classList.add('flex');
    }
    if (avatarEl) avatarEl.src = currentUser.picture || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(currentUser.name);
    if (nameEl) nameEl.textContent = currentUser.name;

    if (adminTag) {
      if (isAdmin) {
        adminTag.classList.remove('hidden');
      } else {
        adminTag.classList.add('hidden');
      }
    }
  } else {
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (profileMenu) {
      profileMenu.classList.add('hidden');
      profileMenu.classList.remove('flex');
    }
    if (adminTag) adminTag.classList.add('hidden');
  }

  // 站長專屬會員名單管理按鈕
  if (adminUsersBtn) {
    if (isAdmin) {
      adminUsersBtn.classList.remove('hidden');
      adminUsersBtn.classList.add('inline-flex');
      // 自動獲取會員數量顯示於徽章
      fetchUserCountBadge();
    } else {
      adminUsersBtn.classList.add('hidden');
      adminUsersBtn.classList.remove('inline-flex');
    }
  }

  // 站長專屬官方發信 (SMTP) 設定按鈕
  const adminSmtpBtn = document.getElementById('admin-smtp-btn');
  if (adminSmtpBtn) {
    if (isAdmin) {
      adminSmtpBtn.classList.remove('hidden');
      adminSmtpBtn.classList.add('inline-flex');
    } else {
      adminSmtpBtn.classList.add('hidden');
      adminSmtpBtn.classList.remove('inline-flex');
    }
  }

  // 🛡️ 嚴格限制：僅皮卡站長可看到「版面設計器」，一般觀眾與訪客完全隱藏
  if (typeof window.updateEditorPermission === 'function') {
    window.updateEditorPermission();
  }

  // 若目前頁面有提問表單，同步更新表單身分
  const formAvatar = document.getElementById('form-user-avatar');
  const formStatus = document.getElementById('form-user-status');
  const formLoginHint = document.getElementById('form-login-hint-btn');
  const authorInput = document.getElementById('qa-author');

  if (formAvatar && formStatus && authorInput) {
    if (currentUser) {
      formAvatar.src = currentUser.picture || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(currentUser.name);
      formAvatar.classList.remove('hidden');
      formStatus.innerHTML = `<span class="text-green-400 font-bold flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> ${currentUser.isGoogleVerified ? 'Google 驗證' : '已登入會員'}：${currentUser.name}</span>`;
      if (formLoginHint) formLoginHint.innerHTML = `<span class="text-xs text-gray-400">已登入</span>`;
      authorInput.value = currentUser.name;
      authorInput.readOnly = true;
    } else {
      formAvatar.classList.add('hidden');
      formStatus.textContent = '訪客模式（可自由填寫或登入）';
      if (formLoginHint) formLoginHint.innerHTML = `<span>登入 / 註冊</span><i class="fa-solid fa-chevron-right text-[10px]"></i>`;
      authorInput.readOnly = false;
    }
  }
}

// 快速獲取會員數以顯示於按鈕徽章
async function fetchUserCountBadge() {
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;
  try {
    const res = await fetch(`${API_BASE}/api/admin/users?adminEmail=${encodeURIComponent(currentUser.email)}`);
    if (res.ok) {
      const data = await res.json();
      const badge = document.getElementById('nav-user-count-badge');
      if (badge && data.users) {
        badge.innerText = data.users.length;
      }
    }
  } catch (e) {}
}

// ==========================================
// 站長會員資料庫管理中心邏輯 (Admin Member Panel)
// ==========================================
window.allAdminUsers = [];

window.openAdminUserModal = function() {
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) {
    showToast('僅皮卡站長有權限開啟會員管理中心！', 'error');
    return;
  }
  const modal = document.getElementById('admin-users-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    fetchAdminUsers();
  }
};

window.closeAdminUserModal = function() {
  const modal = document.getElementById('admin-users-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
};

window.fetchAdminUsers = async function() {
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;
  const tbody = document.getElementById('admin-users-table-body');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-8 text-center text-gray-500">
          <i class="fa-solid fa-spinner fa-spin text-xl text-yellow-400 mb-2"></i>
          <p>正在自後端 SQLite 資料庫載入會員名單...</p>
        </td>
      </tr>
    `;
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/users?adminEmail=${encodeURIComponent(currentUser.email)}`);
    if (res.ok) {
      const data = await res.json();
      window.allAdminUsers = data.users || [];

      // 更新統計數字
      const total = window.allAdminUsers.length;
      const active = window.allAdminUsers.filter(u => u.status === 'active').length;
      const suspended = window.allAdminUsers.filter(u => u.status === 'suspended').length;
      
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayCount = window.allAdminUsers.filter(u => (u.createdAt || '').startsWith(todayStr)).length;

      const totalEl = document.getElementById('stat-total-users');
      const activeEl = document.getElementById('stat-active-users');
      const suspendedEl = document.getElementById('stat-suspended-users');
      const todayEl = document.getElementById('stat-today-users');
      const badge = document.getElementById('nav-user-count-badge');

      if (totalEl) totalEl.innerText = total;
      if (activeEl) activeEl.innerText = active;
      if (suspendedEl) suspendedEl.innerText = suspended;
      if (todayEl) todayEl.innerText = todayCount;
      if (badge) badge.innerText = total;

      filterAdminUserList();
      return;
    }
  } catch (err) {
    console.error('Fetch users failed:', err);
  }

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-8 text-center text-red-400">
          <i class="fa-solid fa-triangle-exclamation text-xl mb-2"></i>
          <p>無法讀取會員資料庫，請確認後端伺服器已連線！</p>
        </td>
      </tr>
    `;
  }
};

window.filterAdminUserList = function() {
  const keyword = (document.getElementById('admin-user-search')?.value || '').trim().toLowerCase();
  let list = window.allAdminUsers || [];
  if (keyword) {
    list = list.filter(u => 
      (u.username && u.username.toLowerCase().includes(keyword)) ||
      (u.email && u.email.toLowerCase().includes(keyword)) ||
      (u.id && u.id.toLowerCase().includes(keyword))
    );
  }
  renderAdminUserTable(list);
};

window.renderAdminUserTable = function(users) {
  const tbody = document.getElementById('admin-users-table-body');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="py-8 text-center text-gray-500">
          <i class="fa-regular fa-folder-open text-2xl mb-2"></i>
          <p>目前沒有符合條件的會員資料。</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-900/60 transition";

    const isOwner = u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() || u.role === 'admin';
    const isSuspended = u.status === 'suspended';

    const roleBadge = isOwner
      ? `<span class="bg-yellow-400/20 text-yellow-300 border border-yellow-400/40 text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 w-fit"><i class="fa-solid fa-crown text-[9px]"></i> 站長</span>`
      : `<span class="bg-blue-950 text-blue-300 border border-blue-800 text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 w-fit"><i class="fa-solid fa-user text-[9px]"></i> 學員</span>`;

    const statusBadge = isSuspended
      ? `<span class="bg-red-950 text-red-400 border border-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit"><span class="w-1.5 h-1.5 rounded-full bg-red-400"></span> 已停權</span>`
      : `<span class="bg-green-950 text-green-400 border border-green-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit"><span class="w-1.5 h-1.5 rounded-full bg-green-400"></span> 正常</span>`;

    const avatarUrl = u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(u.username)}`;

    const birthdayText = u.birthday ? `🎂 ${u.birthday}` : '<span class="text-gray-600">未填生日</span>';
    const phoneText = u.phone ? `📞 ${u.phone}` : '<span class="text-gray-600">未填電話</span>';
    const addressText = u.address ? `<span class="line-clamp-1" title="${u.address}">🏠 ${u.address}</span>` : '<span class="text-gray-600 italic">未填地址</span>';

    let actions = '';
    if (isOwner) {
      actions = `<span class="text-gray-500 text-[11px] italic">站長官方帳號 (受保護)</span>`;
    } else {
      actions = `
        <div class="flex items-center justify-end gap-1.5">
          <button onclick="toggleUserStatus('${u.id}')"
                  class="px-2.5 py-1 text-[11px] font-bold rounded-lg border transition ${isSuspended ? 'bg-green-950 hover:bg-green-900 text-green-300 border-green-800' : 'bg-amber-950 hover:bg-amber-900 text-amber-300 border-amber-800'}"
                  title="${isSuspended ? '解除停權，恢復帳號' : '停權此帳號'}">
            ${isSuspended ? '<i class="fa-solid fa-lock-open"></i> 恢復' : '<i class="fa-solid fa-ban"></i> 停權'}
          </button>
          <button onclick="deleteUserAccount('${u.id}', '${u.username}')"
                  class="px-2 py-1 text-[11px] bg-red-950/80 hover:bg-red-900 text-red-400 border border-red-800/80 rounded-lg transition"
                  title="永久刪除此會員帳號">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      `;
    }

    tr.innerHTML = `
      <td class="py-3 px-3">
        <div class="flex items-center gap-2">
          <img src="${avatarUrl}" class="w-8 h-8 rounded-full border border-gray-700 object-cover bg-gray-950">
          <div>
            <div class="font-bold text-gray-200 text-xs">${u.username}</div>
            <div class="text-[10px] text-gray-500 font-mono">ID: ${u.id}</div>
          </div>
        </div>
      </td>
      <td class="py-3 px-3 font-mono text-gray-300 text-xs">${u.email}</td>
      <td class="py-3 px-3">${roleBadge}</td>
      <td class="py-3 px-3 text-[11px] text-gray-300 leading-tight">
        <div>${birthdayText}</div>
        <div class="mt-0.5">${phoneText}</div>
      </td>
      <td class="py-3 px-3 text-[11px] text-gray-300 max-w-[140px]">${addressText}</td>
      <td class="py-3 px-3">
        <button onclick="viewUserLogins('${u.id}', '${u.username}')"
                class="px-2.5 py-1 bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-300 border border-yellow-400/30 rounded-lg text-[11px] font-bold transition flex items-center gap-1">
          <i class="fa-regular fa-clock"></i>
          <span>${u.loginCount || 0} 次紀錄</span>
        </button>
      </td>
      <td class="py-3 px-3 font-mono text-center text-xs">${u.questionCount || 0} 則</td>
      <td class="py-3 px-3">${statusBadge}</td>
      <td class="py-3 px-3 text-right">${actions}</td>
    `;
    tbody.appendChild(tr);
  });
};

window.viewUserLogins = async function(userId, username) {
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;
  const modal = document.getElementById('admin-user-logins-modal');
  const titleEl = document.getElementById('admin-logins-user-title');
  const tbody = document.getElementById('admin-logins-tbody');

  if (titleEl) titleEl.innerText = `【${username}】每次登入時間歷史紀錄 (ID: ${userId})`;
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-1.5"></i> 載入登入紀錄中...</td></tr>`;
  }
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/users/${userId}/logins?adminEmail=${encodeURIComponent(currentUser.email)}`);
    if (res.ok) {
      const data = await res.json();
      const logins = data.logins || [];
      if (logins.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-gray-500">尚無登入時間紀錄</td></tr>`;
        return;
      }
      tbody.innerHTML = '';
      logins.forEach((log, index) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-800/50 transition";
        const timeStr = (log.loginTime || '').replace('T', ' ').slice(0, 19);
        tr.innerHTML = `
          <td class="py-2.5 px-3 font-mono text-gray-500 text-xs">${index + 1}</td>
          <td class="py-2.5 px-3 font-mono text-yellow-300 font-bold text-xs">${timeStr}</td>
          <td class="py-2.5 px-3 font-mono text-gray-400 text-xs">${log.ip || '127.0.0.1'}</td>
          <td class="py-2.5 px-3 text-gray-400 text-[11px] truncate max-w-[200px]" title="${log.userAgent || ''}">${(log.userAgent || '本機瀏覽器').slice(0, 45)}...</td>
        `;
        tbody.appendChild(tr);
      });
      return;
    }
  } catch (e) {}

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-red-400">載入登入紀錄失敗，請確認後端連線。</td></tr>`;
  }
};

window.closeUserLoginsModal = function() {
  const modal = document.getElementById('admin-user-logins-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
};

window.toggleUserStatus = async function(userId) {
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;
  try {
    const res = await fetch(`${API_BASE}/api/admin/users/${userId}/toggle-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminEmail: currentUser.email })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || '會員狀態已更新', 'success');
      fetchAdminUsers();
    } else {
      showToast(data.error || '操作失敗', 'error');
    }
  } catch (err) {
    showToast('網路連線失敗', 'error');
  }
};

window.deleteUserAccount = async function(userId, username) {
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;
  if (!confirm(`【🗑️ 永久刪除會員】確定要自資料庫永久刪除會員「${username}」的帳號嗎？\n此動作無法還原！`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/admin/users/${userId}?adminEmail=${encodeURIComponent(currentUser.email)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || '會員已成功刪除', 'success');
      fetchAdminUsers();
    } else {
      showToast(data.error || '刪除失敗', 'error');
    }
  } catch (err) {
    showToast('網路連線失敗', 'error');
  }
};

window.exportUsersCSV = function() {
  if (!window.allAdminUsers || window.allAdminUsers.length === 0) {
    showToast('目前沒有可匯出的會員資料！', 'error');
    return;
  }

  let csv = "\uFEFF會員ID,暱稱,電子信箱,身分角色,生日,聯絡電話,住家地址,總登入次數,提問篇數,帳號狀態,註冊時間,最後登入\n";
  window.allAdminUsers.forEach(u => {
    const role = (u.email === ADMIN_EMAIL || u.role === 'admin') ? '站長最高管理員' : '一般會員';
    const status = u.status === 'suspended' ? '已停權' : '正常啟用';
    const bday = (u.birthday || '').replace(/"/g, '""');
    const phone = (u.phone || '').replace(/"/g, '""');
    const addr = (u.address || '').replace(/"/g, '""').replace(/\r?\n/g, ' ');
    const createdAt = (u.createdAt || '').replace(',', ' ');
    const lastLogin = (u.lastLogin || '').replace(',', ' ');
    csv += `"${u.id}","${u.username}","${u.email}","${role}","${bday}","${phone}","${addr}","${u.loginCount || 0}","${u.questionCount || 0}","${status}","${createdAt}","${lastLogin}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `皮卡學院_註冊會員完整名冊_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('已成功匯出完整會員名單 CSV 報表！', 'success');
};

// ==========================================
// 會員個人資料與帳號安全中心 (Profile & Security Modal)
// ==========================================
window.openUserProfileModal = function() {
  if (!currentUser) {
    openOAuthModal();
    return;
  }
  const modal = document.getElementById('user-profile-modal');
  if (!modal) return;

  // 填入目前會員資訊
  const nameInput = document.getElementById('profile-username');
  const emailInput = document.getElementById('profile-email');
  const bdayInput = document.getElementById('profile-birthday');
  const phoneInput = document.getElementById('profile-phone');
  const addrInput = document.getElementById('profile-address');
  const avatarImg = document.getElementById('profile-modal-avatar');

  if (nameInput) nameInput.value = currentUser.name || '';
  if (emailInput) emailInput.value = currentUser.email || '';
  if (bdayInput) bdayInput.value = currentUser.birthday || '';
  if (phoneInput) phoneInput.value = currentUser.phone || '';
  if (addrInput) addrInput.value = currentUser.address || '';
  if (avatarImg) avatarImg.src = currentUser.picture || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(currentUser.name);

  // 預設開啟「個人資料」分頁
  switchProfileTab('info');
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  // 背景載入第三方帳號綁定狀態
  loadUserBindings();
};

window.closeUserProfileModal = function() {
  const modal = document.getElementById('user-profile-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
};

window.switchProfileTab = function(tab) {
  const tabInfo = document.getElementById('profile-tab-info');
  const tabPwd = document.getElementById('profile-tab-pwd');
  const tabLogs = document.getElementById('profile-tab-logs');
  const tabBind = document.getElementById('profile-tab-bind');

  const panelInfo = document.getElementById('profile-panel-info');
  const panelPwd = document.getElementById('profile-panel-pwd');
  const panelLogs = document.getElementById('profile-panel-logs');
  const panelBind = document.getElementById('profile-panel-bind');

  const activeCls = "py-2 px-3 text-xs font-bold rounded-xl transition bg-yellow-400 text-gray-950 shadow";
  const inactiveCls = "py-2 px-3 text-xs font-bold rounded-xl transition text-gray-400 hover:text-white";

  [tabInfo, tabPwd, tabLogs, tabBind].forEach(t => { if (t) t.className = inactiveCls; });
  [panelInfo, panelPwd, panelLogs, panelBind].forEach(p => { if (p) p.classList.add('hidden'); });

  if (tab === 'info') {
    if (tabInfo) tabInfo.className = activeCls;
    if (panelInfo) panelInfo.classList.remove('hidden');
  } else if (tab === 'pwd') {
    if (tabPwd) tabPwd.className = activeCls;
    if (panelPwd) panelPwd.classList.remove('hidden');
  } else if (tab === 'logs') {
    if (tabLogs) tabLogs.className = activeCls;
    if (panelLogs) panelLogs.classList.remove('hidden');
    loadMyLoginLogs();
  } else if (tab === 'bind') {
    if (tabBind) tabBind.className = activeCls;
    if (panelBind) panelBind.classList.remove('hidden');
    loadUserBindings();
  }
};

window.loadUserBindings = async function() {
  if (!currentUser) return;
  const account = currentUser.id || currentUser.email;
  try {
    const res = await fetch(`${API_BASE}/api/user/profile?userId=${encodeURIComponent(account)}`);
    const data = await res.json();
    if (data.success && data.user) {
      const u = data.user;
      const discordInput = document.getElementById('bind-discord-input');
      const scratchInput = document.getElementById('bind-scratch-input');
      const youtubeInput = document.getElementById('bind-youtube-input');
      const googleStatus = document.getElementById('bind-google-status');
      const googleEmail = document.getElementById('bind-google-email');
      const googleActionArea = document.getElementById('bind-google-action-area');

      if (discordInput) discordInput.value = u.discordUser || '';
      if (scratchInput) scratchInput.value = u.scratchUser || '';
      if (youtubeInput) youtubeInput.value = u.youtubeUser || '';

      const isGoogle = Boolean(u.googleId || currentUser.isGoogleVerified);
      if (googleStatus) {
        googleStatus.innerHTML = isGoogle ?
          `<span class="text-green-400 font-bold flex items-center gap-1.5 bg-green-950/60 border border-green-500/40 px-2.5 py-1 rounded-lg text-xs shadow-sm"><i class="fa-solid fa-circle-check text-green-400"></i> OAuth 已認證</span>` :
          `<span class="text-amber-400/90 flex items-center gap-1.5 bg-yellow-950/40 border border-yellow-500/30 px-2.5 py-1 rounded-lg text-xs"><i class="fa-regular fa-clock"></i> 尚未綁定</span>`;
      }
      if (googleEmail) {
        googleEmail.textContent = isGoogle ? (u.email || '已連結 Google 帳號') : '未綁定 Google OAuth';
      }
      if (googleActionArea) {
        if (isGoogle) {
          googleActionArea.innerHTML = `
            <div class="flex items-center justify-between gap-2 p-2.5 bg-[#0b0f19] border border-gray-800 rounded-xl">
              <span class="text-[11px] text-gray-400 truncate flex-1 font-mono">
                <i class="fa-brands fa-google text-red-400 mr-1"></i> ID: ${u.googleId ? (u.googleId.substring(0, 16) + '...') : 'Google 認證學員'}
              </span>
              <button type="button" onclick="unbindGoogleAccount()" class="px-3 py-1.5 text-xs rounded-lg bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-500/30 transition font-bold flex items-center gap-1 shrink-0">
                <i class="fa-solid fa-link-slash"></i> 解除綁定
              </button>
            </div>
          `;
        } else {
          googleActionArea.innerHTML = `
            <button type="button" onclick="startGoogleAccountBinding()" class="w-full bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white font-black py-2.5 px-3 rounded-xl transition text-xs flex items-center justify-center gap-2 shadow-lg">
              <i class="fa-brands fa-google text-sm"></i>
              <span>透過 Google OAuth 授權綁定</span>
            </button>
          `;
        }
      }
    }
  } catch (e) {
    console.error('Load bindings error:', e);
  }
};

// 會員使用 Google OAuth 綁定
window.startGoogleAccountBinding = async function() {
  if (!currentUser) return;
  const uid = currentUser.id || currentUser.email;
  try {
    const res = await fetch(`${API_BASE}/api/auth/google/url?action=bind&userId=${encodeURIComponent(uid)}`);
    const data = await res.json();
    if (data.success && data.configured) {
      const width = 540;
      const height = 660;
      const left = (window.screen.width / 2) - (width / 2);
      const top = (window.screen.height / 2) - (height / 2);
      window.open(data.auth_url, 'pika_google_bind', `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes`);
      showToast('已開啟 Google 授權綁定視窗，請完成確認...', 'info');
    } else {
      await window.simulateGoogleBind();
    }
  } catch (err) {
    await window.simulateGoogleBind();
  }
};

window.simulateGoogleBind = async function() {
  if (!currentUser) return;
  const uid = currentUser.id || currentUser.email;
  try {
    const res = await fetch(`${API_BASE}/api/auth/google/simulate-bind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: uid,
        email: currentUser.email || `pika_${Math.floor(Math.random()*9000+1000)}@gmail.com`
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('⚡ Google OAuth 帳號綁定成功！', 'success');
      currentUser.isGoogleVerified = true;
      localStorage.setItem('pika_user', JSON.stringify(currentUser));
      loadUserBindings();
    } else {
      showToast(data.error || '綁定失敗', 'error');
    }
  } catch (e) {
    showToast('連線失敗', 'error');
  }
};

window.unbindGoogleAccount = async function() {
  if (!currentUser) return;
  if (!confirm('確定要解除 Google 帳號綁定嗎？')) return;
  const uid = currentUser.id || currentUser.email;
  try {
    const res = await fetch(`${API_BASE}/api/user/unbind-google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid, email: currentUser.email })
    });
    const data = await res.json();
    if (data.success) {
      showToast('已成功解除 Google 帳號綁定！', 'success');
      currentUser.isGoogleVerified = false;
      localStorage.setItem('pika_user', JSON.stringify(currentUser));
      loadUserBindings();
    } else {
      showToast(data.error || '解除綁定失敗', 'error');
    }
  } catch (e) {
    showToast('連線失敗', 'error');
  }
};

// 會員使用 Google OAuth 快速登入
window.startGoogleUserLogin = async function() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/google/url?action=login`);
    const data = await res.json();
    if (data.success && data.configured) {
      const width = 540;
      const height = 660;
      const left = (window.screen.width / 2) - (width / 2);
      const top = (window.screen.height / 2) - (height / 2);
      window.open(data.auth_url, 'pika_google_login', `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes`);
      showToast('已開啟 Google 登入視窗，請完成授權...', 'info');
    } else {
      await window.simulateGoogleLogin();
    }
  } catch (err) {
    await window.simulateGoogleLogin();
  }
};

window.simulateGoogleLogin = async function() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/google/simulate-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `google_user_${Math.floor(Math.random()*9000+1000)}@gmail.com` })
    });
    const data = await res.json();
    if (data.success && data.user) {
      currentUser = data.user;
      localStorage.setItem('pika_user', JSON.stringify(currentUser));
      closeOAuthModal();
      updateAuthUI();
      showToast(`⚡ Google OAuth 快捷登入成功！歡迎 ${currentUser.name}`, 'success');
      if (typeof onAuthSuccess === 'function') onAuthSuccess();
    }
  } catch (e) {
    showToast('登入連線失敗', 'error');
  }
};

window.saveAccountBindings = async function(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!currentUser) return;

  const discordUser = document.getElementById('bind-discord-input')?.value.trim() || '';
  const scratchUser = document.getElementById('bind-scratch-input')?.value.trim() || '';
  const youtubeUser = document.getElementById('bind-youtube-input')?.value.trim() || '';

  const btn = document.getElementById('save-bindings-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> 儲存綁定中...`;
  }

  try {
    const res = await fetch(`${API_BASE}/api/user/bind-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id || currentUser.email,
        email: currentUser.email,
        discordUser: discordUser,
        scratchUser: scratchUser,
        youtubeUser: youtubeUser
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('第三方帳號綁定已成功儲存！', 'success');
      loadUserBindings();
    } else {
      showToast(data.error || '儲存失敗', 'error');
    }
  } catch (err) {
    showToast('連線伺服器異常', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-floppy-disk mr-1"></i> 儲存帳號綁定設定`;
    }
  }
};

window.saveUserProfile = async function(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!currentUser) return;

  const username = document.getElementById('profile-username')?.value.trim();
  const birthday = document.getElementById('profile-birthday')?.value.trim() || '';
  const phone = document.getElementById('profile-phone')?.value.trim() || '';
  const address = document.getElementById('profile-address')?.value.trim() || '';

  if (!username) {
    showToast('暱稱不能為空！', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/user/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        email: currentUser.email,
        username,
        birthday,
        phone,
        address
      })
    });
    const data = await res.json();
    if (res.ok) {
      currentUser = { ...currentUser, ...data.user };
      localStorage.setItem('pika_user', JSON.stringify(currentUser));
      updateAuthUI();
      showToast(data.message || '個人資料更新成功！', 'success');
      closeUserProfileModal();
    } else {
      showToast(data.error || '更新失敗', 'error');
    }
  } catch (err) {
    showToast('伺服器連線失敗', 'error');
  }
};

window.submitChangePassword = async function(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!currentUser) return;

  const oldPassword = document.getElementById('pwd-old')?.value.trim();
  const newPassword = document.getElementById('pwd-new')?.value.trim();
  const confirmPassword = document.getElementById('pwd-confirm')?.value.trim();

  if (!oldPassword || !newPassword || !confirmPassword) {
    showToast('請完整填寫舊密碼與新密碼！', 'error');
    return;
  }
  if (newPassword.length < 4) {
    showToast('新密碼長度至少需 4 個字元！', 'error');
    return;
  }
  if (newPassword !== confirmPassword) {
    showToast('兩次輸入的新密碼不相符，請再次確認！', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/user/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account: currentUser.email,
        oldPassword,
        newPassword
      })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || '密碼變更成功！請使用新密碼登入。', 'success');
      document.getElementById('pwd-old').value = '';
      document.getElementById('pwd-new').value = '';
      document.getElementById('pwd-confirm').value = '';
      closeUserProfileModal();
    } else {
      showToast(data.error || '密碼變更失敗', 'error');
    }
  } catch (err) {
    showToast('伺服器連線失敗', 'error');
  }
};

window.loadMyLoginLogs = async function() {
  if (!currentUser) return;
  const tbody = document.getElementById('my-logins-tbody');
  const countEl = document.getElementById('my-logins-count');
  if (tbody) tbody.innerHTML = `<tr><td colspan="3" class="py-6 text-center text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-1.5"></i> 讀取我的登入紀錄中...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/api/user/login-history?userId=${encodeURIComponent(currentUser.id || '')}&email=${encodeURIComponent(currentUser.email || '')}`);
    if (res.ok) {
      const data = await res.json();
      const logins = data.logins || [];
      if (countEl) countEl.innerText = logins.length;
      if (logins.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-6 text-center text-gray-500">尚無登入紀錄</td></tr>`;
        return;
      }
      tbody.innerHTML = '';
      logins.forEach((log, index) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-800/40 transition";
        const timeStr = (log.loginTime || '').replace('T', ' ').slice(0, 19);
        tr.innerHTML = `
          <td class="py-2.5 px-3 font-mono text-gray-500 text-xs">${index + 1}</td>
          <td class="py-2.5 px-3 font-mono text-yellow-300 font-bold text-xs">${timeStr}</td>
          <td class="py-2.5 px-3 font-mono text-gray-400 text-xs">${log.ip || '127.0.0.1'}</td>
        `;
        tbody.appendChild(tr);
      });
      return;
    }
  } catch (e) {}

  if (tbody) tbody.innerHTML = `<tr><td colspan="3" class="py-6 text-center text-red-400">載入紀錄失敗，請稍後再試。</td></tr>`;
};

// ==========================================
// 站長官方發信信箱 (SMTP) 設定管理
// ==========================================
window.openSmtpSettingsModal = async function() {
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) {
    showToast('僅皮卡站長具備官方發信設定權限！', 'error');
    return;
  }
  const modal = document.getElementById('admin-smtp-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
  await window.loadMailSettings();
};

window.closeSmtpSettingsModal = function() {
  const modal = document.getElementById('admin-smtp-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
};

window.currentMailTab = 'oauth';

window.switchMailTab = function(tab) {
  window.currentMailTab = tab;
  const tabOauthBtn = document.getElementById('tab-btn-oauth');
  const tabSmtpBtn = document.getElementById('tab-btn-smtp');
  const panelOauth = document.getElementById('mail-panel-oauth');
  const panelSmtp = document.getElementById('mail-panel-smtp');

  if (tab === 'oauth') {
    if (tabOauthBtn) {
      tabOauthBtn.className = 'flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-yellow-400 text-gray-950 shadow transition flex items-center justify-center gap-1.5';
    }
    if (tabSmtpBtn) {
      tabSmtpBtn.className = 'flex-1 py-2 px-3 text-xs font-semibold rounded-xl bg-gray-950 text-gray-400 hover:text-gray-200 transition flex items-center justify-center gap-1.5';
    }
    if (panelOauth) panelOauth.classList.remove('hidden');
    if (panelSmtp) panelSmtp.classList.add('hidden');
  } else {
    if (tabOauthBtn) {
      tabOauthBtn.className = 'flex-1 py-2 px-3 text-xs font-semibold rounded-xl bg-gray-950 text-gray-400 hover:text-gray-200 transition flex items-center justify-center gap-1.5';
    }
    if (tabSmtpBtn) {
      tabSmtpBtn.className = 'flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-yellow-400 text-gray-950 shadow transition flex items-center justify-center gap-1.5';
    }
    if (panelOauth) panelOauth.classList.add('hidden');
    if (panelSmtp) panelSmtp.classList.remove('hidden');
  }
};

window.loadMailSettings = async function() {
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;
  try {
    const res = await fetch(`${API_BASE}/api/admin/mail-settings?adminEmail=${encodeURIComponent(currentUser.email)}`);
    if (res.ok) {
      const data = await res.json();
      const s = data.settings || {};

      // OAuth 欄位
      const oauthClientIdInput = document.getElementById('oauth-client-id');
      const oauthClientSecretInput = document.getElementById('oauth-client-secret');
      const oauthStatusCard = document.getElementById('oauth-status-card');
      const btnOAuthConnect = document.getElementById('btn-oauth-connect');
      const btnOAuthDisconnect = document.getElementById('btn-oauth-disconnect');

      if (oauthClientIdInput) oauthClientIdInput.value = s.oauth_client_id || '';
      if (oauthClientSecretInput) {
        oauthClientSecretInput.value = '';
        oauthClientSecretInput.placeholder = s.has_client_secret ? '•••••••••••••••• (已設定，留空保留原密鑰)' : '請輸入 Google Client Secret';
      }

      if (oauthStatusCard) {
        if (s.oauth_connected) {
          oauthStatusCard.className = 'p-3.5 bg-green-950/40 border border-green-500/30 rounded-2xl text-xs space-y-1';
          oauthStatusCard.innerHTML = `
            <div class="font-bold flex items-center justify-between text-green-300">
              <span class="flex items-center gap-1.5"><i class="fa-solid fa-circle-check"></i> Google OAuth 2.0 已成功連結授權</span>
              <span class="text-[10px] bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-0.5 rounded-full font-mono">ONLINE</span>
            </div>
            <p class="text-gray-300 text-[11px] pt-1">
              發信帳號：<strong class="text-yellow-300">${s.oauth_authorized_email || ADMIN_EMAIL}</strong>（透過官方 Gmail API 加密傳輸）
            </p>
          `;
          if (btnOAuthConnect) {
            btnOAuthConnect.innerHTML = '<i class="fa-solid fa-arrows-rotate mr-1"></i> 重新授權 Google 發信';
            btnOAuthConnect.className = 'flex-1 bg-gray-800 hover:bg-gray-700 text-yellow-300 border border-yellow-400/30 font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center';
          }
          if (btnOAuthDisconnect) btnOAuthDisconnect.classList.remove('hidden');
        } else {
          oauthStatusCard.className = 'p-3.5 bg-yellow-950/40 border border-yellow-500/30 rounded-2xl text-xs space-y-1';
          oauthStatusCard.innerHTML = `
            <div class="font-bold flex items-center gap-1.5 text-yellow-300">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <span>Google OAuth 2.0 尚未授權發信</span>
            </div>
            <p class="text-gray-300 text-[11px] pt-1">
              請先填寫下方 Client ID 與 Secret 點擊儲存，再點擊「登入 Google 授權發信」按鈕完成一鍵綁定。
            </p>
          `;
          if (btnOAuthConnect) {
            btnOAuthConnect.innerHTML = '<i class="fa-brands fa-google mr-1 text-red-400"></i> 登入 Google 授權發信 (Gmail API)';
            btnOAuthConnect.className = 'flex-1 bg-yellow-400 hover:bg-yellow-300 text-gray-950 font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center shadow';
          }
          if (btnOAuthDisconnect) btnOAuthDisconnect.classList.add('hidden');
        }
      }

      // 傳統 SMTP 欄位
      const enabledCheckbox = document.getElementById('smtp-enabled');
      const hostInput = document.getElementById('smtp-host');
      const portInput = document.getElementById('smtp-port');
      const securitySelect = document.getElementById('smtp-security');
      const userInput = document.getElementById('smtp-user');
      const passInput = document.getElementById('smtp-pass');
      const senderNameInput = document.getElementById('smtp-sender-name');

      if (enabledCheckbox) enabledCheckbox.checked = s.smtp_enabled === '1';
      if (hostInput) hostInput.value = s.smtp_host || 'smtp.gmail.com';
      if (portInput) portInput.value = s.smtp_port || '465';
      if (securitySelect) securitySelect.value = s.smtp_security || 'ssl';
      if (userInput) userInput.value = s.smtp_user || ADMIN_EMAIL;
      if (senderNameInput) senderNameInput.value = s.smtp_sender_name || '皮卡學院官方網站';
      if (passInput) {
        passInput.value = '';
        passInput.placeholder = s.has_pass ? '•••••••••••••••• (已設定，留空保留原密碼)' : '請輸入 16 位 Google 應用程式密碼';
      }

      // 測試信箱預設值
      const testEmailInput = document.getElementById('smtp-test-email');
      if (testEmailInput && !testEmailInput.value) testEmailInput.value = ADMIN_EMAIL;

      // 頂部狀態燈號
      const statusBadge = document.getElementById('smtp-status-badge');
      if (statusBadge) {
        if (s.mail_mode === 'oauth') {
          if (s.oauth_connected) {
            statusBadge.innerHTML = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1.5"><i class="fa-solid fa-bolt"></i> Google OAuth 已啟用</span>';
          } else {
            statusBadge.innerHTML = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 flex items-center gap-1.5"><i class="fa-solid fa-triangle-exclamation"></i> OAuth 待授權</span>';
          }
        } else {
          if (s.smtp_enabled === '1' && s.has_pass) {
            statusBadge.innerHTML = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1.5"><i class="fa-solid fa-envelope"></i> SMTP 發信中</span>';
          } else {
            statusBadge.innerHTML = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-700/60 text-gray-400 border border-gray-600/50 flex items-center gap-1.5"><i class="fa-solid fa-flask"></i> 本機沙盒模擬模式</span>';
          }
        }
      }

      // 根據設定自動切換預設分頁
      window.switchMailTab(s.mail_mode || 'oauth');
    }
  } catch (err) {
    showToast('讀取郵件設定失敗', 'error');
  }
};
window.loadSmtpSettings = window.loadMailSettings;

window.saveMailSettings = async function(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;

  const mailMode = window.currentMailTab || 'oauth';
  const oauthClientId = document.getElementById('oauth-client-id')?.value.trim();
  const oauthClientSecret = document.getElementById('oauth-client-secret')?.value.trim();

  const enabled = document.getElementById('smtp-enabled')?.checked ? '1' : '0';
  const host = document.getElementById('smtp-host')?.value.trim();
  const port = document.getElementById('smtp-port')?.value.trim();
  const security = document.getElementById('smtp-security')?.value.trim();
  const user = document.getElementById('smtp-user')?.value.trim();
  const pass = document.getElementById('smtp-pass')?.value.trim();
  const senderName = document.getElementById('smtp-sender-name')?.value.trim();

  try {
    const res = await fetch(`${API_BASE}/api/admin/mail-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminEmail: currentUser.email,
        mail_mode: mailMode,
        oauth_client_id: oauthClientId,
        oauth_client_secret: oauthClientSecret,
        smtp_enabled: enabled,
        smtp_host: host,
        smtp_port: port,
        smtp_security: security,
        smtp_user: user,
        smtp_pass: pass,
        smtp_sender_name: senderName
      })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || '郵件發信設定已成功儲存！', 'success');
      await window.loadMailSettings();
    } else {
      showToast(data.error || '儲存失敗', 'error');
    }
  } catch (err) {
    showToast('連線失敗，請檢查伺服器狀態', 'error');
  }
};
window.saveSmtpSettings = window.saveMailSettings;

window.startGoogleOAuth = async function() {
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;
  const clientId = document.getElementById('oauth-client-id')?.value.trim();
  if (!clientId || clientId.startsWith('test-') || clientId.includes('YOUR_')) {
    showToast('⚠️ 目前填寫的是範例代碼！請至 Google Cloud 複製真正的 Client ID 後再點擊授權。', 'error');
    document.getElementById('oauth-client-id')?.focus();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/oauth/url?adminEmail=${encodeURIComponent(currentUser.email)}`);
    const data = await res.json();
    if (res.ok && data.auth_url) {
      const width = 580;
      const height = 680;
      const left = (window.screen.width / 2) - (width / 2);
      const top = (window.screen.height / 2) - (height / 2);
      window.open(data.auth_url, 'pika_google_oauth', `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes`);
      showToast('已開啟 Google 授權視窗，請於快顯視窗完成登入同意！', 'info');
    } else {
      showToast(data.error || '無法產生 Google 授權網址，請確認 Client ID 是否已儲存', 'error');
    }
  } catch (err) {
    showToast('連線至伺服器異常', 'error');
  }
};

window.disconnectGoogleOAuth = async function() {
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;
  if (!confirm('確定要解除 Google OAuth 授權發信憑證嗎？解除後系統將自動切換為沙盒或 SMTP 發信。')) return;

  try {
    const res = await fetch(`${API_BASE}/api/admin/oauth/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminEmail: currentUser.email })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || '已成功解除 Google OAuth 發信授權！', 'success');
      await window.loadMailSettings();
    } else {
      showToast(data.error || '解除授權失敗', 'error');
    }
  } catch (err) {
    showToast('連線失敗，請檢查伺服器狀態', 'error');
  }
};

// 監聽 OAuth 彈跳視窗回傳訊息 (支援站長發信授權、會員 OAuth 帳號綁定、會員 OAuth 登入)
window.addEventListener('message', async (event) => {
  if (!event.data) return;
  const t = event.data.type;
  if (t === 'oauth_success') {
    showToast(`⚡ Google 發信授權成功！已成功綁定發信信箱：${event.data.email}`, 'success');
    if (window.loadMailSettings) await window.loadMailSettings();
  } else if (t === 'oauth_error') {
    showToast(`❌ Google 授權失敗：${event.data.error}`, 'error');
  } else if (t === 'google_bind_success') {
    showToast(`⚡ Google 帳號 OAuth 綁定成功！(${event.data.email})`, 'success');
    if (currentUser) currentUser.isGoogleVerified = true;
    if (window.loadUserBindings) await window.loadUserBindings();
  } else if (t === 'google_bind_error') {
    showToast(`❌ Google 帳號綁定失敗：${event.data.error}`, 'error');
  } else if (t === 'google_login_success') {
    currentUser = event.data.user;
    localStorage.setItem('pika_user', JSON.stringify(currentUser));
    closeOAuthModal();
    updateAuthUI();
    showToast(`⚡ 歡迎登入，${currentUser.name}！`, 'success');
    if (typeof onAuthSuccess === 'function') onAuthSuccess();
    setTimeout(checkUserProfileCompletion, 600);
  } else if (t === 'google_login_error') {
    showToast(`❌ Google 登入失敗：${event.data.error}`, 'error');
  }
});

window.copyOAuthRedirectUri = function() {
  const uri = `${window.location.origin}/api/auth/google/oauth2callback`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(uri).then(() => {
      showToast('已複製回調網址 (Redirect URI) 至剪貼簿！', 'success');
    });
  } else {
    prompt('請複製以下已授權重新導向 URI：', uri);
  }
};

window.sendTestMail = async function() {
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) return;
  const testEmail = document.getElementById('smtp-test-email')?.value.trim();
  const btn = document.getElementById('btn-smtp-test');
  const btnText = document.getElementById('btn-smtp-test-text');

  if (!testEmail || !testEmail.includes('@') || !testEmail.includes('.')) {
    showToast('請輸入正確的測試收件電子信箱！', 'error');
    document.getElementById('smtp-test-email')?.focus();
    return;
  }

  if (btn) btn.disabled = true;
  if (btnText) btnText.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> 連線寄送中...';

  try {
    const res = await fetch(`${API_BASE}/api/admin/test-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminEmail: currentUser.email,
        testEmail: testEmail
      })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || '測試信寄送成功！請檢查收件匣。', 'success');
    } else {
      showToast(data.message || data.error || '測試信發送失敗', 'error');
    }
  } catch (err) {
    showToast('發信逾時或連線失敗，請檢查伺服器網路', 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerHTML = '<i class="fa-solid fa-paper-plane mr-1"></i> 發送連線測試信';
  }
};
window.sendTestSmtpEmail = window.sendTestMail;

// 行動版漢堡選單切換
window.toggleMobileMenu = function() {
  const menu = document.getElementById('mobile-menu');
  if (menu) {
    menu.classList.toggle('hidden');
  }
};

// 頻道詳細數據全域快取 (減少跨頁面重複向 YouTube API 發請求)
async function getCachedChannelStats() {
  const cached = sessionStorage.getItem('pika_channel_stats');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${CHANNEL_ID}&key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      const statsObj = {
        subs: item.statistics.subscriberCount,
        videos: item.statistics.videoCount,
        views: item.statistics.viewCount,
        avatar: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
        customUrl: item.snippet.customUrl || '@皮卡學院',
        uploadsId: item.contentDetails.relatedPlaylists.uploads
      };
      sessionStorage.setItem('pika_channel_stats', JSON.stringify(statsObj));
      return statsObj;
    }
  } catch (err) {
    console.error('抓取頻道數據失敗:', err);
  }

  return {
    subs: '1000',
    videos: '41',
    views: '50000',
    avatar: 'https://yt3.ggpht.com/c7-XOamMdC1EGpIV18j6_czYvrmdw1B1BJQtUfnKB61qxkwxbm9A80yw4JJZnhfC-WowWsGtng=s800-c-k-c0x00ffffff-no-rj',
    customUrl: '@皮卡學院',
    uploadsId: 'UU' + CHANNEL_ID.substring(2)
  };
}

// 全站懸浮聊天捷徑按鈕 (若不在 chat.html 頁面時自動掛載)
function initFloatingChatButton() {
  if (window.location.pathname.endsWith('chat.html') || window.location.pathname.endsWith('/chat')) return;
  if (document.getElementById('floating-chat-btn')) return;

  const btn = document.createElement('a');
  btn.id = 'floating-chat-btn';
  btn.href = 'chat.html';
  btn.className = 'fixed bottom-6 right-6 z-40 bg-yellow-400 hover:bg-yellow-300 text-gray-950 font-black px-4 py-2.5 rounded-full shadow-2xl transition transform hover:scale-105 flex items-center gap-2 border-2 border-gray-950';
  btn.innerHTML = `
    <span class="relative flex h-2.5 w-2.5">
      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
      <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
    </span>
    <i class="fa-solid fa-comments text-sm"></i>
    <span class="text-xs font-bold tracking-wide">即時聊天 ＆ 悄悄話</span>
  `;
  document.body.appendChild(btn);
}

// 頁面加載完成後自動初始化
window.addEventListener('load', () => {
  initGoogleAuth();
  initFloatingChatButton();
});
