// CellInputHandler.js - 核心输入处理器
// 游戏的核心输入处理逻辑：数字输入、擦除、撤销、笔记模式、检查答案等
// 从 guide.js 抽离：物理分离，逻辑不变
// 通过构造函数注入依赖（board, renderer, comboSystem, expertSystem, hintSystem, whatIfManager 等）

;(function(global) {
  'use strict';

  class CellInputHandler {
    /**
     * @param {Object} deps - 依赖注入对象
     * @param {Object} deps.board - 棋盘对象
     * @param {Object} deps.renderer - 渲染器
     * @param {Object} deps.comboSystem - 连击系统
     * @param {Object} deps.expertSystem - 专家系统
     * @param {Object} deps.hintSystem - 提示系统
     * @param {Object} deps.comedySystem - 吐槽系统
     * @param {Object} deps.AudioService - 音频服务
     * @param {Object} deps.VIBRATE_PRESETS - 震动预设
     * @param {Object} deps.EventLogger - 事件日志
     * @param {Object} deps.GuideBattle - Boss战对象
     * @param {Object} deps.WhatIfState - What If 状态
     * @param {Object} deps.lessonUICoordinator - 教学引导协调器
     * @param {Object} deps.achievementCoordinator - 成就协调器
     * @param {Object} deps.currentLevelData - 当前关卡数据
     * @param {Object} deps.global - 全局对象（window）
     *
     * @param {Function} deps.getNoteMode - 获取笔记模式
     * @param {Function} deps.setNoteMode - 设置笔记模式
     * @param {Function} deps.getUsedNotes - 获取是否使用过笔记
     * @param {Function} deps.setUsedNotes - 设置已使用笔记
     * @param {Function} deps.getErrorCount - 获取错误计数
     * @param {Function} deps.incErrorCount - 增加错误计数
     * @param {Function} deps.getSolution - 获取答案数组
     *
     * @param {Function} deps.showToast - Toast 提示
     * @param {Function} deps.vibrate - 震动反馈
     * @param {Function} deps.validateBoard - 验证棋盘
     * @param {Function} deps.highlightAllErrors - 高亮所有错误
     * @param {Function} deps.updateNumBtnCompletedState - 更新数字按钮完成状态
     * @param {Function} deps.checkCompletion - 检查完成
     * @param {Function} deps.updateRule45Banner - 更新45法则横幅
     * @param {Function} deps.addWhatIfSnapshot - 添加 What If 快照
     * @param {Function} deps.lessonHandleCellFill - 教学填数处理
     * @param {Function} deps.detectTechniqueForFill - 技巧检测
     * @param {Function} deps.recordTechniqueUsage - 记录技巧使用
     * @param {Function} deps.updateNoteButtonState - 更新笔记按钮状态
     * @param {Function} deps.updateMultiSelectHint - 更新多选提示
     */
    constructor(deps) {
      // === 核心对象引用 ===
      this.board = deps.board;
      this.renderer = deps.renderer;
      this.comboSystem = deps.comboSystem || null;
      this.expertSystem = deps.expertSystem || null;
      this.hintSystem = deps.hintSystem || null;
      this.comedySystem = deps.comedySystem || null;
      this.AudioService = deps.AudioService || (typeof AudioService !== 'undefined' ? AudioService : null);
      this.VIBRATE_PRESETS = deps.VIBRATE_PRESETS || {};
      this.EventLogger = deps.EventLogger || (typeof EventLogger !== 'undefined' ? EventLogger : { log: () => {} });
      this.GuideBattle = deps.GuideBattle || (typeof GuideBattle !== 'undefined' ? GuideBattle : null);
      this.WhatIfState = deps.WhatIfState || null;
      this.lessonUICoordinator = deps.lessonUICoordinator || null;
      this.achievementCoordinator = deps.achievementCoordinator || null;
      this.currentLevelData = deps.currentLevelData || null;
      this.global = deps.global || (typeof window !== 'undefined' ? window : global);

      // === 状态 getter / setter ===
      this._getNoteMode = deps.getNoteMode || (() => false);
      this._setNoteMode = deps.setNoteMode || (() => {});
      this._getUsedNotes = deps.getUsedNotes || (() => false);
      this._setUsedNotes = deps.setUsedNotes || (() => {});
      this._getErrorCount = deps.getErrorCount || (() => 0);
      this._incErrorCount = deps.incErrorCount || (() => {});
      this._getSolution = deps.getSolution || (() => null);

      // === 业务回调函数 ===
      this._showToast = deps.showToast || (() => {});
      this._vibrate = deps.vibrate || (() => {});
      this._validateBoard = deps.validateBoard || (() => ({ valid: false, filled: false, errors: [] }));
      this._highlightAllErrors = deps.highlightAllErrors || (() => {});
      this._updateNumBtnCompletedState = deps.updateNumBtnCompletedState || (() => {});
      this._checkCompletion = deps.checkCompletion || (() => {});
      this._updateRule45Banner = deps.updateRule45Banner || (() => {});
      this._addWhatIfSnapshot = deps.addWhatIfSnapshot || (() => {});
      this._lessonHandleCellFill = deps.lessonHandleCellFill || (() => null);
      this._detectTechniqueForFill = deps.detectTechniqueForFill || (() => null);
      this._recordTechniqueUsage = deps.recordTechniqueUsage || (() => {});
      this._updateNoteButtonState = deps.updateNoteButtonState || (() => {});
      this._updateMultiSelectHint = deps.updateMultiSelectHint || (() => {});

      // === 内部状态 ===
      this._isProcessingInput = false;
    }

    // ============================================================
    //  内部辅助方法
    // ============================================================

    _beginProcessing() { this._isProcessingInput = true; }
    _endProcessing() { this._isProcessingInput = false; }

    /**
     * 获取 noteMode（兼容旧代码直接访问属性的方式）
     */
    get noteMode() { return this._getNoteMode(); }

    // ============================================================
    //  检查答案
    // ============================================================

    checkBoardAnswer() {
      if (!this.board) return;
      const result = this._validateBoard();
      if (!result.filled) {
        this._showToast('盘面还没有填满', 1500);
        return;
      }
      if (result.valid) {
        this._showToast('全部正确！恭喜通关~', 2000);
      } else {
        const count = result.errors.length;
        this._showToast(`发现 ${count} 处错误`, 2000);
        // 高亮错误
        this._highlightAllErrors();
      }
    }

    // ============================================================
    //  自动填充候选数
    // ============================================================

    autoFillCandidates() {
      if (!this.board) return;
      const board = this.board;
      const size = board.size;
      const { boxW, boxH } = board.getBoxSize();
      let filledCount = 0;

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = board.cells[r][c];
          if (cell.fixedNum || cell.fillNum) continue;
          if (cell.candidates.size > 0) continue; // 已经有候选数的跳过

          // 计算可用数字
          const used = new Set();
          // 行
          for (let i = 0; i < size; i++) {
            const v = board.cells[r][i].fixedNum || board.cells[r][i].fillNum;
            if (v) used.add(v);
          }
          // 列
          for (let i = 0; i < size; i++) {
            const v = board.cells[i][c].fixedNum || board.cells[i][c].fillNum;
            if (v) used.add(v);
          }
          // 宫
          const boxR = Math.floor(r / boxH) * boxH;
          const boxC = Math.floor(c / boxW) * boxW;
          for (let i = boxR; i < boxR + boxH; i++) {
            for (let j = boxC; j < boxC + boxW; j++) {
              const v = board.cells[i][j].fixedNum || board.cells[i][j].fillNum;
              if (v) used.add(v);
            }
          }
          // 笼（杀手数独）
          const cageIds = cell.cageIds && cell.cageIds.length > 0 ? cell.cageIds : (cell.cageId !== null ? [cell.cageId] : []);
          for (const cageId of cageIds) {
            if (board.cageIdToCells && board.cageIdToCells[cageId]) {
              for (const [cr, cc] of board.cageIdToCells[cageId]) {
                const v = board.cells[cr][cc].fixedNum || board.cells[cr][cc].fillNum;
                if (v) used.add(v);
              }
            }
          }

          // 添加候选数
          for (let n = 1; n <= size; n++) {
            if (!used.has(n)) {
              cell.candidates.add(n);
              filledCount++;
            }
          }
        }
      }

      if (this.global.gameNoteSystem && typeof this.global.gameNoteSystem.onNumberFilled === 'function') {
        this.global.gameNoteSystem.onNumberFilled();
      }
      this.renderer.render(board);
      if (filledCount > 0) {
        this._showToast(`已自动填充 ${filledCount} 个候选数`, 1500);
      } else {
        this._showToast('所有空格都已有候选数', 1500);
      }
      this.AudioService.sfx.play('note_toggle');
    }

    // ============================================================
    //  增减选中格数字
    // ============================================================

    adjustSelectedNumber(delta) {
      if (!this.board) return;
      const board = this.board;
      const cell = board.getActiveCell();
      if (!cell) {
        board.selectCell(0, 0);
        this.renderer.render(board);
        return;
      }
      const { r, c } = cell;
      const targetCell = board.cells[r][c];
      if (targetCell.fixedNum) return;

      let current = targetCell.fillNum || 0;
      let next = current + delta;

      // 循环：超过最大值回到 1，低于 1 回到最大值
      if (next > board.size) next = 1;
      if (next < 1) next = board.size;

      if (next === 0) {
        this.handleErase();
      } else {
        this.handleNumberInput(next);
      }
    }

    // ============================================================
    //  擦除处理
    // ============================================================

    handleErase() {
      if (this._isProcessingInput) return;
      this._beginProcessing();
      this.AudioService.sfx.play('erase');

      const board = this.board;
      const noteMode = this._getNoteMode();

      // P2: 记录要擦除的数字，用于擦除动画
      const erasedCells = [];
      if (!noteMode) {
        // 正常模式：记录被擦除的填数
        if (board.selectedCells.length > 1) {
          for (const sc of board.selectedCells) {
            const cell = board.cells[sc.r][sc.c];
            if (cell.fillNum) {
              erasedCells.push({ r: sc.r, c: sc.c, value: cell.fillNum });
            }
          }
        } else if (board.selectedCell) {
          const cell = board.cells[board.selectedCell.r][board.selectedCell.c];
          if (cell.fillNum) {
            erasedCells.push({ r: board.selectedCell.r, c: board.selectedCell.c, value: cell.fillNum });
          }
        }
      }

      // === 模式感知的擦除 ===
      // 笔记模式：只清除候选数（不清除填数）
      // 正常模式：清除填数（候选数也一起清除，保持棋盘干净）
      if (noteMode) {
        // 笔记模式擦除：只清除候选数
        if (board.selectedCells.length > 1) {
          board.eraseCandidatesForSelection();
        } else if (board.selectedCell || board.selectedCells.length === 1) {
          board.eraseCandidates();
        }
      } else {
        // 正常模式擦除：清除填数（含候选数）
        if (board.selectedCells.length > 1) {
          board.eraseSelection();
        } else if (board.selectedCell || (board.selectedCells.length === 1)) {
          board.eraseNumber();
        }
      }

      // P2: 触发擦除动画
      if (this.renderer && typeof this.renderer.triggerEraseAnimation === 'function') {
        for (const ec of erasedCells) {
          this.renderer.triggerEraseAnimation(ec.r, ec.c, ec.value, 180);
        }
      }

      // 触感反馈
      this._vibrate(this.VIBRATE_PRESETS.ERASE);

      // 连击系统：擦除断连
      if (this.comboSystem) {
        this.comboSystem.onErase();
      }
      // 吐槽系统：擦除也算操作（重置闲置计时）
      if (this.comedySystem) {
        this.comedySystem.onPlayerAction();
      }
      if (this.global.gameNoteSystem && typeof this.global.gameNoteSystem.onNumberFilled === 'function') {
        this.global.gameNoteSystem.onNumberFilled();
      }
      this.renderer.render(board);
      this._updateNumBtnCompletedState();
      // 更新45法则HUD
      if (board && board.size === 9 && typeof this._updateRule45Banner === 'function') {
        const updateCell = board.selectedCell || (board.selectedCells && board.selectedCells[0]);
        this._updateRule45Banner(updateCell);
      }

      // What If 模式：擦除后自动生成快照
      if (this.WhatIfState && this.WhatIfState.active) {
        const cell = board.selectedCell || board.selectedCells[0];
        const label = cell ? `R${cell.r + 1}C${cell.c + 1}=∅` : 'erase';
        this._addWhatIfSnapshot(label);
      }
      this._endProcessing();
    }

    // ============================================================
    //  撤销
    // ============================================================

    undo() {
      if (!this.board) return;
      if (this._isProcessingInput) return;
      this._beginProcessing();
      const board = this.board;
      // Boss战：记录撤销的位置
      let undoR = -1, undoC = -1;
      if (this.GuideBattle && this.GuideBattle.active && board.selectedCell) {
        undoR = board.selectedCell.r;
        undoC = board.selectedCell.c;
      }
      board.undo();
      // Boss战：通知撤销
      if (this.GuideBattle && this.GuideBattle.active && undoR >= 0) {
        this.GuideBattle.onPlayerUndo(undoR, undoC);
      }
      this.renderer.render(board);
      this.EventLogger.log('game:undo');
      // 更新45法则HUD
      if (board && board.size === 9 && typeof this._updateRule45Banner === 'function') {
        const updateCell = board.selectedCell || (board.selectedCells && board.selectedCells[0]);
        this._updateRule45Banner(updateCell);
      }
      this._endProcessing();
    }

    // ============================================================
    //  擦除单格
    // ============================================================

    eraseCell() {
      this.handleErase();
      this.EventLogger.log('game:erase');
    }

    // ============================================================
    //  笔记模式切换
    // ============================================================

    toggleNoteMode(forceValue) {
      const newMode = (forceValue !== undefined) ? !!forceValue : !this._getNoteMode();
      if (newMode === this._getNoteMode()) return; // 状态未变化，不重复触发
      this._setNoteMode(newMode);
      this.AudioService.sfx.play('note_toggle');

      const noteMode = this._getNoteMode();
      const board = this.board;

      // === 即时视觉反馈（< 50ms） ===
      // 立即更新按钮状态 + 键盘区域视觉提示
      this._updateNoteButtonState();
      // 触感反馈
      this._vibrate(noteMode ? this.VIBRATE_PRESETS.NOTE_TOGGLE : this.VIBRATE_PRESETS.MICRO);

      // 切换笔记模式时清除多选
      if (board && board.selectedCells.length > 0) {
        board.clearMultiSelect();
        this._updateMultiSelectHint();
      }
      // 同步 board.inputMode（控制候选数显示）
      if (board) {
        const targetMode = noteMode ? 'candidate' : 'normal';
        board.setInputMode(targetMode);
        // 双重保险：直接设置确保同步
        if (board.inputMode !== targetMode) {
          board.inputMode = targetMode;
        }
      }
      this.EventLogger.log('game:noteMode', { enabled: noteMode });

      // 吐槽系统：首次切换到笔记模式
      if (noteMode && this.comedySystem && !this._getUsedNotes()) {
        this.comedySystem.onFirstNote();
      }

      // 重新渲染（强制重绘，确保笔记显示状态正确）
      if (this.renderer && board) {
        this.renderer.forceRender = true;
        this.renderer.render(board);
        // 延迟一帧再渲染一次，确保状态同步
        requestAnimationFrame(() => {
          if (this.renderer && board) {
            this.renderer.forceRender = true;
            this.renderer.render(board);
          }
        });
      }

      // 轻量 Toast 提示（缩短显示时间，避免干扰）
      this._showToast(noteMode ? '笔记模式' : '填数模式', 800);
    }

    // ============================================================
    //  数字输入核心处理
    // ============================================================

    handleNumberInput(num, targetCell) {
      if (!this.board) return;
      const board = this.board;
      const solution = this._getSolution();

      // === 教学引导：guided 阶段输入反馈 ===
      if (this.lessonUICoordinator && this.lessonUICoordinator.isWaitingInput) {
        // NOTE_ONLY 模式下，填数逻辑不触发教学反馈（由笔记切换逻辑处理）
        const interactionType = this.lessonUICoordinator.getInteractionType();
        if (interactionType !== 'NOTE_ONLY') {
          let targetR, targetC;
          if (targetCell) {
            targetR = targetCell.r;
            targetC = targetCell.c;
          } else if (board.selectedCell) {
            targetR = board.selectedCell.r;
            targetC = board.selectedCell.c;
          } else {
            return;
          }

          const lessonResult = this._lessonHandleCellFill(targetR, targetC, num);
          // 注意：即使教学系统处理了，数字也照常填入
          // 教学系统只负责额外的反馈（成功动画、失败提示等）
          // 自动揭示的情况由教学系统直接填入正确答案，不走这里
          if (lessonResult && lessonResult.handled && lessonResult.autoRevealed) {
            return; // 自动揭示了，不重复填
          }
        }
      }

      const noteMode = this._getNoteMode();

      // 多选模式：批量操作（普通模式填数 / 笔记模式切换候选）
      if (board.selectedCells.length > 1) {
        if (noteMode) {
          // 笔记模式：批量切换候选数
          board.toggleCandidateForSelection(num);
          this._setUsedNotes(true);
          if (this.global.gameNoteSystem && typeof this.global.gameNoteSystem.onNumberFilled === 'function') {
            this.global.gameNoteSystem.onNumberFilled();
          }
        } else {
          // 普通模式 / 连填模式：批量填数
          const solution = this._getSolution();
          let correctCount = 0;
          let wrongCount = 0;
          const cells = board.selectedCells.slice();

          for (const { r, c } of cells) {
            const cell = board.cells[r][c];
            if (cell.fixedNum > 0 || cell.isLocked) continue;
            if (cell.fillNum === num) continue;

            if (solution && solution[r] && solution[r][c] === num) {
              // 正确填数
              board.setNumberAt(r, c, num);
              correctCount++;
              // Combo 系统
              if (this.comboSystem && typeof this.comboSystem.onCorrectFill === 'function') {
                this.comboSystem.onCorrectFill(r, c, num);
              }
              // 吐槽系统：正确填数
              if (this.comedySystem) {
                this.comedySystem.onCorrectFill(r, c);
              }
              // Boss战：通知玩家正确填数
              if (this.GuideBattle && this.GuideBattle.active) {
                this.GuideBattle.onPlayerFill(r, c, num, true);
              }
              // 填数动画
              if (this.renderer && typeof this.renderer.triggerFillAnimation === 'function') {
                this.renderer.triggerFillAnimation(r, c, 200);
              }
            } else {
              // 错误填数
              wrongCount++;
              this._incErrorCount();
              // 吐槽系统：错误填数（同一格连续错 3 次触发）
              if (this.comedySystem) {
                this.comedySystem.onWrongFill(r, c);
              }
              // Boss战：通知玩家错误填数
              if (this.GuideBattle && this.GuideBattle.active) {
                this.GuideBattle.onPlayerFill(r, c, num, false);
              }
              if (!board.settings.keepWrongNumber) {
                // 临时显示错误，300ms 后清除
                cell.tempWrongNum = num;
                cell.isError = true;
                setTimeout(() => {
                  cell.tempWrongNum = null;
                  cell.isError = false;
                  if (this.renderer) this.renderer.render(board);
                }, 300);
              } else {
                board.setNumberAt(r, c, num);
                cell.isError = true;
                setTimeout(() => {
                  cell.isError = false;
                  if (this.renderer) this.renderer.render(board);
                }, 800);
              }
            }
          }

          // 播放音效（取多数）
          if (correctCount > 0 || wrongCount > 0) {
            if (correctCount >= wrongCount) {
              this.AudioService.sfx.play('fill_correct');
            } else {
              this.AudioService.sfx.play('fill_wrong');
            }
            this._updateNumBtnCompletedState();
            this._checkCompletion();
          }
        }
        this.renderer.render(board);
        return;
      }

      // 单选模式
      let targetR, targetC;
      if (targetCell) {
        targetR = targetCell.r;
        targetC = targetCell.c;
        board.selectCell(targetR, targetC);
      } else if (board.selectedCell) {
        targetR = board.selectedCell.r;
        targetC = board.selectedCell.c;
      } else if (board.selectedCells.length > 0) {
        // 兼容：只有selectedCells但没有selectedCell时，用第一个选中格
        const first = board.selectedCells[0];
        targetR = first.r;
        targetC = first.c;
        board.selectCell(targetR, targetC);
      } else {
        return;
      }

      const { r, c } = { r: targetR, c: targetC };

      // 不能修改固定数字
      const cell = board.cells[r][c];
      if (cell.fixedNum > 0) return;
      if (cell.isLocked) return;

      // Note mode: toggle candidate
      if (noteMode) {
        // 确保格子处于可编辑状态
        if (cell.fillNum) return;
        // 确保inputMode是candidate（控制候选数显示）
        if (board.inputMode !== 'candidate' && board.inputMode !== 'elimination') {
          board.setInputMode('candidate');
        }
        board.toggleCandidate(num);
        this._setUsedNotes(true);

        // === 教学引导：笔记输入检测 ===
        if (this.lessonUICoordinator && this.lessonUICoordinator.isActive && this.lessonUICoordinator.lessonPlayer) {
          // 检查切换后这个数字是否还在候选里（toggle 是添加还是移除）
          const wasAdded = cell.candidates.has(num);
          const lp = this.lessonUICoordinator.lessonPlayer;
          const noteResult = lp.handleNoteToggle
            ? lp.handleNoteToggle(r, c, num, wasAdded)
            : null;
          if (noteResult && noteResult.handled && noteResult.noteComplete) {
            // 笔记完成，播放成功反馈
            this.AudioService.sfx.play('fill_correct');
            if (this.renderer && typeof this.renderer.triggerFillAnimation === 'function') {
              this.renderer.triggerFillAnimation(r, c, 300);
            }
          }
        }

        if (this.global.gameNoteSystem && typeof this.global.gameNoteSystem.onNumberFilled === 'function') {
          this.global.gameNoteSystem.onNumberFilled();
        }
        // 强制重绘（确保笔记更新可见）
        if (this.renderer) {
          this.renderer.forceRender = true;
          this.renderer.render(board);
        }
        this.EventLogger.log('game:note', { row: r, col: c, num });
        return;
      }

      this.EventLogger.log('game:fill', { row: r, col: c, num });

      if (solution && solution[r][c] === num) {
        // 正确
        // 技巧类成就检测：必须在填数前检测，使用填数前的盘面状态
        let detectedTechForAchievement = null;
        if (this.global.ProgressManager) {
          if (this.achievementCoordinator && this.achievementCoordinator.lastHintTechnique) {
            // 方案b（教学判定）：玩家看过该技巧的提示后正确填数，记录该技巧使用
            detectedTechForAchievement = this.achievementCoordinator.lastHintTechnique;
            // 使用后清除，避免一次提示多次计数
            this.achievementCoordinator.lastHintTechnique = null;
          } else {
            // 方案a（技术判定）：玩家正确填入数字，通过TechRater检测该数字可由哪种技巧推导
            detectedTechForAchievement = this._detectTechniqueForFill(r, c, num);
          }
        }

        board.setNumber(num);
        this.AudioService.sfx.play('fill_correct');
        this._vibrate(this.VIBRATE_PRESETS.FILL);
        this.expertSystem.onFillCorrect(r, c, num);
        // 连击系统：正确填数
        if (this.comboSystem) {
          this.comboSystem.onCorrectFill(r, c, num);
        }
        // 吐槽系统：正确填数
        if (this.comedySystem) {
          this.comedySystem.onCorrectFill(r, c);
        }
        // Boss战：通知玩家正确填数
        if (this.GuideBattle && this.GuideBattle.active) {
          this.GuideBattle.onPlayerFill(r, c, num, true);
        }
        this.EventLogger.log('game:fill_correct', { row: r, col: c, num });

        // === 教学引导：What If 模式下填数统计（semiAuto 阶段） ===
        if (this.lessonUICoordinator && this.lessonUICoordinator.isActive && this.WhatIfState && this.WhatIfState.active) {
          this.lessonUICoordinator.handleWhatIfCellFill(r, c, num);
        }

        // 记录技巧使用（在填数后触发，避免影响填数逻辑）
        if (detectedTechForAchievement && this.global.ProgressManager) {
          this._recordTechniqueUsage(detectedTechForAchievement);
        }
        // Trigger fill animation
        if (this.renderer && typeof this.renderer.triggerFillAnimation === 'function') {
          this.renderer.triggerFillAnimation(r, c, 200);
        }
        this._updateNumBtnCompletedState();
        this._checkCompletion();
      } else {
        // 错误填入
        const keepWrong = board.settings.keepWrongNumber;

        if (keepWrong) {
          // 旧行为：错误数字写入 fillNum，800ms 后清除
          board.setNumber(num);
          cell.isError = true;
          this.AudioService.sfx.play('fill_wrong');
          // 错误高亮
          if (this.renderer && typeof this.renderer.highlightHintCells === 'function') {
            this.renderer.clearHintHighlights('error');
            this.renderer.highlightHintCells([{ row: r, col: c }], 'error', 'error');
            setTimeout(() => {
              if (this.renderer && typeof this.renderer.clearHintHighlights === 'function') {
                this.renderer.clearHintHighlights('error');
                cell.isError = false;
                this.renderer.render(board);
              }
            }, 800);
          }
        } else {
          // 新行为：错误数字不写入 fillNum，用 tempWrongNum 临时显示，300ms 后清除
          cell.tempWrongNum = num;
          this.AudioService.sfx.play('fill_wrong');
          // 红色边框高亮（闪烁效果）
          if (this.renderer && typeof this.renderer.highlightHintCells === 'function') {
            this.renderer.clearHintHighlights('error');
            this.renderer.highlightHintCells([{ row: r, col: c }], 'error', 'error');
          }
          // 启动闪烁动画循环（为了抖动效果，需要多次重绘）
          let flashCount = 0;
          const flashInterval = setInterval(() => {
            flashCount++;
            if (flashCount >= 3) {
              clearInterval(flashInterval);
            }
            if (this.renderer) this.renderer.render(board);
          }, 80);
          // 300ms 后清除临时错误数字
          setTimeout(() => {
            clearInterval(flashInterval);
            cell.tempWrongNum = null;
            cell.isError = false;
            if (this.renderer && typeof this.renderer.clearHintHighlights === 'function') {
              this.renderer.clearHintHighlights('error');
            }
            if (this.renderer) this.renderer.render(board);
          }, 300);
        }
        // 震动反馈
        this._vibrate(this.VIBRATE_PRESETS.ERROR);
        this._incErrorCount();
        this.expertSystem.onFillWrong(r, c, num);
        // 连击系统：错误填数
        if (this.comboSystem) {
          this.comboSystem.onWrongFill(r, c, num);
        }
        // 吐槽系统：错误填数（同一格连续错 3 次触发）
        if (this.comedySystem) {
          this.comedySystem.onWrongFill(r, c);
        }
        // 角色错误反馈（通过 expression 层触发 ERROR_FEEDBACK）
        if (this.expertSystem && this.expertSystem.expression) {
          this.expertSystem.expression.enqueue({
            action: 'ERROR_FEEDBACK',
            payload: {
              message: '小心，这格不对哦。再想想看~',
              character: 'cagekeeper',
              speakerName: '守笼人',
            },
            priority: 40,
          });
        }
        this.EventLogger.log('game:fill_wrong', { row: r, col: c, num });
      }

      this.renderer.render(board);

      // 更新45法则HUD
      if (board && board.size === 9 && typeof this._updateRule45Banner === 'function') {
        const updateCell = board.selectedCell || (board.selectedCells && board.selectedCells[0]);
        this._updateRule45Banner(updateCell);
      }

      // What If 模式：填数后自动生成快照
      if (this.WhatIfState && this.WhatIfState.active) {
        const label = `R${r + 1}C${c + 1}=${num}`;
        this._addWhatIfSnapshot(label);
      }
    }
  }

  // 暴露到全局
  global.CellInputHandler = CellInputHandler;

})(typeof window !== 'undefined' ? window : this);
