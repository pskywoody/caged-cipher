// ============================================================
//  ModuleInitializer.js - 模块初始化器
//  集中管理所有子模块的初始化逻辑，统一注入依赖
//  包括：GameController, AchievementCoordinator, AutoHintSystem,
//        WhatIfManager, HintPlayer, LessonUICoordinator,
//        ThreeActEngine, BossCoordinator, StoryOrchestrator 等
// ============================================================

(function(global) {
  'use strict';

  /**
   * 模块初始化器
   * 统一管理所有子系统的初始化顺序和依赖注入
   */
  class ModuleInitializer {
    /**
     * @param {Object} deps - 依赖注入对象
     * @param {Function} deps.getBoard - 获取 board
     * @param {Function} deps.getRenderer - 获取 renderer
     * @param {Function} deps.getExpertSystem - 获取 expertSystem
     * @param {Function} deps.getStoryEngine - 获取 storyEngine
     * @param {Function} deps.getCurrentLevelData - 获取 currentLevelData
     * @param {Function} deps.getCurrentChapterData - 获取 currentChapterData
     * @param {Function} deps.getCurrentLevelId - 获取 currentLevelId
     * @param {Function} deps.getNoteMode - 获取 noteMode
     * @param {Function} deps.setNoteMode - 设置 noteMode
     * @param {Function} deps.getHintCount - 获取 hintCount
     * @param {Function} deps.addHintCount - 增加 hintCount
     * @param {Function} deps.getUsedNotes - 获取 usedNotes
     * @param {Function} deps.getIsCompleted - 获取 isCompleted
     * @param {Function} deps.getIsPaused - 获取 isPaused
     * @param {Function} deps.setIsPaused - 设置 isPaused
     * @param {Function} deps.getChapterSelect - 获取 chapterSelect
     * @param {Function} deps.getSettingsPanel - 获取 settingsPanel
     * @param {Function} deps.getTechMatrix - 获取 techMatrix
     * @param {Function} deps.getComboSystem - 获取 comboSystem
     * @param {Function} deps.getComedySystem - 获取 comedySystem
     * @param {Function} deps.getHintSystem - 获取 hintSystem
     * @param {Function} deps.getGameTimer - 获取 gameTimer
     * @param {Function} deps.getStartTime - 获取 startTime
     * @param {Object} deps.log - Logger 实例
     * @param {Object} deps.AudioService - 音频服务
     * @param {Object} deps.VIBRATE_PRESETS - 震动预设
     * @param {Object} deps.NAME_TO_CHAR - 角色名映射
     * @param {Function} deps.showToast - 显示 Toast
     * @param {Function} deps.showCharacterBubble - 显示角色气泡
     * @param {Function} deps.setUIVisible - 设置 UI 可见性
     * @param {Function} deps.setInteractionLocked - 设置交互锁定
     * @param {Function} deps.vibrate - 震动函数
     * @param {Function} deps.navigateTo - 页面导航
     * @param {Function} deps.updateNoteButtonState - 更新笔记按钮状态
     * @param {Function} deps.updateRule45Banner - 更新 Rule45 横幅
     * @param {Function} deps.updateNumBtnCompletedState - 更新数字按钮完成状态
     * @param {Function} deps.hidePauseMenu - 隐藏暂停菜单
     * @param {Function} deps.toggleNoteMode - 切换笔记模式
     * @param {Function} deps.recordTechniqueUsage - 记录技巧使用
     * @param {Function} deps.renderBoard - 渲染棋盘
     * @param {Function} deps.isLastLevelOfChapter - 是否章节最后一关
     * @param {Function} deps.isFirstLevelOfChapter - 是否章节第一关
     * @param {Function} deps.isLastChapterOfGame - 是否游戏最后一章
     * @param {Function} deps.findChapter - 查找章节
     * @param {Function} deps.findChapterById - 按 ID 查找章节
     * @param {Function} deps.initRule45Banner - 初始化 Rule45 横幅
     * @param {Function} deps.playClimaxAnimation - 播放高潮动画
     * @param {Function} deps.playClearDialog - 播放通关对话
     * @param {Function} deps.playChapterEpilogue - 播放章节尾声
     * @param {Function} deps.showChapterTransition - 显示章节转场
     * @param {Function} deps.showGameEnding - 显示游戏结局
     * @param {Function} deps.playPrologue - 播放序章
     * @param {Function} deps.playPreDialog - 播放前置对话
     * @param {Function} deps.startBossBattle - 开始 Boss 战
     * @param {Function} deps.showSealUnlockAnimation - 显示印章解锁动画
     * @param {Function} deps.playFirstEncounterTeaching - 播放首次教学
     * @param {Function} deps.playHintAnimation - 播放提示动画
     * @param {Function} deps.showFloatBar - 显示浮条
     * @param {Function} deps.hideFloatBar - 隐藏浮条
     * @param {Function} deps.updateFloatBarTabIcon - 更新浮条标签图标
     * @param {Function} deps.showAutoHint - 显示自动提示
     * @param {Function} deps.normalizeEvidence - 规范化证据
     * @param {Function} deps.restartLevel - 重启关卡
     * @param {Function} deps.showCompleteOverlay - 显示完成遮罩
     * @param {Function} deps.goToChapterSelect - 前往章节选择
     * @param {Function} deps.unlockBackground - 解锁背景
     * @param {Function} deps.reinitBoardForBattle - 重初始化对战棋盘
     * @param {Function} deps.setLevelData - 设置关卡数据
     * @param {Function} deps.cleanupLevelState - 清理关卡状态
     * @param {Function} deps.startLessonPlayer - 启动教学播放器
     * @param {Function} deps.getTeachingSystem - 获取教学系统
     */
    constructor(deps) {
      this.deps = deps;
      this.log = deps.log;

      // 实例引用
      this.gameController = null;
      this.achievementCoordinator = null;
      this.autoHintSystem = null;
      this.whatIfManager = null;
      this.lessonUICoordinator = null;
      this.threeActEngine = null;
      this.bossCoordinator = null;
      this.comboUI = null;
      this.heatmapManager = null;
      this.techniqueEncyclopedia = null;
      this.levelFeatureApplier = null;
      this.pauseManagerInitialized = false;
      this.endingManagerInitialized = false;
    }

    // ============================================================
    //  GameController 初始化
    // ============================================================
    initGameController() {
      const deps = this.deps;

      // --- 三幕式引擎 ---
      try {
        if (global.ThreeActEngine && !this.threeActEngine) {
          this.threeActEngine = new ThreeActEngine({
            setInteractionLocked: deps.setInteractionLocked,
            showCharacterBubble: deps.showCharacterBubble,
            isLastLevelOfChapter: deps.isLastLevelOfChapter,
          });
          // 向后兼容：ThreeActGuide 变量指向实例
          global.ThreeActGuide = this.threeActEngine;
        }
      } catch (e) {
        console.warn('[FALLBACK] ThreeActEngine 初始化失败，使用空实现降级', e);
        this.threeActEngine = {
          init: function(){},
          update: function(){},
          getCurrentAct: function() { return 1; },
          getActParams: function() {
            return { aiSpeedMultiplier: 1, hintCooldownMultiplier: 1, comboMultiplier: 1 };
          },
          setBoard: function(){},
          setRenderer: function(){},
          setStoryEngine: function(){},
          setLevelData: function(){},
          setChapterData: function(){},
        };
        global.ThreeActGuide = this.threeActEngine;
      }

      // --- Boss 战协调器 ---
      try {
        if (global.BossCoordinator && !this.bossCoordinator) {
          this.bossCoordinator = new BossCoordinator({
            setInteractionLocked: deps.setInteractionLocked,
            restartLevel: deps.restartLevel,
            showCompleteOverlay: deps.showCompleteOverlay,
            goToChapterSelect: deps.goToChapterSelect,
            unlockBackground: deps.unlockBackground,
            reinitBoardForBattle: deps.reinitBoardForBattle,
            getChapterData: deps.getCurrentChapterData,
            getLevelData: deps.getCurrentLevelData,
            setLevelData: deps.setLevelData,
          });
        }
      } catch (e) {
        console.warn('[FALLBACK] BossCoordinator 初始化失败，使用空实现降级', e);
        this.bossCoordinator = {
          startBattle: function(){},
          endBattle: function(){},
          isActive: function() { return false; },
          setBoard: function(){},
          setRenderer: function(){},
          setStoryEngine: function(){},
          setLevelData: function(){},
          setChapterData: function(){},
          setGameController: function(){},
        };
      }

      // --- 连击 UI 控制器 ---
      try {
        if (global.ComboUIController && !this.comboUI) {
          this.comboUI = new ComboUIController();
          global.comboUI = this.comboUI;
        }
      } catch (e) {
        console.warn('[FALLBACK] ComboUIController 初始化失败，降级', e);
        this.comboUI = {
          bindComboSystem: function(){},
          showMilestone: function(){},
        };
        global.comboUI = this.comboUI;
      }

      // --- 剧情编排器 ---
      try {
        if (global.StoryOrchestrator && StoryOrchestrator.init) {
          StoryOrchestrator.init({
            storyEngine: deps.getStoryEngine(),
            galleryPanel: this.achievementCoordinator ? this.achievementCoordinator.galleryPanel : null,
            renderer: deps.getRenderer(),
            board: deps.getBoard(),
            AudioService: deps.AudioService,
            getCurrentLevelData: deps.getCurrentLevelData,
            getCurrentChapterData: deps.getCurrentChapterData,
            getCurrentLevelId: deps.getCurrentLevelId,
            setUIVisible: deps.setUIVisible,
            setInteractionLocked: deps.setInteractionLocked,
          });
        }
      } catch (e) {
        console.warn('[FALLBACK] StoryOrchestrator 初始化失败，跳过', e);
      }

      // --- 热力图管理器 ---
      try {
        if (global.HeatmapManager && !this.heatmapManager) {
          this.heatmapManager = new HeatmapManager({
            getBoard: deps.getBoard,
            getRenderer: deps.getRenderer,
            getCurrentLevelData: deps.getCurrentLevelData,
            getCurrentLevelId: deps.getCurrentLevelId,
            isLastLevelOfChapter: deps.isLastLevelOfChapter,
            showToast: deps.showToast,
            log: this.log,
          });
        }
      } catch (e) {
        console.warn('[FALLBACK] HeatmapManager 初始化失败，降级', e);
        this.heatmapManager = null;
      }

      // --- 技巧图鉴 ---
      try {
        if (global.TechniqueEncyclopedia && !this.techniqueEncyclopedia) {
          this.techniqueEncyclopedia = new TechniqueEncyclopedia({
            getTeachingSystem: deps.getTeachingSystem,
            onVisibilityChange: (visible) => {
              EventLogger.log('game:techniques', { visible: visible });
            },
          });
        }
      } catch (e) {
        console.warn('[FALLBACK] TechniqueEncyclopedia 初始化失败，降级', e);
        this.techniqueEncyclopedia = null;
      }

      // --- 关卡特性应用器 ---
      try {
        if (global.LevelFeatureApplier && !this.levelFeatureApplier) {
          this.levelFeatureApplier = new LevelFeatureApplier({
            getCurrentLevelData: deps.getCurrentLevelData,
            getCurrentLevelId: deps.getCurrentLevelId,
            getRenderer: deps.getRenderer,
            getBoard: deps.getBoard,
            getSettingsPanel: deps.getSettingsPanel,
            getNoteMode: deps.getNoteMode,
            setNoteMode: deps.setNoteMode,
            updateNoteButtonState: deps.updateNoteButtonState,
          });
        }
      } catch (e) {
        console.warn('[FALLBACK] LevelFeatureApplier 初始化失败，降级', e);
        this.levelFeatureApplier = null;
      }

      // --- 创建 GameController（核心，失败则降级） ---
      try {
        this.gameController = new GameController({
        // 系统对象
        LevelLoader: global.LevelLoader,
        AudioService: deps.AudioService,
        ProgressManager: global.ProgressManager,
        BoardClass: global.Board,
        RendererClass: global.Renderer,
        HintSystemClass: global.HintSystem,
        TeachingSystemClass: global.TeachingSystem,
        NoteSystemClass: global.NoteSystem,
        TechMatrixClass: global.TechMatrix,
        TechRaterClass: global.TechRater,
        ComboSystemClass: global.ComboSystem,
        ComedySystemClass: global.ComedySystem,
        GameTimerClass: global.GameTimer,
        ChapterSelectClass: global.ChapterSelect,
        AchievementPanelClass: global.AchievementPanel,
        GalleryPanelClass: global.GalleryPanel,
        SealAnimationInstance: global.SealAnimationInstance,
        WinConditionManager: global.WinConditionManager,
        ThreeActGuide: this.threeActEngine,
        GuideBattle: global.GuideBattle,
        Rule45Class: global.Rule45,
        GameContext: global.GameContext,

        // 引用对象
        board: deps.getBoard(),
        renderer: deps.getRenderer(),
        expertSystem: deps.getExpertSystem(),
        comboSystem: deps.getComboSystem(),
        comedySystem: deps.getComedySystem(),
        storyEngine: deps.getStoryEngine(),
        hintSystem: deps.getHintSystem(),
        gameTimer: deps.getGameTimer(),
        chapterSelect: deps.getChapterSelect(),
        achievementPanel: this.achievementCoordinator ? this.achievementCoordinator.achievementPanel : null,
        settingsPanel: deps.getSettingsPanel(),
        galleryPanel: this.achievementCoordinator ? this.achievementCoordinator.galleryPanel : null,
        techMatrix: deps.getTechMatrix(),
        lessonPlayer: null,
        whatIfManager: null,

        // 回调
        onShowToast: deps.showToast,
        onVibrate: (presetName) => {
          if (presetName === 'ERROR') deps.vibrate(deps.VIBRATE_PRESETS.ERROR);
          else if (deps.VIBRATE_PRESETS[presetName]) deps.vibrate(deps.VIBRATE_PRESETS[presetName]);
        },
        onSetUIVisible: deps.setUIVisible,
        onSetInteractionLocked: deps.setInteractionLocked,
        onUpdateRule45Banner: deps.updateRule45Banner,
        onResetRule45Banner: () => UIManager.resetRule45Banner(),
        onUpdateNumBtnCompletedState: deps.updateNumBtnCompletedState,
        onUpdateNoteButtonState: deps.updateNoteButtonState,
        onHidePauseMenu: deps.hidePauseMenu,
        onNavigateTo: deps.navigateTo,
        onCleanupLevelState: deps.cleanupLevelState,
        onStartLessonPlayer: deps.startLessonPlayer,
        onIsFirstLevelOfChapter: deps.isFirstLevelOfChapter,
        onIsLastLevelOfChapter: deps.isLastLevelOfChapter,
        onIsLastChapterOfGame: deps.isLastChapterOfGame,
        onFindChapter: deps.findChapter,
        onFindChapterById: deps.findChapterById,
        onInitRule45Banner: deps.initRule45Banner,
        onPlayClimaxAnimation: deps.playClimaxAnimation,
        onPlayClearDialog: deps.playClearDialog,
        onPlayChapterEpilogue: deps.playChapterEpilogue,
        onShowChapterTransition: deps.showChapterTransition,
        onShowGameEnding: deps.showGameEnding,
        onPlayPrologue: deps.playPrologue,
        onPlayPreDialog: deps.playPreDialog,
        onStartBossBattle: deps.startBossBattle,
        onShowSealUnlockAnimation: deps.showSealUnlockAnimation,
        onComboMilestone: (level, milestone) => {
          if (milestone.vibrate && deps.VIBRATE_PRESETS[milestone.vibrate]) {
            deps.vibrate(deps.VIBRATE_PRESETS[milestone.vibrate]);
          }
          if (this.comboUI && this.comboUI.showMilestone) {
            this.comboUI.showMilestone(level, milestone);
          }
        },
        onUpdateFloatBarTabIcon: deps.updateFloatBarTabIcon,

        // 日志
        log: this.log,
      });

        // 初始化 PauseManager
        if (global.PauseManager && !this.pauseManagerInitialized) {
          try {
            PauseManager.init({
              isPaused: deps.getIsPaused,
              setPaused: deps.setIsPaused,
              isCompleted: deps.getIsCompleted,
              getBoard: deps.getBoard,
              getGameTimer: deps.getGameTimer,
              getExpertSystem: deps.getExpertSystem,
              getStartTime: deps.getStartTime,
              getGameController: () => this.gameController,
              getSettingsPanel: deps.getSettingsPanel,
              AudioService: deps.AudioService,
            });
            this.pauseManagerInitialized = true;
          } catch (e) {
            console.warn('[FALLBACK] PauseManager 初始化失败，跳过', e);
          }
        }

        // 初始化 EndingManager
        if (global.EndingManager && !this.endingManagerInitialized) {
          try {
            EndingManager.init({
              getCurrentChapterData: deps.getCurrentChapterData,
              getChapterSelect: deps.getChapterSelect,
              getProgressManager: () => global.ProgressManager,
            });
            this.endingManagerInitialized = true;
          } catch (e) {
            console.warn('[FALLBACK] EndingManager 初始化失败，跳过', e);
          }
        }

      } catch (e) {
        console.error('[FATAL FALLBACK] GameController 初始化失败，使用最小降级', e);
        // GameController 失败时，至少保证 gameController 不为 null，提供最小接口
        this.gameController = {
          board: null,
          renderer: null,
          hintSystem: {
            getHint: function() { return null; },
            getHintCount: function() { return 0; },
            useHint: function() { return false; },
          },
          comboSystem: {
            onCorrectFill: function(){},
            onWrongFill: function(){},
            onErase: function(){},
            reset: function(){},
            getFlowState: function() { return 'cold'; },
            getCombo: function() { return 0; },
          },
          comedySystem: {
            onFirstNote: function(){},
            onCombo: function(){},
            onError: function(){},
            onBossDefeated: function(){},
          },
          loadLevel: function() { return Promise.reject(new Error('GameController degraded')); },
          startLevel: function() { return Promise.reject(new Error('GameController degraded')); },
          initBoard: function() {},
        };
      }

      return this.gameController;
    }

    // ============================================================
    //  AchievementCoordinator 初始化
    // ============================================================
    initAchievementCoordinator() {
      if (!global.AchievementCoordinator) return null;
      if (this.achievementCoordinator) return this.achievementCoordinator;

      const deps = this.deps;

      this.achievementCoordinator = new AchievementCoordinator({
        getNameToChar: () => deps.NAME_TO_CHAR,
        getBoard: deps.getBoard,
        getChapterData: deps.getCurrentChapterData,
        getLevelData: deps.getCurrentLevelData,
        getChapterSelect: deps.getChapterSelect,
        getUsedNotes: deps.getUsedNotes,
        setUIVisible: deps.setUIVisible,
        setInteractionLocked: deps.setInteractionLocked,
        vibrate: (presetName) => {
          if (presetName === 'CLIMAX') deps.vibrate(deps.VIBRATE_PRESETS.CLIMAX);
          else if (deps.VIBRATE_PRESETS[presetName]) deps.vibrate(deps.VIBRATE_PRESETS[presetName]);
        },
      });

      // 初始化面板
      this.achievementCoordinator.initAchievementPanel();
      this.achievementCoordinator.initGalleryPanel();

      // 向后兼容：全局暴露面板引用
      Object.defineProperty(global, 'guideAchievementPanel', {
        get: () => this.achievementCoordinator ? this.achievementCoordinator.achievementPanel : null,
        configurable: true,
      });
      Object.defineProperty(global, 'guideGalleryPanel', {
        get: () => this.achievementCoordinator ? this.achievementCoordinator.galleryPanel : null,
        configurable: true,
      });

      return this.achievementCoordinator;
    }

    // ============================================================
    //  AutoHintSystem 初始化
    // ============================================================
    initAutoHintSystem() {
      if (!global.AutoHintSystem) return null;
      if (this.autoHintSystem) return this.autoHintSystem;

      const deps = this.deps;

      this.autoHintSystem = new AutoHintSystem({
        getHintSystem: deps.getHintSystem,
        getWhatIfState: () => this.whatIfManager,
        getLessonUICoordinator: () => this.lessonUICoordinator,
        isLastLevelOfChapter: deps.isLastLevelOfChapter,
        isBossBattleStarted: () => global.bossBattleStarted,
        getExpertSystem: deps.getExpertSystem,
        getGameContext: () => global.GameContext,
        getComedySystem: deps.getComedySystem,
        getAchievementCoordinator: () => this.achievementCoordinator,
        getHintCount: deps.getHintCount,
        addHintCount: deps.addHintCount,
        getProgressManager: () => global.ProgressManager,
        getCurrentChapterData: deps.getCurrentChapterData,
        getCurrentLevelData: deps.getCurrentLevelData,
        getRenderer: deps.getRenderer,
        getBoard: deps.getBoard,
        getStoryEngine: deps.getStoryEngine,
        playFirstEncounterTeaching: deps.playFirstEncounterTeaching,
        playHintAnimation: deps.playHintAnimation,
        getTechMatrix: deps.getTechMatrix,
        normalizeEvidence: deps.normalizeEvidence,
        showCharacterBubble: deps.showCharacterBubble,
      });

      return this.autoHintSystem;
    }

    // ============================================================
    //  WhatIfManager 初始化
    // ============================================================
    initWhatIfManager() {
      if (!global.WhatIfManager) return this._getWhatIfFallback();
      if (this.whatIfManager) return this.whatIfManager;

      const deps = this.deps;

      try {
        this.whatIfManager = new WhatIfManager({
          board: deps.getBoard(),
          renderer: deps.getRenderer(),
          techMatrix: deps.getTechMatrix(),
          lessonPlayer: null,
          AudioService: deps.AudioService,
          onShowToast: deps.showToast,
          onUpdateRule45Banner: deps.updateRule45Banner,
          isCompleted: deps.getIsCompleted,
          isStoryPlaying: () => {
            const se = deps.getStoryEngine();
            return se && se._isPlaying;
          },
          onUpdateFloatBarTabIcon: deps.updateFloatBarTabIcon,
        });

        // 同步到 gameController
        if (this.gameController) {
          this.gameController.whatIfManager = this.whatIfManager;
        }
      } catch (e) {
        console.warn('[FALLBACK] WhatIfManager 初始化失败，使用空实现降级', e);
        this.whatIfManager = this._getWhatIfFallback();
      }

      return this.whatIfManager;
    }

    /**
     * WhatIfManager 降级空实现
     */
    _getWhatIfFallback() {
      return {
        enterMode: function(){},
        exitMode: function(){},
        isActive: function() { return false; },
        addSnapshot: function(){},
      };
    }

    // ============================================================
    //  HintPlayer 初始化
    // ============================================================
    initHintPlayer() {
      if (!global.HintPlayer) return;

      const deps = this.deps;

      HintPlayer.init({
        getRenderer: deps.getRenderer,
        getTechMatrix: deps.getTechMatrix,
        getWhatIfState: () => this.whatIfManager,
        getAudioService: () => deps.AudioService,
        showCharacterBubble: deps.showCharacterBubble,
        showFloatBar: deps.showFloatBar,
        hideFloatBar: deps.hideFloatBar,
        updateFloatBarTabIcon: deps.updateFloatBarTabIcon,
      });
    }

    // ============================================================
    //  LessonUICoordinator 初始化
    // ============================================================
    initLessonUICoordinator() {
      if (!global.LessonUICoordinator) return null;
      if (this.lessonUICoordinator) return this.lessonUICoordinator;

      const deps = this.deps;

      this.lessonUICoordinator = new LessonUICoordinator({
        getBoard: deps.getBoard,
        getRenderer: deps.getRenderer,
        getCurrentLevelData: deps.getCurrentLevelData,
        getNoteMode: deps.getNoteMode,
        toggleNoteMode: deps.toggleNoteMode,
        recordTechniqueUsage: deps.recordTechniqueUsage,
        renderBoard: deps.renderBoard,
      });

      return this.lessonUICoordinator;
    }

    // ============================================================
    //  NarrationSystem 初始化（占位，供未来扩展）
    // ============================================================
    initNarrationSystem() {
      // NarrationState 已在模块加载时引用
      // 此处留空，供未来扩展使用
    }

    // ============================================================
    //  游戏计时器初始化
    // ============================================================
    initGameTimer() {
      if (typeof GameTimer === 'undefined') return null;

      const deps = this.deps;

      // 查找或创建计时器显示元素
      let timerEl = document.getElementById('game-timer-display');
      if (!timerEl) {
        // 兼容旧布局：动态创建并插入到 toolbar 中
        const toolbar = document.getElementById('toolbar');
        if (toolbar) {
          timerEl = document.createElement('div');
          timerEl.id = 'game-timer-display';
          timerEl.style.cssText =
            'display:flex;align-items:center;justify-content:center;' +
            'min-width:64px;height:36px;padding:0 12px;' +
            'background:rgba(15,23,42,0.6);border:1px solid rgba(251,191,36,0.2);' +
            'border-radius:8px;font-size:14px;font-weight:700;' +
            'color:#fbbf24;letter-spacing:2px;font-family:monospace;' +
            'user-select:none;';
          timerEl.textContent = '00:00';
          timerEl.title = '游戏时间（点击暂停/继续）';
          toolbar.insertBefore(timerEl, toolbar.firstChild);
        }
      }

      // 绑定点击事件
      if (timerEl) {
        timerEl.addEventListener('click', () => {
          const gameTimer = deps.getGameTimer();
          if (gameTimer && gameTimer.isRunning) {
            gameTimer.toggle();
            timerEl.style.opacity = gameTimer.isPaused ? '0.5' : '1';
          }
        });
      }

      // 创建计时器实例
      const gameTimer = new GameTimer({
        onTick: (seconds) => {
          const timerEl2 = document.getElementById('game-timer-display');
          if (timerEl2) {
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            timerEl2.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
          }
          // 同步到 PC 端计时器
          const pcTimerEl = document.getElementById('pc-timer-display');
          if (pcTimerEl) {
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            pcTimerEl.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
          }
          // 累计游戏时长（用于 persistent 成就）
          if (global.ProgressManager && seconds > 0 && seconds % 60 === 0) {
            ProgressManager.addPlayTime(60);
            // 检查 persistent 成就
            if (ProgressManager.getTotalPlayTime() >= 3600) {
              ProgressManager.unlockAchievement('persistent');
            }
          }
        },
        onPause: () => {
          const timerEl2 = document.getElementById('game-timer-display');
          if (timerEl2) timerEl2.style.opacity = '0.5';
        },
        onResume: () => {
          const timerEl2 = document.getElementById('game-timer-display');
          if (timerEl2) timerEl2.style.opacity = '1';
        },
        autoPauseOnHide: true,
      });

      return gameTimer;
    }
  }

  // 导出到全局
  global.ModuleInitializer = ModuleInitializer;

})(window);
