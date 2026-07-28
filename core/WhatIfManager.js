// WhatIfManager.js - What-If 假设模式管理（分支快照系统）
// 从 guide.js 抽离，物理分离，逻辑不变

;(function(global) {
  'use strict';

  class WhatIfManager {
    constructor(options) {
      // 依赖注入
      this.board = options.board || null;
      this.renderer = options.renderer || null;
      this.techMatrix = options.techMatrix || null;
      this.lessonPlayer = options.lessonPlayer || null;
      this.AudioService = options.AudioService || global.AudioService || null;

      // 回调
      this.onShowToast = options.onShowToast || function(msg) {
        if (global.UIManager && global.UIManager.showToast) {
          global.UIManager.showToast(msg);
        }
      };
      this.onUpdateRule45Banner = options.onUpdateRule45Banner || null;
      this.onEnter = options.onEnter || null;       // 进入后回调
      this.onExit = options.onExit || null;         // 退出后回调
      this.onSnapshotAdded = options.onSnapshotAdded || null;
      this.onSnapshotRestored = options.onSnapshotRestored || null;
      this.isCompleted = options.isCompleted || (() => false);
      this.isStoryPlaying = options.isStoryPlaying || (() => false);

      // 状态
      this.active = false;
      this.rootSnapshot = null;      // 根状态快照（进入时保存）
      this.snapshots = [];           // 快照栈（最多3个）
      this.maxSnapshots = 3;
      this.currentIndex = -1;        // 当前查看的快照索引（-1 表示最新状态）
      this.rootLevelTitle = '';      // 保存原关卡名
    }

    // === 外部依赖更新接口 ===
    setBoard(board) { this.board = board; }
    setRenderer(renderer) { this.renderer = renderer; }
    setTechMatrix(techMatrix) { this.techMatrix = techMatrix; }
    setLessonPlayer(lessonPlayer) { this.lessonPlayer = lessonPlayer; }

    // === 快照核心 ===

    /**
     * 创建棋盘快照（深拷贝关键状态）
     */
    _createWhatIfSnapshot(label) {
      if (!this.board) return null;
      const snapshot = {
        label: label || '',
        // 深拷贝格子数据
        cells: this.board.cells.map(row => row.map(cell => ({
          fillNum: cell.fillNum,
          fixedNum: cell.fixedNum,
          candidates: new Set(cell.candidates),
          eliminations: new Set(cell.eliminations),
          isError: cell.isError,
          tempWrongNum: cell.tempWrongNum,
          isLocked: cell.isLocked,
        }))),
        // 选中状态
        selectedCell: this.board.selectedCell ? { ...this.board.selectedCell } : null,
        selectedCells: this.board.selectedCells.map(c => ({ ...c })),
        selectedCageId: this.board.selectedCageId,
        selectedCageIds: [...(this.board.selectedCageIds || [])],
        // 历史记录
        history: this.board.history ? [...this.board.history] : [],
        redoStack: this.board.redoStack ? [...this.board.redoStack] : [],
        // 时间戳
        timestamp: Date.now(),
      };
      return snapshot;
    }

    /**
     * 检查当前棋盘状态与根快照相比是否有变化
     * 用于 beforeunload 时判断是否需要确认离开
     */
    _hasChangesFromRoot(rootSnapshot) {
      if (!this.board || !rootSnapshot || !rootSnapshot.cells) return false;
      for (let r = 0; r < this.board.size; r++) {
        for (let c = 0; c < this.board.size; c++) {
          const src = rootSnapshot.cells[r][c];
          const dst = this.board.cells[r][c];
          if (src.fillNum !== dst.fillNum) return true;
          if (src.candidates.size !== dst.candidates.size) return true;
        }
      }
      return false;
    }

    hasChanges() {
      return this.snapshots.length > 0 ||
        (this.rootSnapshot && this._hasChangesFromRoot(this.rootSnapshot));
    }

    /**
     * 从快照恢复棋盘状态
     */
    _restoreWhatIfSnapshot(snapshot) {
      if (!this.board || !snapshot) return;

      // 恢复格子数据
      for (let r = 0; r < this.board.size; r++) {
        for (let c = 0; c < this.board.size; c++) {
          const src = snapshot.cells[r][c];
          const dst = this.board.cells[r][c];
          dst.fillNum = src.fillNum;
          dst.fixedNum = src.fixedNum;
          dst.candidates = new Set(src.candidates);
          dst.eliminations = new Set(src.eliminations);
          dst.isError = src.isError;
          dst.tempWrongNum = src.tempWrongNum;
          dst.isLocked = src.isLocked;
          dst.isSelected = false;
        }
      }

      // 恢复选中状态
      this.board.selectedCell = snapshot.selectedCell ? { ...snapshot.selectedCell } : null;
      this.board.selectedCells = snapshot.selectedCells.map(c => ({ ...c }));
      this.board.selectedCageId = snapshot.selectedCageId;
      this.board.selectedCageIds = [...(snapshot.selectedCageIds || [])];

      // 重新设置选中标记
      if (this.board.selectedCell) {
        const { r, c } = this.board.selectedCell;
        if (this.board.cells[r] && this.board.cells[r][c]) {
          this.board.cells[r][c].isSelected = true;
        }
      }
      for (const sc of this.board.selectedCells) {
        if (this.board.cells[sc.r] && this.board.cells[sc.r][sc.c]) {
          this.board.cells[sc.r][sc.c].isSelected = true;
        }
      }

      // 恢复历史
      this.board.history = snapshot.history ? [...snapshot.history] : [];
      this.board.redoStack = snapshot.redoStack ? [...snapshot.redoStack] : [];

      // 重绘
      if (this.renderer) {
        this.renderer.forceRender = true;
        this.renderer.render(this.board);
      }

      // 更新45法则HUD
      if (this.board.size === 9 && typeof this.onUpdateRule45Banner === 'function') {
        this.onUpdateRule45Banner(this.board.selectedCell || this.board.selectedCells[0]);
      }

      if (typeof this.onSnapshotRestored === 'function') {
        this.onSnapshotRestored(snapshot);
      }
    }

    /**
     * 生成快照缩略图（使用离屏canvas）
     */
    _createSnapshotThumbnail(snapshot, index) {
      if (!this.board || !this.renderer) return '';
      try {
        const size = 56;
        const offscreen = document.createElement('canvas');
        offscreen.width = size * this.board.size;
        offscreen.height = size * this.board.size;
        const ctx = offscreen.getContext('2d');

        // 简化渲染：只画格子和数字
        const cellSize = size;
        // 背景
        ctx.fillStyle = '#0f1115';
        ctx.fillRect(0, 0, offscreen.width, offscreen.height);

        // 网格线
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= this.board.size; i++) {
          ctx.beginPath();
          ctx.moveTo(i * cellSize, 0);
          ctx.lineTo(i * cellSize, offscreen.height);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, i * cellSize);
          ctx.lineTo(offscreen.width, i * cellSize);
          ctx.stroke();
        }

        // 宫线
        const boxW = this.board.size === 9 ? 3 : (this.board.size === 6 ? 3 : 2);
        const boxH = this.board.size === 9 ? 3 : (this.board.size === 6 ? 2 : 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        for (let i = 0; i <= this.board.size; i += boxW) {
          ctx.beginPath();
          ctx.moveTo(i * cellSize, 0);
          ctx.lineTo(i * cellSize, offscreen.height);
          ctx.stroke();
        }
        for (let i = 0; i <= this.board.size; i += boxH) {
          ctx.beginPath();
          ctx.moveTo(0, i * cellSize);
          ctx.lineTo(offscreen.width, i * cellSize);
          ctx.stroke();
        }

        // 数字
        ctx.font = `600 ${Math.floor(cellSize * 0.6)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // P2-2: 根据快照索引调整玩家数字的紫色调（越新越浓）
        const purpleTint = Math.min(index, 2) * 0.15; // 0, 0.15, 0.30
        for (let r = 0; r < this.board.size; r++) {
          for (let c = 0; c < this.board.size; c++) {
            const cell = snapshot.cells[r][c];
            const num = cell.fillNum || cell.fixedNum;
            if (num > 0) {
              if (cell.fixedNum) {
                ctx.fillStyle = '#e8eaed';
              } else {
                // 玩家数字：从蓝色渐变到紫色
                if (purpleTint > 0) {
                  // 颜色插值：#60a5fa -> #8b5cf6
                  const rCol = Math.round(96 + (139 - 96) * purpleTint / 0.3);
                  const gCol = Math.round(165 + (92 - 165) * purpleTint / 0.3);
                  const bCol = Math.round(250 + (246 - 250) * purpleTint / 0.3);
                  ctx.fillStyle = `rgb(${rCol}, ${gCol}, ${bCol})`;
                } else {
                  ctx.fillStyle = '#60a5fa';
                }
              }
              ctx.fillText(String(num), c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
            }
          }
        }

        // P2-2: 紫色调叠层（越新的快照越浓）
        if (purpleTint > 0) {
          ctx.fillStyle = `rgba(139, 92, 246, ${purpleTint * 0.2})`;
          ctx.fillRect(0, 0, offscreen.width, offscreen.height);
        }

        return offscreen.toDataURL();
      } catch (e) {
        return '';
      }
    }

    // === UI 渲染（快照卡片） ===

    /**
     * 渲染快照卡片到右侧浮条（扑克牌式堆叠）
     */
    _renderWhatIfSnapshots() {
      const container = document.getElementById('snapshot-cards');
      if (!container) return;

      container.innerHTML = '';

      this.snapshots.forEach((snap, index) => {
        const card = document.createElement('div');
        card.className = 'snapshot-card';
        if (index === this.snapshots.length - 1 && this.currentIndex === -1) {
          card.classList.add('active');
        } else if (index === this.currentIndex) {
          card.classList.add('active');
        }
        // P2-2: 不同快照的紫色调渐变（第1个最淡，越新越浓）
        if (index === 0) {
          card.classList.add('whatif-snapshot-1');
        } else if (index === 1) {
          card.classList.add('whatif-snapshot-2');
        } else if (index >= 2) {
          card.classList.add('whatif-snapshot-3');
        }

        // 缩略图
        if (snap.thumbnail) {
          const img = document.createElement('img');
          img.src = snap.thumbnail;
          img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
          card.appendChild(img);
        }

        // 索引徽章
        const indexBadge = document.createElement('div');
        indexBadge.className = 'snapshot-index';
        indexBadge.textContent = String(index + 1);
        card.appendChild(indexBadge);

        // 标签
        const label = document.createElement('div');
        label.className = 'snapshot-label';
        label.textContent = snap.label || `#${index + 1}`;
        card.appendChild(label);

        // 点击跳转
        card.addEventListener('click', () => {
          if (this.AudioService && this.AudioService.sfx) {
            this.AudioService.sfx.play?.('click');
          }
          this.jumpToSnapshot(index);
        });

        container.appendChild(card);
      });

      // 更新拉扣头徽章数量
      this._updateFloatBarBadge();

      // 同步到 PC 端快照面板
      this._syncWhatIfSnapshotsToPc();
    }

    /**
     * 更新拉扣头上的徽章数量
     */
    _updateFloatBarBadge() {
      const badge = document.getElementById('float-bar-tab-badge');
      const count = this.snapshots.length;
      if (badge) {
        if (count > 0 && this.active) {
          badge.style.display = 'flex';
          badge.textContent = String(count);
        } else {
          badge.style.display = 'none';
        }
      }
      // 同步 PC 端计数
      const pcCount = document.getElementById('pc-whatif-count');
      if (pcCount) {
        pcCount.textContent = '分支 ' + count + '/3';
      }
    }

    /**
     * 同步 What If 快照卡片到 PC 端面板
     */
    _syncWhatIfSnapshotsToPc() {
      const pcContainer = document.getElementById('pc-snapshot-cards');
      if (!pcContainer) return;

      pcContainer.innerHTML = '';

      this.snapshots.forEach((snap, index) => {
        const card = document.createElement('div');
        card.className = 'pc-snapshot-card';
        if (index === this.snapshots.length - 1 && this.currentIndex === -1) {
          card.classList.add('active');
        } else if (index === this.currentIndex) {
          card.classList.add('active');
        }
        // P2-2: 不同快照的紫色调渐变（第1个最淡，越新越浓）
        if (index === 0) {
          card.classList.add('whatif-snapshot-1');
        } else if (index === 1) {
          card.classList.add('whatif-snapshot-2');
        } else if (index >= 2) {
          card.classList.add('whatif-snapshot-3');
        }

        // 缩略图
        if (snap.thumbnail) {
          const img = document.createElement('img');
          img.src = snap.thumbnail;
          img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
          card.appendChild(img);
        }

        // 索引徽章
        const indexBadge = document.createElement('div');
        indexBadge.className = 'snapshot-index';
        indexBadge.textContent = String(index + 1);
        card.appendChild(indexBadge);

        // 标签
        const label = document.createElement('div');
        label.className = 'snapshot-label';
        label.textContent = snap.label || `#${index + 1}`;
        card.appendChild(label);

        // 点击跳转
        card.addEventListener('click', () => {
          if (this.AudioService && this.AudioService.sfx) {
            this.AudioService.sfx.play?.('click');
          }
          this.jumpToSnapshot(index);
        });

        pcContainer.appendChild(card);
      });
    }

    // === 模式切换 ===

    /**
     * 进入 What If 模式
     */
    enterMode() {
      if (this.active || !this.board) return;
      if (this.isStoryPlaying()) return;
      if (this.isCompleted()) return;

      // 如果技术矩阵已打开，先关闭它（平滑过渡）
      const techMatrixVisible = this.techMatrix && this.techMatrix.visible;
      if (techMatrixVisible) {
        this.techMatrix.hide();
        // 等待技术矩阵滑出后再进入 What If 模式
        setTimeout(() => {
          this._doEnter();
        }, 300);
        return;
      }

      this._doEnter();
    }

    /**
     * 实际执行进入 What If 模式的逻辑
     */
    _doEnter() {
      // 保存根状态
      this.rootSnapshot = this._createWhatIfSnapshot('root');
      this.snapshots = [];
      this.currentIndex = -1;
      this.active = true;

      // 保存原关卡名
      const titleEl = document.getElementById('level-title');
      if (titleEl) {
        this.rootLevelTitle = titleEl.textContent;
      }

      // 添加视觉标记
      document.body.classList.add('whatif-mode');

      // 通知渲染器进入 What-If 模式（数字异色等视觉增强）
      if (this.renderer && typeof this.renderer.setWhatIfMode === 'function') {
        this.renderer.setWhatIfMode(true, {
          rootCells: this.rootSnapshot ? this.rootSnapshot.cells : null,
        });
      }

      // 创建棋盘淡紫色叠层
      this._createWhatIfOverlay();

      // 创建假设模式徽章
      this._createWhatIfBadge();

      // 显示右侧浮条（拉扣头 + 快照面板）
      const stack = document.getElementById('whatif-snapshot-stack');
      const hintProg = document.getElementById('hint-progress-indicator');
      this._showFloatBar(false); // 显示拉扣头，面板默认收起
      if (stack) stack.style.display = 'flex';
      if (hintProg) hintProg.style.display = 'none';
      this._updateFloatBarTabIcon();
      this._updateFloatBarBadge();

      // 更新按钮状态 —— 使用 active 类而非内联样式
      const btn = document.getElementById('btn-whatif');
      if (btn) {
        btn.classList.add('active');
      }
      // 同步 PC 端按钮
      const pcWhatIfBtn = document.getElementById('pc-btn-whatif');
      if (pcWhatIfBtn) {
        pcWhatIfBtn.classList.add('active');
      }

      // 更新提示按钮（禁用）—— 移动端用内联样式，PC端通过CSS .whatif-mode 控制
      const hintBtn = document.getElementById('btn-hint');
      if (hintBtn) {
        hintBtn.style.opacity = '0.4';
        hintBtn.style.pointerEvents = 'none';
        hintBtn.title = '假设模式下提示不可用';
      }

      // 阻止安卓返回键（popstate 拦截）
      try {
        history.pushState({ whatIf: true }, '');
      } catch (e) {}

      if (this.AudioService && this.AudioService.sfx) {
        this.AudioService.sfx.play?.('select');
      }
      this.onShowToast('已进入假设模式，最多保存 3 个分支快照');

      // === 教学引导：通知 LessonPlayer 玩家进入了 What If 模式 ===
      if (this.lessonPlayer && this.lessonPlayer.isActive &&
          typeof this.lessonPlayer.handleWhatIfEnter === 'function') {
        const whatIfResult = this.lessonPlayer.handleWhatIfEnter();
        if (whatIfResult && whatIfResult.handled && whatIfResult.correct) {
          // 成功进入 What If 模式的教学反馈
          if (this.AudioService && this.AudioService.sfx) {
            this.AudioService.sfx.play('fill_correct');
          }
        }
      }

      if (typeof this.onEnter === 'function') {
        this.onEnter();
      }
    }

    /**
     * 退出 What If 模式（回到根状态）
     */
    exitMode(adoptChanges) {
      if (!this.active) return;

      if (!adoptChanges) {
        // 回退到根状态
        if (this.rootSnapshot) {
          this._restoreWhatIfSnapshot(this.rootSnapshot);
        }
      }

      this.active = false;
      this.rootSnapshot = null;
      this.snapshots = [];
      this.currentIndex = -1;

      // 移除视觉标记
      document.body.classList.remove('whatif-mode');

      // 通知渲染器退出 What-If 模式
      if (this.renderer && typeof this.renderer.setWhatIfMode === 'function') {
        this.renderer.setWhatIfMode(false);
      }

      // 移除叠层和徽章
      this._removeWhatIfOverlay();
      this._removeWhatIfBadge();

      // 恢复关卡名
      const titleEl = document.getElementById('level-title');
      if (titleEl && this.rootLevelTitle) {
        titleEl.textContent = this.rootLevelTitle;
        this.rootLevelTitle = '';
      }

      // 隐藏右侧浮条
      const stack = document.getElementById('whatif-snapshot-stack');
      this._hideFloatBar();
      if (stack) stack.style.display = 'none';

      // 恢复按钮状态 —— 使用 active 类而非内联样式
      const btn = document.getElementById('btn-whatif');
      if (btn) {
        btn.classList.remove('active');
      }
      // 同步 PC 端按钮
      const pcWhatIfBtn = document.getElementById('pc-btn-whatif');
      if (pcWhatIfBtn) {
        pcWhatIfBtn.classList.remove('active');
      }

      // 恢复提示按钮
      const hintBtn = document.getElementById('btn-hint');
      if (hintBtn) {
        hintBtn.style.opacity = '';
        hintBtn.style.pointerEvents = '';
        hintBtn.title = '提示 (H)';
      }

      // 清理历史状态
      try {
        if (history.state && history.state.whatIf) {
          history.back();
        }
      } catch (e) {}

      if (this.AudioService && this.AudioService.sfx) {
        this.AudioService.sfx.play?.('click');
      }

      if (typeof this.onExit === 'function') {
        this.onExit(adoptChanges);
      }
    }

    /**
     * 切换 What If 模式
     */
    toggleMode() {
      if (this.active) {
        // 退出时询问是否采纳
        if (this.snapshots.length > 0 || this.rootSnapshot) {
          // 简单处理：直接回退（长按或菜单可以有采纳选项）
          this.exitMode(false);
          this.onShowToast('已退出假设模式，更改已撤销');
        } else {
          this.exitMode(false);
        }
      } else {
        this.enterMode();
      }
    }

    // === 快照操作 ===

    /**
     * 添加一个快照（填数后自动调用）
     */
    addSnapshot(label) {
      if (!this.active || !this.board) return;

      const snap = this._createWhatIfSnapshot(label);
      if (!snap) return;

      // 生成缩略图
      snap.thumbnail = this._createSnapshotThumbnail(snap, this.snapshots.length);

      // 滚动覆盖：超过上限时移除最旧的
      if (this.snapshots.length >= this.maxSnapshots) {
        this.snapshots.shift();
        this.onShowToast('已覆盖最早的分支快照');
      }

      this.snapshots.push(snap);
      this.currentIndex = -1; // -1 表示当前是最新状态

      this._renderWhatIfSnapshots();

      // 新快照滑入动画：给最新的快照卡片添加 new-snapshot 类
      const latestIdx = this.snapshots.length - 1;
      const container = document.getElementById('snapshot-cards');
      if (container && container.children[latestIdx]) {
        const card = container.children[latestIdx];
        card.classList.add('new-snapshot');
        setTimeout(() => card.classList.remove('new-snapshot'), 500);
      }
      // PC 端同步
      const pcContainer = document.getElementById('pc-snapshot-cards');
      if (pcContainer && pcContainer.children[latestIdx]) {
        const pcCard = pcContainer.children[latestIdx];
        pcCard.classList.add('new-snapshot');
        setTimeout(() => pcCard.classList.remove('new-snapshot'), 500);
      }

      // 快照生成闪光效果
      if (this.renderer && this.board.selectedCell) {
        this.renderer.triggerFillAnimation?.(this.board.selectedCell.r, this.board.selectedCell.c, 200);
      }

      if (typeof this.onSnapshotAdded === 'function') {
        this.onSnapshotAdded(snap);
      }
    }

    /**
     * 跳转到指定快照
     * P2优化：移除200ms延迟，使用快速过渡（<100ms），无白屏
     */
    jumpToSnapshot(index) {
      if (!this.active || !this.snapshots[index]) return;

      const snap = this.snapshots[index];
      this.currentIndex = index;

      // 快速淡入淡出效果（100ms，无白屏）
      const canvas = document.getElementById('gameCanvas');
      if (canvas) {
        canvas.style.transition = 'opacity 0.1s ease-out';
        canvas.style.opacity = '0.6';
        // 下一帧立即恢复数据并重绘
        requestAnimationFrame(() => {
          this._restoreWhatIfSnapshot(snap);
          requestAnimationFrame(() => {
            canvas.style.opacity = '1';
            setTimeout(() => { canvas.style.transition = ''; }, 110);
          });
        });
      } else {
        this._restoreWhatIfSnapshot(snap);
      }

      this._renderWhatIfSnapshots();
      if (this.AudioService && this.AudioService.sfx) {
        this.AudioService.sfx.play?.('select');
      }
    }

    /**
     * 回退一步（弹出栈顶快照）
     */
    undoStep() {
      if (!this.active) return;

      if (this.snapshots.length === 0) {
        // 没有快照了，退出 What If
        this.exitMode(false);
        this.onShowToast('已退出假设模式');
        return;
      }

      // 弹出最新快照
      this.snapshots.pop();

      if (this.snapshots.length > 0) {
        // 恢复到上一个快照
        const prevSnap = this.snapshots[this.snapshots.length - 1];
        this.currentIndex = this.snapshots.length - 1;
        this._restoreWhatIfSnapshot(prevSnap);
      } else {
        // 回到根状态
        this.currentIndex = -1;
        if (this.rootSnapshot) {
          this._restoreWhatIfSnapshot(this.rootSnapshot);
        }
      }

      this._renderWhatIfSnapshots();
      if (this.AudioService && this.AudioService.sfx) {
        this.AudioService.sfx.play?.('erase');
      }
    }

    /**
     * 采纳当前假设（写入正式棋盘）
     */
    adoptChanges() {
      if (!this.active) return;
      this.exitMode(true);
      this.onShowToast('已采纳假设，更改已保存');
    }

    /**
     * 彻底回退（回到根状态，不退出模式）
     */
    resetToRoot() {
      if (!this.active || !this.rootSnapshot) return;

      this._restoreWhatIfSnapshot(this.rootSnapshot);
      this.snapshots = [];
      this.currentIndex = -1;
      this._renderWhatIfSnapshots();
      if (this.AudioService && this.AudioService.sfx) {
        this.AudioService.sfx.play?.('erase');
      }
      this.onShowToast('已重置到假设起点');
    }

    // === 浮条辅助（与 UI 相关的内部方法） ===

    _showFloatBar(showPanel) {
      const bar = document.getElementById('right-floating-bar');
      if (!bar) return;
      bar.style.display = 'flex';
      if (showPanel) {
        bar.classList.add('panel-open');
      }
    }

    _hideFloatBar() {
      const bar = document.getElementById('right-floating-bar');
      if (!bar) return;
      bar.style.display = 'none';
      bar.classList.remove('panel-open');
    }

    _updateFloatBarTabIcon() {
      const icon = document.getElementById('float-bar-tab-icon');
      if (!icon) return;
      if (this.active) {
        icon.textContent = '🧪';
      } else {
        icon.textContent = '💡';
      }
    }

    // === What-If 模式视觉增强（P2-2） ===

    /**
     * 创建棋盘淡紫色叠层
     */
    _createWhatIfOverlay() {
      // 移动端棋盘区域
      const boardArea = document.getElementById('board-area');
      if (boardArea && !boardArea.querySelector('.whatif-overlay')) {
        const overlay = document.createElement('div');
        overlay.className = 'whatif-overlay';
        overlay.id = 'whatif-overlay-mobile';
        boardArea.appendChild(overlay);
      }
      // PC 端棋盘容器
      const pcBoardContainer = document.getElementById('pc-board-container');
      if (pcBoardContainer && !pcBoardContainer.querySelector('.whatif-overlay')) {
        const overlay = document.createElement('div');
        overlay.className = 'whatif-overlay';
        overlay.id = 'whatif-overlay-pc';
        pcBoardContainer.appendChild(overlay);
      }
    }

    /**
     * 移除棋盘淡紫色叠层
     */
    _removeWhatIfOverlay() {
      const mobileOverlay = document.getElementById('whatif-overlay-mobile');
      if (mobileOverlay && mobileOverlay.parentNode) {
        mobileOverlay.parentNode.removeChild(mobileOverlay);
      }
      const pcOverlay = document.getElementById('whatif-overlay-pc');
      if (pcOverlay && pcOverlay.parentNode) {
        pcOverlay.parentNode.removeChild(pcOverlay);
      }
    }

    /**
     * 创建假设模式徽章（带脉冲动画，点击可快速退出）
     */
    _createWhatIfBadge() {
      // 移动端棋盘区域
      const boardArea = document.getElementById('board-area');
      if (boardArea && !boardArea.querySelector('.whatif-badge')) {
        const badge = this._buildWhatIfBadge('whatif-badge-mobile');
        boardArea.appendChild(badge);
      }
      // PC 端棋盘容器
      const pcBoardContainer = document.getElementById('pc-board-container');
      if (pcBoardContainer && !pcBoardContainer.querySelector('.whatif-badge')) {
        const badge = this._buildWhatIfBadge('whatif-badge-pc');
        pcBoardContainer.appendChild(badge);
      }
    }

    /**
     * 构建单个徽章元素
     */
    _buildWhatIfBadge(id) {
      const badge = document.createElement('div');
      badge.className = 'whatif-badge';
      badge.id = id;
      badge.title = '点击退出假设模式';

      const icon = document.createElement('span');
      icon.className = 'whatif-badge-icon';
      icon.textContent = '🧪';
      badge.appendChild(icon);

      const text = document.createElement('span');
      text.className = 'whatif-badge-text';
      text.textContent = '假设模式';
      badge.appendChild(text);

      // 点击退出假设模式
      badge.addEventListener('click', () => {
        if (this.AudioService && this.AudioService.sfx) {
          this.AudioService.sfx.play?.('click');
        }
        this.exitMode(false);
        this.onShowToast('已退出假设模式，更改已撤销');
      });

      return badge;
    }

    /**
     * 移除假设模式徽章
     */
    _removeWhatIfBadge() {
      const mobileBadge = document.getElementById('whatif-badge-mobile');
      if (mobileBadge && mobileBadge.parentNode) {
        mobileBadge.parentNode.removeChild(mobileBadge);
      }
      const pcBadge = document.getElementById('whatif-badge-pc');
      if (pcBadge && pcBadge.parentNode) {
        pcBadge.parentNode.removeChild(pcBadge);
      }
    }

    // === 兼容接口：供 InputRouter 等外部模块访问状态 ===
    getState() {
      return {
        active: this.active,
        snapshots: this.snapshots,
        currentIndex: this.currentIndex,
        rootSnapshot: this.rootSnapshot,
        maxSnapshots: this.maxSnapshots,
        rootLevelTitle: this.rootLevelTitle,
      };
    }
  }

  // 暴露到全局
  if (typeof window !== 'undefined') {
    window.WhatIfManager = WhatIfManager;
  }

})(typeof window !== 'undefined' ? window : globalThis);
