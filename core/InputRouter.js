// InputRouter.js - 输入路由模块
// 负责所有指针/键盘事件的捕获和分发
// 阶段三迁移：从 guide.js 抽离输入事件处理逻辑

;(function(global) {
  'use strict';

  class InputRouter {
    constructor(options) {
      // === 核心对象引用 ===
      this.board = options.board;
      this.renderer = options.renderer;
      this.storyEngine = options.storyEngine || null;
      this.lessonPlayer = options.lessonPlayer || null;
      this.HintPlayerState = options.HintPlayerState || null;
      this.WhatIfState = options.WhatIfState || null;
      this.techMatrix = options.techMatrix || null;
      this.comedySystem = options.comedySystem || null;
      this.settingsPanel = options.settingsPanel || null;
      this.achievementPanel = options.achievementPanel || null;
      this.galleryPanel = options.galleryPanel || null;
      this.AudioService = options.AudioService || (typeof AudioService !== 'undefined' ? AudioService : null);
      this.VIBRATE_PRESETS = options.VIBRATE_PRESETS || {};
      this.GuideBattle = options.GuideBattle || null;

      // === 状态 getter / setter ===
      this._getIsCompleted = options.getIsCompleted || (() => false);
      this._getIsPaused = options.getIsPaused || (() => false);
      this._getNoteMode = options.getNoteMode || (() => false);
      this._setNoteMode = options.setNoteMode || (() => {});
      this._getDebugMode = options.getDebugMode || (() => false);
      this._getTechniquePanelVisible = options.getTechniquePanelVisible || (() => false);
      this._setUsedNotes = options.setUsedNotes || (() => {});

      // === 业务回调函数 ===
      this.onNumberInput = options.onNumberInput || (() => {});
      this.onErase = options.onErase || (() => {});
      this.onToggleNote = options.onToggleNote || (() => {});
      this.onHint = options.onHint || (() => {});
      this.onWhatIfToggle = options.onWhatIfToggle || (() => {});
      this.onUndo = options.onUndo || (() => {});
      this.onPauseToggle = options.onPauseToggle || (() => {});
      this.onSkipHintStep = options.onSkipHintStep || (() => {});
      this.onBoardLongPress = options.onBoardLongPress || (() => {});
      this.onUpdateMultiSelectHint = options.onUpdateMultiSelectHint || (() => {});
      this.onUpdateNoteButtonState = options.onUpdateNoteButtonState || (() => {});
      this.onUpdateRule45Banner = options.onUpdateRule45Banner || (() => {});
      this.onShowToast = options.onShowToast || (() => {});
      this.onVibrate = options.onVibrate || (() => {});
      this.onEnterWhatIf = options.onEnterWhatIf || (() => {});
      this.onExitWhatIf = options.onExitWhatIf || (() => {});
      this.onAdoptWhatIf = options.onAdoptWhatIf || (() => {});
      this.onUndoWhatIfStep = options.onUndoWhatIfStep || (() => {});
      this.onToggleRule45Banner = options.onToggleRule45Banner || (() => {});
      this.onCheckBoardAnswer = options.onCheckBoardAnswer || (() => {});
      this.onAutoFillCandidates = options.onAutoFillCandidates || (() => {});
      this.onAdjustSelectedNumber = options.onAdjustSelectedNumber || (() => {});
      this.onToggleTechniqueEncyclopedia = options.onToggleTechniqueEncyclopedia || (() => {});
      this.onHideTechniqueEncyclopedia = options.onHideTechniqueEncyclopedia || (() => {});
      this.onToggleHeatmapDisplay = options.onToggleHeatmapDisplay || (() => {});
      this.onUpdateNumBtnActiveState = options.onUpdateNumBtnActiveState || (() => {});
      this.onUpdateNumBtnCompletedState = options.onUpdateNumBtnCompletedState || (() => {});

      // === 交互状态变量 ===
      this.isDragging = false;
      this.dragStartCell = null;
      this.activeNumber = null; // 长按数字键激活的数字
      this._swipeStartPos = null; // 滑动起始位置 {x, y, time}

      // 连填模式状态
      this.quickFillMode = false;  // 是否处于连填模式
      this.quickFillNum = null;    // 当前连填的数字
      this.numBtnStartX = 0;       // 数字键按下时的X坐标
      this.numBtnStartY = 0;       // 数字键按下时的Y坐标
      this._numBtnPressed = null;  // 当前按下的数字按钮元素（防止拖动误触）
      this._numBtnHandled = false; // 当前按下是否已处理（防止pointerleave重复触发）

      // 长按状态
      this.longPressTimer = null;  // 长按定时器
      this.longPressTriggered = false; // 是否已触发长按（第一阶段）
      this.longPressPhase = 0;     // 长按阶段：0=未触发, 1=第一阶段(钉选), 2=第二阶段(进入What If)
      this.longPressCell = null;   // 当前长按的格子

      // 即时填数状态
      this._instantFillCommitted = false; // 即时填数是否已提交（非回退状态）
      this._instantFillNum = null; // 即时填入的数字（用于回退）

      // P0触控优化：输入状态锁
      this._isProcessingInput = false;

      // === 常量 ===
      this.LONG_PRESS_PHASE1_MS = 500;  // 第一阶段：钉选
      this.LONG_PRESS_PHASE2_MS = 1100; // 第二阶段：进入What If模式
      this.swipeUpThreshold = 30;  // 上划触发阈值（像素）
      this.EDGE_DEAD_ZONE = 4;     // 屏幕边缘死区（像素）
      this.SWIPE_FAST_THRESHOLD_MS = 200; // 快速滑动时间阈值
      this.SWIPE_DISTANCE_THRESHOLD = 30; // 滑动距离阈值
      this.MIN_TOUCH_TARGET = 44;  // 最小触控目标尺寸（px）
      this.EDGE_TOUCH_OVERFLOW = 6; // 格子边缘触摸溢出（px）

      // === 绑定 this ===
      this._beginProcessing = this._beginProcessing.bind(this);
      this._endProcessing = this._endProcessing.bind(this);
      this.getCellFromEvent = this.getCellFromEvent.bind(this);
      this.onCanvasPointerDown = this.onCanvasPointerDown.bind(this);
      this.onCanvasPointerMove = this.onCanvasPointerMove.bind(this);
      this.onCanvasPointerUp = this.onCanvasPointerUp.bind(this);
      this._handleBoardLongPress = this._handleBoardLongPress.bind(this);
      this._setLongPressHalo = this._setLongPressHalo.bind(this);
      this._highlightAllSameNumber = this._highlightAllSameNumber.bind(this);
      this._getNumBtnFromEvent = this._getNumBtnFromEvent.bind(this);
      this.onNumPadPointerDown = this.onNumPadPointerDown.bind(this);
      this.onNumPadPointerMove = this.onNumPadPointerMove.bind(this);
      this.onNumPadPointerUp = this.onNumPadPointerUp.bind(this);
      this.onNumPadPointerLeave = this.onNumPadPointerLeave.bind(this);
      this.onNumBtnPointerDown = this.onNumBtnPointerDown.bind(this);
      this.onNumBtnPointerMove = this.onNumBtnPointerMove.bind(this);
      this.onNumBtnPointerUp = this.onNumBtnPointerUp.bind(this);
      this.onNumBtnPointerLeave = this.onNumBtnPointerLeave.bind(this);
      this.handleSwipeUpNote = this.handleSwipeUpNote.bind(this);
      this.enterQuickFillMode = this.enterQuickFillMode.bind(this);
      this.exitQuickFillMode = this.exitQuickFillMode.bind(this);
      this._isNumberComplete = this._isNumberComplete.bind(this);
      this._checkQuickFillComplete = this._checkQuickFillComplete.bind(this);
      this.updateNumBtnActiveState = this.updateNumBtnActiveState.bind(this);
      this.checkAndClearActiveNumber = this.checkAndClearActiveNumber.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.handleEscKey = this.handleEscKey.bind(this);
    }

    // ============================================================
    // 输入状态锁
    // ============================================================
    _beginProcessing() { this._isProcessingInput = true; }
    _endProcessing() { this._isProcessingInput = false; }

    // ============================================================
    // 工具方法：从事件获取格子坐标
    // ============================================================
    getCellFromEvent(e) {
      const canvas = document.getElementById('gameCanvas');
      if (!canvas || !this.renderer || !this.board) return null;

      // 确保 cellSize 和尺寸是最新的（窗口变化、布局变化后可能过时）
      this.renderer.recalcCellSize(this.board);

      if (!this.renderer.cellSize || this.renderer.cellSize <= 0) return null;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 使用实际显示尺寸和渲染尺寸双向校准，确保点击位置准确
      // 理论渲染尺寸
      const renderW = this.board.size * this.renderer.cellSize + this.renderer.paddingLeft + this.renderer.paddingRight;
      const renderH = this.board.size * this.renderer.cellSize + this.renderer.paddingTop + this.renderer.paddingBottom;
      // 实际显示尺寸
      const actualW = rect.width;
      const actualH = rect.height;

      // 如果实际尺寸和渲染尺寸差异较大（比如被CSS缩放了），使用比例换算
      const scaleX = actualW / renderW;
      const scaleY = actualH / renderH;

      // 换算到渲染坐标系
      const renderX = x / scaleX;
      const renderY = y / scaleY;

      const cs = this.renderer.cellSize;
      const padL = this.renderer.paddingLeft;
      const padT = this.renderer.paddingTop;

      // P0触控优化：热区扩展
      // 1. 计算相对棋盘区域的坐标
      const relX = renderX - padL;
      const relY = renderY - padT;

      // 2. 初步计算格子索引（棋盘内部使用标准floor计算）
      let col = Math.floor(relX / cs);
      let row = Math.floor(relY / cs);

      // 3. 棋盘外边缘溢出扩展 + 最小44px热区修正
      // 将溢出量和最小热区余量换算到渲染坐标系
      const overflowX = this.EDGE_TOUCH_OVERFLOW / scaleX;
      const overflowY = this.EDGE_TOUCH_OVERFLOW / scaleY;
      const minTarget = this.MIN_TOUCH_TARGET / Math.min(scaleX, scaleY);

      // 边缘格子向外扩展量：取6px溢出和44px最小热区补足中的较大值
      const expandX = Math.max(overflowX, (minTarget - cs) / 2);
      const expandY = Math.max(overflowY, (minTarget - cs) / 2);

      const boardLeft = padL;
      const boardTop = padT;
      const boardRight = padL + this.board.size * cs;
      const boardBottom = padT + this.board.size * cs;

      // 左边缘溢出：点在棋盘左外侧，但在expandX范围内
      if (renderX >= boardLeft - expandX && renderX < boardLeft) {
        col = 0;
        // 行坐标用正常计算（可能在范围内或需要边缘修正）
        if (row < 0 && renderY >= boardTop - expandY && renderY < boardTop) row = 0;
        if (row >= this.board.size && renderY >= boardBottom && renderY <= boardBottom + expandY) row = this.board.size - 1;
      }
      // 右边缘溢出
      else if (renderX > boardRight && renderX <= boardRight + expandX) {
        col = this.board.size - 1;
        if (row < 0 && renderY >= boardTop - expandY && renderY < boardTop) row = 0;
        if (row >= this.board.size && renderY >= boardBottom && renderY <= boardBottom + expandY) row = this.board.size - 1;
      }
      // 上边缘溢出（列已在范围内）
      else if (renderY >= boardTop - expandY && renderY < boardTop && col >= 0 && col < this.board.size) {
        row = 0;
      }
      // 下边缘溢出（列已在范围内）
      else if (renderY > boardBottom && renderY <= boardBottom + expandY && col >= 0 && col < this.board.size) {
        row = this.board.size - 1;
      }

      if (row >= 0 && row < this.board.size && col >= 0 && col < this.board.size) {
        return { r: row, c: col };
      }
      return null;
    }

    // ============================================================
    // Canvas 指针事件处理
    // ============================================================
    onCanvasPointerDown(e) {
      if (this.storyEngine && this.storyEngine._isPlaying) return;
      if (this._getIsCompleted()) return;
      if (this._isProcessingInput) return; // 状态锁
      e.preventDefault();

      // === 提示动画：点击跳过当前步 ===
      if (this.HintPlayerState && this.HintPlayerState.playing) {
        this.onSkipHintStep();
        return;
      }

      // === 教学引导：点击快进 demo 步骤 ===
      if (this.lessonPlayer && this.lessonPlayer.isActive) {
        const phase = this.lessonPlayer.currentPhase;
        if (phase === 'intro' || phase === 'demo') {
          const advanced = this.lessonPlayer.advance();
          if (advanced) {
            return; // 快进成功，不继续选择格子
          }
        }
      }

      const canvas = document.getElementById('gameCanvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 边缘死区检测：距离画布边缘8px内不触发棋盘交互
      if (x < this.EDGE_DEAD_ZONE || x > rect.width - this.EDGE_DEAD_ZONE ||
          y < this.EDGE_DEAD_ZONE || y > rect.height - this.EDGE_DEAD_ZONE) {
        return;
      }

      const cell = this.getCellFromEvent(e);
      if (!cell) return;

      // === 教学引导：冻结遮罩拦截 ===
      if (this.lessonPlayer && this.lessonPlayer.isActive && !this.lessonPlayer.canInteractCell(cell.r, cell.c)) {
        // 被冻结的格子，点击无效（轻微抖动反馈）
        if (this.renderer && typeof this.renderer.shakeCell === 'function') {
          this.renderer.shakeCell(cell.r, cell.c);
        }
        return;
      }

      this.isDragging = false;
      this.longPressTriggered = false;
      this.longPressPhase = 0;
      this.longPressCell = cell;
      this.dragStartCell = cell;
      this._swipeStartPos = { x, y, time: Date.now() };

      // 两段式长按检测
      // 第一阶段（500ms）：钉选到技术矩阵
      this.longPressTimer = setTimeout(() => {
        this.longPressPhase = 1;
        this.longPressTriggered = true;
        this._setLongPressHalo(1);
        this._handleBoardLongPress(cell, 1);
        // 继续第二阶段计时
        this.longPressTimer = setTimeout(() => {
          this.longPressPhase = 2;
          this._setLongPressHalo(2);
          this._handleBoardLongPress(cell, 2);
        }, this.LONG_PRESS_PHASE2_MS - this.LONG_PRESS_PHASE1_MS);
      }, this.LONG_PRESS_PHASE1_MS);

      // 如果处于连填模式，直接填入数字
      if (this.quickFillMode && this.quickFillNum !== null) {
        this._beginProcessing();
        this.onNumberInput(this.quickFillNum, cell);
        this._checkQuickFillComplete();
        this._endProcessing();
        return;
      }

      // 单选：先选中格子
      this._beginProcessing();
      if (this.board.selectedCells.length > 0) {
        this.board.clearMultiSelect();
      }
      this.board.selectCell(cell.r, cell.c);
      this.AudioService.sfx.play('select');
      this.onVibrate(this.VIBRATE_PRESETS.TAP);
      // 吐槽系统：选格也算操作（重置闲置计时）
      if (this.comedySystem) {
        this.comedySystem.onPlayerAction();
      }
      this.renderer.render(this.board);

      // 更新45法则HUD
      if (this.board.size === 9 && typeof this.onUpdateRule45Banner === 'function') {
        this.onUpdateRule45Banner(cell);
      }

      // Boss战：红格预警 - 如果选中的是 gate 分类格子，立即触发预警
      if (this.GuideBattle && this.GuideBattle.active && !this.GuideBattle.ended) {
        const cat = this.GuideBattle.getCellCategory(cell.r, cell.c);
        if (cat === 'gate' && this.renderer && typeof this.renderer.triggerGateAlert === 'function') {
          this.renderer.triggerGateAlert(cell.r, cell.c, 1500);
          this.AudioService.sfx.play('breakthrough', { volume: 0.5 });
        }
      }

      // Boss战：凝视拦截检测（玩家选中格子时，AI有概率抢先占领）
      if (this.GuideBattle && this.GuideBattle.active && !this.GuideBattle.ended) {
        setTimeout(() => {
          this.GuideBattle.onPlayerFocusCell(cell.r, cell.c);
        }, 150); // 略微延迟，模拟AI"反应时间"
      }
      this._endProcessing();
    }

    onCanvasPointerMove(e) {
      if (this.storyEngine && this.storyEngine._isPlaying) return;
      if (this._getIsCompleted()) return;
      if (!this.dragStartCell) return;
      e.preventDefault();

      const cell = this.getCellFromEvent(e);
      if (!cell) return;

      // 清除长按定时器（移动超过阈值就不是长按了）
      if (this.longPressTimer) {
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const dx = (e.clientX - rect.left) - this._swipeStartPos.x;
          const dy = (e.clientY - rect.top) - this._swipeStartPos.y;
          // P0优化：移动超过5px清除长按（更灵敏的长按取消）
          if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
            this.longPressPhase = 0;
            this.longPressCell = null;
            this._setLongPressHalo(0);
          }
        }
      }

      // P0优化：使用像素距离阈值（10px）判断拖拽，而非格子坐标变化
      // 防止手指微小抖动误触发拖拽，或大格子上轻微移动就触发
      if (!this.isDragging && this._swipeStartPos) {
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const dx = (e.clientX - rect.left) - this._swipeStartPos.x;
          const dy = (e.clientY - rect.top) - this._swipeStartPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= 10) {
            // 移动小于10px，不判定为拖拽
            return;
          }
        }
      }

      // 如果移动距离超过10px阈值且格子变化，开始多选
      if (!this.isDragging && (cell.r !== this.dragStartCell.r || cell.c !== this.dragStartCell.c)) {
        this.isDragging = true;
        // 自动进入笔记模式
        if (!this._getNoteMode()) {
          this._setNoteMode(true);
          this.onUpdateNoteButtonState();
        }
        // 确保board处于候选输入模式，保证笔记可见
        if (this.board.inputMode !== 'candidate' && this.board.inputMode !== 'elimination') {
          this.board.setInputMode('candidate');
        }
        this.board.clearMultiSelect();
        // 将起始格子加入选中列表
        const startCell = this.board.cells[this.dragStartCell.r][this.dragStartCell.c];
        if (startCell && !startCell.isLocked) {
          startCell.isSelected = true;
          this.board.selectedCells.push({ r: this.dragStartCell.r, c: this.dragStartCell.c });
        }
        // 初始化框选显示范围
        this.board.boxStart = { r: this.dragStartCell.r, c: this.dragStartCell.c };
        this.board.boxEnd = { r: this.dragStartCell.r, c: this.dragStartCell.c };
      }

      if (this.isDragging) {
        // 拖拽多选：精确记录鼠标滑过的格子（不是矩形框选）
        const cellKey = `${cell.r},${cell.c}`;
        const alreadySelected = this.board.selectedCells.some(s => s.r === cell.r && s.c === cell.c);

        if (!alreadySelected && !this.board.cells[cell.r][cell.c].isLocked) {
          this.board.cells[cell.r][cell.c].isSelected = true;
          this.board.selectedCells.push({ r: cell.r, c: cell.c });
        }

        // 更新框选显示范围（用于绘制选区外框）
        if (!this.board.boxStart) {
          this.board.boxStart = { r: cell.r, c: cell.r };
          this.board.boxEnd = { r: cell.r, c: cell.c };
        } else {
          this.board.boxStart.r = Math.min(this.board.boxStart.r, cell.r);
          this.board.boxStart.c = Math.min(this.board.boxStart.c, cell.c);
          this.board.boxEnd.r = Math.max(this.board.boxEnd.r, cell.r);
          this.board.boxEnd.c = Math.max(this.board.boxEnd.c, cell.c);
        }
        this.onUpdateMultiSelectHint();
        this.renderer.render(this.board);
      }
    }

    onCanvasPointerUp(e) {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      const wasPhase2 = this.longPressPhase >= 2;
      this.longPressPhase = 0;
      this.longPressCell = null;
      this._setLongPressHalo(0);

      if (this.storyEngine && this.storyEngine._isPlaying) return;
      if (this._getIsCompleted()) return;

      // 快速滑动检测：如果是快速滑动（短时间内移动距离大），不触发填数
      let isFastSwipe = false;
      if (this._swipeStartPos) {
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const dx = (e.clientX - rect.left) - this._swipeStartPos.x;
          const dy = (e.clientY - rect.top) - this._swipeStartPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const dt = Date.now() - this._swipeStartPos.time;
          if (dt < this.SWIPE_FAST_THRESHOLD_MS && dist > this.SWIPE_DISTANCE_THRESHOLD) {
            isFastSwipe = true;
          }
        }
        this._swipeStartPos = null;
      }

      const cell = this.getCellFromEvent(e);

      // 长按已触发，不处理点击
      if (this.longPressTriggered) {
        this.longPressTriggered = false;
        this.isDragging = false;
        this.dragStartCell = null;
        return;
      }

      // 拖拽多选结束
      if (this.isDragging && this.board.selectedCells.length > 1) {
        this.isDragging = false;
        this.dragStartCell = null;
        // 保持多选状态，等待输入
        return;
      }

      // 快速滑动：不触发填数，仅作为选择
      if (isFastSwipe && (this.activeNumber !== null || this.quickFillMode)) {
        this.isDragging = false;
        this.dragStartCell = null;
        this.onUpdateMultiSelectHint();
        return;
      }

      // 单选点击
      this.isDragging = false;
      this.dragStartCell = null;
      this.onUpdateMultiSelectHint();
    }

    // ============================================================
    // 长按相关处理
    // ============================================================

    /**
     * 处理棋盘长按（两段式）
     * @param {Object} cell - 格子坐标 {r, c}
     * @param {number} phase - 长按阶段：1=第一阶段(钉选), 2=第二阶段(进入What If)
     */
    _handleBoardLongPress(cell, phase = 1) {
      const cellData = this.board.cells[cell.r][cell.c];
      const num = cellData.fillNum || cellData.fixedNum;

      // Boss战幻影格机制：长按已填数字 → 质疑该格子
      if (this.GuideBattle && this.GuideBattle.active && this.GuideBattle.hasFakeCells && this.GuideBattle.hasFakeCells()) {
        if (num > 0 && phase === 1) {
          const result = this.GuideBattle.tryAccuseFakeCell(cell.r, cell.c);
          if (result.success) {
            if (result.isFake) {
              this.onShowToast('证伪成功！这是一个幻影格');
            } else {
              this.onShowToast('这个格子是真实的，不是幻影格');
            }
          }
          return;
        }
      }

      if (num > 0) {
        // 长按已填数字：第一阶段高亮同数，第二阶段进入What If
        if (phase === 1) {
          this._highlightAllSameNumber(num);
          this.onShowToast(`长按高亮：数字 ${num} 的所有位置（继续长按进入假设模式）`);
        } else if (phase === 2 && !this.WhatIfState.active) {
          // 第二阶段：进入 What If 模式
          this.onEnterWhatIf();
          if (this.AudioService) this.AudioService.sfx.play('breakthrough');
        }
      } else {
        // 长按空格：第一阶段钉选，第二阶段进入What If
        if (phase === 1) {
          if (this.techMatrix) {
            this.techMatrix.pinCell(cell.r, cell.c, 'observation');
            if (this.AudioService) this.AudioService.sfx.play('click');
            this.onShowToast(`已钉选 R${cell.r + 1}C${cell.c + 1}（继续长按进入假设模式）`);
          }
        } else if (phase === 2 && !this.WhatIfState.active) {
          // 第二阶段：进入 What If 模式
          this.onEnterWhatIf();
          if (this.AudioService) this.AudioService.sfx.play('breakthrough');
        }
      }
    }

    /**
     * 设置长按蓄力光晕效果
     * @param {number} phase - 0=关闭, 1=第一阶段(黄色), 2=第二阶段(蓝色)
     */
    _setLongPressHalo(phase) {
      const halo = document.getElementById('long-press-halo');
      if (!halo) return;
      halo.classList.remove('phase1', 'phase2');
      if (phase === 1) {
        halo.classList.add('phase1');
      } else if (phase === 2) {
        halo.classList.add('phase2');
      }
    }

    _highlightAllSameNumber(num) {
      const cells = [];
      for (let r = 0; r < this.board.size; r++) {
        for (let c = 0; c < this.board.size; c++) {
          const cell = this.board.cells[r][c];
          if ((cell.fillNum === num || cell.fixedNum === num) && num > 0) {
            cells.push({ row: r, col: c });
          }
        }
      }
      if (this.renderer && typeof this.renderer.highlightHintCells === 'function') {
        this.renderer.clearHintHighlights('longpress');
        this.renderer.highlightHintCells(cells, 'hint', 'longpress');
        this.renderer.render(this.board);
        // 3秒后自动清除
        setTimeout(() => {
          if (this.renderer && typeof this.renderer.clearHintHighlights === 'function') {
            this.renderer.clearHintHighlights('longpress');
            this.renderer.render(this.board);
          }
        }, 3000);
      }
    }

    // ============================================================
    // 数字键盘指针事件处理
    // ============================================================

    // P0优化：事件代理包装函数 —— 从pad容器事件中找到目标按钮并转发
    _getNumBtnFromEvent(e) {
      return e.target.closest('.num-btn');
    }

    onNumPadPointerDown(e) {
      const btn = this._getNumBtnFromEvent(e);
      if (!btn) return;
      // 构造代理事件对象，替换 currentTarget 为按钮
      const proxyEvt = Object.create(e, { currentTarget: { value: btn } });
      this.onNumBtnPointerDown(proxyEvt);
    }

    onNumPadPointerMove(e) {
      // pointermove 时，按钮可能已经不是按下的那个，但我们用 _numBtnPressed 追踪
      if (!this._numBtnPressed) return;
      const proxyEvt = Object.create(e, { currentTarget: { value: this._numBtnPressed } });
      this.onNumBtnPointerMove(proxyEvt);
    }

    onNumPadPointerUp(e) {
      if (!this._numBtnPressed) return;
      const proxyEvt = Object.create(e, { currentTarget: { value: this._numBtnPressed } });
      this.onNumBtnPointerUp(proxyEvt);
    }

    onNumPadPointerLeave(e) {
      // pointerleave 是直接绑定在 pad 上的，离开 pad 时触发
      // 我们需要模拟离开当前按下的按钮
      if (this._numBtnPressed) {
        const proxyEvt = Object.create(e, { currentTarget: { value: this._numBtnPressed } });
        this.onNumBtnPointerLeave(proxyEvt);
      }
    }

    // P0触控优化：pointerdown立即填数（零延迟），长按/滑动时回退
    onNumBtnPointerDown(e) {
      if (this.storyEngine && this.storyEngine._isPlaying) return;
      if (this._getIsCompleted()) return;
      if (this._isProcessingInput) return; // 状态锁：处理中不响应
      e.preventDefault();

      const btn = e.currentTarget;
      const num = parseInt(btn.dataset.num);
      if (isNaN(num) || num > this.board.size) return;

      // 如果数字已全部填完，不响应
      if (this._isNumberComplete(num)) return;

      // 记录当前按下的按钮（防止拖动到其他按钮上误触）
      this._numBtnPressed = btn;
      this._numBtnHandled = false;
      this.longPressTriggered = false;
      this._instantFillCommitted = false;
      this._instantFillNum = null;

      // 教学 NOTE_ONLY 模式：禁用连填，直接输入笔记
      const isNoteLesson = this.lessonPlayer && this.lessonPlayer.isActive && this.lessonPlayer.isWaitingInput
        && this.lessonPlayer.getInteractionType() === 'NOTE_ONLY';

      if (isNoteLesson) {
        // 笔记教学模式：如果没有选中格子，自动选中目标格
        if (!this.board.selectedCell && this.board.selectedCells.length === 0) {
          const target = this.lessonPlayer.getGuidedTarget();
          if (target && target.cell) {
            this.board.selectCell(target.cell[0], target.cell[1]);
            if (this.renderer) this.renderer.render(this.board);
          }
        }
        // 点击数字键直接切换笔记（零延迟）
        this._beginProcessing();
        this.onNumberInput(num);
        this._endProcessing();
        this._numBtnHandled = true;
        this._instantFillCommitted = true;
        return;
      }

      // 如果已经是连填状态，再次点击则取消（toggle）——零延迟
      if (this.quickFillMode && this.quickFillNum === num) {
        this.exitQuickFillMode();
        this._numBtnHandled = true;
        this.longPressTriggered = true; // 标记防止up时再触发
        this._instantFillCommitted = true;
        return;
      }

      this.numBtnStartY = e.clientY;
      this.numBtnStartX = e.clientX;

      // 添加长按蓄力视觉效果
      btn.classList.add('long-pressing');

      // P0优化：有选中格子时，pointerdown立即填数（零延迟响应）
      // 后续如果触发长按或上滑，再回退这次填数
      if (!this.quickFillMode && (this.board.selectedCell || this.board.selectedCells.length > 0)) {
        this._beginProcessing();
        this.onNumberInput(num);
        this._endProcessing();
        this._instantFillCommitted = true;
        this._instantFillNum = num;
      }

      // 长按检测：500ms 后激活连填模式
      this.longPressTimer = setTimeout(() => {
        this.longPressTriggered = true;
        this._numBtnHandled = true;
        btn.classList.remove('long-pressing');

        // 如果之前做了即时填数，需要回退
        if (this._instantFillCommitted && this._instantFillNum !== null) {
          this._beginProcessing();
          this.board.undo(); // 回退即时填数
          this.renderer.render(this.board);
          this._endProcessing();
          this._instantFillCommitted = false;
          this._instantFillNum = null;
        }

        // 触感反馈：长按激活时震动
        this.onVibrate(this.VIBRATE_PRESETS.LONG_PRESS);
        this.enterQuickFillMode(num);
      }, 500);
    }

    onNumBtnPointerMove(e) {
      if (this.storyEngine && this.storyEngine._isPlaying) return;
      if (this._getIsCompleted()) return;
      if (this._isProcessingInput) return;
      e.preventDefault(); // P0优化：防止页面随手指滑动

      const btn = e.currentTarget;

      // 如果不是按下的那个按钮，不处理（防止拖动误触）
      if (this._numBtnPressed !== btn) return;
      if (this._numBtnHandled) return;

      const num = parseInt(btn.dataset.num);
      if (isNaN(num)) return;

      const deltaY = this.numBtnStartY - e.clientY; // 上划为正

      // 移动超过阈值则取消长按
      if (Math.abs(deltaY) > 15 || Math.abs(e.clientX - this.numBtnStartX) > 15) {
        if (this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
        btn.classList.remove('long-pressing');
      }

      // 上划检测：填入笔记
      if (deltaY > this.swipeUpThreshold && !this.longPressTriggered) {
        if (this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
        btn.classList.remove('long-pressing');

        // P0优化：如果之前做了即时填数，需要回退
        if (this._instantFillCommitted && this._instantFillNum !== null) {
          this._beginProcessing();
          this.board.undo();
          this.renderer.render(this.board);
          this._endProcessing();
          this._instantFillCommitted = false;
          this._instantFillNum = null;
        }

        // 上划：在选中格子/多选格子中切换笔记
        this._beginProcessing();
        this.handleSwipeUpNote(num);
        this._endProcessing();
        this.longPressTriggered = true; // 标记为已处理，防止up时再触发
        this._numBtnHandled = true;
      }
    }

    onNumBtnPointerUp(e) {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }

      const btn = e.currentTarget;
      btn.classList.remove('long-pressing');

      // 如果松开的按钮不是按下的按钮，说明是拖动过来的，不处理
      if (this._numBtnPressed !== btn) {
        return;
      }

      // 如果已经处理过（长按触发、上划笔记、NOTE_ONLY模式等），不再重复处理
      if (this._numBtnHandled) {
        this._numBtnPressed = null;
        this._numBtnHandled = false;
        this.longPressTriggered = false;
        return;
      }

      this._numBtnPressed = null;
      this._numBtnHandled = false;

      if (this.storyEngine && this.storyEngine._isPlaying) return;
      if (this._getIsCompleted()) return;

      const num = parseInt(btn.dataset.num);
      if (isNaN(num) || num > this.board.size) return;

      // 长按已触发（连填模式激活），不处理普通点击
      if (this.longPressTriggered) {
        this.longPressTriggered = false;
        return;
      }

      // 普通点击逻辑
      if (this.quickFillMode) {
        // 连填模式下：点击其他数字 → 切换连填数字
        if (this.quickFillNum !== num) {
          this.enterQuickFillMode(num);
        }
        // 点击同一数字 → 已在down时处理取消
      } else if (this._instantFillCommitted) {
        // P0优化：pointerdown时已即时填数，pointerup时无需重复操作
        // 仅做状态确认
        this._instantFillCommitted = false;
        this._instantFillNum = null;
      } else if (this.board.selectedCell || this.board.selectedCells.length > 0) {
        // 有选中格子但未即时填数（特殊情况） → 填入数字
        this._beginProcessing();
        this.onNumberInput(num);
        this._endProcessing();
      } else {
        // 没有选中格子 → 进入连填模式
        this.enterQuickFillMode(num);
      }
    }

    // 数字按钮 pointerleave：只清理状态，不触发点击（防止拖动误触）
    onNumBtnPointerLeave(e) {
      const btn = e.currentTarget;

      // 清除长按状态
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      btn.classList.remove('long-pressing');

      // 如果离开的不是当前按下的按钮，直接忽略
      if (this._numBtnPressed !== btn) return;

      // 如果已经处理过，不需要再做什么
      if (this._numBtnHandled) return;

      // 注意：pointerleave 时不触发点击逻辑
      // 只有真正的 pointerup 才会触发点击
      // 这样拖动划过其他按钮时不会误输入
    }

    // ============================================================
    // 上划笔记处理
    // ============================================================
    handleSwipeUpNote(num) {
      // 上划：切换笔记候选数（无论当前模式，强制切换候选，不改变全局笔记模式）
      const hasSelection = this.board.selectedCells.length > 0;
      const hasSingle = this.board.selectedCell;

      // 确保笔记系统显示候选数（临时展开单格态）
      if (window.gameNoteSystem && hasSingle) {
        const { r, c } = hasSingle;
        if (typeof window.gameNoteSystem.showSingleCell === 'function') {
          window.gameNoteSystem.showSingleCell(r, c);
        }
      }

      let toggled = false;
      // P2: 记录切换前的状态，用于触发候选数动画
      const animCells = [];
      if (hasSelection && this.board.selectedCells.length > 1) {
        // 多选模式：使用内置的批量切换笔记方法
        // 先记录每个格子的状态
        for (const sc of this.board.selectedCells) {
          const cell = this.board.cells[sc.r][sc.c];
          if (!cell.fixedNum && !cell.fillNum) {
            animCells.push({ r: sc.r, c: sc.c, had: cell.candidates.has(num) });
          }
        }
        this.board.toggleCandidateForSelection(num);
        toggled = true;
      } else if (hasSingle) {
        // 单选模式：切换笔记
        const cell = this.board.cells[hasSingle.r][hasSingle.c];
        if (!cell.fixedNum && !cell.fillNum) {
          const had = cell.candidates.has(num);
          this.board.toggleCandidate(num);
          animCells.push({ r: hasSingle.r, c: hasSingle.c, had: had });
          toggled = true;
        } else if (cell.fillNum && !cell.fixedNum) {
          // 如果格子有填数，先清除填数再切换候选（上滑=强制笔记模式）
          this.board.eraseNumber();
          this.board.toggleCandidate(num);
          animCells.push({ r: hasSingle.r, c: hasSingle.c, had: false });
          toggled = true;
        }
      } else if (hasSelection) {
        // 只有一个selectedCell时也用toggleCandidate
        const sc = this.board.selectedCells[0];
        const cell = this.board.cells[sc.r][sc.c];
        if (!cell.fixedNum && !cell.fillNum) {
          const had = cell.candidates.has(num);
          this.board.toggleCandidate(num);
          animCells.push({ r: sc.r, c: sc.c, had: had });
          toggled = true;
        }
      }

      // P2: 触发候选数切换动画
      if (toggled && this.renderer && typeof this.renderer.triggerCandidateAnimation === 'function') {
        for (const ac of animCells) {
          // had=true 表示之前有，现在被移除了 → leave 动画
          // had=false 表示之前没有，现在被添加了 → enter 动画
          const animType = ac.had ? 'leave' : 'enter';
          this.renderer.triggerCandidateAnimation(ac.r, ac.c, num, animType, 150);
        }
      }

      if (!toggled) return;

      // 标记已使用笔记
      this._setUsedNotes(true);

      // 更新笔记系统
      if (window.gameNoteSystem && typeof window.gameNoteSystem.onNumberFilled === 'function') {
        window.gameNoteSystem.onNumberFilled();
      }

      this.renderer.forceRender = true;
      this.renderer.render(this.board);

      // 震动反馈
      this.onVibrate(this.VIBRATE_PRESETS.NOTE_TOGGLE);

      // 播放笔记切换音效
      this.AudioService.sfx.play('note_toggle');
    }

    // ============================================================
    // 连填模式
    // ============================================================
    enterQuickFillMode(num) {
      if (this._isNumberComplete(num)) return;

      this.quickFillMode = true;
      this.quickFillNum = num;

      // 更新按钮样式
      document.querySelectorAll('.num-btn').forEach(btn => {
        const btnNum = parseInt(btn.dataset.num);
        btn.classList.toggle('quick-fill-num', btnNum === num);
      });

      // 高亮盘面上所有相同数字
      if (this.renderer && typeof this.renderer.setHighlightNumber === 'function') {
        this.renderer.setHighlightNumber(num, true);
        this.renderer.forceRender = true;
        this.renderer.render(this.board);
      }

      // 显示提示（第一次使用时显示更详细）
      this.onShowToast(`连填模式：数字 ${num}，点击格子自动填入`, 1500);

      // 显示连填提示条
      const hintEl = document.getElementById('quick-fill-hint');
      if (hintEl) {
        hintEl.classList.add('show');
        // 3秒后隐藏
        setTimeout(() => {
          if (hintEl) hintEl.classList.remove('show');
        }, 3000);
      }

      this.AudioService.sfx.play('click');
      this.onVibrate(this.VIBRATE_PRESETS.LONG_PRESS);
    }

    exitQuickFillMode() {
      const prevNum = this.quickFillNum;
      this.quickFillMode = false;
      this.quickFillNum = null;

      // 清除按钮样式
      document.querySelectorAll('.num-btn').forEach(btn => {
        btn.classList.remove('quick-fill-num');
      });

      // 清除数字高亮
      if (this.renderer && typeof this.renderer.setHighlightNumber === 'function') {
        this.renderer.setHighlightNumber(prevNum, false);
        this.renderer.forceRender = true;
        this.renderer.render(this.board);
      }

      this.AudioService.sfx.play('click');
    }

    _isNumberComplete(num) {
      if (!this.board) return false;
      let count = 0;
      for (let r = 0; r < this.board.size; r++) {
        for (let c = 0; c < this.board.size; c++) {
          const cell = this.board.cells[r][c];
          if (cell.fillNum === num || cell.fixedNum === num) count++;
        }
      }
      return count >= this.board.size;
    }

    _checkQuickFillComplete() {
      if (!this.quickFillMode || this.quickFillNum === null) return;
      if (this._isNumberComplete(this.quickFillNum)) {
        this.onShowToast(`数字 ${this.quickFillNum} 已全部填完，连填自动关闭`, 1500);
        this.exitQuickFillMode();
      }
    }

    updateNumBtnActiveState() {
      document.querySelectorAll('.num-btn').forEach(btn => {
        const num = parseInt(btn.dataset.num);
        btn.classList.toggle('active', num === this.activeNumber);
      });
    }

    checkAndClearActiveNumber() {
      // 检查该数字是否已填满（每宫/每行/每列都有了）
      if (this.activeNumber === null) return;

      let count = 0;
      for (let r = 0; r < this.board.size; r++) {
        for (let c = 0; c < this.board.size; c++) {
          const cell = this.board.cells[r][c];
          if (cell.fillNum === this.activeNumber || cell.fixedNum === this.activeNumber) {
            count++;
          }
        }
      }

      if (count >= this.board.size) {
        this.activeNumber = null;
        this.updateNumBtnActiveState();
        this.onUpdateNumBtnCompletedState();
        this.onShowToast(`数字 ${count === this.board.size ? count : ''}已全部填完`);
      }
    }

    // ============================================================
    // 键盘事件处理
    // ============================================================
    onKeyDown(e) {
      // 输入框/文本域焦点时，不响应游戏快捷键
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;
      if (document.activeElement && document.activeElement.isContentEditable) return;

      // Space key: always toggle pause (even when paused)
      if (e.key === ' ') {
        if (this.board && !this._getIsCompleted()) {
          this.onPauseToggle();
        }
        e.preventDefault();
        return;
      }

      // Esc key: 暂停状态下按 Esc 恢复游戏；非暂停状态按优先级关闭面板/取消
      if (e.key === 'Escape') {
        if (this._getIsPaused()) {
          // 暂停时按 Esc：恢复游戏
          this.onPauseToggle();
          e.preventDefault();
          return;
        }
        const handled = this.handleEscKey();
        if (handled) {
          e.preventDefault();
        }
        return;
      }

      if (this.storyEngine && this.storyEngine._isPlaying) return;
      if (this._getIsCompleted()) return;
      if (this._getIsPaused()) return;

      // Ctrl/meta key combos first (undo/redo)
      // Z / Ctrl+Z: undo
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        this.onUndo();
        e.preventDefault();
        return;
      }

      // Y / Ctrl+Shift+Z / Ctrl+Y: redo
      if ((e.key === 'y' || e.key === 'Y' || ((e.key === 'z' || e.key === 'Z') && e.shiftKey)) && (e.ctrlKey || e.metaKey)) {
        if (this.board && typeof this.board.redo === 'function') {
          this.board.redo();
          this.renderer.render(this.board);
          if (window.gameNoteSystem && typeof window.gameNoteSystem.onNumberFilled === 'function') {
            window.gameNoteSystem.onNumberFilled();
          }
          this.AudioService.sfx.play('click');
        }
        e.preventDefault();
        return;
      }

      // Number keys 1-9
      if (e.key >= '1' && e.key <= '9') {
        const num = parseInt(e.key);
        if (num <= this.board.size && !this._isProcessingInput) {
          // 教学 NOTE_ONLY 模式：确保笔记模式开启，并自动选中目标格
          const isNoteLesson = this.lessonPlayer && this.lessonPlayer.isActive && this.lessonPlayer.isWaitingInput
            && this.lessonPlayer.getInteractionType() === 'NOTE_ONLY';

          if (isNoteLesson) {
            // 确保笔记模式开启
            if (!this._getNoteMode()) {
              this.onToggleNote(true);
            }
            // 确保选中目标格
            if (!this.board.selectedCell && this.board.selectedCells.length === 0) {
              const target = this.lessonPlayer.getGuidedTarget();
              if (target && target.cell) {
                this.board.selectCell(target.cell[0], target.cell[1]);
                if (this.renderer) this.renderer.render(this.board);
              }
            }
          }

          this._beginProcessing();
          this.onNumberInput(num);
          this._endProcessing();
        }
        e.preventDefault();
        return;
      }

      // 0 / Backspace / Delete: erase
      // What If 模式下 Backspace 回退快照
      if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') {
        if (this.WhatIfState && this.WhatIfState.active && e.key === 'Backspace') {
          this.onUndoWhatIfStep();
        } else {
          this.onErase();
        }
        e.preventDefault();
        return;
      }

      // Arrow keys: navigate / extend selection
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // === 教学引导：冻结期间禁止方向键移动 ===
        if (this.lessonPlayer && this.lessonPlayer.isActive && this.lessonPlayer._freezeEnabled) {
          e.preventDefault();
          return;
        }
        const dirs = { ArrowUp: [-1,0], ArrowDown: [1,0], ArrowLeft: [0,-1], ArrowRight: [0,1] };
        const [dr, dc] = dirs[e.key];
        if (e.shiftKey) {
          // Shift+方向键：扩展多选
          this.board.extendSelection(dr, dc);
          this.onUpdateMultiSelectHint();
        } else {
          // 普通方向键：移动选中
          if (this.board.selectedCells.length > 0) {
            this.board.clearMultiSelect();
            this.onUpdateMultiSelectHint();
          }
          this.board.moveSelection(dr, dc);
        }
        this.renderer.render(this.board);
        e.preventDefault();
        return;
      }

      // N: note mode
      if (e.key === 'n' || e.key === 'N') {
        this.onToggleNote();
        e.preventDefault();
        return;
      }

      // H: hint
      // Shift+H (debug mode only): toggle heatmap display
      if (e.key === 'h' || e.key === 'H') {
        // 调试模式下 Shift+H 切换热力图显示
        if (this._getDebugMode() && e.shiftKey) {
          this.onToggleHeatmapDisplay();
          e.preventDefault();
          return;
        }
        // What If 模式下提示不可用
        if (this.WhatIfState && this.WhatIfState.active) {
          this.onShowToast('假设模式下提示不可用');
          e.preventDefault();
          return;
        }
        this.onHint();
        e.preventDefault();
        return;
      }

      // W: What If 假设模式
      if (e.key === 'w' || e.key === 'W') {
        this.onWhatIfToggle();
        e.preventDefault();
        return;
      }

      // Enter: What If 模式下采纳
      if (e.key === 'Enter' && this.WhatIfState && this.WhatIfState.active) {
        this.onAdoptWhatIf();
        e.preventDefault();
        return;
      }

      // R: Rule45 面板切换
      if (e.key === 'r' || e.key === 'R') {
        if (this.board && this.board.size === 9 && typeof this.onToggleRule45Banner === 'function') {
          this.onToggleRule45Banner();
        } else {
          this.onShowToast('当前关卡不支持 45 法则');
        }
        e.preventDefault();
        return;
      }

      // M: TechMatrix (技术矩阵)
      if (e.key === 'm' || e.key === 'M') {
        if (this.techMatrix) this.techMatrix.toggle();
        e.preventDefault();
        return;
      }

      // T: Technique encyclopedia
      if (e.key === 't' || e.key === 'T') {
        this.onToggleTechniqueEncyclopedia();
        e.preventDefault();
        return;
      }

      // S: Settings panel
      if (e.key === 's' || e.key === 'S') {
        if (this.settingsPanel) this.settingsPanel.toggle();
        e.preventDefault();
        return;
      }

      // G: Gallery panel
      if (e.key === 'g' || e.key === 'G') {
        if (this.galleryPanel) this.galleryPanel.toggle();
        e.preventDefault();
        return;
      }

      // C: Check / validate answer
      if (e.key === 'c' || e.key === 'C') {
        this.onCheckBoardAnswer();
        e.preventDefault();
        return;
      }

      // A: Auto-fill candidates
      if (e.key === 'a' || e.key === 'A') {
        this.onAutoFillCandidates();
        e.preventDefault();
        return;
      }

      // + / = : increment selected cell number
      if (e.key === '+' || e.key === '=') {
        this.onAdjustSelectedNumber(1);
        e.preventDefault();
        return;
      }

      // - / _ : decrement selected cell number
      if (e.key === '-' || e.key === '_') {
        this.onAdjustSelectedNumber(-1);
        e.preventDefault();
        return;
      }
    }

    // === Esc 键处理（按优先级逐层关闭）===
    handleEscKey() {
      // 优先级 1：设置面板
      if (this.settingsPanel && this.settingsPanel.visible) {
        this.settingsPanel.hide();
        return true;
      }
      // 优先级 1.5：技术矩阵面板
      if (this.techMatrix && this.techMatrix.visible) {
        this.techMatrix.hide();
        return true;
      }
      // 优先级 2：成就面板
      if (this.achievementPanel && this.achievementPanel._isVisible) {
        this.achievementPanel.hide();
        return true;
      }
      // 优先级 2.5：图鉴面板
      if (this.galleryPanel && this.galleryPanel._isVisible) {
        this.galleryPanel.hide();
        return true;
      }
      // 优先级 3：技巧图鉴
      if (this._getTechniquePanelVisible()) {
        this.onHideTechniqueEncyclopedia();
        return true;
      }
      // 优先级 4：退出 What If 模式
      if (this.WhatIfState && this.WhatIfState.active) {
        if (this.WhatIfState.snapshots.length > 0) {
          // 有未采纳更改，确认退出
          if (confirm('退出假设模式？未采纳的更改将丢失。')) {
            this.onExitWhatIf(false);
          }
        } else {
          this.onExitWhatIf(false);
        }
        return true;
      }
      // 优先级 5：退出连填模式
      if (this.quickFillMode) {
        this.exitQuickFillMode();
        this.onShowToast('已退出连填模式', 1000);
        return true;
      }
      // 优先级 5b：取消数字激活
      if (this.activeNumber !== null) {
        this.activeNumber = null;
        this.updateNumBtnActiveState();
        this.onShowToast('已取消数字激活', 1000);
        return true;
      }
      // 优先级 6：清除多选
      if (this.board.selectedCells.length > 0) {
        this.board.clearMultiSelect();
        this.onUpdateMultiSelectHint();
        this.renderer.render(this.board);
        return true;
      }
      // 优先级 7：清除选中
      if (this.board.selectedCell) {
        this.board.clearBoxSelection();
        this.renderer.render(this.board);
        return true;
      }
      return false;
    }

    // ============================================================
    // 事件绑定 / 解绑
    // ============================================================
    bindEvents(canvas, document) {
      if (canvas) {
        // --- Canvas 交互 ---
        canvas.addEventListener('pointerdown', this.onCanvasPointerDown);
        canvas.addEventListener('pointermove', this.onCanvasPointerMove);
        canvas.addEventListener('pointerup', this.onCanvasPointerUp);
        canvas.addEventListener('pointercancel', this.onCanvasPointerUp);
        canvas.addEventListener('pointerleave', this.onCanvasPointerUp);
      }

      // --- Number pad 交互（事件代理模式）---
      ['num-pad', 'pc-num-pad'].forEach(padId => {
        const pad = document.getElementById(padId);
        if (!pad) return;
        pad.addEventListener('pointerdown', this.onNumPadPointerDown);
        pad.addEventListener('pointermove', this.onNumPadPointerMove);
        pad.addEventListener('pointerup', this.onNumPadPointerUp);
        pad.addEventListener('pointercancel', this.onNumPadPointerUp);
        pad.addEventListener('pointerleave', this.onNumPadPointerLeave);
      });

      // --- Keyboard ---
      document.addEventListener('keydown', this.onKeyDown);
    }

    unbindEvents(canvas, document) {
      if (canvas) {
        canvas.removeEventListener('pointerdown', this.onCanvasPointerDown);
        canvas.removeEventListener('pointermove', this.onCanvasPointerMove);
        canvas.removeEventListener('pointerup', this.onCanvasPointerUp);
        canvas.removeEventListener('pointercancel', this.onCanvasPointerUp);
        canvas.removeEventListener('pointerleave', this.onCanvasPointerUp);
      }

      ['num-pad', 'pc-num-pad'].forEach(padId => {
        const pad = document.getElementById(padId);
        if (!pad) return;
        pad.removeEventListener('pointerdown', this.onNumPadPointerDown);
        pad.removeEventListener('pointermove', this.onNumPadPointerMove);
        pad.removeEventListener('pointerup', this.onNumPadPointerUp);
        pad.removeEventListener('pointercancel', this.onNumPadPointerUp);
        pad.removeEventListener('pointerleave', this.onNumPadPointerLeave);
      });

      document.removeEventListener('keydown', this.onKeyDown);
    }

    // ============================================================
    // 状态清理（关卡切换时调用）
    // ============================================================
    cleanupLevelState() {
      // 清理长按定时器
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      this.longPressTriggered = false;

      // 清理拖拽状态
      this.isDragging = false;
      this.dragStartCell = null;
      this._swipeStartPos = null;

      // 清理激活数字
      this.activeNumber = null;
      this.quickFillMode = false;
      this.quickFillNum = null;
      this.numBtnStartX = 0;
      this.numBtnStartY = 0;
      if (typeof this.onUpdateNumBtnActiveState === 'function') {
        this.updateNumBtnActiveState();
      }

      // 重置输入状态锁
      this._isProcessingInput = false;
      this._numBtnPressed = null;
      this._numBtnHandled = false;
      this._instantFillCommitted = false;
      this._instantFillNum = null;
    }
  }

  // 全局暴露
  if (typeof window !== 'undefined') {
    window.InputRouter = InputRouter;
  }

})(window);
