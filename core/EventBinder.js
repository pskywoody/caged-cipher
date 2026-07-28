// ==========================================
//  EventBinder - 事件绑定器
// ==========================================
//  从 guide.js 抽离，物理分离，逻辑不变
//  负责所有 DOM 事件绑定：工具栏按钮、设置面板、窗口事件等
//  核心输入事件由 InputRouter 处理，本模块负责 UI 层事件
// ==========================================

;(function(global) {
  'use strict';

  class EventBinder {
    /**
     * @param {Object} deps - 依赖注入
     *
     * 核心对象引用：
     * @param {Object} deps.board - 棋盘对象
     * @param {Object} deps.renderer - 渲染器
     * @param {Object} deps.storyEngine - 故事引擎
     * @param {Object} deps.techMatrix - 技巧矩阵
     * @param {Object} deps.comboSystem - 连击系统
     * @param {Object} deps.expertSystem - 专家系统
     * @param {Object} deps.hintSystem - 提示系统
     * @param {Object} deps.comedySystem - 吐槽系统
     * @param {Object} deps.settingsPanel - 设置面板
     * @param {Object} deps.achievementCoordinator - 成就协调器
     * @param {Object} deps.AudioService - 音频服务
     * @param {Object} deps.VIBRATE_PRESETS - 震动预设
     * @param {Object} deps.WhatIfState - What If 状态对象
     * @param {Object} deps.HintPlayerState - 提示播放状态
     * @param {Object} deps.lessonUICoordinator - 教学UI协调器
     * @param {Object} deps.chapterSelect - 章节选择
     * @param {Object} deps.currentLevelData - 当前关卡数据
     *
     * 状态 getter / setter：
     * @param {Function} deps.getIsCompleted - 获取是否已完成
     * @param {Function} deps.getIsPaused - 获取是否暂停
     * @param {Function} deps.getNoteMode - 获取笔记模式
     * @param {Function} deps.setNoteMode - 设置笔记模式
     * @param {Function} deps.getDebugMode - 获取调试模式
     * @param {Function} deps.getTechniquePanelVisible - 获取技巧面板是否可见
     * @param {Function} deps.getUsedNotes - 获取是否使用过笔记
     * @param {Function} deps.setUsedNotes - 设置已使用笔记
     * @param {Function} deps.getErrorCount - 获取错误计数
     * @param {Function} deps.incErrorCount - 增加错误计数
     * @param {Function} deps.getSolution - 获取答案数组
     *
     * 业务回调 - 核心输入：
     * @param {Function} deps.onNumberInput - 数字输入
     * @param {Function} deps.onErase - 擦除
     * @param {Function} deps.onToggleNote - 切换笔记模式
     * @param {Function} deps.onHint - 显示提示
     * @param {Function} deps.onWhatIfToggle - 切换WhatIf
     * @param {Function} deps.onUndo - 撤销
     * @param {Function} deps.onPauseToggle - 切换暂停
     * @param {Function} deps.onSkipHintStep - 跳过提示步骤
     * @param {Function} deps.onBoardLongPress - 棋盘长按
     * @param {Function} deps.onUpdateMultiSelectHint - 更新多选提示
     * @param {Function} deps.onUpdateNoteButtonState - 更新笔记按钮状态
     * @param {Function} deps.onUpdateRule45Banner - 更新45法则横幅
     * @param {Function} deps.onShowToast - 显示Toast
     * @param {Function} deps.onVibrate - 震动
     * @param {Function} deps.onEnterWhatIf - 进入WhatIf
     * @param {Function} deps.onExitWhatIf - 退出WhatIf
     * @param {Function} deps.onAdoptWhatIf - 采纳WhatIf
     * @param {Function} deps.onUndoWhatIfStep - 撤销WhatIf步骤
     * @param {Function} deps.onToggleRule45Banner - 切换45法则横幅
     * @param {Function} deps.onCheckBoardAnswer - 检查答案
     * @param {Function} deps.onAutoFillCandidates - 自动填充候选数
     * @param {Function} deps.onAdjustSelectedNumber - 调整选中数字
     * @param {Function} deps.onToggleTechniqueEncyclopedia - 切换技巧百科
     * @param {Function} deps.onHideTechniqueEncyclopedia - 隐藏技巧百科
     * @param {Function} deps.onToggleHeatmapDisplay - 切换热图显示
     * @param {Function} deps.onUpdateNumBtnActiveState - 更新数字按钮激活状态
     * @param {Function} deps.onUpdateNumBtnCompletedState - 更新数字按钮完成状态
     *
     * 业务回调 - UI操作：
     * @param {Function} deps.showToast - 显示Toast
     * @param {Function} deps.vibrate - 震动
     * @param {Function} deps.toggleNoteMode - 切换笔记模式
     * @param {Function} deps.undo - 撤销
     * @param {Function} deps.eraseCell - 擦除当前格
     * @param {Function} deps.showHint - 显示提示
     * @param {Function} deps.toggleWhatIfMode - 切换WhatIf模式
     * @param {Function} deps.adoptWhatIfChanges - 采纳WhatIf更改
     * @param {Function} deps.undoWhatIfStep - 撤销WhatIf步骤
     * @param {Function} deps.resetWhatIfToRoot - 重置WhatIf到根
     * @param {Function} deps.exitWhatIfMode - 退出WhatIf模式
     * @param {Function} deps.toggleFloatBarPanel - 切换浮条面板
     * @param {Function} deps.toggleTechniqueEncyclopedia - 切换技巧百科
     * @param {Function} deps.togglePause - 切换暂停
     * @param {Function} deps.showPauseMenu - 显示暂停菜单
     * @param {Function} deps.restartLevel - 重启关卡
     * @param {Function} deps.goToChapterSelect - 返回章节选择
     * @param {Function} deps.goToMainMenu - 返回主菜单
     *
     * 业务回调 - WhatIf辅助：
     * @param {Function} deps.hasChangesFromRoot - 检查是否有根级更改
     *
     * 业务回调 - CellInputHandler 专用：
     * @param {Function} deps.validateBoard - 验证棋盘
     * @param {Function} deps.highlightAllErrors - 高亮所有错误
     * @param {Function} deps.checkCompletion - 检查完成
     * @param {Function} deps.addWhatIfSnapshot - 添加WhatIf快照
     * @param {Function} deps.lessonHandleCellFill - 教学填数处理
     * @param {Function} deps.detectTechniqueForFill - 技巧检测
     * @param {Function} deps.recordTechniqueUsage - 记录技巧使用
     */
    constructor(deps = {}) {
      // 核心对象
      this._board = deps.board || null;
      this._renderer = deps.renderer || null;
      this._storyEngine = deps.storyEngine || null;
      this._techMatrix = deps.techMatrix || null;
      this._comboSystem = deps.comboSystem || null;
      this._expertSystem = deps.expertSystem || null;
      this._hintSystem = deps.hintSystem || null;
      this._comedySystem = deps.comedySystem || null;
      this._settingsPanel = deps.settingsPanel || null;
      this._achievementCoordinator = deps.achievementCoordinator || null;
      this._AudioService = deps.AudioService || null;
      this._VIBRATE_PRESETS = deps.VIBRATE_PRESETS || {};
      this._WhatIfState = deps.WhatIfState || null;
      this._HintPlayerState = deps.HintPlayerState || null;
      this._lessonUICoordinator = deps.lessonUICoordinator || null;
      this._chapterSelect = deps.chapterSelect || null;
      this._currentLevelData = deps.currentLevelData || null;

      // 状态 getter / setter
      this._getIsCompleted = deps.getIsCompleted || (() => false);
      this._getIsPaused = deps.getIsPaused || (() => false);
      this._getNoteMode = deps.getNoteMode || (() => false);
      this._setNoteMode = deps.setNoteMode || (() => {});
      this._getDebugMode = deps.getDebugMode || (() => false);
      this._getTechniquePanelVisible = deps.getTechniquePanelVisible || (() => false);
      this._getUsedNotes = deps.getUsedNotes || (() => false);
      this._setUsedNotes = deps.setUsedNotes || (() => {});
      this._getErrorCount = deps.getErrorCount || (() => 0);
      this._incErrorCount = deps.incErrorCount || (() => {});
      this._getSolution = deps.getSolution || (() => null);

      // 业务回调 - 核心输入（用于 InputRouter）
      this._onNumberInput = deps.onNumberInput || (() => {});
      this._onErase = deps.onErase || (() => {});
      this._onToggleNote = deps.onToggleNote || (() => {});
      this._onHint = deps.onHint || (() => {});
      this._onWhatIfToggle = deps.onWhatIfToggle || (() => {});
      this._onUndo = deps.onUndo || (() => {});
      this._onPauseToggle = deps.onPauseToggle || (() => {});
      this._onSkipHintStep = deps.onSkipHintStep || (() => {});
      this._onBoardLongPress = deps.onBoardLongPress || (() => {});
      this._onUpdateMultiSelectHint = deps.onUpdateMultiSelectHint || (() => {});
      this._onUpdateNoteButtonState = deps.onUpdateNoteButtonState || (() => {});
      this._onUpdateRule45Banner = deps.onUpdateRule45Banner || (() => {});
      this._onShowToast = deps.onShowToast || (() => {});
      this._onVibrate = deps.onVibrate || (() => {});
      this._onEnterWhatIf = deps.onEnterWhatIf || (() => {});
      this._onExitWhatIf = deps.onExitWhatIf || (() => {});
      this._onAdoptWhatIf = deps.onAdoptWhatIf || (() => {});
      this._onUndoWhatIfStep = deps.onUndoWhatIfStep || (() => {});
      this._onToggleRule45Banner = deps.onToggleRule45Banner || (() => {});
      this._onCheckBoardAnswer = deps.onCheckBoardAnswer || (() => {});
      this._onAutoFillCandidates = deps.onAutoFillCandidates || (() => {});
      this._onAdjustSelectedNumber = deps.onAdjustSelectedNumber || (() => {});
      this._onToggleTechniqueEncyclopedia = deps.onToggleTechniqueEncyclopedia || (() => {});
      this._onHideTechniqueEncyclopedia = deps.onHideTechniqueEncyclopedia || (() => {});
      this._onToggleHeatmapDisplay = deps.onToggleHeatmapDisplay || (() => {});
      this._onUpdateNumBtnActiveState = deps.onUpdateNumBtnActiveState || (() => {});
      this._onUpdateNumBtnCompletedState = deps.onUpdateNumBtnCompletedState || (() => {});

      // 业务回调 - UI操作
      this._showToast = deps.showToast || (() => {});
      this._vibrate = deps.vibrate || (() => {});
      this._toggleNoteMode = deps.toggleNoteMode || (() => {});
      this._undo = deps.undo || (() => {});
      this._eraseCell = deps.eraseCell || (() => {});
      this._showHint = deps.showHint || (() => {});
      this._toggleWhatIfMode = deps.toggleWhatIfMode || (() => {});
      this._adoptWhatIfChanges = deps.adoptWhatIfChanges || (() => {});
      this._undoWhatIfStep = deps.undoWhatIfStep || (() => {});
      this._resetWhatIfToRoot = deps.resetWhatIfToRoot || (() => {});
      this._exitWhatIfMode = deps.exitWhatIfMode || (() => {});
      this._toggleFloatBarPanel = deps.toggleFloatBarPanel || (() => {});
      this._toggleTechniqueEncyclopedia = deps.toggleTechniqueEncyclopedia || (() => {});
      this._togglePause = deps.togglePause || (() => {});
      this._showPauseMenu = deps.showPauseMenu || (() => {});
      this._restartLevel = deps.restartLevel || (() => {});
      this._goToChapterSelect = deps.goToChapterSelect || (() => {});
      this._goToMainMenu = deps.goToMainMenu || (() => {});

      // 业务回调 - WhatIf辅助
      this._hasChangesFromRoot = deps.hasChangesFromRoot || (() => false);

      // 业务回调 - CellInputHandler 专用
      this._validateBoard = deps.validateBoard || (() => {});
      this._highlightAllErrors = deps.highlightAllErrors || (() => {});
      this._checkCompletion = deps.checkCompletion || (() => {});
      this._addWhatIfSnapshot = deps.addWhatIfSnapshot || (() => {});
      this._lessonHandleCellFill = deps.lessonHandleCellFill || (() => {});
      this._detectTechniqueForFill = deps.detectTechniqueForFill || (() => {});
      this._recordTechniqueUsage = deps.recordTechniqueUsage || (() => {});

      // 状态
      this._bound = false;
      this._inputRouter = null;
      this._cellInputHandler = null;
      this._menuSheet = null;
    }

    /**
     * 设置 InputRouter 实例（由外部创建后传入，或在 bind 中创建）
     */
    setInputRouter(router) { this._inputRouter = router; }
    getInputRouter() { return this._inputRouter; }

    /**
     * 设置 CellInputHandler 实例
     */
    setCellInputHandler(handler) { this._cellInputHandler = handler; }
    getCellInputHandler() { return this._cellInputHandler; }

    /**
     * 是否已绑定
     */
    get isBound() { return this._bound; }

    // ============================================================
    //  事件绑定主入口
    // ============================================================

    bind() {
      if (this._bound) return;
      this._bound = true;

      const canvas = document.getElementById('gameCanvas');
      const AudioService = this._AudioService;
      const VIBRATE_PRESETS = this._VIBRATE_PRESETS;

      // --- 初始化 InputRouter 并绑定输入事件 ---
      this._inputRouter = new InputRouter({
        board: this._board,
        renderer: this._renderer,
        storyEngine: this._storyEngine,
        lessonPlayer: null,
        HintPlayerState: this._HintPlayerState,
        WhatIfState: this._WhatIfState,
        techMatrix: this._techMatrix,
        comedySystem: this._comedySystem,
        settingsPanel: this._settingsPanel,
        achievementPanel: this._achievementCoordinator ? this._achievementCoordinator.achievementPanel : null,
        galleryPanel: this._achievementCoordinator ? this._achievementCoordinator.galleryPanel : null,
        AudioService: AudioService,
        VIBRATE_PRESETS: VIBRATE_PRESETS,
        GuideBattle: (typeof GuideBattle !== 'undefined') ? GuideBattle : null,

        // 状态 getter / setter
        getIsCompleted: () => this._getIsCompleted(),
        getIsPaused: () => this._getIsPaused(),
        getNoteMode: () => this._getNoteMode(),
        setNoteMode: (v) => { this._setNoteMode(v); },
        getDebugMode: () => this._getDebugMode(),
        getTechniquePanelVisible: () => this._getTechniquePanelVisible(),
        setUsedNotes: (v) => { this._setUsedNotes(v); },

        // 业务回调
        onNumberInput: this._onNumberInput,
        onErase: this._onErase,
        onToggleNote: this._onToggleNote,
        onHint: this._onHint,
        onWhatIfToggle: this._onWhatIfToggle,
        onUndo: this._onUndo,
        onPauseToggle: this._onPauseToggle,
        onSkipHintStep: this._onSkipHintStep,
        onBoardLongPress: this._onBoardLongPress,
        onUpdateMultiSelectHint: this._onUpdateMultiSelectHint,
        onUpdateNoteButtonState: this._onUpdateNoteButtonState,
        onUpdateRule45Banner: this._onUpdateRule45Banner,
        onShowToast: this._onShowToast,
        onVibrate: this._onVibrate,
        onEnterWhatIf: this._onEnterWhatIf,
        onExitWhatIf: this._onExitWhatIf,
        onAdoptWhatIf: this._onAdoptWhatIf,
        onUndoWhatIfStep: this._onUndoWhatIfStep,
        onToggleRule45Banner: this._onToggleRule45Banner,
        onCheckBoardAnswer: this._onCheckBoardAnswer,
        onAutoFillCandidates: this._onAutoFillCandidates,
        onAdjustSelectedNumber: this._onAdjustSelectedNumber,
        onToggleTechniqueEncyclopedia: this._onToggleTechniqueEncyclopedia,
        onHideTechniqueEncyclopedia: this._onHideTechniqueEncyclopedia,
        onToggleHeatmapDisplay: this._onToggleHeatmapDisplay,
        onUpdateNumBtnActiveState: this._onUpdateNumBtnActiveState,
        onUpdateNumBtnCompletedState: this._onUpdateNumBtnCompletedState,
      });
      this._inputRouter.bindEvents(canvas, document);

      // --- 初始化 CellInputHandler（核心输入处理器，已迁移到 core/CellInputHandler.js）---
      if (typeof CellInputHandler !== 'undefined' && !this._cellInputHandler) {
        this._cellInputHandler = new CellInputHandler({
          // 核心对象引用
          board: this._board,
          renderer: this._renderer,
          comboSystem: this._comboSystem,
          expertSystem: this._expertSystem,
          hintSystem: this._hintSystem,
          comedySystem: this._comedySystem,
          AudioService: AudioService,
          VIBRATE_PRESETS: VIBRATE_PRESETS,
          EventLogger: typeof EventLogger !== 'undefined' ? EventLogger : null,
          GuideBattle: (typeof GuideBattle !== 'undefined') ? GuideBattle : null,
          WhatIfState: this._WhatIfState,
          lessonUICoordinator: this._lessonUICoordinator,
          achievementCoordinator: this._achievementCoordinator,
          currentLevelData: this._currentLevelData,
          global: global,

          // 状态 getter / setter
          getNoteMode: () => this._getNoteMode(),
          setNoteMode: (v) => { this._setNoteMode(v); },
          getUsedNotes: () => this._getUsedNotes ? this._getUsedNotes() : false,
          setUsedNotes: (v) => { this._setUsedNotes(v); },
          getErrorCount: () => this._getErrorCount ? this._getErrorCount() : 0,
          incErrorCount: () => { if (this._incErrorCount) this._incErrorCount(); },
          getSolution: () => this._getSolution ? this._getSolution() : null,

          // 业务回调
          showToast: this._showToast,
          vibrate: this._vibrate,
          validateBoard: this._validateBoard,
          highlightAllErrors: this._highlightAllErrors,
          updateNumBtnCompletedState: this._onUpdateNumBtnCompletedState,
          checkCompletion: this._checkCompletion,
          updateRule45Banner: this._onUpdateRule45Banner,
          addWhatIfSnapshot: this._addWhatIfSnapshot,
          lessonHandleCellFill: this._lessonHandleCellFill,
          detectTechniqueForFill: this._detectTechniqueForFill,
          recordTechniqueUsage: this._recordTechniqueUsage,
          updateNoteButtonState: this._onUpdateNoteButtonState,
          updateMultiSelectHint: this._onUpdateMultiSelectHint,
        });
      }

      // --- Toolbar buttons ---
      const btnNote = document.getElementById('btn-note');
      if (btnNote) {
        btnNote.addEventListener('click', () => {
          AudioService.sfx.play('click');
          this._vibrate(VIBRATE_PRESETS.MICRO);
          this._toggleNoteMode();
        });
      }

      // Window resize
      window.addEventListener('resize', () => {
        if (this._renderer && this._board) {
          // P2优化：resize时失效尺寸缓存
          if (typeof this._renderer.invalidateSizeCache === 'function') {
            this._renderer.invalidateSizeCache();
          }
          this._renderer.recalcCellSize(this._board);
          this._renderer.render(this._board);
        }
      });

      // Orientation change (mobile)
      window.addEventListener('orientationchange', () => {
        // 延迟等待布局完成后重新计算
        setTimeout(() => {
          if (this._renderer && this._board) {
            // P2优化：方向变化时失效尺寸缓存
            if (typeof this._renderer.invalidateSizeCache === 'function') {
              this._renderer.invalidateSizeCache();
            }
            this._renderer.recalcCellSize(this._board);
            this._renderer.render(this._board);
          }
        }, 200);
      });

      // Popstate 拦截：安卓返回键优先退出 What If 模式
      window.addEventListener('popstate', (e) => {
        if (this._WhatIfState && this._WhatIfState.active) {
          e.preventDefault();
          if (this._WhatIfState.snapshots.length > 0) {
            if (confirm('退出假设模式？未采纳的更改将丢失。')) {
              this._exitWhatIfMode(false);
            } else {
              // 用户取消，重新推入状态
              history.pushState({ whatIf: true }, '');
            }
          } else {
            this._exitWhatIfMode(false);
          }
        }
      });

      // 页面关闭/刷新时自动回退未采纳的假设（风险与降级）
      // 规格书要求：页面关闭时自动回退未采纳假设，防止玩家误以为假设已被保存
      window.addEventListener('beforeunload', (e) => {
        if (this._WhatIfState && this._WhatIfState.active) {
          const hasChanges = this._WhatIfState.snapshots.length > 0 || 
            (this._WhatIfState.rootSnapshot && this._hasChangesFromRoot(this._WhatIfState.rootSnapshot));
          if (hasChanges) {
            // 触发浏览器确认对话框（现代浏览器忽略自定义消息，但需要设置 returnValue）
            e.preventDefault();
            e.returnValue = '假设模式下的更改尚未采纳，离开后将丢失。';
            return e.returnValue;
          }
        }
      });

      // pagehide 事件（iOS Safari / 移动端更可靠）
      // 确保页面被系统回收时，状态标记被清理（虽然内存会释放，但用于页面缓存恢复时）
      window.addEventListener('pagehide', () => {
        if (this._WhatIfState && this._WhatIfState.active) {
          try {
            // 清理标记，防止页面从 bfcache 恢复时状态不一致
            this._WhatIfState.active = false;
            document.body.classList.remove('whatif-mode');
          } catch (err) {
            // 静默失败
          }
        }
      });

      // Toolbar buttons
      document.getElementById('btn-undo')?.addEventListener('click', () => { AudioService.sfx.play('click'); this._vibrate(VIBRATE_PRESETS.MICRO); this._undo(); });
      // 擦除按钮：单击=擦除当前格，长按=笔记模式下清空所有笔记
      (function setupEraseButton() {
        const btn = document.getElementById('btn-erase');
        if (!btn) return;
        let eraseLongPressTimer = null;
        let eraseLongPressTriggered = false;
        const self = this;
        btn.addEventListener('pointerdown', (e) => {
          if (self._storyEngine && self._storyEngine._isPlaying) return;
          if (self._getIsCompleted()) return;
          e.preventDefault();
          eraseLongPressTriggered = false;
          btn.classList.add('long-pressing');
          eraseLongPressTimer = setTimeout(() => {
            eraseLongPressTriggered = true;
            btn.classList.remove('long-pressing');
            // 长按擦除
            if (self._getNoteMode()) {
              // 笔记模式：清除所有候选数
              if (self._board && typeof self._board.clearAllCandidates === 'function') {
                self._board.clearAllCandidates();
                self._renderer.render(self._board);
                AudioService.sfx.play('erase');
                self._vibrate(VIBRATE_PRESETS.ERROR_SOFT);
                self._showToast('已清除所有笔记', 1000);
              }
            } else {
              // 正常模式：与单击相同（擦除当前格）
              self._eraseCell();
            }
          }, 500);
        });
        btn.addEventListener('pointerup', (e) => {
          if (eraseLongPressTimer) {
            clearTimeout(eraseLongPressTimer);
            eraseLongPressTimer = null;
          }
          btn.classList.remove('long-pressing');
          if (!eraseLongPressTriggered) {
            // 短按：普通擦除
            AudioService.sfx.play('click');
            self._eraseCell();
          }
        });
        btn.addEventListener('pointerleave', () => {
          if (eraseLongPressTimer) {
            clearTimeout(eraseLongPressTimer);
            eraseLongPressTimer = null;
          }
          btn.classList.remove('long-pressing');
        });
      }).call(this);
      document.getElementById('btn-hint')?.addEventListener('click', () => { AudioService.sfx.play('click'); this._vibrate(VIBRATE_PRESETS.MICRO); this._showHint(); });
      document.getElementById('btn-whatif')?.addEventListener('click', () => {
        AudioService.sfx.play('click');
        this._toggleWhatIfMode();
      });

      // What If 浮条按钮
      document.getElementById('btn-whatif-accept')?.addEventListener('click', () => {
        AudioService.sfx.play('click');
        this._adoptWhatIfChanges();
      });
      document.getElementById('btn-whatif-undo')?.addEventListener('click', () => {
        AudioService.sfx.play('click');
        this._undoWhatIfStep();
      });
      document.getElementById('btn-whatif-reset')?.addEventListener('click', () => {
        AudioService.sfx.play('click');
        this._resetWhatIfToRoot();
      });

      // 右侧浮条拉扣头
      document.getElementById('float-bar-tab')?.addEventListener('click', (e) => {
        e.stopPropagation();
        AudioService.sfx.play('click');
        this._toggleFloatBarPanel();
      });

      document.getElementById('btn-rule45')?.addEventListener('click', () => { 
        AudioService.sfx.play('click'); 
        // 45法则已改为顶部常驻HUD显示
        this._showToast('45法则仪表盘已显示在棋盘上方');
      });
      document.getElementById('btn-techniques')?.addEventListener('click', () => { AudioService.sfx.play('click'); this._toggleTechniqueEncyclopedia(); });
      document.getElementById('btn-tech-matrix')?.addEventListener('click', () => {
        AudioService.sfx.play('click');
        if (this._techMatrix) this._techMatrix.toggle();
      });
      document.getElementById('btn-settings')?.addEventListener('click', () => {
        AudioService.sfx.play('click');
        if (this._settingsPanel) {
          this._settingsPanel.toggle();
        }
      });
      document.getElementById('btn-achievement')?.addEventListener('click', () => {
        AudioService.sfx.play('click');
        if (this._achievementCoordinator) {
          this._achievementCoordinator.toggleAchievementPanel();
        }
      });
      document.getElementById('btn-gallery')?.addEventListener('click', () => {
        AudioService.sfx.play('click');
        if (this._achievementCoordinator) {
          this._achievementCoordinator.toggleGalleryPanel();
        }
      });
      document.getElementById('btn-chapter')?.addEventListener('click', () => {
        AudioService.sfx.play('click');
        if (this._chapterSelect) this._chapterSelect.show();
      });
      document.getElementById('btn-pause')?.addEventListener('click', () => {
        AudioService.sfx.play('click');
        this._togglePause();
      });

      // 暂停菜单按钮
      document.getElementById('btn-pause-resume')?.addEventListener('click', () => {
        AudioService.sfx.play('click');
        this._togglePause();
      });
      document.getElementById('btn-pause-restart')?.addEventListener('click', () => {
        AudioService.sfx.play('click');
        this._restartLevel();
      });
      document.getElementById('btn-pause-chapter')?.addEventListener('click', () => {
        AudioService.sfx.play('click');
        this._goToChapterSelect();
      });
      document.getElementById('btn-pause-menu')?.addEventListener('click', () => {
        AudioService.sfx.play('click');
        this._goToMainMenu();
      });
      document.getElementById('btn-pause-settings')?.addEventListener('click', () => {
        AudioService.sfx.play('click');
        if (this._settingsPanel) this._settingsPanel.show();
      });

      // 顶部Header菜单按钮（统一菜单 Bottom Sheet）
      const menuBtn = document.querySelector('.header-menu');
      if (menuBtn && typeof MenuSheet !== 'undefined') {
        const self = this;
        this._menuSheet = new MenuSheet({
          onAction: (action) => {
            AudioService.sfx.play('click');
            switch (action) {
              case 'chapter':
                document.getElementById('btn-chapter')?.click();
                break;
              case 'achievement':
                document.getElementById('btn-achievement')?.click();
                break;
              case 'gallery':
                // 图鉴按钮可能在工具栏，尝试调用
                if (self._achievementCoordinator && self._achievementCoordinator.galleryPanel) {
                  self._achievementCoordinator.showGalleryPanel();
                } else {
                  document.getElementById('btn-gallery')?.click();
                }
                break;
              case 'settings':
                document.getElementById('btn-settings')?.click();
                break;
            }
          }
        });
        window._guideMenuSheet = this._menuSheet;

        menuBtn.addEventListener('click', () => {
          AudioService.sfx.play('click');
          this._menuSheet.toggle();
        });
      }

      // 页面隐藏时自动暂停
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && !this._getIsPaused() && !this._getIsCompleted() && this._board) {
          this._showPauseMenu();
        }
      });
    }
  }

  // 暴露到全局
  global.EventBinder = EventBinder;

})(typeof window !== 'undefined' ? window : this);
