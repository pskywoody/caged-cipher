// EndingManager.js - 游戏结局系统
// 从 guide.js 抽离，物理分离，逻辑不变
// 包含：普通结局、真结局、返回按钮

;(function(global) {
  'use strict';

  // === 依赖引用（由 guide.js 在初始化时注入）===
  let _deps = {
    getCurrentChapterData: () => null,
    getChapterSelect: () => null,
    getProgressManager: () => null,
  };

  // ============================================================
  //  初始化 / 依赖注入
  // ============================================================
  function init(deps) {
    if (deps) {
      Object.assign(_deps, deps);
    }
  }

  // ============================================================
  //  游戏结局
  // ============================================================
  function showGameEnding() {
    const overlay = document.getElementById('complete-overlay');
    if (overlay) overlay.style.display = 'none';

    // 检查是否是真结局章
    const currentChapterData = _deps.getCurrentChapterData();
    const isTrueEndingChapter = currentChapterData && currentChapterData.isTrueEnding;

    if (isTrueEndingChapter) {
      showTrueEnding();
      return;
    }

    const ending = document.getElementById('game-ending');
    if (!ending) {
      // Fallback: just show a final message
      if (overlay) {
        overlay.style.display = 'flex';
        document.getElementById('complete-grade').textContent = '终';
        document.getElementById('complete-insight').textContent = '全剧终 — 感谢你的游玩';
        const btn = document.getElementById('btn-next-level');
        if (btn) btn.style.display = 'none';
      }
      return;
    }

    ending.style.display = 'flex';
    ending.style.opacity = '0';
    requestAnimationFrame(() => {
      ending.style.transition = 'opacity 1.5s ease';
      ending.style.opacity = '1';
    });

    // Add "back to chapter select" button after a delay
    setTimeout(() => {
      addEndingReturnButton();
    }, 4000);
  }

  // ============================================================
  //  真结局
  // ============================================================
  function showTrueEnding() {
    const ProgressManager = _deps.getProgressManager();
    if (ProgressManager) {
      ProgressManager.setTrueEndingCleared();
    }

    const trueEnding = document.getElementById('true-ending');
    if (!trueEnding) {
      // Fallback: use normal ending with modified text
      const ending = document.getElementById('game-ending');
      if (ending) {
        const titleEl = ending.querySelector('div > div:nth-child(2)');
        if (titleEl) titleEl.textContent = '真 · 星辰归途';
        const subEl = ending.querySelector('div > div:nth-child(1)');
        if (subEl) subEl.textContent = '— 真结局 —';
      }
      showGameEnding();
      return;
    }

    trueEnding.style.display = 'flex';
    trueEnding.style.opacity = '0';
    requestAnimationFrame(function() {
      trueEnding.style.transition = 'opacity 2s ease';
      trueEnding.style.opacity = '1';
    });

    // Add return button after delay
    setTimeout(function() {
      addTrueEndingReturnButton();
    }, 5000);
  }

  function addTrueEndingReturnButton() {
    const ending = document.getElementById('true-ending');
    if (!ending) return;
    if (document.getElementById('btn-true-ending-return')) return;

    const btn = document.createElement('button');
    btn.id = 'btn-true-ending-return';
    btn.textContent = '返回章节选择';
    btn.style.cssText = 'margin-top:40px;padding:14px 36px;font-size:16px;' +
      'background:transparent;border:1px solid #fbbf24;color:#fbbf24;' +
      'border-radius:8px;cursor:pointer;letter-spacing:3px;transition:all 0.3s;' +
      'text-shadow:0 0 10px rgba(251,191,36,0.5);';
    btn.addEventListener('mouseenter', function() {
      btn.style.background = 'rgba(251,191,36,0.15)';
      btn.style.boxShadow = '0 0 20px rgba(251,191,36,0.3)';
    });
    btn.addEventListener('mouseleave', function() {
      btn.style.background = 'transparent';
      btn.style.boxShadow = 'none';
    });
    btn.addEventListener('click', function() {
      ending.style.opacity = '0';
      setTimeout(function() {
        ending.style.display = 'none';
        const chapterSelect = _deps.getChapterSelect();
        if (chapterSelect) {
          chapterSelect._render();
          chapterSelect.show();
        }
      }, 1000);
    });

    const content = ending.querySelector('div');
    if (content) content.appendChild(btn);
  }

  function addEndingReturnButton() {
    const ending = document.getElementById('game-ending');
    if (!ending) return;
    if (document.getElementById('btn-ending-return')) return;

    const btn = document.createElement('button');
    btn.id = 'btn-ending-return';
    btn.textContent = '返回章节选择';
    btn.style.cssText = 'margin-top:40px;padding:12px 32px;font-size:16px;' +
      'background:transparent;border:1px solid #64748b;color:#94a3b8;' +
      'border-radius:8px;cursor:pointer;letter-spacing:2px;transition:all 0.3s;';
    btn.addEventListener('mouseenter', () => {
      btn.style.borderColor = '#fbbf24';
      btn.style.color = '#fbbf24';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.borderColor = '#64748b';
      btn.style.color = '#94a3b8';
    });
    btn.addEventListener('click', () => {
      ending.style.opacity = '0';
      setTimeout(() => {
        ending.style.display = 'none';
        const chapterSelect = _deps.getChapterSelect();
        if (chapterSelect) {
          chapterSelect._render();
          chapterSelect.show();
        }
      }, 800);
    });

    const content = ending.querySelector('div');
    if (content) content.appendChild(btn);
  }

  // ============================================================
  //  公开 API
  // ============================================================
  const EndingManager = {
    init,
    showGameEnding,
    showTrueEnding,
    addTrueEndingReturnButton,
    addEndingReturnButton,
  };

  global.EndingManager = EndingManager;

})(typeof window !== 'undefined' ? window : this);
