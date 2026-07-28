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

      // ============================================================
      //  P0 加固：每个模块独立 try-catch + 降级空实现
      //  确保单个模块失败不会导致整个应用崩溃
      // ============================================================

      // --- 1. AudioService 音频服务 ---
      try {
        if (typeof AudioService !== 'undefined' && AudioService.init) {
          AudioService.init();
        } else {
          throw new Error('AudioService not available');
        }
      } catch (e) {
        console.warn('[FALLBACK] AudioService 初始化失败，使用空实现降级', e);
        // 降级空实现
        global.AudioService = {
          sfx: { play: function(){} },
          bgm: { play: function(){}, stop: function(){} },
          voice: { play: function(){} },
          duck: function(){},
          unlock: function(){},
          init: function(){},
        };
      }

      // 页面进入动画
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const root = document.querySelector('.page-transition-root');
          if (root) {
            root.classList.add('page-enter-active');
            try {
              if (AudioService && AudioService.sfx) AudioService.sfx.play('book_open', { volume: 0.5 });
            } catch(e) {}
            setTimeout(() => {
              root.classList.remove('page-enter', 'page-enter-active');
            }, 550);
          }
        });
      });

      // --- 2. SettingsPanel 设置面板 ---
      try {
        if (typeof SettingsPanel !== 'undefined') {
          ctx.settingsPanel = new SettingsPanel({
            onResetProgress: () => {
              if (global.ProgressManager) ProgressManager.reset();
            },
          });
          ctx.settingsPanel.load();
        }
      } catch (e) {
        console.warn('[FALLBACK] SettingsPanel 初始化失败，降级', e);
        ctx.settingsPanel = {
          get: function() { return null; },
          set: function() {},
          load: function() {},
        };
      }

      // --- 3. PerformanceMonitor 性能监控 ---
      try {
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
      } catch (e) {
        console.warn('[FALLBACK] PerformanceMonitor 初始化失败，降级', e);
        // 降级：提供 getQualityLevel 空实现
        if (typeof PerformanceMonitor === 'undefined') {
          global.PerformanceMonitor = {
            start: function(){},
            onQualityChange: function(){},
            setQualityLevel: function(){},
            getQualityLevel: function() { return 'high'; },
            avgFps: 60,
          };
        }
      }

      // --- 4. GameContext 中央状态 ---
      try {
        if (typeof initGameContext === 'function') {
          initGameContext({ logger: log });
        } else {
          throw new Error('initGameContext function not found');
        }
      } catch (e) {
        console.warn('[FALLBACK] GameContext 初始化失败，使用空实现降级', e);
        // 降级空实现
        if (!global.GameContext) {
          global.GameContext = {
            player: {},
            level: {},
            decision: {},
            learning: {},
            isInCooldown: function() { return false; },
            setCooldown: function() {},
            updatePlayer: function() {},
            updateLevel: function() {},
          };
        }
      }

      // --- 5. ExpertSystem 专家系统 ---
      try {
        if (typeof ExpertSystem !== 'undefined') {
          ctx.expertSystem = new ExpertSystem();
          ctx.expertSystem.init({
            thresholds: { stuckMs: 45000 },
            onFeedback: (msg, level) => ctx.showToast(msg),
          });
          global.ExpertSystem = ctx.expertSystem;
        } else {
          throw new Error('ExpertSystem class not found');
        }
      } catch (e) {
        console.warn('[FALLBACK] ExpertSystem 初始化失败，使用空实现降级', e);
        ctx.expertSystem = {
          onFillCorrect: function(){},
          onFillWrong: function(){},
          onNote: function(){},
          onHint: function(){},
          decide: function() { return []; },
          evaluateFromContext: function() { return []; },
          init: function(){},
          setGridSize: function(){},
        };
        global.ExpertSystem = ctx.expertSystem;
      }

      // --- 6. ExpertCharacterHandler 角色反馈 ---
      try {
        if (typeof ExpertCharacterHandler !== 'undefined' && ExpertCharacterHandler.init) {
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
        }
      } catch (e) {
        console.warn('[FALLBACK] ExpertCharacterHandler 初始化失败，跳过', e);
      }

      // --- 7. StoryEngine 剧情引擎 ---
      try {
        if (global.StoryEngine) {
          ctx.storyEngine = global.StoryEngine;
        } else {
          throw new Error('StoryEngine not available');
        }
      } catch (e) {
        console.warn('[FALLBACK] StoryEngine 不可用，使用空实现降级', e);
        ctx.storyEngine = {
          play: function() { return Promise.resolve(); },
          isPlaying: function() { return false; },
          stop: function() {},
          nextDialogue: function() {},
          _isPlaying: false,
        };
        global.StoryEngine = ctx.storyEngine;
      }

      // Global click to advance story + unlock audio
      document.addEventListener('click', (e) => {
        try {
          if (typeof AudioService !== 'undefined' && AudioService.unlock) AudioService.unlock();
        } catch(e) {}
        try {
          if (ctx.storyEngine && ctx.storyEngine._isPlaying) {
            if (e.target.closest && e.target.closest('button, .num-btn, #num-pad, #chapter-select-overlay')) return;
            if (ctx.storyEngine.nextDialogue) ctx.storyEngine.nextDialogue();
          }
        } catch(e) {}
      });

      // --- 8. ProgressManager 进度管理 ---
      try {
        if (global.ProgressManager && ProgressManager.load) {
          ProgressManager.load();
        }
      } catch (e) {
        console.warn('[FALLBACK] ProgressManager 加载失败，降级', e);
        if (!global.ProgressManager) {
          global.ProgressManager = {
            load: function(){},
            save: function(){},
            reset: function(){},
            _data: { levelScores: {} },
          };
        }
      }

      // 检测调试模式
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const idParam = urlParams.get('id');
        ctx._debugMode = urlParams.get('debug') === '1';
        if (ctx._debugMode) log.info('[Debug] 调试模式已启用');
      } catch (e) {
        ctx._debugMode = false;
      }

      // --- 9. 初始化管理器（核心：initManagers） ---
      try {
        this.initManagers();
      } catch (e) {
        console.error('[FATAL FALLBACK] initManagers 失败，尝试降级启动', e);
        // 确保至少有 moduleInitializer 的降级版本
        if (!this.moduleInitializer) {
          this.moduleInitializer = {
            initGameController: function() { return null; },
            initAchievementCoordinator: function() { return null; },
            initAutoHintSystem: function() { return null; },
            initWhatIfManager: function() { return null; },
            initHintPlayer: function() {},
            initLessonUICoordinator: function() { return null; },
            initNarrationSystem: function() {},
            initGameTimer: function() { return null; },
          };
          ctx.moduleInitializer = this.moduleInitializer;
        }
      }

      // --- 10. Setup chapter select ---
      try {
        this.setupChapterSelect();
      } catch (e) {
        console.warn('[FALLBACK] setupChapterSelect 失败，跳过章节选择', e);
        ctx.chapterSelect = null;
      }

      // --- 11. 启动关卡 ---
      try {
        const urlParams2 = new URLSearchParams(window.location.search);
        const idParam2 = urlParams2.get('id');
        if (idParam2) {
          ctx.currentLevelId = parseInt(idParam2) || ctx.currentLevelId;
          await ctx.startLevel(ctx.currentLevelId);
        } else {
          if (ctx.chapterSelect) {
            await ctx.chapterSelect.loadChapters();
            ctx.chapterSelect.show();
          } else {
            await ctx.startLevel(101);
          }
        }
      } catch (e) {
        console.error('[FATAL FALLBACK] 关卡启动失败', e);
        // 显示错误提示
        try {
          if (ctx.showToast) ctx.showToast('关卡加载失败，请刷新重试');
        } catch(e2) {}
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
