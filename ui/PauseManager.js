// PauseManager.js - 暂停菜单与设置管理
// 从 guide.js 抽离，物理分离，逻辑不变
// 包含：暂停/继续、弹窗栈管理、暂停菜单 UI、重开/章节选择/主菜单转发

;(function(global) {
  'use strict';

  // ===== P1 关键路径加固：安全 DOM 操作辅助函数 =====
  const _domWarned = {};

  function _getEl(id) {
    const el = document.getElementById(id);
    if (!el) {
      if (!_domWarned[id]) {
        console.warn('[DOM][PauseManager] 元素不存在:', id);
        _domWarned[id] = true;
      }
    }
    return el;
  }

  function _setText(id, text) {
    const el = _getEl(id);
    if (el) el.textContent = text;
  }

  // === 依赖引用（由 guide.js 在初始化时注入）===
  let _deps = {
    isPaused: () => false,
    setPaused: (v) => {},
    isCompleted: () => false,
    getBoard: () => null,
    getGameTimer: () => null,
    getExpertSystem: () => null,
    getStartTime: () => 0,
    getGameController: () => null,
    getSettingsPanel: () => null,
    AudioService: null,
  };

  // === 内部状态 ===
  let _modalStack = []; // 弹窗栈，用于多层弹窗时正确管理滚动锁定

  // ============================================================
  //  初始化 / 依赖注入
  // ============================================================
  function init(deps) {
    if (deps) {
      Object.assign(_deps, deps);
    }
  }

  // ============================================================
  //  弹窗栈管理工具
  // ============================================================
  function _lockBodyScroll() {
    if (!document.body.classList.contains('modal-open')) {
      document.body.classList.add('modal-open');
      // 保存当前滚动位置
      document.body.dataset.scrollTop = window.scrollY || document.documentElement.scrollTop;
    }
  }

  function _unlockBodyScroll() {
    if (_modalStack.length === 0) {
      document.body.classList.remove('modal-open');
      // 恢复滚动位置
      const scrollTop = parseInt(document.body.dataset.scrollTop || '0');
      if (scrollTop > 0) {
        window.scrollTo(0, scrollTop);
      }
    }
  }

  function _pushModal(id) {
    if (_modalStack.indexOf(id) === -1) {
      _modalStack.push(id);
      _lockBodyScroll();
    }
  }

  function _popModal(id) {
    const idx = _modalStack.indexOf(id);
    if (idx !== -1) {
      _modalStack.splice(idx, 1);
      _unlockBodyScroll();
    }
  }

  // ============================================================
  //  暂停菜单
  // ============================================================
  function togglePause() {
    if (_deps.isPaused()) {
      hidePauseMenu();
    } else {
      showPauseMenu();
    }
  }

  function showPauseMenu() {
    if (_deps.isCompleted() || _deps.isPaused()) return;
    if (!_deps.getBoard()) return; // 棋盘未初始化时不暂停

    _deps.setPaused(true);

    // P2: 锁定背景滚动
    _pushModal('pause');

    // 暂停计时器
    const gameTimer = _deps.getGameTimer();
    if (gameTimer && typeof gameTimer.pause === 'function') {
      gameTimer.pause();
    }

    // 暂停 BGM
    const AudioService = _deps.AudioService || global.AudioService;
    if (typeof AudioService !== 'undefined' && AudioService.bgm) {
      AudioService.bgm.pause();
    }

    // 暂停专家系统
    const expertSystem = _deps.getExpertSystem();
    if (expertSystem && typeof expertSystem.pause === 'function') {
      expertSystem.pause();
    }

    // 更新暂停菜单时间显示
    updatePauseTime();

    // 显示暂停菜单
    const overlay = _getEl('pause-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      requestAnimationFrame(() => {
        overlay.style.transition = 'opacity 0.3s ease';
        overlay.style.opacity = '1';
        // 添加 pause-show 类触发内容卡片缩放弹入
        requestAnimationFrame(() => {
          overlay.classList.add('pause-show');
        });
      });
    }
  }

  function hidePauseMenu() {
    if (!_deps.isPaused()) return;
    _deps.setPaused(false);

    // P2: 解锁背景滚动（延迟到动画结束后）
    _popModal('pause');

    const overlay = _getEl('pause-overlay');
    if (overlay) {
      // 先移除缩放，再淡出
      overlay.classList.remove('pause-show');
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay) overlay.style.display = 'none';
      }, 300);
    }

    // 恢复计时器
    const gameTimer = _deps.getGameTimer();
    if (gameTimer && typeof gameTimer.resume === 'function') {
      gameTimer.resume();
    }

    // 恢复 BGM
    const AudioService = _deps.AudioService || global.AudioService;
    if (typeof AudioService !== 'undefined' && AudioService.bgm) {
      AudioService.bgm.resume();
    }

    // 恢复专家系统
    const expertSystem = _deps.getExpertSystem();
    if (expertSystem && typeof expertSystem.resume === 'function') {
      expertSystem.resume();
    }
  }

  function updatePauseTime() {
    const timeEl = _getEl('pause-time');
    if (!timeEl) return;

    let elapsed = 0;
    const gameTimer = _deps.getGameTimer();
    if (gameTimer && typeof gameTimer.getTime === 'function') {
      elapsed = gameTimer.getTime();
    } else {
      elapsed = Math.floor((Date.now() - _deps.getStartTime()) / 1000);
    }

    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    timeEl.textContent = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }

  // ============================================================
  //  转发到 GameController 的函数
  // ============================================================
  function restartLevel() {
    const gc = _deps.getGameController();
    return gc ? gc.restartLevel() : null;
  }

  function goToChapterSelect() {
    const gc = _deps.getGameController();
    return gc ? gc.goToChapterSelect() : null;
  }

  function goToMainMenu() {
    const gc = _deps.getGameController();
    return gc ? gc.goToMainMenu() : null;
  }

  // ============================================================
  //  公开 API
  // ============================================================
  const PauseManager = {
    init,
    togglePause,
    showPauseMenu,
    hidePauseMenu,
    updatePauseTime,
    restartLevel,
    goToChapterSelect,
    goToMainMenu,
    // 弹窗管理工具（供其他模块使用）
    _pushModal,
    _popModal,
    _lockBodyScroll,
    _unlockBodyScroll,
  };

  global.PauseManager = PauseManager;

})(typeof window !== 'undefined' ? window : this);
