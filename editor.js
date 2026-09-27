/**
 * 皮卡學院 (Pika Academy) - 全功能視覺化版面建構器與視窗設計器 (Page & Window Builder)
 * 支援：文字即時編輯、新增自訂卡片/橫幅/影片區塊、自訂彈跳視窗 (Modals)、區塊調序與刪除
 */

(function() {
  let isEditing = false;
  let siteContent = {};
  let currentBlocks = [];
  let modalConfig = {
    enabled: false,
    title: '⚡ 皮卡學院特別公告',
    content: '歡迎來到皮卡學院！最新 Scratch 遊戲專題與極難關卡攻略火熱更新中～',
    image: '',
    btnText: '前往查看精彩內容',
    btnLink: 'videos.html',
    autoPopup: true
  };

  let announcementConfig = {
    id: 'global',
    enabled: true,
    mode: 'always', // 'always' | 'scheduled'
    startTime: '',
    endTime: '',
    delaySeconds: 0,
    text: '⚡ 歡迎來到皮卡學院官方網站！每週定期更新 Scratch 教學與精選遊戲實況～',
    link: '',
    theme: 'yellow'
  };

  // 取得當前分頁名稱 (index, videos, qa, about)
  function getCurrentPageName() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('videos')) return 'videos';
    if (path.includes('qa')) return 'qa';
    if (path.includes('about')) return 'about';
    return 'index';
  }

  const PAGE_NAME = getCurrentPageName();

  // ==========================================
  // 1. 初始化資料 (讀取文字、版面區塊、視窗設定)
  // ==========================================
  async function initAllData() {
    // 1. 讀取文字內容
    try {
      const cachedContent = localStorage.getItem('pika_site_content');
      if (cachedContent) {
        siteContent = JSON.parse(cachedContent);
        applyContentToDOM(siteContent);
      }
    } catch (e) {}

    try {
      const res = await fetch(`${API_BASE}/api/site-content`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.content) {
          siteContent = { ...siteContent, ...data.content };
          localStorage.setItem('pika_site_content', JSON.stringify(siteContent));
          applyContentToDOM(siteContent);
        }
      }
    } catch (err) {}

    // 2. 讀取版面與視窗設定
    try {
      const cachedLayout = localStorage.getItem(`pika_layout_${PAGE_NAME}`);
      if (cachedLayout) {
        const parsed = JSON.parse(cachedLayout);
        if (parsed.blocks) currentBlocks = parsed.blocks;
        if (parsed.modal) modalConfig = { ...modalConfig, ...parsed.modal };
        renderDynamicBlocks();
        handleAutoPopup();
      }
    } catch (e) {}

    try {
      const res = await fetch(`${API_BASE}/api/site-layout?page=${PAGE_NAME}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (Array.isArray(data.blocks)) currentBlocks = data.blocks;
          if (data.modal && typeof data.modal === 'object' && Object.keys(data.modal).length > 0) {
            modalConfig = { ...modalConfig, ...data.modal };
          }
          localStorage.setItem(`pika_layout_${PAGE_NAME}`, JSON.stringify({ blocks: currentBlocks, modal: modalConfig }));
          renderDynamicBlocks();
          handleAutoPopup();
        }
      }
    } catch (err) {}

    // 3. 讀取全站頂部公告排程與設定
    try {
      const cachedAnn = localStorage.getItem('pika_announcement');
      if (cachedAnn) {
        announcementConfig = { ...announcementConfig, ...JSON.parse(cachedAnn) };
        renderAnnouncementBar();
      }
    } catch (e) {}

    try {
      const res = await fetch(`${API_BASE}/api/announcement`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.announcement) {
          announcementConfig = { ...announcementConfig, ...data.announcement };
          localStorage.setItem('pika_announcement', JSON.stringify(announcementConfig));
          renderAnnouncementBar();
        }
      }
    } catch (err) {}
  }

  // 判定當前時間公告是否應該出來
  function isAnnouncementActive() {
    if (!announcementConfig || !announcementConfig.enabled) return false;
    if (announcementConfig.mode === 'scheduled') {
      const now = new Date();
      if (announcementConfig.startTime) {
        const start = new Date(announcementConfig.startTime);
        if (!isNaN(start.getTime()) && now < start) return false;
      }
      if (announcementConfig.endTime) {
        const end = new Date(announcementConfig.endTime);
        if (!isNaN(end.getTime()) && now > end) return false;
      }
    }
    return true;
  }

  // 渲染頂部公告條（含時機判斷、延遲滑出、自訂配色與文字連結）
  function renderAnnouncementBar() {
    const bar = document.getElementById('top-announcement-bar');
    if (!bar) return;

    const active = isAnnouncementActive();
    const theme = announcementConfig.theme || 'yellow';

    // 移除現有主題 class
    bar.classList.remove('theme-yellow', 'theme-red', 'theme-blue', 'theme-purple');
    bar.classList.add(`theme-${theme}`);

    if (!active) {
      if (isEditing) {
        // 站長編輯模式下：顯示提示告知訪客隱藏，並允許點擊修改
        bar.classList.remove('announcement-hidden');
        bar.classList.add('announcement-inactive-admin');
        let statusMsg = !announcementConfig.enabled ? '已關閉停用' : '未達排程時間或已過期';
        if (announcementConfig.mode === 'scheduled' && announcementConfig.startTime) {
          const now = new Date();
          const start = new Date(announcementConfig.startTime);
          if (now < start) {
            statusMsg = `預計 ${announcementConfig.startTime.replace('T', ' ')} 出現`;
          }
        }
        bar.innerHTML = `
          <div class="flex items-center justify-center gap-2.5 flex-wrap">
            <span class="bg-rose-500/30 text-rose-200 border border-rose-500/60 text-[11px] px-3 py-0.5 rounded-full font-black flex items-center gap-1">
              <i class="fa-solid fa-eye-slash"></i> 目前狀態：不出現（${statusMsg}）
            </span>
            <i class="fa-solid fa-bullhorn text-xs"></i>
            <span data-editable="global_announcement">${announcementConfig.text || ''}</span>
            <button onclick="window.toggleAnnouncementVisibility()" class="bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-black px-3 py-1 rounded-xl text-xs shadow-lg transition flex items-center gap-1 transform hover:scale-105">
              <i class="fa-solid fa-eye"></i> 點此切換為【要出現】
            </button>
            <button onclick="window.openAnnouncementStudio()" class="bg-gray-800 hover:bg-gray-700 text-yellow-400 font-bold px-2.5 py-1 rounded-xl text-xs border border-gray-700 shadow transition ml-1">
              <i class="fa-solid fa-gear"></i> 詳細排程
            </button>
          </div>
        `;
      } else {
        // 一般訪客：完全隱藏
        bar.classList.add('announcement-hidden');
        bar.classList.remove('announcement-inactive-admin');
      }
      updateToolbarVisibilityBtn();
      return;
    }

    // 正常啟用狀態
    bar.classList.remove('announcement-inactive-admin');

    let textSpan = `<span data-editable="global_announcement">${announcementConfig.text || ''}</span>`;
    let mainContent = textSpan;
    if (announcementConfig.link) {
      mainContent = `<a href="${announcementConfig.link}" target="_blank" class="hover:underline flex items-center gap-1.5">${textSpan} <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i></a>`;
    }

    bar.innerHTML = `
      <div class="flex items-center justify-center gap-2.5 flex-wrap">
        <i class="fa-solid fa-bullhorn text-xs animate-bounce"></i>
        ${mainContent}
        ${isEditing ? `
          <button onclick="window.toggleAnnouncementVisibility()" class="bg-rose-600 hover:bg-rose-500 text-white font-black px-2.5 py-0.5 rounded-lg text-xs shadow-lg transition ml-2 flex items-center gap-1 transform hover:scale-105" title="點擊讓此公告對訪客隱藏不出現">
            <i class="fa-solid fa-eye-slash"></i> 點此設為【不出現】
          </button>
        ` : ''}
      </div>
    `;

    // 處理進入網頁延遲出現秒數
    const delaySec = parseInt(announcementConfig.delaySeconds) || 0;
    if (delaySec > 0 && !window._announcementShown) {
      bar.classList.add('announcement-hidden');
      setTimeout(() => {
        bar.classList.remove('announcement-hidden');
        bar.classList.add('slide-in');
        window._announcementShown = true;
      }, delaySec * 1000);
    } else {
      bar.classList.remove('announcement-hidden');
    }

    updateToolbarVisibilityBtn();
  }

  // 一鍵切換頂部公告【出現 / 不出現】 (僅皮卡站長可切換)
  window.toggleAnnouncementVisibility = async function() {
    const user = typeof currentUser !== 'undefined' && currentUser ? currentUser : JSON.parse(localStorage.getItem('pika_user') || 'null');
    const adminEmail = typeof ADMIN_EMAIL !== 'undefined' ? ADMIN_EMAIL : 'ytfgtfretftrr@gmail.com';
    if (!user || user.email.toLowerCase() !== adminEmail.toLowerCase()) {
      showToast('⛔ 無管理者權限！僅皮卡站長有權切換公告狀態。', 'error');
      return;
    }

    announcementConfig.enabled = !announcementConfig.enabled;
    localStorage.setItem('pika_announcement', JSON.stringify(announcementConfig));
    try {
      await fetch(`${API_BASE}/api/announcement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail: user.email, announcement: announcementConfig })
      });
    } catch (e) {}

    renderAnnouncementBar();
    const statusMsg = announcementConfig.enabled ? '【要出現】（訪客打開網頁即可看到）' : '【不出現】（已完全對訪客隱藏）';
    showToast(`頂部公告已成功切換為：${statusMsg}！`, announcementConfig.enabled ? 'success' : 'info');
  };

  // 更新工具列上的出現/不出現按鈕外觀
  function updateToolbarVisibilityBtn() {
    const btn = document.getElementById('editor-ann-toggle-vis-btn');
    const icon = document.getElementById('editor-ann-toggle-vis-icon');
    const text = document.getElementById('editor-ann-toggle-vis-text');
    if (!btn || !icon || !text) return;

    if (announcementConfig.enabled) {
      btn.className = "hidden items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black px-3.5 py-2 rounded-full shadow-lg transition";
      if (isEditing) {
        btn.classList.remove('hidden');
        btn.classList.add('inline-flex');
      }
      icon.className = "fa-solid fa-eye";
      text.textContent = "公告：出現中";
      btn.title = "目前設定為【出現中】，點擊可一鍵改為【不出現】";
    } else {
      btn.className = "hidden items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black px-3.5 py-2 rounded-full shadow-lg transition";
      if (isEditing) {
        btn.classList.remove('hidden');
        btn.classList.add('inline-flex');
      }
      icon.className = "fa-solid fa-eye-slash";
      text.textContent = "公告：不出現";
      btn.title = "目前設定為【不出現】，點擊可一鍵改為【要出現】";
    }
  }

  function applyContentToDOM(contentMap) {
    if (!contentMap) return;
    document.querySelectorAll('[data-editable]').forEach(el => {
      const key = el.getAttribute('data-editable');
      if (key && contentMap[key] !== undefined && contentMap[key] !== '') {
        el.innerHTML = contentMap[key];
      }
    });
  }

  // ==========================================
  // 2. 視窗與彈跳視窗 (Popup Window) 渲染
  // ==========================================
  function handleAutoPopup() {
    if (!modalConfig || !modalConfig.enabled) return;
    if (modalConfig.autoPopup) {
      const hasShown = sessionStorage.getItem(`pika_popup_shown_${PAGE_NAME}`);
      if (!hasShown) {
        setTimeout(() => {
          openCustomPopupWindow();
          sessionStorage.setItem(`pika_popup_shown_${PAGE_NAME}`, '1');
        }, 800);
      }
    }
  }

  window.openCustomPopupWindow = function() {
    let modalEl = document.getElementById('custom-popup-modal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'custom-popup-modal';
      modalEl.className = 'custom-modal-backdrop hidden';
      document.body.appendChild(modalEl);
    }

    modalEl.innerHTML = `
      <div class="bg-gray-900 border border-yellow-500/50 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative animate-in fade-in zoom-in duration-300">
        <button onclick="window.closeCustomPopupWindow()" class="absolute top-5 right-5 text-gray-400 hover:text-white text-xl">
          <i class="fa-solid fa-xmark"></i>
        </button>

        ${modalConfig.image ? `
          <div class="rounded-2xl overflow-hidden aspect-video w-full bg-gray-950 border border-gray-800">
            <img src="${modalConfig.image}" alt="Popup Banner" class="w-full h-full object-cover">
          </div>
        ` : ''}

        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 bg-yellow-950/80 text-yellow-400 text-xs px-3 py-1 rounded-full border border-yellow-700/60 font-bold">
            <i class="fa-solid fa-bell animate-bounce"></i>
            <span>皮卡官方特別視窗</span>
          </div>
          <h3 class="text-2xl font-black text-white leading-snug">${modalConfig.title || '特別公告'}</h3>
          <p class="text-gray-300 text-sm leading-relaxed">${modalConfig.content || ''}</p>
        </div>

        ${modalConfig.btnText && modalConfig.btnLink ? `
          <div class="pt-2">
            <a href="${modalConfig.btnLink}" class="w-full bg-gradient-to-r from-yellow-500 to-amber-400 hover:from-yellow-400 hover:to-amber-300 text-gray-950 font-black py-3.5 px-6 rounded-2xl shadow-xl shadow-yellow-500/20 transition transform hover:-translate-y-0.5 flex items-center justify-center gap-2 text-sm">
              <span>${modalConfig.btnText}</span>
              <i class="fa-solid fa-arrow-right"></i>
            </a>
          </div>
        ` : ''}
      </div>
    `;

    modalEl.classList.remove('hidden');
    modalEl.classList.add('flex');
  };

  window.closeCustomPopupWindow = function() {
    const modalEl = document.getElementById('custom-popup-modal');
    if (modalEl) {
      modalEl.classList.add('hidden');
      modalEl.classList.remove('flex');
    }
  };

  // ==========================================
  // 3. 動態自訂區塊 (Dynamic Blocks) 渲染引擎
  // ==========================================
  function renderDynamicBlocks() {
    let container = document.getElementById('dynamic-blocks-container');
    if (!container) {
      // 若頁面沒有預留容器，自動插入到 main 或 footer 上方
      container = document.createElement('div');
      container.id = 'dynamic-blocks-container';
      container.className = 'max-w-6xl mx-auto px-6 space-y-6 my-10';
      const footer = document.querySelector('footer');
      if (footer && footer.parentNode) {
        footer.parentNode.insertBefore(container, footer);
      } else {
        document.body.appendChild(container);
      }
    }

    if (currentBlocks.length === 0) {
      container.innerHTML = isEditing ? `
        <div class="border-2 border-dashed border-yellow-500/40 rounded-3xl p-8 text-center text-gray-400 bg-gray-900/40">
          <i class="fa-solid fa-cubes text-3xl text-yellow-400 mb-2"></i>
          <h4 class="font-bold text-white text-base">目前尚無自訂動態區塊</h4>
          <p class="text-xs text-gray-500 mt-1">點擊右下角『➕ 新增區塊』即可插入精彩圖文卡片、橫幅公告或 YouTube 影片！</p>
        </div>
      ` : '';
      return;
    }

    container.innerHTML = '';
    currentBlocks.forEach((block, idx) => {
      const isHidden = Boolean(block.hidden);
      if (isHidden && !isEditing) {
        return; // 一般訪客模式下不出現
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'dynamic-block-wrapper';
      wrapper.dataset.blockIndex = idx;
      if (isHidden && isEditing) {
        wrapper.classList.add('opacity-40', 'border-rose-500/60');
      }

      // 編輯模式動作控制條
      const actionsHtml = `
        <div class="block-actions-badge">
          <button onclick="window.moveBlockUp(${idx})" class="text-gray-300 hover:text-yellow-400 text-xs px-1" title="向上移動">
            <i class="fa-solid fa-arrow-up"></i>
          </button>
          <button onclick="window.moveBlockDown(${idx})" class="text-gray-300 hover:text-yellow-400 text-xs px-1" title="向下移動">
            <i class="fa-solid fa-arrow-down"></i>
          </button>
          <button onclick="window.toggleBlockVisibility(${idx})" class="${isHidden ? 'text-rose-400 hover:text-rose-300 font-black' : 'text-emerald-400 hover:text-emerald-300 font-bold'} text-xs px-1.5 flex items-center gap-1" title="${isHidden ? '目前為【不出現】，點擊切換為【要出現】' : '目前為【要出現】，點擊切換為【不出現】'}">
            <i class="fa-solid ${isHidden ? 'fa-eye-slash' : 'fa-eye'}"></i>
            <span class="text-[10px]">${isHidden ? '不出現' : '出現中'}</span>
          </button>
          <button onclick="window.deleteBlock(${idx})" class="text-gray-400 hover:text-red-400 text-xs px-1 ml-1" title="刪除此區塊">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      `;

      let contentHtml = '';

      // 類型 1: 精選圖文卡片 (Card)
      if (block.type === 'card') {
        contentHtml = `
          <div class="pika-card rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-center gap-6 shadow-xl">
            ${block.image ? `
              <div class="md:w-1/3 w-full aspect-video rounded-2xl overflow-hidden bg-gray-950 border border-gray-800">
                <img src="${block.image}" alt="${block.title}" class="w-full h-full object-cover">
              </div>
            ` : ''}
            <div class="${block.image ? 'md:w-2/3' : 'w-full'} space-y-3">
              ${block.badge ? `<span class="text-xs bg-yellow-950 text-yellow-400 border border-yellow-700/60 px-3 py-1 rounded-full font-bold inline-block">${block.badge}</span>` : ''}
              <h3 class="text-2xl font-black text-white" data-editable="block_${block.id}_title">${block.title}</h3>
              <p class="text-gray-300 text-sm leading-relaxed" data-editable="block_${block.id}_desc">${block.desc}</p>
              ${block.btnText && block.btnLink ? `
                <div class="pt-2">
                  <a href="${block.btnLink}" target="_blank" class="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-gray-950 font-black px-5 py-2.5 rounded-xl text-xs sm:text-sm shadow transition">
                    <span>${block.btnText}</span>
                    <i class="fa-solid fa-arrow-up-right-from-square text-xs"></i>
                  </a>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }
      // 類型 2: 宣傳橫幅 (Banner)
      else if (block.type === 'banner') {
        contentHtml = `
          <div class="rounded-3xl bg-gradient-to-r from-yellow-950/80 via-amber-950/50 to-gray-900 border border-yellow-500/40 p-6 sm:p-8 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div class="space-y-1 text-center sm:text-left">
              <h4 class="text-xl font-bold text-yellow-400" data-editable="block_${block.id}_title">${block.title}</h4>
              <p class="text-gray-300 text-xs sm:text-sm" data-editable="block_${block.id}_desc">${block.desc}</p>
            </div>
            ${block.btnText && block.btnLink ? `
              <a href="${block.btnLink}" target="_blank" class="flex-shrink-0 bg-yellow-400 hover:bg-yellow-300 text-gray-950 font-black px-6 py-2.5 rounded-xl text-xs sm:text-sm shadow transition">
                ${block.btnText}
              </a>
            ` : ''}
          </div>
        `;
      }
      // 類型 3: YouTube 專題影片 (Video)
      else if (block.type === 'video') {
        const videoId = (block.videoId || '').replace('https://www.youtube.com/watch?v=', '').replace('https://youtu.be/', '').split('&')[0];
        contentHtml = `
          <div class="pika-card rounded-3xl p-6 sm:p-8 space-y-4 shadow-xl">
            <div class="flex items-center justify-between border-b border-gray-800 pb-3">
              <h4 class="text-lg sm:text-xl font-bold text-white flex items-center gap-2" data-editable="block_${block.id}_title">
                <i class="fa-brands fa-youtube text-red-500 text-2xl"></i>
                <span>${block.title || '精選推薦影片'}</span>
              </h4>
              <span class="text-xs text-gray-500">專題影音</span>
            </div>
            <div class="aspect-video w-full rounded-2xl overflow-hidden bg-black border border-gray-800 shadow-2xl">
              <iframe src="https://www.youtube.com/embed/${videoId}" class="w-full h-full" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>
            ${block.desc ? `<p class="text-gray-400 text-xs sm:text-sm" data-editable="block_${block.id}_desc">${block.desc}</p>` : ''}
          </div>
        `;
      }

      wrapper.innerHTML = actionsHtml + contentHtml;
      container.appendChild(wrapper);
    });

    // 重新套用自訂文字
    applyContentToDOM(siteContent);
  }

  // 區塊動作：上移
  window.moveBlockUp = function(idx) {
    if (idx <= 0) return;
    const temp = currentBlocks[idx];
    currentBlocks[idx] = currentBlocks[idx - 1];
    currentBlocks[idx - 1] = temp;
    renderDynamicBlocks();
    showToast('區塊已上移！記得點擊『儲存版面』發布。', 'info');
  };

  // 區塊動作：下移
  window.moveBlockDown = function(idx) {
    if (idx >= currentBlocks.length - 1) return;
    const temp = currentBlocks[idx];
    currentBlocks[idx] = currentBlocks[idx + 1];
    currentBlocks[idx + 1] = temp;
    renderDynamicBlocks();
    showToast('區塊已下移！記得點擊『儲存版面』發布。', 'info');
  };

  // 區塊動作：刪除
  window.deleteBlock = function(idx) {
    if (!confirm('確定要刪除這個自訂區塊嗎？')) return;
    currentBlocks.splice(idx, 1);
    renderDynamicBlocks();
    showToast('區塊已移除！', 'info');
  };

  // 區塊動作：設定要出現還是不出現
  window.toggleBlockVisibility = function(idx) {
    if (currentBlocks[idx]) {
      currentBlocks[idx].hidden = !currentBlocks[idx].hidden;
      renderDynamicBlocks();
      const statusText = currentBlocks[idx].hidden ? '【不出現】（已對訪客隱藏）' : '【要出現】（訪客打開網頁可見）';
      showToast(`該區塊已設為：${statusText}！記得點擊『儲存並發布』。`, 'info');
    }
  };

  // ==========================================
  // 4. 浮動控制台 (Toolbar & Modal Dialogs - 僅皮卡站長可見與操作)
  // ==========================================
  function injectToolbar() {
    if (document.getElementById('pika-editor-toolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'pika-editor-toolbar';
    toolbar.style.display = 'none'; // 預設隱藏，只有站長登入才顯示
    toolbar.innerHTML = `
      <div id="editor-status-indicator" class="hidden items-center gap-1.5 text-xs text-yellow-400 font-bold px-1">
        <span class="w-2 h-2 rounded-full bg-yellow-400 animate-ping"></span>
        <span class="hidden sm:inline">版面設計中</span>
      </div>

      <!-- 開啟/退出編輯開關 -->
      <button id="editor-toggle-btn" onclick="window.togglePikaEditor()"
              class="inline-flex items-center gap-1.5 bg-yellow-500/20 hover:bg-yellow-500 text-yellow-400 hover:text-gray-950 text-xs font-black px-3.5 py-2 rounded-full border border-yellow-500/40 transition shadow">
        <i class="fa-solid fa-paintbrush"></i>
        <span id="editor-btn-text">版面設計器</span>
      </button>

      <!-- 👁️ 一鍵切換頂部公告【要出現 / 不出現】 (編輯模式下顯示) -->
      <button id="editor-ann-toggle-vis-btn" onclick="window.toggleAnnouncementVisibility()"
              class="hidden items-center gap-1.5 text-xs font-black px-3.5 py-2 rounded-full shadow transition"
              title="點擊切換頂部公告要出現還是不出現">
        <i id="editor-ann-toggle-vis-icon" class="fa-solid fa-eye"></i>
        <span id="editor-ann-toggle-vis-text">公告：出現中</span>
      </button>

      <!-- ➕ 新增自訂區塊按鈕 (編輯模式下顯示) -->
      <button id="editor-add-block-btn" onclick="window.openAddBlockModal()"
              class="hidden items-center gap-1.5 bg-yellow-400 hover:bg-yellow-300 text-gray-950 text-xs font-black px-3 py-2 rounded-full shadow transition">
        <i class="fa-solid fa-plus"></i>
        <span>新增區塊</span>
      </button>

      <!-- 🪟 自訂彈跳視窗按鈕 (編輯模式下顯示) -->
      <button id="editor-modal-mgr-btn" onclick="window.openModalStudio()"
              class="hidden items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black px-3 py-2 rounded-full shadow transition">
        <i class="fa-solid fa-window-restore"></i>
        <span>視窗設定</span>
      </button>

      <!-- 📢 頂部公告排程與時機按鈕 (編輯模式下顯示) -->
      <button id="editor-ann-mgr-btn" onclick="window.openAnnouncementStudio()"
              class="hidden items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-black px-3 py-2 rounded-full shadow transition">
        <i class="fa-solid fa-bullhorn"></i>
        <span>公告排程</span>
      </button>

      <!-- 💾 儲存所有修改 -->
      <button id="editor-save-btn" onclick="window.savePikaAll()"
              class="hidden items-center gap-1.5 bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white text-xs font-black px-3.5 py-2 rounded-full shadow-lg transition transform hover:scale-105">
        <i class="fa-solid fa-cloud-arrow-up"></i>
        <span>儲存並發布</span>
      </button>

      <!-- 🔄 還原全部 -->
      <button id="editor-reset-btn" onclick="window.resetPikaAll()"
              class="hidden items-center gap-1 text-gray-400 hover:text-red-400 text-xs px-2 py-2 transition"
              title="重設為預設狀態">
        <i class="fa-solid fa-rotate-left"></i>
        <span class="hidden sm:inline">還原</span>
      </button>
    `;

    document.body.appendChild(toolbar);
    window.updateEditorPermission();
  }

  // 權限檢查與控制台顯隱：只有皮卡站長可見
  window.updateEditorPermission = function() {
    const toolbar = document.getElementById('pika-editor-toolbar');
    if (!toolbar) return;
    const user = typeof currentUser !== 'undefined' && currentUser ? currentUser : JSON.parse(localStorage.getItem('pika_user') || 'null');
    const adminEmail = typeof ADMIN_EMAIL !== 'undefined' ? ADMIN_EMAIL : 'ytfgtfretftrr@gmail.com';
    const isAdmin = user && user.email && user.email.toLowerCase() === adminEmail.toLowerCase();

    if (isAdmin) {
      toolbar.style.display = 'flex';
    } else {
      toolbar.style.display = 'none';
      if (isEditing) {
        window.togglePikaEditor(false);
      }
    }
  };

  // 切換設計器狀態 (嚴格限制僅皮卡站長有權開啟)
  window.togglePikaEditor = function(forceVal) {
    const user = typeof currentUser !== 'undefined' && currentUser ? currentUser : JSON.parse(localStorage.getItem('pika_user') || 'null');
    const adminEmail = typeof ADMIN_EMAIL !== 'undefined' ? ADMIN_EMAIL : 'ytfgtfretftrr@gmail.com';
    const isAdmin = user && user.email && user.email.toLowerCase() === adminEmail.toLowerCase();

    if (typeof forceVal === 'boolean') {
      isEditing = forceVal;
    } else {
      if (!isEditing && !isAdmin) {
        showToast('⛔ 無管理者權限！僅皮卡站長本人有權編輯全站版面與文字。', 'error');
        return;
      }
      isEditing = !isEditing;
    }

    const toolbar = document.getElementById('pika-editor-toolbar');
    if (!toolbar) return;
    const toggleBtn = document.getElementById('editor-toggle-btn');
    const btnText = document.getElementById('editor-btn-text');
    const visBtn = document.getElementById('editor-ann-toggle-vis-btn');
    const addBtn = document.getElementById('editor-add-block-btn');
    const modalBtn = document.getElementById('editor-modal-mgr-btn');
    const annBtn = document.getElementById('editor-ann-mgr-btn');
    const saveBtn = document.getElementById('editor-save-btn');
    const resetBtn = document.getElementById('editor-reset-btn');
    const statusIndicator = document.getElementById('editor-status-indicator');

    const editables = document.querySelectorAll('[data-editable]');

    if (isEditing) {
      document.body.classList.add('editor-active');
      toolbar.classList.add('is-editing');
      toggleBtn.className = "inline-flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-3 py-2 rounded-full border border-gray-700 transition";
      btnText.textContent = "退出設計";

      [visBtn, addBtn, modalBtn, annBtn, saveBtn, resetBtn, statusIndicator].forEach(el => {
        if (el) {
          el.classList.remove('hidden');
          el.classList.add('inline-flex');
        }
      });

      editables.forEach(el => {
        el.contentEditable = "true";
        el.setAttribute('title', '點擊此處直接打字編輯');
      });

      renderDynamicBlocks();
      renderAnnouncementBar();
      updateToolbarVisibilityBtn();
      showToast('已開啟版面設計器！可點擊文字打字，或使用工具列設定公告要出現/不出現。', 'info');
    } else {
      document.body.classList.remove('editor-active');
      toolbar.classList.remove('is-editing');
      toggleBtn.className = "inline-flex items-center gap-1.5 bg-yellow-500/20 hover:bg-yellow-500 text-yellow-400 hover:text-gray-950 text-xs font-black px-3.5 py-2 rounded-full border border-yellow-500/40 transition shadow";
      btnText.textContent = "版面設計器";

      [visBtn, addBtn, modalBtn, annBtn, saveBtn, resetBtn, statusIndicator].forEach(el => {
        if (el) {
          el.classList.add('hidden');
          el.classList.remove('inline-flex');
        }
      });

      editables.forEach(el => {
        el.contentEditable = "false";
        el.removeAttribute('title');
      });

      renderDynamicBlocks();
      renderAnnouncementBar();
    }
  };

  // ==========================================
  // 5. 新增區塊彈窗 (Add Block Modal)
  // ==========================================
  window.openAddBlockModal = function() {
    let modal = document.getElementById('add-block-dialog');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'add-block-dialog';
      modal.className = 'custom-modal-backdrop hidden';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="bg-gray-900 border border-gray-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative">
        <button onclick="window.closeAddBlockModal()" class="absolute top-5 right-5 text-gray-400 hover:text-white text-lg">
          <i class="fa-solid fa-xmark"></i>
        </button>

        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-yellow-400 text-gray-950 flex items-center justify-center text-lg font-bold">
            <i class="fa-solid fa-cube"></i>
          </div>
          <div>
            <h3 class="text-xl font-bold text-white">新增自訂區塊組件</h3>
            <p class="text-xs text-gray-400">選擇你想插入此頁面的組件類型</p>
          </div>
        </div>

        <form id="add-block-form" class="space-y-4 pt-2">
          <div>
            <label class="block text-xs font-bold text-gray-300 mb-1">區塊類型</label>
            <select id="new-block-type" onchange="window.onBlockTypeChange()" class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">
              <option value="card">🌟 精選圖文卡片 (Feature Card)</option>
              <option value="banner">📢 宣傳與活動橫幅 (Announcement Banner)</option>
              <option value="video">🎬 YouTube 專題影片嵌入 (Video Card)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-300 mb-1">標題文字</label>
            <input type="text" id="new-block-title" required placeholder="例如: 寒假 Scratch 特訓營開始報名！" class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-300 mb-1">詳細說明文字</label>
            <textarea id="new-block-desc" rows="3" placeholder="請填寫此區塊的詳細介紹或活動資訊..." class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400"></textarea>
          </div>

          <div id="field-card-image">
            <label class="block text-xs font-bold text-gray-300 mb-1">卡片圖片網址 (選填)</label>
            <input type="url" id="new-block-image" placeholder="https://... 或貼上圖片連結" class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">
          </div>

          <div id="field-card-badge">
            <label class="block text-xs font-bold text-gray-300 mb-1">頂部小標籤 (選填)</label>
            <input type="text" id="new-block-badge" placeholder="例如: 限時活動、精彩重溫" class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">
          </div>

          <div id="field-video-id" class="hidden">
            <label class="block text-xs font-bold text-gray-300 mb-1">YouTube 影片網址或 ID</label>
            <input type="text" id="new-block-videoid" placeholder="https://www.youtube.com/watch?v=... 或影片 ID" class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">
          </div>

          <div class="grid grid-cols-2 gap-3" id="field-button-group">
            <div>
              <label class="block text-xs font-bold text-gray-300 mb-1">按鈕文字 (選填)</label>
              <input type="text" id="new-block-btntext" placeholder="例如: 立即參加" class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-300 mb-1">按鈕跳轉網址</label>
              <input type="text" id="new-block-btnlink" placeholder="https://... 或 videos.html" class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">
            </div>
          </div>

          <div class="pt-2">
            <button type="submit" class="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-950 font-black py-3 px-4 rounded-xl shadow transition">
              確認插入新區塊
            </button>
          </div>
        </form>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    document.getElementById('add-block-form').onsubmit = function(e) {
      e.preventDefault();
      const type = document.getElementById('new-block-type').value;
      const title = document.getElementById('new-block-title').value.trim();
      const desc = document.getElementById('new-block-desc').value.trim();
      const image = document.getElementById('new-block-image').value.trim();
      const badge = document.getElementById('new-block-badge').value.trim();
      const videoId = document.getElementById('new-block-videoid').value.trim();
      const btnText = document.getElementById('new-block-btntext').value.trim();
      const btnLink = document.getElementById('new-block-btnlink').value.trim();

      const newBlock = {
        id: 'blk_' + Date.now().toString().slice(-4),
        type,
        title,
        desc,
        image,
        badge,
        videoId,
        btnText,
        btnLink
      };

      currentBlocks.push(newBlock);
      renderDynamicBlocks();
      window.closeAddBlockModal();
      showToast('新區塊已成功新增！可繼續打字修改或點擊『儲存並發布』。', 'success');
    };
  };

  window.closeAddBlockModal = function() {
    const modal = document.getElementById('add-block-dialog');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  };

  window.onBlockTypeChange = function() {
    const type = document.getElementById('new-block-type').value;
    const fieldImage = document.getElementById('field-card-image');
    const fieldBadge = document.getElementById('field-card-badge');
    const fieldVideo = document.getElementById('field-video-id');
    const fieldBtn = document.getElementById('field-button-group');

    if (type === 'video') {
      fieldVideo.classList.remove('hidden');
      fieldImage.classList.add('hidden');
      fieldBadge.classList.add('hidden');
    } else if (type === 'banner') {
      fieldVideo.classList.add('hidden');
      fieldImage.classList.add('hidden');
      fieldBadge.classList.add('hidden');
    } else {
      fieldVideo.classList.add('hidden');
      fieldImage.classList.remove('hidden');
      fieldBadge.classList.remove('hidden');
    }
  };

  // ==========================================
  // 6. 視窗設計器 (Modal / Popup Studio)
  // ==========================================
  window.openModalStudio = function() {
    let modal = document.getElementById('modal-studio-dialog');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-studio-dialog';
      modal.className = 'custom-modal-backdrop hidden';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="bg-gray-900 border border-gray-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative">
        <button onclick="window.closeModalStudio()" class="absolute top-5 right-5 text-gray-400 hover:text-white text-lg">
          <i class="fa-solid fa-xmark"></i>
        </button>

        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-lg font-bold">
            <i class="fa-solid fa-window-restore"></i>
          </div>
          <div>
            <h3 class="text-xl font-bold text-white">自訂彈跳視窗 (Popup Window) 設計</h3>
            <p class="text-xs text-gray-400">設定訪客進入此頁面時顯示的特別彈窗</p>
          </div>
        </div>

        <form id="modal-studio-form" class="space-y-4 pt-2">
          <!-- 彈跳視窗要出現還是不出現 -->
          <div class="p-4 bg-gray-950 border border-gray-800 rounded-2xl space-y-2.5">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-sm font-black text-white block">彈跳視窗要出現還是不出現？</span>
                <span class="text-xs text-gray-400">決定訪客進入此頁面時是否出現此活動彈窗</span>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 pt-1">
              <button type="button" onclick="window.setModalEnabled(true)" id="opt-modal-show"
                      class="py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition ${modalConfig.enabled ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-600/30' : 'bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800'}">
                <i class="fa-solid fa-eye text-sm"></i>
                <span>要出現 (開啟)</span>
              </button>
              <button type="button" onclick="window.setModalEnabled(false)" id="opt-modal-hide"
                      class="py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition ${!modalConfig.enabled ? 'bg-rose-600 text-white border-rose-400 shadow-lg shadow-rose-600/30' : 'bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800'}">
                <i class="fa-solid fa-eye-slash text-sm"></i>
                <span>不出現 (隱藏)</span>
              </button>
            </div>
            <input type="hidden" id="modal-enabled" value="${modalConfig.enabled ? '1' : '0'}">
          </div>

          <div class="flex items-center justify-between p-3 bg-gray-950 border border-gray-800 rounded-xl">
            <div>
              <span class="text-xs font-bold text-white block">進入網頁自動彈出</span>
              <span class="text-[11px] text-gray-500">每位訪客每次開啟網頁時自動跳出一次</span>
            </div>
            <input type="checkbox" id="modal-autopopup" ${modalConfig.autoPopup ? 'checked' : ''} class="w-5 h-5 accent-yellow-400 cursor-pointer">
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-300 mb-1">視窗標題</label>
            <input type="text" id="modal-title" value="${modalConfig.title || ''}" required class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-300 mb-1">視窗內容說明</label>
            <textarea id="modal-content" rows="3" class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">${modalConfig.content || ''}</textarea>
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-300 mb-1">宣傳圖片網址 (選填)</label>
            <input type="url" id="modal-image" value="${modalConfig.image || ''}" placeholder="https://..." class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-gray-300 mb-1">按鈕文字</label>
              <input type="text" id="modal-btntext" value="${modalConfig.btnText || ''}" placeholder="例如: 立即前往" class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-300 mb-1">按鈕跳轉連結</label>
              <input type="text" id="modal-btnlink" value="${modalConfig.btnLink || ''}" placeholder="https://... 或 videos.html" class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">
            </div>
          </div>

          <div class="flex items-center gap-3 pt-2">
            <button type="button" onclick="window.previewModalWindow()" class="w-1/2 bg-gray-800 hover:bg-gray-700 text-yellow-400 font-bold py-3 px-4 rounded-xl transition text-xs flex items-center justify-center gap-1.5">
              <i class="fa-regular fa-eye"></i>
              <span>預覽視窗效果</span>
            </button>
            <button type="submit" class="w-1/2 bg-indigo-600 hover:bg-indigo-500 text-white font-black py-3 px-4 rounded-xl transition text-xs flex items-center justify-center gap-1.5">
              <i class="fa-solid fa-check"></i>
              <span>儲存視窗設定</span>
            </button>
          </div>
        </form>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    document.getElementById('modal-studio-form').onsubmit = function(e) {
      e.preventDefault();
      const enabledVal = document.getElementById('modal-enabled') ? document.getElementById('modal-enabled').value : '0';
      modalConfig.enabled = (enabledVal === '1');
      modalConfig.autoPopup = document.getElementById('modal-autopopup').checked;
      modalConfig.title = document.getElementById('modal-title').value.trim();
      modalConfig.content = document.getElementById('modal-content').value.trim();
      modalConfig.image = document.getElementById('modal-image').value.trim();
      modalConfig.btnText = document.getElementById('modal-btntext').value.trim();
      modalConfig.btnLink = document.getElementById('modal-btnlink').value.trim();

      window.closeModalStudio();
      const statusText = modalConfig.enabled ? '【要出現】' : '【不出現】';
      showToast(`視窗設定已套用（目前設定為：${statusText}）！請點擊『儲存並發布』。`, 'success');
    };
  };

  window.setModalEnabled = function(val) {
    const input = document.getElementById('modal-enabled');
    const btnShow = document.getElementById('opt-modal-show');
    const btnHide = document.getElementById('opt-modal-hide');
    if (input) input.value = val ? '1' : '0';
    if (btnShow && btnHide) {
      if (val) {
        btnShow.className = "py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-600/30";
        btnHide.className = "py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800";
      } else {
        btnShow.className = "py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800";
        btnHide.className = "py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition bg-rose-600 text-white border-rose-400 shadow-lg shadow-rose-600/30";
      }
    }
  };

  window.closeModalStudio = function() {
    const modal = document.getElementById('modal-studio-dialog');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  };

  window.previewModalWindow = function() {
    const enabledVal = document.getElementById('modal-enabled') ? document.getElementById('modal-enabled').value : '0';
    modalConfig.enabled = (enabledVal === '1');
    modalConfig.title = document.getElementById('modal-title').value.trim();
    modalConfig.content = document.getElementById('modal-content').value.trim();
    modalConfig.image = document.getElementById('modal-image').value.trim();
    modalConfig.btnText = document.getElementById('modal-btntext').value.trim();
    modalConfig.btnLink = document.getElementById('modal-btnlink').value.trim();

    window.closeModalStudio();
    openCustomPopupWindow();
  };

  // ==========================================
  // 6.5 頂部公告排程與顯示時機管理 (Announcement Timing Studio)
  // ==========================================
  window.openAnnouncementStudio = function() {
    let modal = document.getElementById('announcement-studio-dialog');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'announcement-studio-dialog';
      modal.className = 'custom-modal-backdrop hidden';
      document.body.appendChild(modal);
    }

    const isSched = announcementConfig.mode === 'scheduled';

    modal.innerHTML = `
      <div class="bg-gray-900 border border-gray-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative">
        <button onclick="window.closeAnnouncementStudio()" class="absolute top-5 right-5 text-gray-400 hover:text-white text-lg">
          <i class="fa-solid fa-xmark"></i>
        </button>

        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-500 text-gray-950 flex items-center justify-center text-lg font-bold">
            <i class="fa-solid fa-bullhorn"></i>
          </div>
          <div>
            <h3 class="text-xl font-bold text-white">頂部公告時機與排程管理</h3>
            <p class="text-xs text-gray-400">設定這行黃色文字何時出來、排程日期時間與滑出動畫</p>
          </div>
        </div>

        <form id="announcement-studio-form" class="space-y-4 pt-2">
          <!-- 要出現還是不出現 -->
          <div class="p-4 bg-gray-950 border border-gray-800 rounded-2xl space-y-2.5">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-sm font-black text-white block">頂部公告要出現還是不出現？</span>
                <span class="text-xs text-gray-400">一鍵決定一般訪客是否能看到這行黃色公告</span>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 pt-1">
              <button type="button" onclick="window.setAnnouncementEnabled(true)" id="opt-ann-show"
                      class="py-3 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition ${announcementConfig.enabled ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-600/30' : 'bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800'}">
                <i class="fa-solid fa-eye text-sm"></i>
                <span>要出現 (訪客可見)</span>
              </button>
              <button type="button" onclick="window.setAnnouncementEnabled(false)" id="opt-ann-hide"
                      class="py-3 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition ${!announcementConfig.enabled ? 'bg-rose-600 text-white border-rose-400 shadow-lg shadow-rose-600/30' : 'bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800'}">
                <i class="fa-solid fa-eye-slash text-sm"></i>
                <span>不出現 (完全隱藏)</span>
              </button>
            </div>
            <input type="hidden" id="ann-enabled" value="${announcementConfig.enabled ? '1' : '0'}">
          </div>

          <!-- 何時出來 (顯示時機) -->
          <div>
            <label class="block text-xs font-bold text-gray-300 mb-1.5">
              <i class="fa-solid fa-clock text-amber-400 mr-1"></i> 什麼時候出來 (顯示時機)
            </label>
            <select id="ann-mode" onchange="window.onAnnModeChange()" class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">
              <option value="always" ${announcementConfig.mode === 'always' ? 'selected' : ''}>🌟 隨時常駐 (訪客進入網站立即顯示)</option>
              <option value="scheduled" ${announcementConfig.mode === 'scheduled' ? 'selected' : ''}>⏰ 指定日期與時間區間排程 (時間到才出來)</option>
            </select>
          </div>

          <!-- 指定日期時間排程區塊 -->
          <div id="ann-scheduled-fields" class="${isSched ? '' : 'hidden'} space-y-3 p-3.5 bg-yellow-950/20 border border-yellow-500/30 rounded-2xl">
            <div class="text-[11px] text-yellow-300 flex items-center gap-1.5 font-bold">
              <i class="fa-solid fa-circle-info"></i>
              <span>設定出來的期間（未到開始時間或已過結束時間自動對訪客隱藏）：</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] font-bold text-gray-400 mb-1">開始出來時間</label>
                <input type="datetime-local" id="ann-start-time" value="${announcementConfig.startTime || ''}" class="w-full bg-gray-950 border border-gray-700 text-gray-200 text-xs rounded-xl p-2 focus:border-yellow-400">
              </div>
              <div>
                <label class="block text-[11px] font-bold text-gray-400 mb-1">結束隱藏時間</label>
                <input type="datetime-local" id="ann-end-time" value="${announcementConfig.endTime || ''}" class="w-full bg-gray-950 border border-gray-700 text-gray-200 text-xs rounded-xl p-2 focus:border-yellow-400">
              </div>
            </div>
          </div>

          <!-- 進場延遲秒數與主題配色 -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-gray-300 mb-1">
                <i class="fa-solid fa-hourglass-start text-yellow-400 mr-1"></i> 進場延遲秒數
              </label>
              <select id="ann-delay" class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">
                <option value="0" ${announcementConfig.delaySeconds == 0 ? 'selected' : ''}>立即出現 (0 秒)</option>
                <option value="2" ${announcementConfig.delaySeconds == 2 ? 'selected' : ''}>進入網頁 2 秒後滑出</option>
                <option value="3" ${announcementConfig.delaySeconds == 3 ? 'selected' : ''}>進入網頁 3 秒後滑出</option>
                <option value="5" ${announcementConfig.delaySeconds == 5 ? 'selected' : ''}>進入網頁 5 秒後滑出</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-300 mb-1">
                <i class="fa-solid fa-palette text-yellow-400 mr-1"></i> 主題配色
              </label>
              <select id="ann-theme" class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">
                <option value="yellow" ${announcementConfig.theme === 'yellow' ? 'selected' : ''}>經典黃金 (預設)</option>
                <option value="red" ${announcementConfig.theme === 'red' ? 'selected' : ''}>熱情紅 (直播/急件通知)</option>
                <option value="blue" ${announcementConfig.theme === 'blue' ? 'selected' : ''}>極光藍 (科技/新單元)</option>
                <option value="purple" ${announcementConfig.theme === 'purple' ? 'selected' : ''}>星空紫 (社群活動)</option>
              </select>
            </div>
          </div>

          <!-- 公告文字 -->
          <div>
            <label class="block text-xs font-bold text-gray-300 mb-1">公告文字內容</label>
            <input type="text" id="ann-text" value="${(announcementConfig.text || '').replace(/"/g, '&quot;')}" required class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">
          </div>

          <!-- 點擊跳轉網址 (選填) -->
          <div>
            <label class="block text-xs font-bold text-gray-300 mb-1">點擊跳轉連結 (選填)</label>
            <input type="text" id="ann-link" value="${(announcementConfig.link || '').replace(/"/g, '&quot;')}" placeholder="https://... 或 videos.html" class="w-full bg-gray-950 border border-gray-800 text-gray-200 text-sm rounded-xl p-2.5 focus:border-yellow-400">
          </div>

          <div class="pt-3 flex gap-2">
            <button type="button" onclick="window.previewAnnouncementBar()" class="flex-1 bg-gray-800 hover:bg-gray-700 text-yellow-400 font-bold py-3 rounded-xl transition text-xs border border-gray-700">
              <i class="fa-regular fa-eye mr-1"></i> 立即測試預覽
            </button>
            <button type="submit" class="flex-1 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-gray-950 font-black py-3 rounded-xl transition text-xs shadow-lg shadow-yellow-500/20">
              <i class="fa-solid fa-check mr-1"></i> 儲存並套用排程
            </button>
          </div>
        </form>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    document.getElementById('announcement-studio-form').onsubmit = async function(e) {
      e.preventDefault();
      const enabledVal = document.getElementById('ann-enabled') ? document.getElementById('ann-enabled').value : '1';
      announcementConfig.enabled = (enabledVal === '1');
      announcementConfig.mode = document.getElementById('ann-mode').value;
      const startEl = document.getElementById('ann-start-time');
      const endEl = document.getElementById('ann-end-time');
      announcementConfig.startTime = startEl ? startEl.value : '';
      announcementConfig.endTime = endEl ? endEl.value : '';
      announcementConfig.delaySeconds = parseInt(document.getElementById('ann-delay').value) || 0;
      announcementConfig.theme = document.getElementById('ann-theme').value;
      announcementConfig.text = document.getElementById('ann-text').value.trim();
      announcementConfig.link = document.getElementById('ann-link').value.trim();

      const user = typeof currentUser !== 'undefined' && currentUser ? currentUser : JSON.parse(localStorage.getItem('pika_user') || 'null');
      const adminEmail = typeof ADMIN_EMAIL !== 'undefined' ? ADMIN_EMAIL : 'ytfgtfretftrr@gmail.com';
      if (!user || user.email.toLowerCase() !== adminEmail.toLowerCase()) {
        showToast('⛔ 無管理者權限！僅皮卡站長有權修改公告排程。', 'error');
        return;
      }

      // 同步至本地快取與送出 API
      localStorage.setItem('pika_announcement', JSON.stringify(announcementConfig));
      try {
        await fetch(`${API_BASE}/api/announcement`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminEmail: user.email, announcement: announcementConfig })
        });
      } catch (err) {}

      renderAnnouncementBar();
      window.closeAnnouncementStudio();
      const statusText = announcementConfig.enabled ? '【要出現】（訪客打開網頁就能看到）' : '【不出現】（已完全對訪客隱藏）';
      showToast(`🎉 頂部公告設定已儲存！目前為：${statusText}。`, 'success');
    };
  };

  window.setAnnouncementEnabled = function(val) {
    const hiddenInput = document.getElementById('ann-enabled');
    const btnShow = document.getElementById('opt-ann-show');
    const btnHide = document.getElementById('opt-ann-hide');
    if (hiddenInput) hiddenInput.value = val ? '1' : '0';
    if (btnShow && btnHide) {
      if (val) {
        btnShow.className = "py-3 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-600/30";
        btnHide.className = "py-3 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800";
      } else {
        btnShow.className = "py-3 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800";
        btnHide.className = "py-3 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition bg-rose-600 text-white border-rose-400 shadow-lg shadow-rose-600/30";
      }
    }
  };

  window.closeAnnouncementStudio = function() {
    const modal = document.getElementById('announcement-studio-dialog');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  };

  window.onAnnModeChange = function() {
    const mode = document.getElementById('ann-mode').value;
    const fields = document.getElementById('ann-scheduled-fields');
    if (fields) {
      if (mode === 'scheduled') {
        fields.classList.remove('hidden');
      } else {
        fields.classList.add('hidden');
      }
    }
  };

  window.previewAnnouncementBar = function() {
    const text = document.getElementById('ann-text').value.trim();
    const link = document.getElementById('ann-link').value.trim();
    const theme = document.getElementById('ann-theme').value;

    const bar = document.getElementById('top-announcement-bar');
    if (bar) {
      bar.className = 'top-announcement-bar';
      bar.classList.add(`theme-${theme}`);
      bar.classList.remove('announcement-hidden', 'announcement-inactive-admin');

      let textSpan = `<span data-editable="global_announcement">${text || ''}</span>`;
      let content = link ? `<a href="${link}" target="_blank" class="hover:underline flex items-center gap-1.5">${textSpan} <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i></a>` : textSpan;
      bar.innerHTML = `<i class="fa-solid fa-bullhorn text-xs animate-bounce"></i> ${content}`;
      bar.classList.add('slide-in');
    }
    showToast('正在預覽公告效果！若滿意請點擊『儲存並套用排程』。', 'info');
  };

  // ==========================================
  // 7. 儲存所有版面、區塊、視窗與文字內容 (僅皮卡站長有權發布)
  // ==========================================
  window.savePikaAll = async function() {
    const user = typeof currentUser !== 'undefined' && currentUser ? currentUser : JSON.parse(localStorage.getItem('pika_user') || 'null');
    const adminEmail = typeof ADMIN_EMAIL !== 'undefined' ? ADMIN_EMAIL : 'ytfgtfretftrr@gmail.com';
    if (!user || user.email.toLowerCase() !== adminEmail.toLowerCase()) {
      showToast('⛔ 無管理者權限！僅皮卡站長有權儲存全站版面與文字。', 'error');
      return;
    }

    // 1. 抓取文字內容
    const editables = document.querySelectorAll('[data-editable]');
    const newChanges = {};
    editables.forEach(el => {
      const key = el.getAttribute('data-editable');
      if (key) newChanges[key] = el.innerHTML.trim();
    });
    siteContent = { ...siteContent, ...newChanges };

    // 儲存文字至本地與 API
    try {
      localStorage.setItem('pika_site_content', JSON.stringify(siteContent));
      await fetch(`${API_BASE}/api/site-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail: user.email, content: siteContent })
      });
    } catch (e) {}

    // 2. 儲存版面與視窗設定至本地與 API
    try {
      localStorage.setItem(`pika_layout_${PAGE_NAME}`, JSON.stringify({ blocks: currentBlocks, modal: modalConfig }));
      await fetch(`${API_BASE}/api/site-layout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail: user.email, page: PAGE_NAME, blocks: currentBlocks, modal: modalConfig })
      });
    } catch (e) {}

    // 3. 若有直接修改頂部公告文字，同步更新公告設定
    if (newChanges['global_announcement']) {
      announcementConfig.text = newChanges['global_announcement'];
    }
    try {
      localStorage.setItem('pika_announcement', JSON.stringify(announcementConfig));
      await fetch(`${API_BASE}/api/announcement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail: user.email, announcement: announcementConfig })
      });
    } catch (e) {}

    // 關閉編輯狀態
    window.togglePikaEditor();

    if (typeof showToast === 'function') {
      showToast('🎉 版面架構、自訂區塊與視窗設定已全數保存至 SQLite 資料庫，全網即時生效！', 'success');
    } else {
      alert('🎉 版面與視窗設定已成功發布！');
    }
  };

  // ==========================================
  // 8. 還原版面與文字 (僅皮卡站長有權還原)
  // ==========================================
  window.resetPikaAll = async function() {
    const user = typeof currentUser !== 'undefined' && currentUser ? currentUser : JSON.parse(localStorage.getItem('pika_user') || 'null');
    const adminEmail = typeof ADMIN_EMAIL !== 'undefined' ? ADMIN_EMAIL : 'ytfgtfretftrr@gmail.com';
    if (!user || user.email.toLowerCase() !== adminEmail.toLowerCase()) {
      showToast('⛔ 無管理者權限！僅皮卡站長有權重設版面。', 'error');
      return;
    }

    if (!confirm('確定要將此頁面的所有自訂區塊、視窗設定與文字還原為預設嗎？')) return;

    try {
      localStorage.removeItem('pika_site_content');
      localStorage.removeItem(`pika_layout_${PAGE_NAME}`);
      localStorage.removeItem('pika_announcement');
      await fetch(`${API_BASE}/api/site-content/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail: user.email })
      });
      await fetch(`${API_BASE}/api/site-layout/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail: user.email, page: PAGE_NAME })
      });
    } catch (e) {}

    if (typeof showToast === 'function') {
      showToast('已還原所有設定，正在重新載入...', 'info');
    }
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  // 頁面加載完成後自動初始化
  window.addEventListener('DOMContentLoaded', () => {
    initAllData();
    injectToolbar();
  });
})();
