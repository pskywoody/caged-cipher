// UIManager.js - UI管理模块
// 负责所有 UI 表现层逻辑：按钮状态、数字键盘、Toast、45法则横幅、三幕指示器等
const UIManager = (function() {
  'use strict';

  // ===== P1 关键路径加固：安全 DOM 操作辅助函数 =====
  const _domWarned = {};

  function _getEl(id) {
    const el = document.getElementById(id);
    if (!el) {
      if (!_domWarned[id]) {
        console.warn('[DOM] 元素不存在:', id);
        _domWarned[id] = true;
      }
    }
    return el;
  }

  function _setText(id, text) {
    const el = _getEl(id);
    if (el) el.textContent = text;
  }

  function _setHtml(id, html) {
    const el = _getEl(id);
    if (el) el.innerHTML = html;
  }

  function _show(id) {
    const el = _getEl(id);
    if (el) el.style.display = '';
  }

  function _hide(id) {
    const el = _getEl(id);
    if (el) el.style.display = 'none';
  }

  function _setStyle(id, prop, value) {
    const el = _getEl(id);
    if (el) el.style[prop] = value;
  }

  function _toggleClass(id, className, force) {
    const el = _getEl(id);
    if (el) el.classList.toggle(className, force);
  }

  // === 依赖注入 - 从全局获取（guide.js 会挂载这些） ===
  function _getBoard() { return window.guideBoard || window.gameBoard || window.board; }
  function _getNoteMode() { return window.guideNoteMode !== undefined ? window.guideNoteMode : false; }
  function _isPcLayout() { return window._isPcLayout || false; }

  // UI elements to hide during story
  const UI_SELECTORS = ['#game-container', '#num-pad', '#toolbar'];

  // === 状态变量 ===

  // 数字按钮完成状态跟踪
  let _prevNumCompleted = {};

  // Rule45 Banner
  let _rule45BannerInited = false;
  let _rule45BannerVisible = true; // 45法则HUD是否显示

  // Technique Panel
  let _techniquePanelEl = null;
  let _techniquePanelVisible = false;

  // Toast
  const _toastQueue = [];
  const _MAX_TOASTS = 2;

  // 三幕引导 UI 状态
  let _threeActEnabled = false;

  // ============================================================
  // UI Visibility
  // ============================================================
  function setUIVisible(visible) {
    const opacity = visible ? '1' : '0';
    const pointerEvents = visible ? 'auto' : 'none';
    UI_SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.style.opacity = opacity;
        el.style.pointerEvents = pointerEvents;
        el.style.transition = 'opacity 0.5s ease';
      });
    });

    // Preserve scene background during gameplay: add/remove game-scene-bg class on body
    if (visible) {
      document.body.classList.add('game-scene-bg');
    } else {
      document.body.classList.remove('game-scene-bg');
    }
  }

  // ============================================================
  // Note Button State
  // ============================================================
  function updateNoteButtonState() {
    const noteMode = _getNoteMode();
    _toggleClass('btn-note', 'active', noteMode);
    // 同步到 PC 端
    _toggleClass('pc-btn-note', 'active', noteMode);
    // 同步键盘区域笔记模式视觉提示（移动端）
    _toggleClass('num-pad', 'note-mode-active', noteMode);
    _toggleClass('note-mode-indicator', 'show', noteMode);
    // 同步键盘区域笔记模式视觉提示（PC端）
    _toggleClass('pc-num-pad', 'note-mode-active', noteMode);
    _toggleClass('pc-note-mode-indicator', 'show', noteMode);
  }

  // ============================================================
  // Number Button Completed State
  // ============================================================
  function updateNumBtnCompletedState() {
    const board = _getBoard();
    for (let n = 1; n <= board.size; n++) {
      let count = 0;
      for (let r = 0; r < board.size; r++) {
        for (let c = 0; c < board.size; c++) {
          const cell = board.cells[r][c];
          if (cell.fillNum === n || cell.fixedNum === n) count++;
        }
      }
      const isNowCompleted = count >= board.size;
      const wasCompleted = _prevNumCompleted[n] || false;

      // 更新所有数字按钮（包括移动端和 PC 端）
      const allBtns = document.querySelectorAll(`.num-btn[data-num="${n}"]`);
      allBtns.forEach(btn => {
        btn.classList.toggle('completed', isNowCompleted);

        // 刚完成时触发金色闪光动画
        if (isNowCompleted && !wasCompleted) {
          btn.classList.remove('completed-flash');
          void btn.offsetWidth; // 强制重排
          btn.classList.add('completed-flash');
          setTimeout(() => {
            btn.classList.remove('completed-flash');
          }, 550);
        }

        // 更新候选数小数字
        const countEl = btn.querySelector('.num-count');
        if (countEl) {
          countEl.textContent = board.size - count;
        }
      });

      _prevNumCompleted[n] = isNowCompleted;
    }
    // 更新45法则HUD
    if (board && board.size === 9 && typeof updateRule45Banner === 'function') {
      const cell = board.selectedCell || (board.selectedCells && board.selectedCells[0]);
      updateRule45Banner(cell);
    }
  }

  // ============================================================
  // Multi-Select Hint
  // ============================================================
  function updateMultiSelectHint() {
    const board = _getBoard();
    const hint = _getEl('multi-select-hint');
    if (!hint) return;
    const count = board.selectedCells.length;
    if (count > 1) {
      hint.textContent = '已选中 ' + count + ' 格 · 笔记模式';
      hint.classList.add('show');
    } else {
      hint.textContent = '';
      hint.classList.remove('show');
    }
    // 更新45法则HUD
    if (board && board.size === 9 && typeof updateRule45Banner === 'function') {
      const cell = board.selectedCell || (board.selectedCells && board.selectedCells[0]);
      updateRule45Banner(cell);
    }
  }

  // ============================================================
  // Number Pad
  // ============================================================
  function updateNumPad() {
    const board = _getBoard();
    const maxNum = board ? board.size : 9;
    document.querySelectorAll('.num-btn').forEach(btn => {
      const num = parseInt(btn.dataset.num);
      btn.style.display = num <= maxNum ? '' : 'none';
    });
    // 动态调整 grid 列数，确保按钮居中（4x4=4列，6x6=6列，9x9=9列）
    const numPad = _getEl('num-pad');
    if (numPad) {
      numPad.style.gridTemplateColumns = 'repeat(' + maxNum + ', 1fr)';
    }
    // PC 端数字键盘同步
    const pcNumPad = _getEl('pc-num-pad');
    if (pcNumPad) {
      pcNumPad.style.gridTemplateColumns = 'repeat(' + maxNum + ', 1fr)';
    }
  }

  // ============================================================
  // Rule45 Banner (顶部常驻 HUD)
  // ============================================================
  function initRule45Banner() {
    if (_rule45BannerInited) return;
    const banner = _getEl('rule45-banner');
    if (!banner) return;
    _rule45BannerInited = true;
    banner.style.display = 'block';
  }

  function showRule45Banner() {
    const banner = _getEl('rule45-banner');
    if (banner) {
      banner.style.display = 'block';
    }
    // PC 端同步显示
    const pcNotebook = _getEl('pc-rule45-notebook');
    if (pcNotebook) {
      pcNotebook.style.display = '';
    }
    _rule45BannerVisible = true;
  }

  function hideRule45Banner() {
    const banner = _getEl('rule45-banner');
    if (banner) {
      banner.style.display = 'none';
    }
    // PC 端同步隐藏
    const pcNotebook = _getEl('pc-rule45-notebook');
    if (pcNotebook) {
      pcNotebook.style.display = 'none';
    }
    _rule45BannerVisible = false;
  }

  /**
   * 切换 45 法则 HUD 显示/隐藏
   */
  function toggleRule45Banner() {
    if (_rule45BannerVisible) {
      hideRule45Banner();
      showToast('已隐藏 45 法则仪表盘', 1000);
    } else {
      showRule45Banner();
      showToast('已显示 45 法则仪表盘', 1000);
    }
  }

  function updateRule45Banner(cell) {
    const board = _getBoard();
    const banner = document.getElementById('rule45-banner');
    if (!banner || !board || board.size !== 9) return;

    let row = 0, col = 0;
    if (cell) {
      row = cell.r !== undefined ? cell.r : cell.row;
      col = cell.c !== undefined ? cell.c : cell.col;
    } else if (board.selectedCell) {
      row = board.selectedCell.r;
      col = board.selectedCell.c;
    } else if (board.selectedCells && board.selectedCells.length > 0) {
      row = board.selectedCells[0].r;
      col = board.selectedCells[0].c;
    }

    // 计算行信息
    let rowSum = 0, rowEmpty = 0;
    for (let c = 0; c < board.size; c++) {
      const cell = board.cells[row][c];
      if (cell.fillNum || cell.fixedNum) {
        rowSum += cell.fillNum || cell.fixedNum;
      } else {
        rowEmpty++;
      }
    }
    const rowDiff = 45 - rowSum;

    // 计算列信息
    let colSum = 0, colEmpty = 0;
    for (let r = 0; r < board.size; r++) {
      const cell = board.cells[r][col];
      if (cell.fillNum || cell.fixedNum) {
        colSum += cell.fillNum || cell.fixedNum;
      } else {
        colEmpty++;
      }
    }
    const colDiff = 45 - colSum;

    // 计算宫信息
    const boxW = 3, boxH = 3;
    const boxRow = Math.floor(row / boxH);
    const boxCol = Math.floor(col / boxW);
    let boxSum = 0, boxEmpty = 0;
    for (let r = boxRow * boxH; r < (boxRow + 1) * boxH; r++) {
      for (let c = boxCol * boxW; c < (boxCol + 1) * boxW; c++) {
        const cell = board.cells[r][c];
        if (cell.fillNum || cell.fixedNum) {
          boxSum += cell.fillNum || cell.fixedNum;
        } else {
          boxEmpty++;
        }
      }
    }
    const boxDiff = 45 - boxSum;

    // 更新行/列/宫数据
    _setText('r45-row-label', '行' + (row + 1) + '·剩' + rowEmpty);
    _setHtml('r45-row-data', rowSum + '<span class="r45-diff">/45</span> <span class="r45-remain">差' + rowDiff + '</span>');

    _setText('r45-col-label', '列' + (col + 1) + '·剩' + colEmpty);
    _setHtml('r45-col-data', colSum + '<span class="r45-diff">/45</span> <span class="r45-remain">差' + colDiff + '</span>');

    const boxNum = boxRow * 3 + boxCol + 1;
    _setText('r45-box-label', '宫' + boxNum + '·剩' + boxEmpty);
    _setHtml('r45-box-data', boxSum + '<span class="r45-diff">/45</span> <span class="r45-remain">差' + boxDiff + '</span>');

    // 计算当前选中格子所在笼子的信息
    const cageTitleEl = _getEl('r45-cage-title');
    const cageCombosEl = _getEl('r45-cage-combos');

    if (cageTitleEl && cageCombosEl) {
    if (board.cages && board.cages.length > 0 && (cell || (board.selectedCells && board.selectedCells.length > 0))) {
      // 找到包含当前格子的笼子（最外层）
      let currentCage = null;
      for (const cage of board.cages) {
        if (cage.cells.some(cc => cc[0] === row && cc[1] === col)) {
          currentCage = cage;
          break;
        }
      }

      if (currentCage) {
        // 计算笼子当前和
        let cageSum = 0;
        let cageEmpty = 0;
        const usedNums = [];
        for (const cc of currentCage.cells) {
          const c = board.cells[cc[0]][cc[1]];
          if (c.fillNum || c.fixedNum) {
            const num = c.fillNum || c.fixedNum;
            cageSum += num;
            if (!usedNums.includes(num)) usedNums.push(num);
          } else {
            cageEmpty++;
          }
        }
        const remain = currentCage.sum - cageSum;

        cageTitleEl.textContent = '笼 ' + currentCage.sum + '·' + cageSum + ' (剩' + remain + ')';

        // 计算可能的组合（排除已使用的数字）
        if (cageEmpty > 0 && typeof Rule45 !== 'undefined' && Rule45.findCombinations) {
          try {
            const combos = Rule45.findCombinations(cageEmpty, remain, null, [], usedNums);
            cageCombosEl.innerHTML = '';
            const displayCombos = combos.slice(0, 8); // 最多显示8个
            for (const combo of displayCombos) {
              const pill = document.createElement('span');
              pill.className = 'r45-combo-pill';
              pill.textContent = '[' + combo.join(',') + ']';
              cageCombosEl.appendChild(pill);
            }
            if (combos.length > 8) {
              const more = document.createElement('span');
              more.style.cssText = 'font-size:11px;color:#6b7280;margin-left:4px;';
              more.textContent = '+' + (combos.length - 8) + '种';
              cageCombosEl.appendChild(more);
            }
            if (combos.length === 0) {
              const none = document.createElement('span');
              none.style.cssText = 'font-size:11px;color:#ef4444;margin-left:4px;';
              none.textContent = '无解';
              cageCombosEl.appendChild(none);
            }
          } catch (e) {
            cageCombosEl.innerHTML = '<span style="font-size:11px;color:#6b7280;">组合计算中...</span>';
          }
        } else {
          cageCombosEl.innerHTML = '<span style="font-size:11px;color:#6b7280;">已填满</span>';
        }
      } else {
        cageTitleEl.textContent = '未选中笼子';
        cageCombosEl.innerHTML = '<span style="font-size:11px;color:#6b7280;">点击格子查看笼子组合</span>';
      }
    } else {
      cageTitleEl.textContent = '选择格子查看';
      cageCombosEl.innerHTML = '<span style="font-size:11px;color:#6b7280;">点击任意格子查看行列宫及笼子信息</span>';
    }
    } // cageTitleEl && cageCombosEl

    // 同步到 PC 端面板
    if (typeof _syncRule45ToPc === 'function') {
      _syncRule45ToPc();
    }
  }

  function _syncRule45ToPc() {
    if (!_isPcLayout()) return;

    // 同步行/列/宫数据
    const mobileRowLabel = _getEl('r45-row-label');
    const pcRowLabel = _getEl('pc-r45-row-label');
    if (mobileRowLabel && pcRowLabel) pcRowLabel.innerHTML = mobileRowLabel.innerHTML;

    const mobileRowData = _getEl('r45-row-data');
    const pcRowData = _getEl('pc-r45-row-data');
    if (mobileRowData && pcRowData) pcRowData.innerHTML = mobileRowData.innerHTML;

    const mobileColLabel = _getEl('r45-col-label');
    const pcColLabel = _getEl('pc-r45-col-label');
    if (mobileColLabel && pcColLabel) pcColLabel.innerHTML = mobileColLabel.innerHTML;

    const mobileColData = _getEl('r45-col-data');
    const pcColData = _getEl('pc-r45-col-data');
    if (mobileColData && pcColData) pcColData.innerHTML = mobileColData.innerHTML;

    const mobileBoxLabel = _getEl('r45-box-label');
    const pcBoxLabel = _getEl('pc-r45-box-label');
    if (mobileBoxLabel && pcBoxLabel) pcBoxLabel.innerHTML = mobileBoxLabel.innerHTML;

    const mobileBoxData = _getEl('r45-box-data');
    const pcBoxData = _getEl('pc-r45-box-data');
    if (mobileBoxData && pcBoxData) pcBoxData.innerHTML = mobileBoxData.innerHTML;

    // 同步笼子信息
    const mobileCageTitle = _getEl('r45-cage-title');
    const pcCageTitle = _getEl('pc-r45-cage-title');
    if (mobileCageTitle && pcCageTitle) pcCageTitle.innerHTML = mobileCageTitle.innerHTML;

    const mobileCageCombos = _getEl('r45-cage-combos');
    const pcCageCombos = _getEl('pc-r45-cage-combos');
    if (mobileCageCombos && pcCageCombos) pcCageCombos.innerHTML = mobileCageCombos.innerHTML;
  }

  // ============================================================
  // Toast
  // ============================================================
  function showToast(msg, duration) {
    duration = duration || 2500;

    // 检查当前显示的 toast 数量
    const activeToasts = document.querySelectorAll('.game-toast.show').length;

    if (activeToasts >= _MAX_TOASTS) {
      // 加入队列，等当前 toast 消失后再显示
      _toastQueue.push({ msg, duration });
      return;
    }

    _createToast(msg, duration);
  }

  function hideToast() {
    // 立即清除所有 toast
    document.querySelectorAll('.game-toast').forEach(toast => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, 300);
    });
    // 清空队列
    _toastQueue.length = 0;
  }

  function _createToast(msg, duration) {
    const toast = document.createElement('div');
    toast.className = 'game-toast';
    toast.textContent = msg;

    // PC 模式下放在左侧面板，移动端放在 body
    if (_isPcLayout()) {
      const leftPanel = _getEl('pc-left-panel');
      if (leftPanel) {
        leftPanel.appendChild(toast);
      } else {
        document.body.appendChild(toast);
      }
    } else {
      document.body.appendChild(toast);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.classList.add('show');
      });
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.remove();
        // 显示队列中的下一个 toast
        _processToastQueue();
      }, 300);
    }, duration);
  }

  function _processToastQueue() {
    if (_toastQueue.length === 0) return;

    const activeToasts = document.querySelectorAll('.game-toast.show').length;
    if (activeToasts < _MAX_TOASTS) {
      const next = _toastQueue.shift();
      _createToast(next.msg, next.duration);
    }
  }

  // ============================================================
  // 三幕指示器 UI
  // ============================================================

  /**
   * 更新棋盘上方三幕指示灯（圆点 + 文字）
   * @param {number} act - 幕次 1/2/3，或 'complete' 表示通关
   */
  function _updateThreeActDot(act) {
    const _enabled = _threeActEnabled;
    const dotIndicator = _getEl('three-act-indicator');
    if (!dotIndicator) return;

    if (!_enabled) {
      dotIndicator.style.display = 'none';
      return;
    }

    const labelEl = dotIndicator.querySelector('.three-act-label');
    // 清除旧的幕次 class
    dotIndicator.classList.remove('act-1', 'act-2', 'act-3', 'act-complete');

    // 判断是否是切换（之前有值，现在换了一个）
    const wasActive = dotIndicator.style.display !== 'none' && act !== null;

    if (act === 1) {
      dotIndicator.classList.add('act-1');
      if (labelEl) labelEl.textContent = '突破';
      dotIndicator.style.display = 'flex';
    } else if (act === 2) {
      dotIndicator.classList.add('act-2');
      if (labelEl) labelEl.textContent = '破局';
      dotIndicator.style.display = 'flex';
    } else if (act === 3) {
      dotIndicator.classList.add('act-3');
      if (labelEl) labelEl.textContent = '收尾';
      dotIndicator.style.display = 'flex';
    } else if (act === 'complete') {
      dotIndicator.classList.add('act-complete');
      if (labelEl) labelEl.textContent = '通关';
      dotIndicator.style.display = 'flex';
    } else {
      dotIndicator.style.display = 'none';
    }

    // 切换时的光晕爆发动画
    if (wasActive || act === 'complete') {
      dotIndicator.classList.remove('act-switching');
      // 强制重排以重新触发动画
      void dotIndicator.offsetWidth;
      dotIndicator.classList.add('act-switching');
      setTimeout(() => {
        dotIndicator.classList.remove('act-switching');
      }, 450);
    }
  }

  /**
   * 更新顶部幕次指示器（文本 + 进度条）
   */
  function _updateActIndicator(stats) {
    const _enabled = _threeActEnabled;
    const indicator = _getEl('act-indicator');
    const textEl = _getEl('act-indicator-text');
    const fillEl = _getEl('act-indicator-fill');

    if (!_enabled || !stats) {
      if (indicator) indicator.style.display = 'none';
      _updateThreeActDot(null);
      return;
    }

    // 判断当前幕次
    const simpleDone = stats.simple.total > 0 && stats.simple.filled >= stats.simple.total;
    const gateDone = stats.gate.total > 0 && stats.gate.filled >= stats.gate.total;

    let actName, actColor, current, total, actNum;

    if (!simpleDone && stats.simple.total > 0) {
      // 第一幕
      actName = '第一幕·速填';
      actColor = '#22c55e';
      current = stats.simple.filled;
      total = stats.simple.total;
      actNum = 1;
    } else if (!gateDone && stats.gate.total > 0) {
      // 第二幕
      actName = '第二幕·破局';
      actColor = '#ef4444';
      current = stats.gate.filled;
      total = stats.gate.total;
      actNum = 2;
    } else if (stats.core.total > 0) {
      // 第三幕
      actName = '第三幕·雪崩';
      actColor = '#fbbf24';
      current = stats.core.filled;
      total = stats.core.total;
      actNum = 3;
    } else {
      if (indicator) indicator.style.display = 'none';
      _updateThreeActDot(null);
      return;
    }

    // 更新顶部进度条指示器
    if (indicator && textEl && fillEl) {
      indicator.style.display = 'flex';
      textEl.textContent = actName;
      textEl.style.color = actColor;
      fillEl.style.background = actColor;
      const progress = total > 0 ? (current / total) * 100 : 0;
      fillEl.style.width = progress + '%';
    }

    // 更新棋盘上方圆点指示灯
    _updateThreeActDot(actNum);
  }

  /**
   * 设置三幕引导 UI 是否启用
   */
  function setThreeActEnabled(enabled) {
    _threeActEnabled = enabled;
  }

  /**
   * 重置数字按钮完成状态跟踪（切换关卡时调用）
   */
  function resetNumBtnCompletedState() {
    _prevNumCompleted = {};
  }

  /**
   * 重置 Rule45 Banner 状态（切换关卡时调用）
   */
  function resetRule45Banner() {
    _rule45BannerInited = false;
    _rule45BannerVisible = false;
  }

  // ============================================================
  // 公开 API
  // ============================================================
  return {
    // UI 可见性
    setUIVisible,

    // 按钮状态
    updateNoteButtonState,
    updateNumBtnCompletedState,
    updateMultiSelectHint,

    // 数字键盘
    updateNumPad,

    // 45 法则横幅
    updateRule45Banner,
    toggleRule45Banner,
    initRule45Banner,
    showRule45Banner,
    hideRule45Banner,
    _syncRule45ToPc,

    // Toast
    showToast,
    hideToast,

    // 三幕指示器
    updateActIndicator: _updateActIndicator,
    updateThreeActDot: _updateThreeActDot,
    setThreeActEnabled,

    // 状态重置
    resetNumBtnCompletedState,
    resetRule45Banner,
  };
})();

if (typeof window !== 'undefined') {
  window.UIManager = UIManager;
}
