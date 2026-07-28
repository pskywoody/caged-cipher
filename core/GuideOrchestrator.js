// ============================================================
//  GuideOrchestrator.js - Guide 应用编排器
//  负责组装所有子模块实例，管理初始化顺序和依赖注入
// ============================================================

(function(global) {
  'use strict';

  /**
   * Guide 应用编排器
   * 集中管理所有子系统的初始化和依赖注入
   */
  class GuideOrchestrator {
    /**
     * @param {Object} ctx - 上下文对象（guide.js 的闭包状态引用）
     */
    constructor(ctx) {
      this.ctx = ctx;
      this.log = ctx.log;

      // 管理器实例
      this.levelStateManager = null;
      this.moduleInitializer = null;
      this.levelCompleter = null;
      this.hintManager = null;
      this.testHarness = null;
    }

    /**
     * 完整的应用启动流程
     */
    async bootstrap() {
      const ctx = this.ctx;
      const log = this.log;

      log.info('Guide mode starting...');

      // Init audio
      AudioService.init();

      // 页面进入动画
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const root = document.querySelector('.page-transition-root');
          if (root) {
            root.classList.add('page-enter-active');
            try {
              if (AudioService.sfx) AudioService.sfx.play('book_open', { volume: 0.5 });
            } catch(e) {}
            setTimeout(() => {
              root.classList.remove('page-enter', 'page-enter-active');
            }, 550);
          }
        });
      });

      // Init settings panel
      if (typeof SettingsPanel !== 'undefined') {
        ctx.settingsPanel = new SettingsPanel({
          onResetProgress: () => {
            if (global.ProgressManager) ProgressManager.reset();
          },
        });
        ctx.settingsPanel.load();
      }

      // P2-3: 初始化性能监控（FPS 检测 + 自动画质降级）
      if (typeof PerformanceMonitor !== 'undefined') {
        PerformanceMonitor.onQualityChange((newLevel, oldLevel, reason) => {
          // 当 renderer 存在时，同步画质等级
          if (ctx.renderer && typeof ctx.renderer.setQualityLevel === 'function') {
            ctx.renderer.setQualityLevel(newLevel);
          }
          // 更新 body 上的画质类，供 CSS 使用
          if (document.body) {
            document.body.classList.remove('quality-high', 'quality-medium', 'quality-low');
            document.body.classList.add('quality-' + newLevel);
          }
          log.info('[Performance] Quality: ' + oldLevel + ' -> ' + newLevel +
                   ' (' + reason + ', avgFps: ' + PerformanceMonitor.avgFps + ')');
        });

        // 启动性能监控（首次检测会在后台进行）
        PerformanceMonitor.start();

        // 如果 settings panel 已经加载了画质设置，应用它
        if (ctx.settingsPanel && ctx.settingsPanel.get) {
          const savedQuality = ctx.settingsPanel.get('display.quality');
          if (savedQuality && savedQuality !== 'auto') {
            PerformanceMonitor.setQualityLevel(savedQuality);
          }
        }
      }

      // GameContext 中央状态
      if (typeof initGameContext === 'function') {
        initGameContext({ logger: log });
      }

      // Init expert system
      ctx.expertSystem = new ExpertSystem();
      ctx.expertSystem.init({
        thresholds: { stuckMs: 45000 },
        onFeedback: (msg, level) => ctx.showToast(msg),
      });
      global.ExpertSystem = ctx.expertSystem;

      // Register character-based feedback handlers
      ExpertCharacterHandler.init({
        getExpertSystem: () => ctx.expertSystem,
        showCharacterBubble: ctx.showCharacterBubble,
        showToast: ctx.showToast,
        showAutoHint: ctx.showAutoHint,
        getLessonUICoordinator: () => ctx.lessonUICoordinator,
        getHintPlayerState: () => ctx.HintPlayerState,
        log: log,
      });
      ctx.registerExpertCharacterHandlers();

      // Get story engine
      ctx.storyEngine = global.StoryEngine;

      // Global click to advance story + unlock audio
      document.addEventListener('click', (e) => {
        if (typeof AudioService !== 'undefined') AudioService.unlock();
        if (ctx.storyEngine && ctx.storyEngine._isPlaying) {
          if (e.target.closest('button, .num-btn, #num-pad, #chapter-select-overlay')) return;
          ctx.storyEngine.nextDialogue();
        }
      });

      // Init progress
      if (global.ProgressManager) ProgressManager.load();

      // 检测调试模式
      const urlParams = new URLSearchParams(window.location.search);
      const idParam = urlParams.get('id');
      ctx._debugMode = urlParams.get('debug') === '1';
      if (ctx._debugMode) log.info('[Debug] 调试模式已启用');

      // 初始化管理器
      this.initManagers();

      // Setup chapter select
      this.setupChapterSelect();

      if (idParam) {
        ctx.currentLevelId = parseInt(idParam) || ctx.currentLevelId;
        await ctx.startLevel(ctx.currentLevelId);
      } else {
        if (ctx.chapterSelect) {
          await ctx.chapterSelect.loadChapters();
          ctx.chapterSelect.show();
        } else {
          await ctx.startLevel(101);
        }
      }
    }

    setupChapterSelect() {
      const ctx = this.ctx;
      if (!global.ChapterSelect) return;

      // 初始化成就协调器
      this.initAchievementCoordinator();
      if (ctx.achievementCoordinator) {
        ctx.achievementCoordinator.setupAchievementCallback();
      }

      ctx.chapterSelect = new ChapterSelect({
        onSelectLevel: function(levelId) {
          ctx.startedFromSelect = true;
          ctx.startLevel(levelId);
        },
      });

      // Toolbar chapter button
      const btnChapter = document.getElementById('btn-chapter');
      if (btnChapter) {
        btnChapter.addEventListener('click', () => {
          AudioService.sfx.play('click');
          if (ctx.chapterSelect) {
            ctx.chapterSelect._isVisible ? ctx.chapterSelect.hide() : ctx.chapterSelect.show();
          }
        });
      }

      // 初始化游戏计时器
      this.initGameTimer();

      // 初始化游戏流程控制器
      this.initGameController();
    }

    initBoard(levelData) {
      const ctx = this.ctx;
      const result = ctx.gameController.initBoard(levelData);
      // 同步 board/renderer 到 guide.js 闭包
      ctx.board = ctx.gameController.board;
      ctx.renderer = ctx.gameController.renderer;
      ctx.hintSystem = ctx.gameController.hintSystem;
      ctx.techMatrix = ctx.gameController.techMatrix;
      ctx.comboSystem = ctx.gameController.comboSystem;
      ctx.comedySystem = ctx.gameController.comedySystem;

      // 同步到三幕式引擎
      if (ctx.threeActEngine) {
        ctx.threeActEngine.setBoard(ctx.board);
        ctx.threeActEngine.setRenderer(ctx.renderer);
        ctx.threeActEngine.setStoryEngine(ctx.storyEngine);
        ctx.threeActEngine.setLevelData(ctx.currentLevelData);
        ctx.threeActEngine.setChapterData(ctx.currentChapterData);
      }
      if (ctx.bossCoordinator) {
        ctx.bossCoordinator.setBoard(ctx.board);
        ctx.bossCoordinator.setRenderer(ctx.renderer);
        ctx.bossCoordinator.setStoryEngine(ctx.storyEngine);
        ctx.bossCoordinator.setLevelData(ctx.currentLevelData);
        ctx.bossCoordinator.setChapterData(ctx.currentChapterData);
        ctx.bossCoordinator.setGameController(ctx.gameController);
      }
      if (StoryOrchestrator) {
        StoryOrchestrator.setBoard(ctx.board);
        StoryOrchestrator.setRenderer(ctx.renderer);
      }
      if (ctx.comboUI && ctx.gameController.comboSystem) {
        ctx.comboUI.bindComboSystem(ctx.gameController.comboSystem);
      }

      // 初始化各子系统
      this.initWhatIfManager();
      this.initHintPlayer();
      this.initNarrationSystem();
      return result;
    }

    showChapterTransition(callback) {
      const ctx = this.ctx;
      const transition = document.getElementById('chapter-transition');
      if (!transition) { if (callback) callback(); return; }
      const nextChapterId = ctx.currentChapterData.chapterId + 1;
      const nextChapter = ctx.findChapterById(nextChapterId);
      if (nextChapter) {
        document.getElementById('ct-title').textContent = nextChapter.title || '';
        document.getElementById('ct-subtitle').textContent = nextChapter.subtitle || '';
      }
      transition.style.display = 'flex';
      transition.style.opacity = '0';
      requestAnimationFrame(() => {
        transition.style.transition = 'opacity 0.8s ease';
        transition.style.opacity = '1';
      });
      setTimeout(() => {
        transition.style.opacity = '0';
        setTimeout(() => {
          transition.style.display = 'none';
          if (callback) callback();
        }, 800);
      }, 3000);
    }

    /**
     * 初始化所有管理器
     */
    initManagers() {
      const ctx = this.ctx;

      // 关卡状态管理器
      this.levelStateManager = new LevelStateManager({
        getBoard: () => ctx.board,
        getRenderer: () => ctx.renderer,
        getInputRouter: () => ctx.inputRouter,
        getComboSystem: () => ctx.comboSystem,
        getComboUI: () => ctx.comboUI,
        getComedySystem: () => ctx.comedySystem,
        getBossCoordinator: () => ctx.bossCoordinator,
        getLessonUICoordinator: () => ctx.lessonUICoordinator,
        getAchievementCoordinator: () => ctx.achievementCoordinator,
        getNoteMode: () => ctx.noteMode,
        setNoteMode: (v) => { ctx.noteMode = v; },
        getIsPaused: () => ctx.isPaused,
        setIsPaused: (v) => { ctx.isPaused = v; },
        updateNoteButtonState: ctx.updateNoteButtonState,
        hideCharBubble: () => CharBubble.hide(),
        hidePauseMenu: ctx.hidePauseMenu,
      });

      // 模块初始化器
      this.moduleInitializer = new ModuleInitializer({
        getBoard: () => ctx.board,
        getRenderer: () => ctx.renderer,
        getExpertSystem: () => ctx.expertSystem,
        getStoryEngine: () => ctx.storyEngine,
        getCurrentLevelData: () => ctx.currentLevelData,
        getCurrentChapterData: () => ctx.currentChapterData,
        getCurrentLevelId: () => ctx.currentLevelId,
        getNoteMode: () => ctx.noteMode,
        setNoteMode: (v) => { ctx.noteMode = v; },
        getHintCount: () => ctx.hintCount,
        addHintCount: (delta) => { ctx.hintCount += delta; },
        getUsedNotes: () => ctx.usedNotes,
        getIsCompleted: () => ctx.isCompleted,
        getIsPaused: () => ctx.isPaused,
        setIsPaused: (v) => { ctx.isPaused = v; },
        getChapterSelect: () => ctx.chapterSelect,
        getSettingsPanel: () => ctx.settingsPanel,
        getTechMatrix: () => ctx.techMatrix,
        getComboSystem: () => ctx.comboSystem,
        getComedySystem: () => ctx.comedySystem,
        getHintSystem: () => ctx.hintSystem,
        getGameTimer: () => ctx.gameTimer,
        getStartTime: () => ctx.startTime,
        log: this.log,
        AudioService: typeof AudioService !== 'undefined' ? AudioService : null,
        VIBRATE_PRESETS: ctx.VIBRATE_PRESETS,
        NAME_TO_CHAR: ctx.NAME_TO_CHAR,
        showToast: ctx.showToast,
        showCharacterBubble: ctx.showCharacterBubble,
        setUIVisible: ctx.setUIVisible,
        setInteractionLocked: ctx.setInteractionLocked,
        vibrate: ctx.vibrate,
        navigateTo: ctx.navigateTo,
        updateNoteButtonState: ctx.updateNoteButtonState,
        updateRule45Banner: ctx.updateRule45Banner,
        updateNumBtnCompletedState: ctx.updateNumBtnCompletedState,
        hidePauseMenu: ctx.hidePauseMenu,
        toggleNoteMode: ctx.toggleNoteMode,
        recordTechniqueUsage: ctx.recordTechniqueUsage,
        renderBoard: () => { if (ctx.renderer) ctx.renderer.render(ctx.board); },
        isLastLevelOfChapter: ctx.isLastLevelOfChapter,
        isFirstLevelOfChapter: ctx.isFirstLevelOfChapter,
        isLastChapterOfGame: ctx.isLastChapterOfGame,
        findChapter: ctx.findChapter,
        findChapterById: ctx.findChapterById,
        initRule45Banner: ctx.initRule45Banner,
        playClimaxAnimation: ctx.playClimaxAnimation,
        playClearDialog: ctx.playClearDialog,
        playChapterEpilogue: ctx.playChapterEpilogue,
        showChapterTransition: ctx.showChapterTransition,
        showGameEnding: ctx.showGameEnding,
        playPrologue: ctx.playPrologue,
        playPreDialog: ctx.playPreDialog,
        startBossBattle: ctx.startBossBattle,
        showSealUnlockAnimation: ctx.showSealUnlockAnimation,
        playFirstEncounterTeaching: ctx.playFirstEncounterTeaching,
        playHintAnimation: ctx.playHintAnimation,
        showFloatBar: ctx.showFloatBar,
        hideFloatBar: ctx.hideFloatBar,
        updateFloatBarTabIcon: ctx._updateFloatBarTabIcon,
        showAutoHint: ctx.showAutoHint,
        normalizeEvidence: ctx._normalizeEvidence,
        restartLevel: ctx.restartLevel,
        showCompleteOverlay: ctx._showCompleteOverlay,
        goToChapterSelect: ctx.goToChapterSelect,
        unlockBackground: ctx.unlockBackground,
        reinitBoardForBattle: ctx._reinitBoardForBattle,
        setLevelData: (data, levelId) => {
          ctx.currentLevelData = data;
          ctx.currentLevelId = levelId;
          if (ctx.gameController) {
            ctx.gameController.currentLevelData = data;
            ctx.gameController.currentLevelId = levelId;
          }
        },
        cleanupLevelState: ctx._cleanupLevelState,
        startLessonPlayer: ctx._startLessonPlayer,
        getTeachingSystem: () => global.guideTeachingSystem,
      });

      // 关卡完成流程管理器
      this.levelCompleter = new LevelCompleter({
        getBoard: () => ctx.board,
        getRenderer: () => ctx.renderer,
        getCurrentLevelData: () => ctx.currentLevelData,
        getCurrentLevelId: () => ctx.currentLevelId,
        getCurrentChapterData: () => ctx.currentChapterData,
        getChapterSelect: () => ctx.chapterSelect,
        getExpertSystem: () => ctx.expertSystem,
        getGameTimer: () => ctx.gameTimer,
        getHintCount: () => ctx.hintCount,
        getErrorCount: () => ctx.errorCount,
        getComedySystem: () => ctx.comedySystem,
        getIsCompleted: () => ctx.isCompleted,
        setIsCompleted: (v) => { ctx.isCompleted = v; },
        getIsBossBattleActive: () => typeof GuideBattle !== 'undefined' && (GuideBattle.active || GuideBattle.ended),
        isLastLevelOfChapter: ctx.isLastLevelOfChapter,
        AudioService: typeof AudioService !== 'undefined' ? AudioService : null,
        log: this.log,
        showToast: ctx.showToast,
        vibrate: ctx.vibrate,
        updateNumBtnCompletedState: ctx.updateNumBtnCompletedState,
        playClearDialog: ctx.playClearDialog,
        playClimaxAnimation: ctx.playClimaxAnimation,
        calculateGrade: ctx.calculateGrade,
        checkAchievements: ctx.checkAchievements,
        refreshAchievementPanel: () => {
          if (ctx.achievementCoordinator) ctx.achievementCoordinator.refreshAchievementPanel();
        },
        updateNextLevelButton: ctx.updateNextLevelButton,
        findChapterById: ctx.findChapterById,
      });

      // 提示管理器
      this.hintManager = new HintManager({
        getBoard: () => ctx.board,
        getRenderer: () => ctx.renderer,
        getHintSystem: () => ctx.hintSystem,
        getTechMatrix: () => ctx.techMatrix,
        getExpertSystem: () => ctx.expertSystem,
        getComedySystem: () => ctx.comedySystem,
        getAchievementCoordinator: () => ctx.achievementCoordinator,
        getWhatIfState: () => ctx.WhatIfState,
        getStoryEngine: () => ctx.storyEngine,
        getCurrentLevelData: () => ctx.currentLevelData,
        getCurrentChapterData: () => ctx.currentChapterData,
        getHintCount: () => ctx.hintCount,
        addHintCount: (delta) => { ctx.hintCount += delta; },
        AudioService: typeof AudioService !== 'undefined' ? AudioService : null,
        NAME_TO_CHAR: ctx.NAME_TO_CHAR,
        showToast: ctx.showToast,
        showCharacterBubble: ctx.showCharacterBubble,
        playFirstEncounterTeaching: ctx.playFirstEncounterTeaching,
        playHintAnimation: ctx.playHintAnimation,
        normalizeEvidence: ctx._normalizeEvidence,
      });

      // 测试接口
      this.testHarness = new TestHarness({
        getBoard: () => ctx.board,
        getRenderer: () => ctx.renderer,
        getCurrentLevelId: () => ctx.currentLevelId,
        setCurrentLevelId: (v) => { ctx.currentLevelId = v; },
        getCurrentLevelData: () => ctx.currentLevelData,
        getCurrentChapterData: () => ctx.currentChapterData,
        getGameTimer: () => ctx.gameTimer,
        getIsCompleted: () => ctx.isCompleted,
        setIsCompleted: (v) => { ctx.isCompleted = v; },
        getErrorCount: () => ctx.errorCount,
        setErrorCount: (v) => { ctx.errorCount = v; },
        getHintCount: () => ctx.hintCount,
        setHintCount: (v) => { ctx.hintCount = v; },
        getUsedNotes: () => ctx.usedNotes,
        setUsedNotes: (v) => { ctx.usedNotes = v; },
        loadLevel: ctx.loadLevel,
        findChapter: ctx.findChapter,
        initBoard: ctx.initBoard,
        setInteractionLocked: ctx.setInteractionLocked,
        cleanupLevelState: ctx._cleanupLevelState,
      });
      this.testHarness.mountToGlobal();

      // 同步引用到 ctx
      ctx.levelStateManager = this.levelStateManager;
      ctx.moduleInitializer = this.moduleInitializer;
      ctx.levelCompleter = this.levelCompleter;
      ctx.hintManager = this.hintManager;
      ctx.testHarness = this.testHarness;
    }

    // === 初始化函数转发 ===
    initGameController() {
      this.initAchievementCoordinator();
      const gc = this.moduleInitializer.initGameController();
      const ctx = this.ctx;
      ctx.gameController = gc;
      ctx.threeActEngine = this.moduleInitializer.threeActEngine;
      ctx.bossCoordinator = this.moduleInitializer.bossCoordinator;
      ctx.comboUI = this.moduleInitializer.comboUI;
      ctx.heatmapManager = this.moduleInitializer.heatmapManager;
      ctx.techniqueEncyclopedia = this.moduleInitializer.techniqueEncyclopedia;
      ctx.levelFeatureApplier = this.moduleInitializer.levelFeatureApplier;
    }

    initAchievementCoordinator() {
      const ac = this.moduleInitializer.initAchievementCoordinator();
      if (ac) this.ctx.achievementCoordinator = ac;
    }

    initAutoHintSystem() {
      const ahs = this.moduleInitializer.initAutoHintSystem();
      if (ahs) this.ctx.autoHintSystem = ahs;
    }

    initWhatIfManager() {
      const wim = this.moduleInitializer.initWhatIfManager();
      if (wim) {
        this.ctx.whatIfManager = wim;
        this.ctx.WhatIfState = wim;
      }
    }

    initHintPlayer() {
      this.moduleInitializer.initHintPlayer();
    }

    initLessonUICoordinator() {
      const luc = this.moduleInitializer.initLessonUICoordinator();
      if (luc) this.ctx.lessonUICoordinator = luc;
    }

    initNarrationSystem() {
      this.moduleInitializer.initNarrationSystem();
    }

    initGameTimer() {
      const gt = this.moduleInitializer.initGameTimer();
      if (gt) this.ctx.gameTimer = gt;
    }

    // === 状态管理转发 ===
    cleanupLevelState() {
      this.levelStateManager.cleanupLevelState();
    }

    reinitBoardForBattle() {
      const ctx = this.ctx;
      const newBoard = this.levelStateManager.reinitBoardForBattle(
        ctx.currentLevelData, ctx.currentLevelId, ctx.renderer,
        {
          storyOrchestrator: StoryOrchestrator,
          threeActEngine: ctx.threeActEngine,
          bossCoordinator: ctx.bossCoordinator,
        }
      );
      if (newBoard) ctx.board = newBoard;
    }
  }

  // 导出到全局
  global.GuideOrchestrator = GuideOrchestrator;

})(window);
