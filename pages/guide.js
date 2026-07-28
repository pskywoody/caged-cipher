// Guide.js - Main game controller (clean version)
// Expert system driven, modular, maintainable

;(function(global) {
  'use strict';

  // 从外部模块加载（物理拆分，逻辑不变）
  const LevelLoader = window.LevelLoader;
  const UIManager = window.UIManager;
  const CharBubble = window.CharBubble;
  const InputRouter = window.InputRouter;
  const WhatIfManager = window.WhatIfManager;
  const GameController = window.GameController;
  const HintPlayer = window.HintPlayer;
  const NarrationSystem = window.NarrationSystem;
  const LessonUICoordinator = window.LessonUICoordinator;
  const AchievementCoordinator = window.AchievementCoordinator;
  const StoryOrchestrator = window.StoryOrchestrator;
  const WinConditionManager = window.WinConditionManager;
  const AutoHintSystem = window.AutoHintSystem;
  const DebugTools = window.DebugTools;
  const PcLayoutManager = window.PcLayoutManager;
  const PauseManager = window.PauseManager;
  const EndingManager = window.EndingManager;
  const ExpertCharacterHandler = window.ExpertCharacterHandler;
  const CellInputHandler = window.CellInputHandler;

  // === 第九阶段抽离：GameContext 中央状态和 CellInputHandler 核心输入 ===
  // GameContext 通过 initGameContext() 初始化并挂到 window.GameContext
  // CellInputHandler 通过构造函数注入依赖，封装核心输入处理逻辑
  let cellInputHandler = null;

  // === 第四阶段抽离：GameController 和 WhatIfManager 实例 ===
  let gameController = null;
  let whatIfManager = null;

  // === 第五阶段抽离：HintPlayer 和 NarrationSystem 状态引用 ===
  // 状态对象在模块加载时即已创建，直接引用（保证 InputRouter 等拿到正确引用）
  let HintPlayerState = HintPlayer ? HintPlayer.state : null;
  let NarrationState = NarrationSystem ? NarrationSystem.state : null;

  /* ============================================================
     Z-INDEX 层级宪章（与 guide.html :root CSS 变量保持一致）
     背景(0) < 棋盘(10) < 覆盖层/高亮(20) < 浮条/HUD(100)
     < 提示气泡(500) < 角色气泡(800) < Toast(2000)
     < 遮罩/弹窗(10000+) < 对话(15000) < 高潮(20000)
     < 成就(25000) < 暂停(28000) < 转场(30000) < 结局(35000)
     ============================================================ */
  const Z_INDEX = {
    BG: 0,
    BOARD: 10,
    BOARD_OVERLAY: 20,
    HUD: 100,
    FLOATING_BAR: 100,
    HINT_BUBBLE: 500,
    CHAR_BUBBLE: 800,
    TOAST: 2000,
    OVERLAY: 10000,
    DIALOG: 15000,
    CLIMAX: 20000,
    ACHIEVEMENT: 25000,
    PAUSE: 28000,
    TRANSITION: 30000,
    ENDING: 35000
  };

  const log = new Logger('Guide');

  // === State ===
  let board = null;
  let renderer = null;
  let inputRouter = null;
  let expertSystem = null;
  let comboSystem = null;
  let comedySystem = null;  // 吐槽系统
  let storyEngine = null;
  let currentLevelData = null;
  let currentChapterData = null;
  let currentLevelId = 101;
  let isCompleted = false;
  let startTime = 0;
  let noteMode = false;
  let hintSystem = null;
  let hintCount = 0;

  // === 第八阶段抽离：自动提示系统 ===
  let autoHintSystem = null;

  // === 第七阶段抽离：教学引导 UI 协调器 ===
  let lessonUICoordinator = null;

  let errorCount = 0;
  let chapterSelect = null;
  let startedFromSelect = false;
  // === 第七阶段抽离：成就/印章协调器 ===
  // achievementPanel / galleryPanel 已迁移到 achievementCoordinator
  let settingsPanel = null;
  let achievementCoordinator = null;
  let techMatrix = null;
  let gameTimer = null;
  let isPaused = false;
  let pauseElapsedTime = 0;
  let usedNotes = false; // 本关是否使用了笔记（用于岩之印记判定）

  // 开发调试模式
  let _debugMode = false;
  let _heatmapVisible = false; // 热力图是否显示（仅调试用）

  // UI elements to hide during story
  const UI_SELECTORS = ['#game-container', '#num-pad', '#toolbar'];

  // 暴露内部状态到全局，供 UIManager / CharBubble 等模块访问
  Object.defineProperty(global, 'guideNoteMode', {
    get: function() { return noteMode; },
    configurable: true,
  });
  Object.defineProperty(global, 'guideBoard', {
    get: function() { return board; },
    configurable: true,
  });

  // ============================================================
  // 统一震动反馈 (Unified Vibration / Haptic Feedback)
  // 所有震动都经过此函数，遵循 board.settings.vibration 开关
  // 震动强度分级：
  //   - 微反馈（微震动）: 5-10ms —— 选格、普通按钮
  //   - 正常反馈: 10-15ms —— 填数、擦除、笔记切换
  //   - 强反馈: 30-50ms 或三段式 —— 错误、连击里程碑
  //   - 超强反馈: 80ms+ 或长脉冲 —— EUREKA、通关、高潮
  // ============================================================
  const VIBRATE_PRESETS = {
    // 微反馈
    MICRO: 5,           // 普通按钮点击
    TAP: 10,            // 格子选中

    // 正常反馈
    FILL: 15,           // 正确填数
    ERASE: 10,          // 擦除
    NOTE_TOGGLE: [10, 20, 10],  // 笔记模式切换
    LONG_PRESS: 15,     // 长按激活

    // 强反馈
    ERROR: [50, 30, 50],       // 错误填数
    ERROR_SOFT: [10, 20, 10],  // 轻度错误（清除所有笔记等）
    COMBO_5: 20,               // 5连击
    COMBO_10: 30,              // 10连击
    COMBO_MAX: 50,             // MAX连击
    COMBO_MILESTONE: [20, 30, 50], // 连击里程碑（递增）

    // 超强反馈
    EUREKA: 80,                // EUREKA时刻
    CLIMAX: [50, 20, 30],      // 高潮/印章
    VICTORY: [80, 40, 80],     // 通关胜利
  };

  /**
   * 统一震动函数
   * @param {number|number[]} pattern - 震动模式（毫秒数或数组）
   * @param {string} [presetName] - 预设名称（用于日志，可选）
   */
  function vibrate(pattern, presetName) {
    if (!board || !board.settings || board.settings.vibration === false) return;
    if (typeof navigator.vibrate !== 'function') return;
    try {
      navigator.vibrate(pattern);
    } catch(e) {
      // 静默失败
    }
  }

  // ============================================================
  // 页面导航（带翻页过渡动画 + 音效）
  // ============================================================
  let _isNavigating = false;

  /**
   * 带过渡动画的页面跳转
   * @param {string} url - 目标 URL
   * @param {Object} [options] - 选项
   * @param {number} [options.delay=400] - 动画时长（毫秒）
   * @param {boolean} [options.playSound=true] - 是否播放翻页音效
   */
  function navigateTo(url, options) {
    if (_isNavigating) return; // 防止重复跳转
    _isNavigating = true;

    options = options || {};
    const delay = options.delay !== undefined ? options.delay : 400;
    const playSound = options.playSound !== false;

    // 1. 播放翻页音效
    if (playSound && typeof AudioService !== 'undefined' && AudioService.sfx) {
      try {
        AudioService.sfx.play('book_flip');
      } catch(e) {}
    }

    // 2. 播放离开动画（淡出 + 缩放，模拟合书）
    const root = document.querySelector('.page-transition-root') || document.body;
    root.classList.add('page-leave');

    // 3. 动画结束后跳转
    setTimeout(() => {
      window.location.href = url;
    }, delay);
  }

  // Character portrait emoji mapping (fallback if image not available)
  const CHAR_EMOJI = {
    ayan: '🌸',
    cagekeeper: '🔒',
    ying: '✨',
    shenmo: '📖',
    plotter: '🎭',
    plotterShadow: '👤',
    setterSecret: '🔮',
    weaver: '⭐',
    remnant: '🛡️',
  };

  // Character name to ID mapping
  const NAME_TO_CHAR = {
    '阿妍': 'ayan',
    '守笼人': 'cagekeeper',
    '莹莹': 'ying',
    '沈墨': 'shenmo',
    '设局人': 'plotter',
    '设局人残影': 'plotterShadow',
    '设局人（残影）': 'plotterShadow',
    '设局人（秘术）': 'setterSecret',
    '星辰梭': 'weaver',
    '残局守护者': 'remnant',
  };

  // === Init ===
  window.onload = async function() {
    log.info('Guide mode starting...');

    // Init audio
    AudioService.init();

    // 页面进入动画（翻书效果）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const root = document.querySelector('.page-transition-root');
        if (root) {
          root.classList.add('page-enter-active');
          // 播放翻页开书音效（尾音）
          try {
            if (AudioService.sfx) AudioService.sfx.play('book_open', { volume: 0.5 });
          } catch(e) {}
          // 动画结束后清理类名
          setTimeout(() => {
            root.classList.remove('page-enter', 'page-enter-active');
          }, 550);
        }
      });
    });

    // Init settings panel
    if (typeof SettingsPanel !== 'undefined') {
      settingsPanel = new SettingsPanel({
        onResetProgress: () => {
          if (global.ProgressManager) ProgressManager.reset();
        },
      });
      settingsPanel.load();
    }

    // ===== GameContext 中央状态（五层联动核心）=====
    // 统一的游戏状态容器，感知/决策/行动/学习/三幕式各层在此交汇
    // 已迁移到 core/GameContext.js，通过全局 initGameContext() 初始化
    if (typeof initGameContext === 'function') {
      initGameContext({ logger: log });
    } else {
      _initGameContext(); // 向后兼容
    }

    // Init expert system
    expertSystem = new ExpertSystem();
    expertSystem.init({
      thresholds: { stuckMs: 45000 },
      onFeedback: (msg, level) => showToast(msg),
    });
    global.ExpertSystem = expertSystem;

    // Register character-based feedback handlers
    ExpertCharacterHandler.init({
      getExpertSystem: () => expertSystem,
      showCharacterBubble: showCharacterBubble,
      showToast: showToast,
      showAutoHint: showAutoHint,
      getLessonUICoordinator: () => lessonUICoordinator,
      getHintPlayerState: () => HintPlayerState,
      log: log,
    });
    registerExpertCharacterHandlers();

    // Get story engine
    storyEngine = global.StoryEngine;

    // Global click to advance story + unlock audio
    document.addEventListener('click', (e) => {
      if (typeof AudioService !== 'undefined') {
        AudioService.unlock();
      }
      if (storyEngine && storyEngine._isPlaying) {
        if (e.target.closest('button, .num-btn, #num-pad, #chapter-select-overlay')) return;
        storyEngine.nextDialogue();
      }
    });

    // Init progress
    if (global.ProgressManager) {
      ProgressManager.load();
    }

    // Read level ID from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get('id');

    // 检测调试模式（?debug=1）
    _debugMode = urlParams.get('debug') === '1';
    if (_debugMode) {
      log.info('[Debug] 调试模式已启用');
    }

    // Setup chapter select
    setupChapterSelect();

    if (idParam) {
      // Direct level load (backward compatible)
      currentLevelId = parseInt(idParam) || currentLevelId;
      await startLevel(currentLevelId);
    } else {
      // Show chapter select screen
      if (chapterSelect) {
        await chapterSelect.loadChapters();
        chapterSelect.show();
      } else {
        // Fallback: start at level 101
        await startLevel(101);
      }
    }
  };

  // === Level Loading ===
  async function loadLevel(levelId) {

    return gameController.loadLevel(levelId);

  }

  /**
   * 用当前currentLevelData重新初始化棋盘（用于对战关卡切换）
   */
  function _reinitBoardForBattle() {
    if (!currentLevelData) return;

    // 重新创建Board
    const gridSize = currentLevelData.gridSize || 9;
    board = new Board(gridSize);
    board.loadLevel({
      cells: currentLevelData.boardData,
      cages: currentLevelData.cages || [],
      levelId: currentLevelId,
      // Boss战机制数据
      lockCells: currentLevelData.lockCells,
      fakeCells: currentLevelData.fakeCells,
      regionLocks: currentLevelData.regionLocks,
      cageCollapse: currentLevelData.cageCollapse,
      dualPath: currentLevelData.dualPath,
      phases: currentLevelData.phases,
    });

    // 重新初始化渲染器
    if (renderer) {
      // 清除缓存，强制重绘
      renderer._staticCache = null;
      renderer._staticCacheKey = null;
      renderer._boardCache = null;
      renderer._boardCacheKey = null;
      renderer._cageDepthCache = null;
      renderer.recalcCellSize(board);
      renderer.render(board);
    }

    // 重新初始化笔记系统
    if (typeof NoteSystem !== 'undefined' && renderer) {
      const noteSys = new NoteSystem(board, renderer, {
        perspective: 'hero',
        mode: 'classic',
        maxGlimpseCount: 3,
        glimpseDuration: 3000,
      });
      window.gameNoteSystem = noteSys;
      if (typeof renderer.setNoteSystem === 'function') {
        renderer.setNoteSystem(noteSys);
      }
      global.guideNoteSystem = noteSys;
    }

    log.info('[Boss] 棋盘已重新初始化为对战关卡');

    // 同步到 StoryOrchestrator（第七阶段抽离）
    if (StoryOrchestrator) {
      StoryOrchestrator.setBoard(board);
    }

    // 同步到 ThreeActEngine 和 BossCoordinator（第六阶段抽离）
    if (threeActEngine) {
      threeActEngine.setBoard(board);
      threeActEngine.setRenderer(renderer);
    }
    if (bossCoordinator) {
      bossCoordinator.setBoard(board);
      bossCoordinator.setRenderer(renderer);
    }
  }

  // === Start Level (full flow) ===
  /**
   * 关卡切换时清理所有运行时状态和定时器，防止内存泄漏和状态残留
   */
  function _cleanupLevelState() {
    // 清理输入路由状态（长按、拖拽、连填等）
    if (inputRouter) {
      inputRouter.cleanupLevelState();
    }

    // 清理笔记模式状态
    noteMode = false;
    if (board) {
      board.setInputMode('normal');
    }
    if (typeof updateNoteButtonState === 'function') {
      updateNoteButtonState();
    }

    // 清理笔记系统
    if (window.gameNoteSystem) {
      window.gameNoteSystem = null;
    }
    if (global.guideNoteSystem) {
      global.guideNoteSystem = null;
    }
    if (renderer && typeof renderer.setNoteSystem === 'function') {
      renderer.setNoteSystem(null);
    }

    // 清理角色气泡
    CharBubble.hide();

    // 清理完成状态标志
    isPaused = false;
    if (achievementCoordinator) achievementCoordinator.lastHintTechnique = null;

    // 清理连击系统
    if (comboSystem) {
      if (comboSystem._updateInterval) {
        clearInterval(comboSystem._updateInterval);
        comboSystem._updateInterval = null;
      }
      if (typeof comboSystem.destroy === 'function') {
        comboSystem.destroy();
      }
      comboSystem = null;
    }
    // 清理连击UI显示（第六阶段抽离至 ui/ComboUIController.js）
    if (comboUI && typeof comboUI.cleanup === 'function') {
      comboUI.cleanup();
    }

    // 清理吐槽系统
    if (comedySystem) {
      if (typeof comedySystem.destroy === 'function') {
        comedySystem.destroy();
      }
      comedySystem = null;
    }

    // 清理Boss战系统（第六阶段抽离至 game/BossCoordinator.js）
    if (bossCoordinator && typeof bossCoordinator.cleanup === 'function') {
      bossCoordinator.cleanup();
    }

    // 清理教学引导系统（第七阶段抽离至 game/lesson-ui-coordinator.js）
    if (lessonUICoordinator) {
      lessonUICoordinator.cleanup();
    }

    // 隐藏暂停菜单
    const pauseOverlay = document.getElementById('pause-overlay');
    if (pauseOverlay) {
      pauseOverlay.style.display = 'none';
      pauseOverlay.style.opacity = '0';
    }

    // 清理分层过关系统缓存
    if (typeof WinConditionManager !== 'undefined') {
      try { WinConditionManager.clearPristineCache(); } catch(e) {}
    }

    // 清理三幕式引导
    if (typeof ThreeActGuide !== 'undefined') {
      try { ThreeActGuide.cleanup(); } catch(e) {}
    }
  }

  // ============================================================
  // LessonPlayer - 教学引导系统
  // 已迁移至 game/lesson-ui-coordinator.js (LessonUICoordinator)
  // 向后兼容：转发到 lessonUICoordinator 实例
  // ============================================================

  function _initLessonUICoordinator() {
    if (!LessonUICoordinator) return;
    if (lessonUICoordinator) return;

    lessonUICoordinator = new LessonUICoordinator({
      getBoard: () => board,
      getRenderer: () => renderer,
      getCurrentLevelData: () => currentLevelData,
      getNoteMode: () => noteMode,
      toggleNoteMode: (force) => toggleNoteMode(force),
      recordTechniqueUsage: (name) => recordTechniqueUsage(name),
      renderBoard: () => { if (renderer) renderer.render(board); },
    });
  }

  function _startLessonPlayer() {
    if (!lessonUICoordinator) _initLessonUICoordinator();
    if (!lessonUICoordinator) return;
    lessonUICoordinator.start();
  }

  function _lessonHandleCellFill(r, c, num) {
    if (!lessonUICoordinator) return null;
    return lessonUICoordinator.handleCellFill(r, c, num);
  }

  async function startLevel(levelId) {


    return gameController.startLevel(levelId);


  }

  // === Chapter Select Setup ===
  function setupChapterSelect() {
    if (!global.ChapterSelect) return;

    // === 第七阶段抽离：初始化成就/印章协调器 ===
    _initAchievementCoordinator();

    // 设置成就解锁回调
    if (achievementCoordinator) {
      achievementCoordinator.setupAchievementCallback();
    }

    chapterSelect = new ChapterSelect({
      onSelectLevel: function(levelId) {
        startedFromSelect = true;
        startLevel(levelId);
      },
    });

    // Toolbar chapter button
    const btnChapter = document.getElementById('btn-chapter');
    if (btnChapter) {
      btnChapter.addEventListener('click', () => {
        AudioService.sfx.play('click');
        if (chapterSelect) {
          if (chapterSelect._isVisible) {
            chapterSelect.hide();
          } else {
            chapterSelect.show();
          }
        }
      });
    }

    // 初始化游戏计时器
    initGameTimer();

    // 初始化游戏流程控制器（第四阶段抽离）
    _initGameController();
  }

  // === 第七阶段抽离：成就/印章协调器初始化 ===
  function _initAchievementCoordinator() {
    if (!AchievementCoordinator) return;
    if (achievementCoordinator) return;

    achievementCoordinator = new AchievementCoordinator({
      getNameToChar: () => NAME_TO_CHAR,
      getBoard: () => board,
      getChapterData: () => currentChapterData,
      getLevelData: () => currentLevelData,
      getChapterSelect: () => chapterSelect,
      getUsedNotes: () => usedNotes,
      setUIVisible: setUIVisible,
      setInteractionLocked: setInteractionLocked,
      vibrate: (presetName) => {
        if (presetName === 'CLIMAX') vibrate(VIBRATE_PRESETS.CLIMAX);
        else if (VIBRATE_PRESETS[presetName]) vibrate(VIBRATE_PRESETS[presetName]);
      },
    });

    // 初始化面板
    achievementCoordinator.initAchievementPanel();
    achievementCoordinator.initGalleryPanel();

    // 向后兼容：全局暴露面板引用
    Object.defineProperty(global, 'guideAchievementPanel', {
      get: function() { return achievementCoordinator ? achievementCoordinator.achievementPanel : null; },
      configurable: true,
    });
    Object.defineProperty(global, 'guideGalleryPanel', {
      get: function() { return achievementCoordinator ? achievementCoordinator.galleryPanel : null; },
      configurable: true,
    });
  }

  // === GameController 初始化（第四阶段抽离） ===
  function _initGameController() {
    // === 第六阶段抽离：初始化三幕式引擎 ===
    if (ThreeActEngine && !threeActEngine) {
      threeActEngine = new ThreeActEngine({
        setInteractionLocked: setInteractionLocked,
        showCharacterBubble: showCharacterBubble,
        isLastLevelOfChapter: isLastLevelOfChapter,
      });
      // 向后兼容：ThreeActGuide 变量指向实例
      ThreeActGuide = threeActEngine;
      global.ThreeActGuide = threeActEngine;
    }

    // === 第六阶段抽离：初始化 Boss 战协调器 ===
    if (BossCoordinator && !bossCoordinator) {
      bossCoordinator = new BossCoordinator({
        setInteractionLocked: setInteractionLocked,
        restartLevel: restartLevel,
        showCompleteOverlay: _showCompleteOverlay,
        goToChapterSelect: goToChapterSelect,
        unlockBackground: unlockBackground,
        reinitBoardForBattle: _reinitBoardForBattle,
        getChapterData: () => currentChapterData,
        getLevelData: () => currentLevelData,
        setLevelData: (data, levelId) => {
          currentLevelData = data;
          currentLevelId = levelId;
          // 同步到 gameController
          if (gameController) {
            gameController.currentLevelData = data;
            gameController.currentLevelId = levelId;
          }
        },
      });
    }

    // === 第六阶段抽离：初始化连击 UI 控制器 ===
    if (ComboUIController && !comboUI) {
      comboUI = new ComboUIController();
      global.comboUI = comboUI;
    }

    // === 第七阶段抽离：初始化剧情编排器 ===
    if (StoryOrchestrator) {
      StoryOrchestrator.init({
        storyEngine: storyEngine,
        galleryPanel: achievementCoordinator ? achievementCoordinator.galleryPanel : null,
        renderer: renderer,
        board: board,
        AudioService: AudioService,
        getCurrentLevelData: () => currentLevelData,
        getCurrentChapterData: () => currentChapterData,
        getCurrentLevelId: () => currentLevelId,
        setUIVisible: setUIVisible,
        setInteractionLocked: setInteractionLocked,
      });
    }

    gameController = new GameController({
      // 系统对象
      LevelLoader: LevelLoader,
      AudioService: AudioService,
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
      ThreeActGuide: threeActEngine,
      GuideBattle: global.GuideBattle,
      Rule45Class: global.Rule45,
      GameContext: global.GameContext,

      // 引用对象
      board: board,
      renderer: renderer,
      expertSystem: expertSystem,
      comboSystem: comboSystem,
      comedySystem: comedySystem,
      storyEngine: storyEngine,
      hintSystem: hintSystem,
      gameTimer: gameTimer,
      chapterSelect: chapterSelect,
      achievementPanel: achievementCoordinator ? achievementCoordinator.achievementPanel : null,
      settingsPanel: settingsPanel,
      galleryPanel: achievementCoordinator ? achievementCoordinator.galleryPanel : null,
      techMatrix: techMatrix,
      lessonPlayer: null, // 教学引导由 lessonUICoordinator 管理
      whatIfManager: null, // 稍后设置

      // 回调
      onShowToast: showToast,
      onVibrate: (presetName) => {
        if (presetName === 'ERROR') vibrate(VIBRATE_PRESETS.ERROR);
        else if (VIBRATE_PRESETS[presetName]) vibrate(VIBRATE_PRESETS[presetName]);
      },
      onSetUIVisible: setUIVisible,
      onSetInteractionLocked: setInteractionLocked,
      onUpdateRule45Banner: updateRule45Banner,
      onResetRule45Banner: () => UIManager.resetRule45Banner(),
      onUpdateNumBtnCompletedState: updateNumBtnCompletedState,
      onUpdateNoteButtonState: updateNoteButtonState,
      onHidePauseMenu: hidePauseMenu,
      onNavigateTo: navigateTo,
      onCleanupLevelState: _cleanupLevelState,
      onStartLessonPlayer: _startLessonPlayer,
      onIsFirstLevelOfChapter: isFirstLevelOfChapter,
      onIsLastLevelOfChapter: isLastLevelOfChapter,
      onIsLastChapterOfGame: isLastChapterOfGame,
      onFindChapter: findChapter,
      onFindChapterById: findChapterById,
      onInitRule45Banner: initRule45Banner,
      onPlayClimaxAnimation: playClimaxAnimation,
      onPlayClearDialog: playClearDialog,
      onPlayChapterEpilogue: playChapterEpilogue,
      onShowChapterTransition: showChapterTransition,
      onShowGameEnding: showGameEnding,
      onPlayPrologue: playPrologue,
      onPlayPreDialog: playPreDialog,
      onStartBossBattle: startBossBattle,
      onShowSealUnlockAnimation: showSealUnlockAnimation,
      onComboMilestone: (level, milestone) => {
        if (milestone.vibrate && VIBRATE_PRESETS[milestone.vibrate]) {
          vibrate(VIBRATE_PRESETS[milestone.vibrate]);
        }
        if (typeof comboUI !== 'undefined' && comboUI.showMilestone) {
          comboUI.showMilestone(level, milestone);
        }
      },
      onUpdateFloatBarTabIcon: _updateFloatBarTabIcon,

      // 日志
      log: log,
    });

    // === 第九阶段抽离：PauseManager 和 EndingManager 初始化 ===
    PauseManager.init({
      isPaused: () => isPaused,
      setPaused: (v) => { isPaused = v; },
      isCompleted: () => isCompleted,
      getBoard: () => board,
      getGameTimer: () => gameTimer,
      getExpertSystem: () => expertSystem,
      getStartTime: () => startTime,
      getGameController: () => gameController,
      getSettingsPanel: () => settingsPanel,
      AudioService: typeof AudioService !== 'undefined' ? AudioService : null,
    });

    EndingManager.init({
      getCurrentChapterData: () => currentChapterData,
      getChapterSelect: () => chapterSelect,
      getProgressManager: () => global.ProgressManager,
    });
  }

  // === 游戏计时器初始化 ===
  function initGameTimer() {
    if (typeof GameTimer === 'undefined') return;

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
        if (gameTimer && gameTimer.isRunning) {
          gameTimer.toggle();
          timerEl.style.opacity = gameTimer.isPaused ? '0.5' : '1';
        }
      });
    }

    // 创建计时器实例
    gameTimer = new GameTimer({
      onTick: (seconds) => {
        const timerEl = document.getElementById('game-timer-display');
        if (timerEl) {
          const m = Math.floor(seconds / 60);
          const s = seconds % 60;
          timerEl.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
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
        const timerEl = document.getElementById('game-timer-display');
        if (timerEl) timerEl.style.opacity = '0.5';
      },
      onResume: () => {
        const timerEl = document.getElementById('game-timer-display');
        if (timerEl) timerEl.style.opacity = '1';
      },
      autoPauseOnHide: true,
    });
  }

  // === Find Chapter ===
  function findChapter() {
    if (!currentLevelData || !global.CHAPTER_DATA) return;
    const numId = parseInt(currentLevelId);
    const chapterId = Math.floor(numId / 100);
    for (const ch of global.CHAPTER_DATA.chapters) {
      if (ch.chapterId === chapterId) {
        currentChapterData = ch;
        return;
      }
    }
  }

  // ============================================================
  //  剧情编排（第七阶段抽离至 story/StoryOrchestrator.js）
  // ============================================================
  //  向后兼容：所有剧情编排函数转发到 StoryOrchestrator

  function unlockCharactersFromDialog(dialogLines) {
    return StoryOrchestrator.unlockCharactersFromDialog(dialogLines);
  }
  function unlockBackgroundsFromDialog(dialogLines) {
    return StoryOrchestrator.unlockBackgroundsFromDialog(dialogLines);
  }
  function unlockBackground(bgPath) {
    return StoryOrchestrator.unlockBackground(bgPath);
  }
  function playPreDialog() {
    return StoryOrchestrator.playPreDialog();
  }
  function playPrologue() {
    return StoryOrchestrator.playPrologue();
  }

  function isFirstLevelOfChapter() {
    if (!currentChapterData || !currentChapterData.levels) return false;
    const levels = currentChapterData.levels;
    // 只考虑普通关卡（非隐藏关）作为章节的第一关
    const normalLevels = levels.filter(function(lvl) { return !lvl.isHidden; });
    return normalLevels.length > 0 && normalLevels[0].levelId === currentLevelId;
  }

  // === Boss战系统（第六阶段抽离至 game/BossCoordinator.js） ===
  // 向后兼容：bossBattleStarted 指向 bossCoordinator.isStarted
  Object.defineProperty(global, 'bossBattleStarted', {
    get: function() { return bossCoordinator ? bossCoordinator.isStarted : false; },
    configurable: true,
  });
  // 向后兼容：currentBossConfig
  Object.defineProperty(global, 'currentBossConfig', {
    get: function() { return bossCoordinator ? bossCoordinator.currentBossConfig : null; },
    configurable: true,
  });

  // === Boss 战转发函数（第六阶段抽离至 game/BossCoordinator.js） ===
  // 所有 Boss 战逻辑已迁移到 BossCoordinator 类

  function startBossBattle() {
    if (!bossCoordinator) return;
    bossCoordinator.startBossBattle();
  }

  function retryBossBattle() {
    if (!bossCoordinator) return;
    bossCoordinator.retryBossBattle();
  }

  function toggleDifficultyPanel() {
    if (!bossCoordinator) return;
    bossCoordinator.toggleDifficultyPanel();
  }

  function setDifficulty(diff) {
    if (!bossCoordinator) return;
    bossCoordinator.setDifficulty(diff);
  }

  function updateDifficultyUI() {
    if (!bossCoordinator) return;
    bossCoordinator.updateDifficultyUI();
  }

  function applyDifficultyToBoss(bossConfig, difficulty) {
    if (!bossCoordinator) return bossConfig;
    return bossCoordinator.applyDifficultyToBoss(bossConfig, difficulty);
  }

  function _initBossBattle(bossConfig) {
    if (!bossCoordinator) return;
    bossCoordinator._initBossBattle(bossConfig);
  }

  function onBossBattleEnd(result, bossConfig) {
    if (!bossCoordinator) return;
    bossCoordinator.onBossBattleEnd(result, bossConfig);
  }

  function _showBattleResultOverlay(result, bossConfig) {
    if (!bossCoordinator) return;
    bossCoordinator._showBattleResultOverlay(result, bossConfig);
  }



  // 显示通关遮罩（复用checkCompletion中的通关逻辑）
  function _showCompleteOverlay() {
    // Stop BGM
    AudioService.bgm.stop();

    // Get expert report
    const report = expertSystem.onLevelEnd();
    // 用 gameTimer 获取时间（如果可用），否则回退到 startTime 计算
    const elapsed = gameTimer ? gameTimer.getTime() : Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    // 暂停计时器
    if (gameTimer) gameTimer.pause();

    // Calculate grade
    const grade = calculateGrade(elapsed, report.totalWrong || errorCount || 0, hintCount);

    // Save progress
    saveProgress(elapsed, report.totalWrong || errorCount || 0, hintCount, grade.letter);

    // 吐槽系统：通关评级
    if (comedySystem) {
      comedySystem.onLevelClear(grade.letter);
    }

    // Play victory BGM
    AudioService.bgm.playFile('victory_full.wav');

    // Play clear dialog first, then show overlay
    playClearDialog(() => {
      // Show completion overlay
      const overlay = document.getElementById('complete-overlay');
      if (overlay) {
        overlay.style.display = 'flex';
        overlay.style.opacity = '0';
        requestAnimationFrame(() => {
          overlay.style.transition = 'opacity 0.5s ease';
          overlay.style.opacity = '1';
        });

        const gradeEl = document.getElementById('complete-grade');
        if (gradeEl) {
          gradeEl.textContent = grade.letter;
          gradeEl.style.color = grade.color;
        }

        document.getElementById('complete-time').textContent = '用时 ' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
        document.getElementById('complete-errors').textContent = '错误 ' + (report.totalWrong || 0) + ' 次';

        // Add hints display
        const hintsEl = document.getElementById('complete-hints');
        if (hintsEl) {
          hintsEl.textContent = '提示 ' + hintCount + ' 次';
        }

        const learning = expertSystem.getLearning();
        const insight = learning.generateComment({
          nonTrivialRatio: 0.3,
          maxTechLevel: 5,
          score: 500,
        });
        document.getElementById('complete-insight').textContent = insight;

        // Update next level button text based on position
        updateNextLevelButton();
      }

      // Play victory sound
      AudioService.sfx.play('victory');
      log.info('Level completed:', currentLevelId, 'grade:', grade.letter);
    });
  }

  // === UI Visibility (转发到 UIManager) ===
  function setUIVisible(visible) { return UIManager.setUIVisible(visible); }

  // === Pristine Heatmap Preload ===
  /**
   * 预加载初始热力图到 WinConditionManager 缓存
   * 使用 TechRaterAdapter 生成，延迟一帧执行避免阻塞 UI 渲染
   */
  function _preloadPristineHeatmap() {
    if (!board || !currentLevelData) return;
    if (typeof WinConditionManager === 'undefined') return;
    if (typeof TechRaterAdapter === 'undefined') return;

    // 延迟到下一帧执行，避免阻塞初始渲染
    requestAnimationFrame(() => {
      // 再延迟一帧，确保 UI 完全渲染
      requestAnimationFrame(() => {
        try {
          // 用 WinConditionManager 的 getPristineHeatmap 生成并缓存
          // 它内部有缓存机制，同一关卡只会生成一次
          const isBoss = typeof isLastLevelOfChapter === 'function' ? isLastLevelOfChapter() : false;
          const heatmap = WinConditionManager.getPristineHeatmap(board, currentLevelData, isBoss);
          if (heatmap) {
            log.info('[Heatmap] 初始热力图预加载完成:', currentLevelId);
            // 设置到 renderer 并启用三色显示
            if (renderer && typeof renderer.setHeatmapData === 'function') {
              renderer.setHeatmapData(heatmap);
              // 启用热力图
              // 如果启用了三幕引导，默认第一幕（simple）模式；否则全显
              const threeActEnabled = currentLevelData.features &&
                currentLevelData.features.threeActGuide === true;
              renderer.setHeatmapEnabled(true, 0.15);
              renderer.setThreeActMode(threeActEnabled ? 'simple' : 'all');
              renderer.render(board);
            }
          }
        } catch (e) {
          log.warn('[Heatmap] 预加载初始热力图失败:', e);
        }
      });
    });
  }

  /**
   * 切换热力图显示（调试用）
   * 仅在 debug 模式下可用，通过 Shift+H 触发
   */
  function _toggleHeatmapDisplay() {
    if (!renderer) return;
    if (typeof renderer.setHeatmapEnabled !== 'function') return;

    _heatmapVisible = !_heatmapVisible;

    if (_heatmapVisible) {
      // 如果还没有热力图数据，尝试获取
      if (!renderer._heatmapData) {
        try {
          const isBoss = typeof isLastLevelOfChapter === 'function' ? isLastLevelOfChapter() : false;
          const heatmap = WinConditionManager.getPristineHeatmap(board, currentLevelData, isBoss);
          if (heatmap) {
            renderer.setHeatmapData(heatmap);
          }
        } catch (e) {
          log.warn('[Heatmap] 获取热力图数据失败:', e);
        }
      }
      renderer.setHeatmapEnabled(true, 0.4);
      showToast('热力图：开');
    } else {
      renderer.setHeatmapEnabled(false);
      showToast('热力图：关');
    }

    // 触发重绘
    if (renderer && board) {
      renderer.render(board);
    }
  }

  // === Board Init ===
  function initBoard(levelData) {
    const result = gameController.initBoard(levelData);
    // 同步 board/renderer 到 guide.js 闭包（保持向后兼容）
    board = gameController.board;
    renderer = gameController.renderer;
    hintSystem = gameController.hintSystem;
    techMatrix = gameController.techMatrix;
    // 同步到 ThreeActEngine（第六阶段抽离）
    if (threeActEngine) {
      threeActEngine.setBoard(board);
      threeActEngine.setRenderer(renderer);
      threeActEngine.setStoryEngine(storyEngine);
      threeActEngine.setLevelData(currentLevelData);
      threeActEngine.setChapterData(currentChapterData);
    }
    // 同步到 BossCoordinator（第六阶段抽离）
    if (bossCoordinator) {
      bossCoordinator.setBoard(board);
      bossCoordinator.setRenderer(renderer);
      bossCoordinator.setStoryEngine(storyEngine);
      bossCoordinator.setLevelData(currentLevelData);
      bossCoordinator.setChapterData(currentChapterData);
      bossCoordinator.setGameController(gameController);
    }
    // 同步到 StoryOrchestrator（第七阶段抽离）
    if (StoryOrchestrator) {
      StoryOrchestrator.setBoard(board);
      StoryOrchestrator.setRenderer(renderer);
    }
    // 绑定连击 UI 到 comboSystem（第六阶段抽离）
    if (comboUI && gameController.comboSystem) {
      comboUI.bindComboSystem(gameController.comboSystem);
    }
    // 初始化 WhatIfManager（需要 board 和 renderer）
    _initWhatIfManager();
    // 初始化 HintPlayer 和 NarrationSystem（需要 board/renderer/techMatrix）
    _initHintPlayer();
    _initNarrationSystem();
    return result;
  }

  // === Apply Level Features (渐进式功能解锁) ===
  function applyLevelFeatures() {
    if (!currentLevelData || !currentLevelData.features) return;
    const f = currentLevelData.features;

    // 1. 控制工具栏按钮显隐
    // 笔记按钮
    const btnNote = document.getElementById('btn-note');
    if (btnNote) {
      if (f.allowDraft === false) {
        btnNote.style.display = 'none';
        // 隐藏时退出笔记模式
        if (noteMode) {
          noteMode = false;
          updateNoteButtonState();
        }
      } else {
        btnNote.style.display = '';
      }
    }

    // 提示按钮
    const btnHint = document.getElementById('btn-hint');
    if (btnHint) {
      btnHint.style.display = (f.showHints === false) ? 'none' : '';
    }

    // 45法则按钮（201关起解锁）
    const btnRule45 = document.getElementById('btn-rule45');
    if (btnRule45) {
      const levelIdNum = parseInt(currentLevelId);
      const rule45Unlocked = levelIdNum >= 201;
      if (f.assistant45 === false || !rule45Unlocked) {
        btnRule45.style.display = 'none';
      } else {
        btnRule45.style.display = '';
      }
    }

    // 2. 控制高亮（调用 renderer.setHighlightOptions）
    if (renderer && typeof renderer.setHighlightOptions === 'function') {
      renderer.setHighlightOptions({
        highlightRow: f.highlightRow !== false,
        highlightCol: f.highlightCol !== false,
        highlightBox: f.highlightBox !== false,
        highlightNumber: f.highlightNumber !== false,
        highlightCage: f.highlightCage !== false,
      });
    }

    // 3. 控制自动填充候选数（受全局设置控制，默认关闭）
    // 忽略关卡级 autoFillCandidates 特性，统一由玩家在设置中手动开启
    const shouldAutoFill = settingsPanel && settingsPanel.get
      ? settingsPanel.get('game.autoFillCandidates')
      : false;

    if (shouldAutoFill === true) {
      const noteSys = window.gameNoteSystem || global.guideNoteSystem;
      if (noteSys) {
        if (typeof noteSys._autoFillTheoreticalCandidates === 'function') {
          noteSys._autoFillTheoreticalCandidates();
        } else if (typeof noteSys.autoFill === 'function') {
          noteSys.autoFill();
        }
      } else if (board && typeof board.autoFillCandidates === 'function') {
        board.autoFillCandidates();
      } else if (typeof autoFillCandidates === 'function') {
        autoFillCandidates();
      }
      // 触发重绘
      if (renderer) {
        renderer.forceRender = true;
        renderer.render(board);
      }
    }
  }

  // === Event Binding ===
  let eventsBound = false; // 防止重复绑定
  function bindEvents() {
    if (eventsBound) return; // 只绑定一次
    eventsBound = true;

    const canvas = document.getElementById('gameCanvas');

    // --- 初始化 InputRouter 并绑定输入事件 ---
    inputRouter = new InputRouter({
      board: board,
      renderer: renderer,
      storyEngine: storyEngine,
      lessonPlayer: null, // 教学引导由 lessonUICoordinator 管理
      HintPlayerState: HintPlayerState,
      WhatIfState: WhatIfState,
      techMatrix: techMatrix,
      comedySystem: comedySystem,
      settingsPanel: settingsPanel,
      achievementPanel: achievementCoordinator ? achievementCoordinator.achievementPanel : null,
      galleryPanel: achievementCoordinator ? achievementCoordinator.galleryPanel : null,
      AudioService: AudioService,
      VIBRATE_PRESETS: VIBRATE_PRESETS,
      GuideBattle: (typeof GuideBattle !== 'undefined') ? GuideBattle : null,

      // 状态 getter / setter
      getIsCompleted: () => isCompleted,
      getIsPaused: () => isPaused,
      getNoteMode: () => noteMode,
      setNoteMode: (v) => { noteMode = v; },
      getDebugMode: () => _debugMode,
      getTechniquePanelVisible: () => _techniquePanelVisible,
      setUsedNotes: (v) => { usedNotes = v; },

      // 业务回调
      onNumberInput: handleNumberInput,
      onErase: handleErase,
      onToggleNote: toggleNoteMode,
      onHint: showHint,
      onWhatIfToggle: toggleWhatIfMode,
      onUndo: undo,
      onPauseToggle: togglePause,
      onSkipHintStep: skipHintStep,
      onBoardLongPress: handleBoardLongPress,
      onUpdateMultiSelectHint: updateMultiSelectHint,
      onUpdateNoteButtonState: updateNoteButtonState,
      onUpdateRule45Banner: updateRule45Banner,
      onShowToast: showToast,
      onVibrate: vibrate,
      onEnterWhatIf: enterWhatIfMode,
      onExitWhatIf: exitWhatIfMode,
      onAdoptWhatIf: adoptWhatIfChanges,
      onUndoWhatIfStep: undoWhatIfStep,
      onToggleRule45Banner: toggleRule45Banner,
      onCheckBoardAnswer: checkBoardAnswer,
      onAutoFillCandidates: autoFillCandidates,
      onAdjustSelectedNumber: adjustSelectedNumber,
      onToggleTechniqueEncyclopedia: toggleTechniqueEncyclopedia,
      onHideTechniqueEncyclopedia: hideTechniqueEncyclopedia,
      onToggleHeatmapDisplay: _toggleHeatmapDisplay,
      onUpdateNumBtnActiveState: updateNumBtnActiveState,
      onUpdateNumBtnCompletedState: updateNumBtnCompletedState,
    });
    inputRouter.bindEvents(canvas, document);

    // --- 初始化 CellInputHandler（核心输入处理器，已迁移到 core/CellInputHandler.js）---
    if (CellInputHandler && !cellInputHandler) {
      cellInputHandler = new CellInputHandler({
        // 核心对象引用
        board: board,
        renderer: renderer,
        comboSystem: comboSystem,
        expertSystem: expertSystem,
        hintSystem: hintSystem,
        comedySystem: comedySystem,
        AudioService: AudioService,
        VIBRATE_PRESETS: VIBRATE_PRESETS,
        EventLogger: EventLogger,
        GuideBattle: (typeof GuideBattle !== 'undefined') ? GuideBattle : null,
        WhatIfState: WhatIfState,
        lessonUICoordinator: lessonUICoordinator,
        achievementCoordinator: achievementCoordinator,
        currentLevelData: currentLevelData,
        global: global,

        // 状态 getter / setter
        getNoteMode: () => noteMode,
        setNoteMode: (v) => { noteMode = v; },
        getUsedNotes: () => usedNotes,
        setUsedNotes: (v) => { usedNotes = v; },
        getErrorCount: () => errorCount,
        incErrorCount: () => { errorCount++; },
        getSolution: () => currentLevelData?.solution,

        // 业务回调
        showToast: showToast,
        vibrate: vibrate,
        validateBoard: validateBoard,
        highlightAllErrors: highlightAllErrors,
        updateNumBtnCompletedState: updateNumBtnCompletedState,
        checkCompletion: checkCompletion,
        updateRule45Banner: updateRule45Banner,
        addWhatIfSnapshot: addWhatIfSnapshot,
        lessonHandleCellFill: _lessonHandleCellFill,
        detectTechniqueForFill: detectTechniqueForFill,
        recordTechniqueUsage: recordTechniqueUsage,
        updateNoteButtonState: updateNoteButtonState,
        updateMultiSelectHint: updateMultiSelectHint,
      });
    }

    // --- Toolbar buttons ---
    const btnNote = document.getElementById('btn-note');
    if (btnNote) {
      btnNote.addEventListener('click', () => {
        AudioService.sfx.play('click');
        vibrate(VIBRATE_PRESETS.MICRO);
        toggleNoteMode();
      });
    }

    // Window resize
    window.addEventListener('resize', () => {
      if (renderer && board) {
        // P2优化：resize时失效尺寸缓存
        if (typeof renderer.invalidateSizeCache === 'function') {
          renderer.invalidateSizeCache();
        }
        renderer.recalcCellSize(board);
        renderer.render(board);
      }
    });

    // Orientation change (mobile)
    window.addEventListener('orientationchange', () => {
      // 延迟等待布局完成后重新计算
      setTimeout(() => {
        if (renderer && board) {
          // P2优化：方向变化时失效尺寸缓存
          if (typeof renderer.invalidateSizeCache === 'function') {
            renderer.invalidateSizeCache();
          }
          renderer.recalcCellSize(board);
          renderer.render(board);
        }
      }, 200);
    });

    // Popstate 拦截：安卓返回键优先退出 What If 模式
    window.addEventListener('popstate', (e) => {
      if (WhatIfState && WhatIfState.active) {
        e.preventDefault();
        if (WhatIfState.snapshots.length > 0) {
          if (confirm('退出假设模式？未采纳的更改将丢失。')) {
            exitWhatIfMode(false);
          } else {
            // 用户取消，重新推入状态
            history.pushState({ whatIf: true }, '');
          }
        } else {
          exitWhatIfMode(false);
        }
      }
    });

    // 页面关闭/刷新时自动回退未采纳的假设（风险与降级）
    // 规格书要求：页面关闭时自动回退未采纳假设，防止玩家误以为假设已被保存
    window.addEventListener('beforeunload', (e) => {
      if (WhatIfState && WhatIfState.active) {
        const hasChanges = WhatIfState.snapshots.length > 0 || 
          (WhatIfState.rootSnapshot && _hasChangesFromRoot(WhatIfState.rootSnapshot));
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
      if (WhatIfState && WhatIfState.active) {
        try {
          // 清理标记，防止页面从 bfcache 恢复时状态不一致
          WhatIfState.active = false;
          document.body.classList.remove('whatif-mode');
        } catch (err) {
          // 静默失败
        }
      }
    });

    // Toolbar buttons
    document.getElementById('btn-undo')?.addEventListener('click', () => { AudioService.sfx.play('click'); vibrate(VIBRATE_PRESETS.MICRO); undo(); });
    // 擦除按钮：单击=擦除当前格，长按=笔记模式下清空所有笔记
    (function setupEraseButton() {
      const btn = document.getElementById('btn-erase');
      if (!btn) return;
      let eraseLongPressTimer = null;
      let eraseLongPressTriggered = false;
      btn.addEventListener('pointerdown', (e) => {
        if (storyEngine && storyEngine._isPlaying) return;
        if (isCompleted) return;
        e.preventDefault();
        eraseLongPressTriggered = false;
        btn.classList.add('long-pressing');
        eraseLongPressTimer = setTimeout(() => {
          eraseLongPressTriggered = true;
          btn.classList.remove('long-pressing');
          // 长按擦除
          if (noteMode) {
            // 笔记模式：清除所有候选数
            if (board && typeof board.clearAllCandidates === 'function') {
              board.clearAllCandidates();
              renderer.render(board);
              AudioService.sfx.play('erase');
              vibrate(VIBRATE_PRESETS.ERROR_SOFT);
              showToast('已清除所有笔记', 1000);
            }
          } else {
            // 正常模式：与单击相同（擦除当前格）
            eraseCell();
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
          eraseCell();
        }
      });
      btn.addEventListener('pointerleave', () => {
        if (eraseLongPressTimer) {
          clearTimeout(eraseLongPressTimer);
          eraseLongPressTimer = null;
        }
        btn.classList.remove('long-pressing');
      });
    })();
    document.getElementById('btn-hint')?.addEventListener('click', () => { AudioService.sfx.play('click'); vibrate(VIBRATE_PRESETS.MICRO); showHint(); });
    document.getElementById('btn-whatif')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      toggleWhatIfMode();
    });

    // What If 浮条按钮
    document.getElementById('btn-whatif-accept')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      adoptWhatIfChanges();
    });
    document.getElementById('btn-whatif-undo')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      undoWhatIfStep();
    });
    document.getElementById('btn-whatif-reset')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      resetWhatIfToRoot();
    });

    // 右侧浮条拉扣头
    document.getElementById('float-bar-tab')?.addEventListener('click', (e) => {
      e.stopPropagation();
      AudioService.sfx.play('click');
      toggleFloatBarPanel();
    });

    document.getElementById('btn-rule45')?.addEventListener('click', () => { 
      AudioService.sfx.play('click'); 
      // 45法则已改为顶部常驻HUD显示
      showToast('45法则仪表盘已显示在棋盘上方');
    });
    document.getElementById('btn-techniques')?.addEventListener('click', () => { AudioService.sfx.play('click'); toggleTechniqueEncyclopedia(); });
    document.getElementById('btn-tech-matrix')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      if (techMatrix) techMatrix.toggle();
    });
    document.getElementById('btn-settings')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      if (settingsPanel) {
        settingsPanel.toggle();
      }
    });
    document.getElementById('btn-achievement')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      if (achievementCoordinator) {
        achievementCoordinator.toggleAchievementPanel();
      }
    });
    document.getElementById('btn-gallery')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      if (achievementCoordinator) {
        achievementCoordinator.toggleGalleryPanel();
      }
    });
    document.getElementById('btn-chapter')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      if (chapterSelect) chapterSelect.show();
    });
    document.getElementById('btn-pause')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      togglePause();
    });

    // 暂停菜单按钮
    document.getElementById('btn-pause-resume')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      togglePause();
    });
    document.getElementById('btn-pause-restart')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      restartLevel();
    });
    document.getElementById('btn-pause-chapter')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      goToChapterSelect();
    });
    document.getElementById('btn-pause-menu')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      goToMainMenu();
    });
    document.getElementById('btn-pause-settings')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      if (settingsPanel) settingsPanel.show();
    });

    // 顶部Header菜单按钮（统一菜单 Bottom Sheet）
    const menuBtn = document.querySelector('.header-menu');
    if (menuBtn && typeof MenuSheet !== 'undefined') {
      const menuSheet = new MenuSheet({
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
              if (achievementCoordinator && achievementCoordinator.galleryPanel) {
                achievementCoordinator.showGalleryPanel();
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
      window._guideMenuSheet = menuSheet;

      menuBtn.addEventListener('click', () => {
        AudioService.sfx.play('click');
        menuSheet.toggle();
      });
    }

    // 页面隐藏时自动暂停
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !isPaused && !isCompleted && board) {
        showPauseMenu();
      }
    });
  }

  // === 输入路由（已迁移到 InputRouter）===
  // 向后兼容：转发到 inputRouter 实例
  function getCellFromEvent(e) { return inputRouter ? inputRouter.getCellFromEvent(e) : null; }
  function onCanvasPointerDown(e) { return inputRouter && inputRouter.onCanvasPointerDown(e); }
  function onCanvasPointerMove(e) { return inputRouter && inputRouter.onCanvasPointerMove(e); }
  function onCanvasPointerUp(e) { return inputRouter && inputRouter.onCanvasPointerUp(e); }
  function onNumBtnPointerDown(e) { return inputRouter && inputRouter.onNumBtnPointerDown(e); }
  function onNumBtnPointerMove(e) { return inputRouter && inputRouter.onNumBtnPointerMove(e); }
  function onNumBtnPointerUp(e) { return inputRouter && inputRouter.onNumBtnPointerUp(e); }
  function onNumBtnPointerLeave(e) { return inputRouter && inputRouter.onNumBtnPointerLeave(e); }
  function onKeyDown(e) { return inputRouter && inputRouter.onKeyDown(e); }
  function handleEscKey() { return inputRouter ? inputRouter.handleEscKey() : false; }
  function handleSwipeUpNote(num) { return inputRouter && inputRouter.handleSwipeUpNote(num); }
  function enterQuickFillMode(num) { return inputRouter && inputRouter.enterQuickFillMode(num); }
  function exitQuickFillMode() { return inputRouter && inputRouter.exitQuickFillMode(); }
  function _isNumberComplete(num) { return inputRouter ? inputRouter._isNumberComplete(num) : false; }
  function _checkQuickFillComplete() { return inputRouter && inputRouter._checkQuickFillComplete(); }
  function updateNumBtnActiveState() { return inputRouter && inputRouter.updateNumBtnActiveState(); }
  function checkAndClearActiveNumber() { return inputRouter && inputRouter.checkAndClearActiveNumber(); }
  function handleBoardLongPress(cell, phase) { return inputRouter && inputRouter._handleBoardLongPress(cell, phase); }

  // === 检查答案（已迁移到 core/CellInputHandler.js）===
  function checkBoardAnswer() {
    return cellInputHandler && cellInputHandler.checkBoardAnswer();
  }

  // === 自动填充候选数（已迁移到 core/CellInputHandler.js）===
  function autoFillCandidates() {
    return cellInputHandler && cellInputHandler.autoFillCandidates();
  }

  // === 增减选中格数字（已迁移到 core/CellInputHandler.js）===
  function adjustSelectedNumber(delta) {
    return cellInputHandler && cellInputHandler.adjustSelectedNumber(delta);
  }

  function updateMultiSelectHint() { return UIManager.updateMultiSelectHint(); }

  function updateNoteButtonState() { return UIManager.updateNoteButtonState(); }

  // === 擦除处理（已迁移到 core/CellInputHandler.js）===
  function handleErase() {
    return cellInputHandler && cellInputHandler.handleErase();
  }

  // === Undo（已迁移到 core/CellInputHandler.js）===
  function undo() {
    return cellInputHandler && cellInputHandler.undo();
  }

  // === Erase（已迁移到 core/CellInputHandler.js）===
  function eraseCell() {
    return cellInputHandler && cellInputHandler.eraseCell();
  }

  // === Note Mode（已迁移到 core/CellInputHandler.js）===
  function toggleNoteMode(forceValue) {
    return cellInputHandler && cellInputHandler.toggleNoteMode(forceValue);
  }

  // ============================================================
  //  GameContext 中央状态系统（已迁移到 core/GameContext.js）
  // ============================================================
  //  统一的游戏状态容器，打通"感知→决策→行动"完整数据流
  //  所有层级通过 window.GameContext 读写共享状态
  // ============================================================

  // 向后兼容：_initGameContext 转发到全局 initGameContext
  function _initGameContext() {
    if (typeof initGameContext === 'function') {
      return initGameContext({ logger: log });
    }
    return null;
  }

  /**
   * 全局 AI 速度调整函数（由决策层调用）
   * 通过 GameContext → GuideBattle 的链路调整 AI 速度倍率
   * 速度倍率按 reason 独立管理，多个 reason 叠加相乘
   * @param {number} factor - 速度倍率（<1 变慢，>1 变快）
   * @param {string} reason - 调整原因（用于独立追踪和重置）
   * @param {number} durationMs - 持续时间（毫秒），到期自动恢复
   */
  function _setAISpeedMultiplier(factor, reason, durationMs) {
    try {
      if (!global.GameContext) {
        console.warn('[AISpeed] GameContext 未初始化，跳过速度调整');
        return;
      }

      const ctx = global.GameContext;

      // 确保 _aiSpeedModifiers 存在
      if (!ctx._aiSpeedModifiers) {
        ctx._aiSpeedModifiers = {};
      }

      // 设置该 reason 的倍率
      ctx._aiSpeedModifiers[reason] = {
        factor: factor,
        expiry: durationMs ? Date.now() + durationMs : 0,
      };

      // 计算总倍率
      let totalFactor = 1.0;
      for (const key in ctx._aiSpeedModifiers) {
        const mod = ctx._aiSpeedModifiers[key];
        // 检查是否过期
        if (mod.expiry > 0 && Date.now() > mod.expiry) {
          delete ctx._aiSpeedModifiers[key];
          continue;
        }
        totalFactor *= mod.factor;
      }

      // 限制在合理范围
      totalFactor = Math.max(0.3, Math.min(2.0, totalFactor));

      // 如果有活跃的 Boss 战，应用到 GuideBattle
      if (typeof guideBattle !== 'undefined' && guideBattle && guideBattle.active) {
        if (typeof guideBattle.setContextSpeedMultiplier === 'function') {
          guideBattle.setContextSpeedMultiplier(totalFactor, reason);
        }
      }

      log.info('[AISpeed] 速度调整 reason=' + reason +
        ' factor=' + factor.toFixed(2) +
        ' total=' + totalFactor.toFixed(2) +
        ' duration=' + (durationMs || 'infinite'));

      // 如果设置了持续时间，到期后自动清除并重算
      if (durationMs && durationMs > 0) {
        setTimeout(() => {
          try {
            _resetAISpeedMultiplier(reason);
          } catch (e) {
            console.warn('[AISpeed] auto-reset error:', e);
          }
        }, durationMs);
      }
    } catch (e) {
      console.warn('[AISpeed] _setAISpeedMultiplier error:', e);
    }
  }

  /**
   * 重置某个原因的 AI 速度倍率
   * @param {string} reason - 要重置的调整原因
   */
  function _resetAISpeedMultiplier(reason) {
    try {
      if (!global.GameContext || !global.GameContext._aiSpeedModifiers) {
        return;
      }

      const ctx = global.GameContext;
      delete ctx._aiSpeedModifiers[reason];

      // 重新计算总倍率
      let totalFactor = 1.0;
      for (const key in ctx._aiSpeedModifiers) {
        const mod = ctx._aiSpeedModifiers[key];
        if (mod.expiry > 0 && Date.now() > mod.expiry) {
          delete ctx._aiSpeedModifiers[key];
          continue;
        }
        totalFactor *= mod.factor;
      }

      totalFactor = Math.max(0.3, Math.min(2.0, totalFactor));

      if (typeof guideBattle !== 'undefined' && guideBattle && guideBattle.active) {
        if (typeof guideBattle.setContextSpeedMultiplier === 'function') {
          guideBattle.setContextSpeedMultiplier(totalFactor, 'reset_' + reason);
        }
      }

      log.info('[AISpeed] 速度重置 reason=' + reason + ' total=' + totalFactor.toFixed(2));
    } catch (e) {
      console.warn('[AISpeed] _resetAISpeedMultiplier error:', e);
    }
  }

  // 挂到全局，供决策层调用
  global._setAISpeedMultiplier = _setAISpeedMultiplier;
  global._resetAISpeedMultiplier = _resetAISpeedMultiplier;

  // ============================================================
  // AutoHintSystem - 自动提示系统
  // 已迁移至 expert/AutoHintSystem.js
  // 向后兼容：转发到 autoHintSystem 实例
  // ============================================================

  function _initAutoHintSystem() {
    if (!AutoHintSystem) return;
    if (autoHintSystem) return;

    autoHintSystem = new AutoHintSystem({
      getHintSystem: () => hintSystem,
      getWhatIfState: () => WhatIfState,
      getLessonUICoordinator: () => lessonUICoordinator,
      isLastLevelOfChapter: () => isLastLevelOfChapter(),
      isBossBattleStarted: () => bossBattleStarted,
      getExpertSystem: () => expertSystem,
      getGameContext: () => global.GameContext,
      getComedySystem: () => comedySystem,
      getAchievementCoordinator: () => achievementCoordinator,
      getHintCount: () => hintCount,
      addHintCount: (delta) => { hintCount += delta; },
      getProgressManager: () => global.ProgressManager,
      getCurrentChapterData: () => currentChapterData,
      getCurrentLevelData: () => currentLevelData,
      getRenderer: () => renderer,
      getBoard: () => board,
      getStoryEngine: () => storyEngine,
      playFirstEncounterTeaching: (d, c, t, cells) => playFirstEncounterTeaching(d, c, t, cells),
      playHintAnimation: (hint) => playHintAnimation(hint),
      getTechMatrix: () => techMatrix,
      normalizeEvidence: (hint) => _normalizeEvidence(hint),
      showCharacterBubble: (charId, opts) => showCharacterBubble(charId, opts),
    });
  }

  function showAutoHint(params = {}) {
    if (!autoHintSystem) _initAutoHintSystem();
    if (!autoHintSystem) return;
    autoHintSystem.showAutoHint(params);
  }

  function _getAutoHintIntro(charId, reason) {
    if (!autoHintSystem) _initAutoHintSystem();
    // 直接调用 AutoHintSystem 内部函数不可行，保持一个本地副本用于向后兼容
    // 实际逻辑已迁移，这里提供降级实现
    const intros = {
      ayan: { stuck: '让我看看...嗯，', anxiety: '别急，', novice: '这个嘛，', flow_drop: '刚才思路不错，' },
      cagekeeper: { stuck: '观察盘面。', anxiety: '冷静下来。', novice: '基础要打牢。', flow_drop: '保持节奏。' },
      ying: { stuck: '我来帮你看看！', anxiety: '别着急别着急~', novice: '我教你呀！', flow_drop: '加油加油！' },
    };
    const charIntros = intros[charId] || intros.ayan;
    return charIntros[reason] || charIntros.stuck;
  }

  function _getCharacterName(charId) {
    const names = { ayan: '阿妍', cagekeeper: '守笼人', ying: '莹莹' };
    return names[charId] || '阿妍';
  }

  // === Hint ===
  function showHint() {
    if (!hintSystem) return;

    // What If 模式下提示不可用
    if (WhatIfState && WhatIfState.active) {
      showToast('假设模式下提示不可用');
      return;
    }

    // Check hint limit for current cycle
    if (!canUseHint()) {
      showToast('本周目提示次数已用完，请凭实力解谜');
      // 吐槽系统：提示用完
      if (comedySystem) {
        comedySystem.onHintsExhausted();
      }
      return;
    }

    const hint = hintSystem.getHint();
    if (!hint) {
      showToast('提示冷却中，请稍后再试');
      return;
    }

    AudioService.sfx.play('hint');

    if (hint.hintType === 'complete') {
      showToast(hint.dialogue);
      return;
    }

    const { character, characterName, dialogue, target, targetCells, techniqueName, isFirstEncounter, teachingDialog } = hint;

    // 记录本次提示使用的技巧（用于正确填数时触发技巧类成就）
    if (achievementCoordinator) achievementCoordinator.lastHintTechnique = techniqueName || null;

    // Clear previous hint highlights
    if (renderer && typeof renderer.clearHintHighlights === 'function') {
      renderer.clearHintHighlights('hint');
    }

    // Also select the primary target cell for backward compatibility
    // Safely extract row/col from target (supports {row,col}, {r,c}, {cells:[...]}, and region-only formats)
    if (target && board) {
      let tRow, tCol;
      if (target.row !== undefined && target.col !== undefined) {
        tRow = target.row;
        tCol = target.col;
      } else if (target.r !== undefined && target.c !== undefined) {
        tRow = target.r;
        tCol = target.c;
      } else if (target.cells && target.cells.length > 0) {
        const first = target.cells[0];
        if (first.row !== undefined && first.col !== undefined) {
          tRow = first.row;
          tCol = first.col;
        } else if (first.r !== undefined && first.c !== undefined) {
          tRow = first.r;
          tCol = first.c;
        }
      }
      if (tRow !== undefined && tCol !== undefined) {
        board.selectCell(tRow, tCol);
      }
    }

    renderer.render(board);

    hintCount++;
    expertSystem.onHint();
    // === GameContext 同步：手动提示计数 ===
    try {
      if (global.GameContext && global.GameContext.player) {
        global.GameContext.player.hintUsageCount++;
      }
    } catch (e) {}
    // 累计总提示次数（用于真结局判定）
    if (global.ProgressManager) {
      ProgressManager.addHintCount(1);
      // 标记当前章节使用了提示（用于 no_hint_chapter 成就判定）
      if (currentChapterData && !currentLevelData.isHidden) {
        ProgressManager.setChapterHintUsed(currentChapterData.chapterId);
      }
      // 使用了提示，重置连续无提示通关计数
      ProgressManager.resetNoHintStreak();
    }
    EventLogger.log('game:hint', { character: characterName, target, targetCells, technique: techniqueName });

    // First encounter: play full teaching dialogue via StoryEngine
    if (isFirstEncounter && teachingDialog && teachingDialog.length > 0 && storyEngine) {
      playFirstEncounterTeaching(teachingDialog, character, techniqueName, targetCells);
      return;
    }

    // 使用动画播放器（所有 deduction 类型提示都用动画播放）
    if (renderer && typeof renderer.playHintAnimation === 'function'
        && hint.hintType === 'deduction') {
      playHintAnimation(hint);
      return;
    }

    // Fallback: 旧版高亮 + 气泡方式
    // Highlight target cells (new multi-cell support)
    if (targetCells && targetCells.length > 0 && renderer && typeof renderer.highlightHintCells === 'function') {
      renderer.highlightHintCells(targetCells, 'hint', 'hint');
    }

    // 更新技术矩阵的证据链
    if (techMatrix && hint.hintType === 'deduction') {
      // 规范化证据数据确保显示完整
      if (!hint._evidenceNormalized && typeof _normalizeEvidence === 'function') {
        hint.evidence = _normalizeEvidence(hint);
        hint._evidenceNormalized = true;
      }
      techMatrix.showEvidence(hint);
    }

    // Regular hint: show character bubble
    const prefix = techniqueName ? `【${techniqueName}】` : '';
    showCharacterBubble(character || NAME_TO_CHAR[characterName] || 'ayan', {
      text: prefix + dialogue,
      speakerName: characterName,
      duration: 4500,
      type: 'hint',
    });
  }

  /**
   * Play first-encounter teaching dialogue with full StoryEngine presentation.
   * 第七阶段抽离至 story/StoryOrchestrator.js
   */
  function playFirstEncounterTeaching(dialogLines, characterId, techniqueName, targetCells) {
    return StoryOrchestrator.playFirstEncounterTeaching(dialogLines, characterId, techniqueName, targetCells);
  }

  /**
   * Show a brief "new technique discovered" badge.
   * 第七阶段抽离至 story/StoryOrchestrator.js
   */
  function showTeachingBadge(techniqueName) {
    return StoryOrchestrator._showTeachingBadge(techniqueName);
  }

  /**
   * Lock/unlock game interaction (used during teaching dialogues).
   */
  function setInteractionLocked(locked) {
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
      canvas.style.pointerEvents = locked ? 'none' : '';
    }
    document.querySelectorAll('.num-btn, #toolbar button').forEach(el => {
      el.style.pointerEvents = locked ? 'none' : '';
    });
  }

  // === Rule45 Banner (顶部常驻 HUD) - 已迁移到 UIManager ===
  function initRule45Banner() { return UIManager.initRule45Banner(); }
  function showRule45Banner() { return UIManager.showRule45Banner(); }
  function hideRule45Banner() { return UIManager.hideRule45Banner(); }
  function toggleRule45Banner() { return UIManager.toggleRule45Banner(); }
  function updateRule45Banner(cell) { return UIManager.updateRule45Banner(cell); }

  // ============================================================
  //  提示播放器（Hint Player）- 动画式推理展示
  //  已迁移到 expert/HintPlayer.js
  // ============================================================

  /**
   * 初始化 HintPlayer（注入依赖）
   * 在 board/renderer 就绪后调用
   * 注：HintPlayerState 已在模块加载时指向 HintPlayer.state
   */
  function _initHintPlayer() {
    HintPlayer.init({
      getRenderer: () => renderer,
      getTechMatrix: () => techMatrix,
      getWhatIfState: () => WhatIfState,
      getAudioService: () => AudioService,
      showCharacterBubble: showCharacterBubble,
      showFloatBar: showFloatBar,
      hideFloatBar: hideFloatBar,
      updateFloatBarTabIcon: _updateFloatBarTabIcon,
    });
  }

  // === 转发函数：HintPlayer ===
  function playHintAnimation(hint) { return HintPlayer.playAnimation(hint); }
  function skipHintStep() { return HintPlayer.skipStep(); }
  function stopHintAnimation() { return HintPlayer.stopAnimation(); }

  // ============================================================
  //  解说系统（Narration System）
  //  已迁移到 expert/NarrationSystem.js
  // ============================================================

  /**
   * NarrationSystem 初始化（状态已在模块加载时引用）
   * 保留此函数以保持 initBoard 中的调用链一致
   */
  function _initNarrationSystem() {
    // NarrationState 已在顶部指向 NarrationSystem.state
    // 此处留空，供未来扩展使用
  }

  // === 转发函数：NarrationSystem ===
  function showNarrationBubble(options) { return NarrationSystem.showBubble(options); }
  function updateNarrationText(text, speed) { return NarrationSystem.updateText(text, speed); }
  function updateNarrationStep(stepNum, totalSteps) { return NarrationSystem.updateStep(stepNum, totalSteps); }
  function hideNarrationBubble() { return NarrationSystem.hideBubble(); }
  function _generateNarration(stepType, stepData, hint) { return NarrationSystem.generateNarration(stepType, stepData, hint); }
  function _skipTypewriter() { return NarrationSystem.skipTypewriter(); }
  function _getNarrationTemplate(technique) { return NarrationSystem._getNarrationTemplate(technique); }
  function _startTypewriter(text, element, speed) { return NarrationSystem._startTypewriter(text, element, speed); }
  function _stepTypeToEvidenceLayer(stepType) { return HintPlayer._stepTypeToEvidenceLayer(stepType); }
  function _buildArrowData(hint, targetCell) { return HintPlayer._buildArrowData(hint, targetCell); }
  function _normalizeEvidence(hint) { return HintPlayer._normalizeEvidence(hint); }
  function _buildHintAnimationSteps(hint) { return HintPlayer._buildHintAnimationSteps(hint); }
  function _getHintAvatar(characterId) { return HintPlayer._getHintAvatar(characterId); }
  function _onHintAnimationComplete(hint) { return HintPlayer._onHintAnimationComplete(hint); }

  // 向后兼容：解说模板引用
  const NARRATION_TEMPLATES = NarrationSystem ? NarrationSystem.templates : {};

  // ============================================================
  //  What If 假设模式（分支快照系统）— 已迁移到 WhatIfManager.js
  //  WhatIfState 指向 whatIfManager 实例（保持向后兼容）
  // ============================================================
  let WhatIfState = null; // 将在 _initWhatIfManager 中赋值

  /**
   * 创建棋盘快照（深拷贝关键状态）
   */
  function _createWhatIfSnapshot(label) {

    return whatIfManager._createWhatIfSnapshot(label);

  }

  /**
   * 检查当前棋盘状态与根快照相比是否有变化
   * 用于 beforeunload 时判断是否需要确认离开
   * @param {Object} rootSnapshot - 根快照
   * @returns {boolean}
   */
  function _hasChangesFromRoot(rootSnapshot) {

    return whatIfManager._hasChangesFromRoot(rootSnapshot);

  }

  /**
   * 从快照恢复棋盘状态
   */
  function _restoreWhatIfSnapshot(snapshot) {

    return whatIfManager._restoreWhatIfSnapshot(snapshot);

  }

  /**
   * 生成快照缩略图（使用离屏canvas）
   */
  function _createSnapshotThumbnail(snapshot, index) {

    return whatIfManager._createSnapshotThumbnail(snapshot, index);

  }

  /**
   * 渲染快照卡片到右侧浮条（扑克牌式堆叠）
   */
  function _renderWhatIfSnapshots() {

    return whatIfManager._renderWhatIfSnapshots();

  }

  /**
   * 更新拉扣头上的徽章数量
   */
  function _updateFloatBarBadge() {

    return whatIfManager._updateFloatBarBadge();

  }

  /**
   * 同步 What If 快照卡片到 PC 端面板
   */
  function _syncWhatIfSnapshotsToPc() {

    return whatIfManager._syncWhatIfSnapshotsToPc();

  }

  /**
   * 切换右侧浮条面板的展开/收起
   */
  function toggleFloatBarPanel() {
    const bar = document.getElementById('right-floating-bar');
    if (!bar) return;
    const isOpen = bar.classList.contains('panel-open');
    if (isOpen) {
      bar.classList.remove('panel-open');
    } else {
      bar.classList.add('panel-open');
    }
  }

  /**
   * 显示右侧浮条（拉扣头）
   */
  function showFloatBar(showPanel = false) {
    const bar = document.getElementById('right-floating-bar');
    if (!bar) return;
    bar.style.display = 'flex';
    if (showPanel) {
      bar.classList.add('panel-open');
    }
  }

  /**
   * 隐藏右侧浮条
   */
  function hideFloatBar() {
    const bar = document.getElementById('right-floating-bar');
    if (!bar) return;
    bar.style.display = 'none';
    bar.classList.remove('panel-open');
  }

  /**
   * 更新拉扣头图标（根据当前模式）
   */
  function _updateFloatBarTabIcon() {
    const icon = document.getElementById('float-bar-tab-icon');
    if (!icon) return;
    if (HintPlayerState && HintPlayerState.playing) {
      icon.textContent = '💡';
    } else if (WhatIfState && WhatIfState.active) {
      icon.textContent = '🧪';
    } else {
      icon.textContent = '💡';
    }
  }

  /**
   * 进入 What If 模式
   */
  function enterWhatIfMode() {

    return whatIfManager.enterMode();

  }

  /**
   * 实际执行进入 What If 模式的逻辑
   */
  function _doEnterWhatIf() {

    return whatIfManager._doEnter();

  }

  /**
   * 退出 What If 模式（回到根状态）
   */
  function exitWhatIfMode(adoptChanges) {

    return whatIfManager.exitMode(adoptChanges);

  }

  /**
   * 切换 What If 模式
   */
  function toggleWhatIfMode() {

    return whatIfManager.toggleMode();

  }

  /**
   * 添加一个快照（填数后自动调用）
   */
  function addWhatIfSnapshot(label) {

    return whatIfManager.addSnapshot(label);

  }

  /**
   * 跳转到指定快照
   * P2优化：移除200ms延迟，使用快速过渡（<100ms），无白屏
   */
  function jumpToWhatIfSnapshot(index) {

    return whatIfManager.jumpToSnapshot(index);

  }

  /**
   * 回退一步（弹出栈顶快照）
   */
  function undoWhatIfStep() {

    return whatIfManager.undoStep();

  }

  /**
   * 采纳当前假设（写入正式棋盘）
   */
  function adoptWhatIfChanges() {

    return whatIfManager.adoptChanges();

  }

  /**
   * 彻底回退（回到根状态，不退出模式）
   */
  function resetWhatIfToRoot() {

    return whatIfManager.resetToRoot();

  }

  // === WhatIfManager 初始化（第四阶段抽离） ===
  function _initWhatIfManager() {
    whatIfManager = new WhatIfManager({
      board: board,
      renderer: renderer,
      techMatrix: techMatrix,
      lessonPlayer: null, // 教学引导由 lessonUICoordinator 管理
      AudioService: AudioService,
      onShowToast: showToast,
      onUpdateRule45Banner: updateRule45Banner,
      isCompleted: () => isCompleted,
      isStoryPlaying: () => storyEngine && storyEngine._isPlaying,
      onUpdateFloatBarTabIcon: _updateFloatBarTabIcon,
    });
    // 向后兼容：WhatIfState 指向 whatIfManager 实例
    WhatIfState = whatIfManager;

    // 同步到 gameController
    if (gameController) {
      gameController.whatIfManager = whatIfManager;
    }
  }

  // === Technique Encyclopedia ===
  let _techniquePanelEl = null;
  let _techniquePanelVisible = false;

  function toggleTechniqueEncyclopedia() {
    if (_techniquePanelVisible) {
      hideTechniqueEncyclopedia();
    } else {
      showTechniqueEncyclopedia();
    }
  }

  function showTechniqueEncyclopedia() {
    if (_techniquePanelVisible) return;
    _techniquePanelVisible = true;

    // Get teaching system data
    const teachingSys = global.guideTeachingSystem;
    const learned = teachingSys ? teachingSys.getLearnedTechniques() : [];
    const allTechniques = teachingSys ? teachingSys.getAllTechniques() : [];

    // Create panel
    const panel = document.createElement('div');
    panel.id = 'technique-encyclopedia';
    _techniquePanelEl = panel;

    panel.style.cssText =
      'position:fixed;top:0;right:0;width:100%;max-width:420px;height:100%;' +
      'background:rgba(15,23,42,0.98);' +
      'border-left:1px solid rgba(251,191,36,0.3);' +
      'z-index:20000;' +
      'transform:translateX(100%);' +
      'transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);' +
      'display:flex;flex-direction:column;' +
      'backdrop-filter:blur(12px);';

    // Category labels
    const categoryNames = {
      basic: '基础技巧',
      intermediate: '进阶技巧',
      killer: '杀手数独',
    };

    // Mastery labels
    const masteryLabels = ['未学习', '初次见面', '略有印象', '基本掌握', '熟练运用', '融会贯通'];
    const masteryColors = ['#64748b', '#94a3b8', '#3b82f6', '#22c55e', '#f59e0b', '#fbbf24'];

    // Build technique list
    let techniquesHTML = '';
    const categories = { basic: [], intermediate: [], killer: [] };

    if (teachingSys) {
      for (const techId of allTechniques) {
        const info = teachingSys.getTechniqueInfo(techId);
        if (info && categories[info.category]) {
          categories[info.category].push(info);
        }
      }
    }

    for (const [cat, list] of Object.entries(categories)) {
      if (list.length === 0) continue;
      techniquesHTML +=
        '<div style="margin-bottom:20px;">' +
        '<div style="font-size:11px;color:#fbbf24;letter-spacing:3px;margin-bottom:8px;padding-left:4px;">' +
        (categoryNames[cat] || cat) + '</div>';
      for (const tech of list) {
        const level = tech.masteryLevel || 0;
        const pct = Math.min(100, level * 20);
        const isLocked = !tech.learned;
        techniquesHTML +=
          '<div style="' +
            'background:rgba(30,41,59,0.8);' +
            'border:1px solid ' + (isLocked ? 'rgba(100,116,139,0.2)' : 'rgba(251,191,36,0.2)') + ';' +
            'border-radius:10px;' +
            'padding:12px;' +
            'margin-bottom:8px;' +
            'opacity:' + (isLocked ? '0.5' : '1') + ';' +
          '">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
              '<span style="font-size:14px;font-weight:700;color:' + (isLocked ? '#64748b' : '#fef3c7') + ';">' +
                (isLocked ? '🔒 ' + '???' : tech.name) + '</span>' +
              '<span style="font-size:10px;color:' + masteryColors[level] + ';letter-spacing:1px;">' +
                masteryLabels[level] + '</span>' +
            '</div>' +
            '<div style="font-size:11px;color:#94a3b8;line-height:1.5;margin-bottom:8px;">' +
              (isLocked ? '尚未发现此技巧' : tech.description) +
            '</div>' +
            (isLocked ? '' :
              '<div style="height:4px;background:rgba(100,116,139,0.2);border-radius:2px;overflow:hidden;">' +
                '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,' + masteryColors[level] + ',' + masteryColors[Math.min(5, level + 1)] + ');border-radius:2px;transition:width 0.3s;"></div>' +
              '</div>' +
              '<div style="font-size:9px;color:#64748b;margin-top:4px;text-align:right;">' +
                '遇见 ' + tech.encounterCount + ' 次 · 正确 ' + (tech.correctCount || 0) + ' 次' +
              '</div>'
            ) +
          '</div>';
      }
      techniquesHTML += '</div>';
    }

    if (learned.length === 0 && allTechniques.length === 0) {
      techniquesHTML =
        '<div style="text-align:center;color:#64748b;padding:40px 20px;">' +
        '<div style="font-size:48px;margin-bottom:16px;">📖</div>' +
        '<div style="font-size:14px;">教学系统未加载</div>' +
        '</div>';
    } else if (learned.length === 0) {
      techniquesHTML =
        '<div style="text-align:center;color:#64748b;padding:40px 20px;">' +
        '<div style="font-size:48px;margin-bottom:16px;">🔍</div>' +
        '<div style="font-size:14px;margin-bottom:8px;">还没有发现任何技巧</div>' +
        '<div style="font-size:11px;">点击提示按钮，在解谜中学习新技巧吧！</div>' +
        '</div>';
    }

    panel.innerHTML =
      // Header
      '<div style="padding:20px 20px 16px;border-bottom:1px solid rgba(251,191,36,0.2);display:flex;align-items:center;justify-content:space-between;">' +
        '<div>' +
          '<div style="font-size:18px;font-weight:900;color:#fef3c7;letter-spacing:2px;">📖 技巧图鉴</div>' +
          '<div style="font-size:11px;color:#94a3b8;margin-top:4px;">' +
            '已掌握 ' + learned.length + ' / ' + allTechniques.length + ' 种技巧' +
          '</div>' +
        '</div>' +
        '<div id="tech-panel-close" style="font-size:20px;color:#64748b;cursor:pointer;padding:4px 8px;" title="关闭">✕</div>' +
      '</div>' +
      // Content
      '<div style="flex:1;overflow-y:auto;padding:16px 20px;">' +
        techniquesHTML +
      '</div>';

    document.body.appendChild(panel);

    // Animate in
    requestAnimationFrame(() => {
      panel.style.transform = 'translateX(0)';
    });

    // Close button
    panel.querySelector('#tech-panel-close').addEventListener('click', () => {
      hideTechniqueEncyclopedia();
    });

    EventLogger.log('game:techniques', { visible: true });
  }

  function hideTechniqueEncyclopedia() {
    if (!_techniquePanelVisible || !_techniquePanelEl) return;
    _techniquePanelVisible = false;

    const panel = _techniquePanelEl;
    panel.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (panel.parentNode) panel.remove();
    }, 300);
    _techniquePanelEl = null;

    EventLogger.log('game:techniques', { visible: false });
  }

  // === Hint Limit (per cycle) ===
  function getMaxHints() {
    // Base hints based on grid size
    const gridSize = currentLevelData ? (currentLevelData.gridSize || 9) : 9;
    let baseHints = gridSize <= 4 ? 5 : gridSize <= 6 ? 8 : 12;

    // Apply cycle multiplier
    if (global.ProgressManager) {
      const mods = ProgressManager.getCycleModifiers();
      baseHints = Math.max(1, Math.floor(baseHints * mods.hintMultiplier));
    }

    return baseHints;
  }

  function canUseHint() {
    return hintCount < getMaxHints();
  }

  // === Update Number Pad (转发到 UIManager) ===
  function updateNumPad() { return UIManager.updateNumPad(); }

  // === Number Input（已迁移到 core/CellInputHandler.js）===
  function handleNumberInput(num, targetCell) {
    return cellInputHandler && cellInputHandler.handleNumberInput(num, targetCell);
  }

  // === Three-Act Guide (三幕式引导) v2 （第六阶段抽离至 game/ThreeActEngine.js） ===
  // 向后兼容：ThreeActGuide 变量指向 threeActEngine 实例
  // 所有逻辑已迁移到 ThreeActEngine 类

  // ============================================================
  // WinConditionManager - 分层过关系统
  // 已迁移至 game/WinConditionManager.js
  // 向后兼容：WinConditionManager 已在文件顶部从 window 导入
  // ============================================================

  // === Completion Check ===

  /**
   * 独立规则校验：不依赖 solution 数组，验证数独所有规则
   * 包括：每行/列/宫 1-size 不重复，每个笼子和值正确，没有空格子
   * @returns {Object} { valid: boolean, filled: boolean, errors: [{r, c, type}] }
   */
  function validateBoard() {
    if (!board) return { valid: false, filled: false, errors: [] };

    const size = board.size;
    const errors = [];
    let filled = true;

    // 检查是否所有格子都填了
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        const val = cell.fixedNum || cell.fillNum;
        if (!val) {
          filled = false;
        }
      }
    }

    // 行校验：每行 1-size 不重复
    for (let r = 0; r < size; r++) {
      const seen = new Set();
      for (let c = 0; c < size; c++) {
        const val = board.cells[r][c].fixedNum || board.cells[r][c].fillNum;
        if (!val) continue;
        if (seen.has(val)) {
          // 找到冲突的两个格子
          for (let cc = 0; cc < c; cc++) {
            const pv = board.cells[r][cc].fixedNum || board.cells[r][cc].fillNum;
            if (pv === val) {
              errors.push({ r, c, type: 'row' });
              errors.push({ r, c: cc, type: 'row' });
              break;
            }
          }
        } else {
          seen.add(val);
        }
      }
    }

    // 列校验：每列 1-size 不重复
    for (let c = 0; c < size; c++) {
      const seen = new Set();
      for (let r = 0; r < size; r++) {
        const val = board.cells[r][c].fixedNum || board.cells[r][c].fillNum;
        if (!val) continue;
        if (seen.has(val)) {
          for (let rr = 0; rr < r; rr++) {
            const pv = board.cells[rr][c].fixedNum || board.cells[rr][c].fillNum;
            if (pv === val) {
              errors.push({ r, c, type: 'col' });
              errors.push({ r: rr, c, type: 'col' });
              break;
            }
          }
        } else {
          seen.add(val);
        }
      }
    }

    // 宫校验：每宫 1-size 不重复
    const { boxW, boxH } = board.getBoxSize ? board.getBoxSize() : { boxW: 3, boxH: 3 };
    const boxRows = Math.ceil(size / boxH);
    const boxCols = Math.ceil(size / boxW);
    for (let boxR = 0; boxR < boxRows; boxR++) {
      for (let boxC = 0; boxC < boxCols; boxC++) {
        const seen = new Map();
        for (let r = boxR * boxH; r < boxR * boxH + boxH && r < size; r++) {
          for (let c = boxC * boxW; c < boxC * boxW + boxW && c < size; c++) {
            const val = board.cells[r][c].fixedNum || board.cells[r][c].fillNum;
            if (!val) continue;
            if (seen.has(val)) {
              const prev = seen.get(val);
              errors.push({ r, c, type: 'box' });
              errors.push({ r: prev.r, c: prev.c, type: 'box' });
            } else {
              seen.set(val, { r, c });
            }
          }
        }
      }
    }

    // 笼和校验：每个笼子和值正确（仅当所有格子都填了时才校验）
    if (board.cages && board.cages.length > 0) {
      for (const cage of board.cages) {
        if (!cage.cells || cage.hiddenSum || typeof cage.sum !== 'number') continue;
        let sum = 0;
        let allFilled = true;
        const seen = new Set();
        let hasDup = false;
        for (const [r, c] of cage.cells) {
          const val = board.cells[r]?.[c]?.fixedNum || board.cells[r]?.[c]?.fillNum;
          if (!val) {
            allFilled = false;
            break;
          }
          sum += val;
          if (seen.has(val)) {
            hasDup = true;
          }
          seen.add(val);
        }
        if (!allFilled) continue;
        // 笼内数字重复
        if (hasDup) {
          for (const [r, c] of cage.cells) {
            errors.push({ r, c, type: 'cage_dup' });
          }
        }
        // 笼和错误
        if (sum !== cage.sum) {
          for (const [r, c] of cage.cells) {
            errors.push({ r, c, type: 'cage_sum' });
          }
        }
      }
    }

    // 去重错误格子
    const uniqueErrors = [];
    const seenErrors = new Set();
    for (const err of errors) {
      const key = `${err.r},${err.c}`;
      if (!seenErrors.has(key)) {
        seenErrors.add(key);
        uniqueErrors.push(err);
      }
    }

    const valid = filled && uniqueErrors.length === 0;
    return { valid, filled, errors: uniqueErrors };
  }

  /**
   * 判断棋盘是否完成：以规则校验为主，答案比对为辅
   */
  function isBoardComplete() {
    if (!board || !currentLevelData) return false;

    // 主校验：独立规则校验
    const result = validateBoard();
    if (!result.valid) return false;

    // 辅助校验：与 solution 比对（双重保险）
    const solution = currentLevelData.solution;
    if (solution) {
      for (let r = 0; r < board.size; r++) {
        for (let c = 0; c < board.size; c++) {
          const cell = board.cells[r][c];
          const filled = cell.fixedNum || cell.fillNum;
          if (filled !== solution[r][c]) return false;
        }
      }
    }

    return true;
  }

  /**
   * 高亮所有错误格子（当棋盘填满但有错误时）
   */
  function highlightAllErrors() {
    if (!board) return;
    const result = validateBoard();
    if (!result.filled) return false;

    // 标记所有错误格子
    for (const err of result.errors) {
      const cell = board.cells[err.r]?.[err.c];
      if (cell) {
        cell.isError = true;
      }
    }

    if (renderer) {
      renderer.render(board);
    }

    return result.errors.length > 0;
  }

  function checkCompletion() {
    // Boss战中，由Boss战系统控制胜负，不自动通关
    if (typeof GuideBattle !== 'undefined' && (GuideBattle.active || GuideBattle.ended)) {
      return;
    }
    // 已经通关的不重复触发
    if (isCompleted) return;

    try {
      const isBossLvl = isLastLevelOfChapter();

      // === 1. 检查是否100%完成（Boss关必须100%，非Boss关也可能玩家手动填完） ===
      if (isBoardComplete()) {
        _triggerLevelComplete();
        return;
      }

      // === 2. 非Boss关：检查分层过关条件 ===
      if (!isBossLvl && currentLevelData && board) {
        // 三幕式引导：检测阶段切换（simple→gate→avalanche）
        if (typeof ThreeActGuide !== 'undefined') {
          try { ThreeActGuide.onFillCheck(); } catch(e) {}
        }

        // 检查是否满足分层通关条件（内部使用 pristine heatmap）
        const won = WinConditionManager.checkWinCondition(
          board, currentLevelData, isBossLvl
        );

        if (won) {
          // 满足通关条件：先自动补全，再触发通关
          const autoFillCells = WinConditionManager.getAutoFillCells(
            board, currentLevelData, isBossLvl
          );

          const levelType = WinConditionManager.getLevelType(currentLevelData, isBossLvl);
          log.info('[WinCondition] 分层通关触发:', levelType, '自动补全', autoFillCells.length, '格');

          _playAutoFillAnimation(autoFillCells, levelType, () => {
            _triggerLevelComplete();
          });
          return;
        }
      }

      // === 3. 未通关：检查是否填满但有错误（原逻辑） ===
      _checkFilledWithErrors();

    } catch(e) {
      log.error('checkCompletion error:', e);
    }
  }

  /**
   * 检查棋盘是否填满但有错误（原 checkCompletion 中的错误检测逻辑）
   */
  function _checkFilledWithErrors() {
    const result = validateBoard();
    if (result.filled && result.errors.length > 0) {
      try { highlightAllErrors(); } catch(e) {}
      showToast('还有地方不对哦~');
      vibrate(VIBRATE_PRESETS.ERROR);
    }
  }

  /**
   * 播放自动补全动画（逐格填入，带雪崩加速效果）
   * @param {Array} autoFillCells - 需要自动补全的格子列表 [{r, c, value, category, order}]
   * @param {string} levelType - 关卡类型（决定动画速度和加速曲线）
   * @param {Function} onComplete - 完成回调
   *
   * 动画速度设计：
   *   - 新手关 (novice)：较慢，让玩家看清楚，轻度加速
   *   - 中盘关 (midgame)：中等速度，中度加速
   *   - 收官关 (endgame)：雪崩效果，明显加速（越往后越快）
   *
   * 加速曲线：使用 ease-in 曲线，后段速度提升更明显
   *   delay(progress) = baseDelay * (1 - acceleration * progress^2)
   *   最终速度 = baseDelay * (1 - acceleration)
   */
  function _playAutoFillAnimation(autoFillCells, levelType, onComplete) {
    if (!autoFillCells || autoFillCells.length === 0) {
      if (onComplete) onComplete();
      return;
    }

    isCompleted = true; // 标记为已通关，防止重复触发
    // 暂停计时器（通关时刻开始算）
    if (gameTimer) try { gameTimer.pause(); } catch(e) {}

    const total = autoFillCells.length;

    // ============================================================
    // 速度配置（根据关卡类型）
    // ============================================================
    let baseDelay;      // 初始延迟（ms）
    let minDelay;       // 最小延迟（ms）— 防止太快看不清
    let acceleration;   // 加速度系数（0~1，越大加速越猛）

    switch (levelType) {
      case 'novice':
        // 新手关：慢节奏，轻度加速（让玩家理解发生了什么）
        baseDelay = 80;
        minDelay = 40;
        acceleration = 0.4;  // 最快到 60% 速度
        break;

      case 'midgame':
        // 中盘关：中等节奏，中度加速
        baseDelay = 65;
        minDelay = 25;
        acceleration = 0.55; // 最快到 45% 速度
        break;

      case 'endgame':
      default:
        // 收官关（雪崩）：快节奏，强力加速（越往后越快的爽感）
        baseDelay = 50;
        minDelay = 12;
        acceleration = 0.75; // 最快到 25% 速度
        break;
    }

    // 格子很多时整体提速（避免动画太长）
    if (total > 50) {
      const scaleFactor = Math.max(0.5, 1 - (total - 50) * 0.01);
      baseDelay = Math.max(minDelay, baseDelay * scaleFactor);
    }

    let index = 0;
    let prevCellInfo = null;  // 上一个被填的格子，用于绘制雪崩光线

    // 雪崩开始音效（仅 endgame 类型播放完整雪崩音效）
    if (levelType === 'endgame') {
      try { AudioService.synth.playAvalancheStart(); } catch(e) {}
    } else {
      // novice/midgame 用简单的 success 音效
      try { AudioService.sfx.play('success'); } catch(e) {}
    }

    // 雪崩开始：清空旧的光线
    if (levelType === 'endgame' && renderer && typeof renderer.clearAvalancheRays === 'function') {
      try { renderer.clearAvalancheRays(); } catch(e) {}
    }

    function fillNext() {
      if (index >= total) {
        // 动画完成：确保最后一帧完整渲染
        updateNumBtnCompletedState();
        if (renderer) {
          try { renderer.render(board); } catch(e) {}
        }

        // 雪崩结束音效（仅 endgame 类型）
        if (levelType === 'endgame') {
          try { AudioService.synth.playAvalancheEnd(); } catch(e) {}
        }

        if (onComplete) onComplete();
        return;
      }

      const cellInfo = autoFillCells[index];
      const { r, c, value, category } = cellInfo;

      // 雪崩光线：从上一个 core 格连接到当前格（仅 endgame 类型）
      if (levelType === 'endgame' && prevCellInfo && renderer &&
          typeof renderer.addAvalancheRay === 'function') {
        try {
          renderer.addAvalancheRay(prevCellInfo.r, prevCellInfo.c, r, c, 400);
        } catch(e) {}
      }

      // 填入数字（不记入历史，因为是自动补全）
      try {
        board.setNumberAt(r, c, value, {
          recordHistory: false,
          autoClear: true,
        });
      } catch (e) {
        // 兜底：直接设置 fillNum
        const cell = board.cells[r]?.[c];
        if (cell && !cell.fixedNum) {
          cell.fillNum = value;
        }
      }

      // 触发填数动画
      if (renderer && typeof renderer.triggerFillAnimation === 'function') {
        try {
          renderer.triggerFillAnimation(r, c, 200);
        } catch(e) {}
      }

      // 记录上一个格子位置（用于下一条光线）
      prevCellInfo = cellInfo;

      // 渲染策略：每 N 格重绘一次（格子越多，间隔越大，保证流畅）
      // 收官关（雪崩）渲染间隔更大，强化"飞速填满"的视觉感
      let renderInterval;
      if (levelType === 'endgame') {
        renderInterval = total > 40 ? 5 : (total > 20 ? 4 : 3);
      } else {
        renderInterval = total > 40 ? 4 : 3;
      }

      if (index % renderInterval === 0 || index === total - 1) {
        if (renderer) {
          try { renderer.render(board); } catch(e) {}
        }
      }

      // 播放音效
      // 雪崩阶段（endgame）：使用合成器的渐进式音阶音效
      // 其他阶段：使用普通 fill_correct 音效
      if (levelType === 'endgame') {
        // 雪崩音效：使用合成器，音高随进度上升
        // 控制播放频率：前半段间隔稍长，后半段更密集
        const progress = index / total;
        let sfxInterval;
        if (progress < 0.5) {
          // 前半段：间隔稍大（约每3-4格播一次）
          sfxInterval = 3;
        } else {
          // 后半段：更密集（约每2格播一次），配合加速感
          sfxInterval = 2;
        }

        if (index % sfxInterval === 0) {
          try {
            // 用当前已填入的数量作为"tick"索引，音高随进度上升
            AudioService.synth.playAvalancheTick(index, total);
          } catch(e) {}
        }
      } else {
        // 非雪崩关卡：使用普通 fill_correct 音效，固定间隔
        const sfxInterval = 4;
        if (index % sfxInterval === 0) {
          try { AudioService.sfx.play('fill_correct'); } catch(e) {}
        }
      }

      index++;

      // ============================================================
      // 雪崩加速：使用 ease-in 二次曲线
      // delay = baseDelay * (1 - acceleration * progress^2)
      // 特点：开始慢，后面越来越快，符合"雪崩"的感觉
      // ============================================================
      let delay = baseDelay;
      if (total > 10 && acceleration > 0) {
        const progress = index / total;
        // 二次方曲线：前半段平缓加速，后半段猛烈加速
        const speedFactor = 1 - acceleration * progress * progress;
        delay = baseDelay * speedFactor;
        delay = Math.max(minDelay, delay);
      }

      setTimeout(fillNext, delay);
    }

    // 开始动画
    fillNext();
  }

  /**
   * 触发关卡完成（统一通关逻辑，供 checkCompletion 和自动补全完成后调用）
   */
  function _triggerLevelComplete() {
    isCompleted = true;

    // 三幕指示灯：设置为通关状态
    if (typeof ThreeActGuide !== 'undefined') {
      try { ThreeActGuide.setComplete(); } catch(e) {}
    }

    // Stop BGM
    try { AudioService.bgm.stop(); } catch(e) { log.warn('BGM stop error:', e); }

    // Get expert report
    let report = { totalWrong: 0 };
    try {
      report = expertSystem.onLevelEnd();
    } catch(e) {
      log.error('expertSystem.onLevelEnd error:', e);
    }

    // === GameContext 学习层：关卡结束时更新玩家风格 ===
    try {
      if (expertSystem && expertSystem.learning &&
          typeof expertSystem.learning.updateStyleFromContext === 'function') {
        expertSystem.learning.updateStyleFromContext();
      }
    } catch(e) {
      log.warn('learning.updateStyleFromContext error:', e);
    }

    // 用 gameTimer 获取时间（如果可用），否则回退到 startTime 计算
    const elapsed = gameTimer ? gameTimer.getTime() : Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    // 暂停计时器（如果还没暂停）
    if (gameTimer) try { gameTimer.pause(); } catch(e) {}

    // Calculate grade
    let grade = { letter: 'C', color: '#ffc107' };
    try {
      grade = calculateGrade(elapsed, report.totalWrong || errorCount || 0, hintCount);
    } catch(e) { log.error('calculateGrade error:', e); }

    // Save progress
    try {
      saveProgress(elapsed, report.totalWrong || errorCount || 0, hintCount, grade.letter);
    } catch(e) { log.error('saveProgress error:', e); }

    // Play victory BGM
    try { AudioService.bgm.playFile('victory_full.wav'); } catch(e) {}

    // Play clear dialog first, then show overlay
    const showOverlay = () => {
      try {
        // Show completion overlay
        const overlay = document.getElementById('complete-overlay');
        if (overlay) {
          overlay.style.display = 'flex';
          overlay.style.opacity = '0';
          requestAnimationFrame(() => {
            overlay.style.transition = 'opacity 0.5s ease';
            overlay.style.opacity = '1';
          });

          const gradeEl = document.getElementById('complete-grade');
          if (gradeEl) {
            gradeEl.textContent = grade.letter;
            gradeEl.style.color = grade.color;
          }

          document.getElementById('complete-time').textContent = '用时 ' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
          document.getElementById('complete-errors').textContent = '错误 ' + (report.totalWrong || 0) + ' 次';

          // Add hints display
          const hintsEl = document.getElementById('complete-hints');
          if (hintsEl) {
            hintsEl.textContent = '提示 ' + hintCount + ' 次';
          }

          let insight = '';
          try {
            const learning = expertSystem.getLearning();
            insight = learning.generateComment({
              nonTrivialRatio: 0.3,
              maxTechLevel: 5,
              score: 500,
            });
          } catch(e) { log.error('learning.generateComment error:', e); }
          document.getElementById('complete-insight').textContent = insight;

          // Update next level button text based on position
          try { updateNextLevelButton(); } catch(e) {}
        }

        // Play victory sound
        try { AudioService.sfx.play('victory'); } catch(e) {}
        log.info('Level completed:', currentLevelId, 'grade:', grade.letter);
      } catch(e) {
        log.error('Show completion overlay error:', e);
        // 最后兜底：直接显示结算画面
        const overlay = document.getElementById('complete-overlay');
        if (overlay) overlay.style.display = 'flex';
      }
    };

    // Play clear dialog first, then play climax animation, then show overlay
    const playClimaxAndShowOverlay = () => {
      // 判断是否播放高潮动画：排除 Boss 战和新手关（101-109）
      const isBossLevel = typeof isLastLevelOfChapter === 'function' ? isLastLevelOfChapter() : false;
      const levelIdNum = parseInt(currentLevelId);
      const isNoviceLevel = levelIdNum >= 101 && levelIdNum <= 109;

      if (isBossLevel || isNoviceLevel) {
        // 跳过高潮动画，直接显示结算面板
        showOverlay();
        return;
      }

      // 播放通关高潮动画
      try {
        playClimaxAnimation(showOverlay);
      } catch(e) {
        log.error('playClimaxAnimation error:', e);
        showOverlay();
      }
    };

    // Play clear dialog first, then show overlay
    try {
      playClearDialog(playClimaxAndShowOverlay);
    } catch(e) {
      log.error('playClearDialog error:', e);
      playClimaxAndShowOverlay();
    }
  }

  /**
   * 播放通关高潮动画（破案印章四步序列）
   * 已迁移至 game/achievement-coordinator.js (AchievementCoordinator)
   */
  function playClimaxAnimation(callback) {
    if (!achievementCoordinator) {
      if (callback) callback();
      return;
    }
    achievementCoordinator.playClimaxAnimation(callback);
  }
  // === Save Progress ===
  function saveProgress(timeSeconds, errors, hints, grade) {
    if (!global.ProgressManager) return;

    // Save level score
    const isNewBest = ProgressManager.setLevelScore(currentLevelId, {
      time: timeSeconds,
      errors: errors,
      hints: hints,
      grade: grade,
    });

    // 检查成就
    checkAchievements(timeSeconds, errors, hints, grade);

    // 刷新成就面板
    if (achievementCoordinator) {
      achievementCoordinator.refreshAchievementPanel();
    }

    // Unlock next chapter if this is the last level of current chapter
    if (isLastLevelOfChapter() && currentChapterData) {
      const nextChapterId = currentChapterData.chapterId + 1;
      if (findChapterById(nextChapterId)) {
        ProgressManager.unlockChapter(nextChapterId);
        log.info('Unlocked chapter:', nextChapterId);
      }
    }

    // 检查隐藏关解锁
    if (currentChapterData && chapterSelect && chapterSelect.chaptersData) {
      const newUnlocked = ProgressManager.checkAndUnlockHiddenLevels(
        currentChapterData.chapterId,
        chapterSelect.chaptersData
      );
      if (newUnlocked.length > 0) {
        showToast('✨ 新的隐藏关已解锁！');
        // 检查 all_hidden / all_hidden_levels 成就
        if (ProgressManager.getUnlockedHiddenCount() >=
            ProgressManager.getTotalHiddenCount(chapterSelect.chaptersData)) {
          ProgressManager.unlockAchievement('all_hidden');
          ProgressManager.unlockAchievement('all_hidden_levels');
        }
        // 检查 first_hidden_level 成就（第一个隐藏关解锁）
        if (ProgressManager.getUnlockedHiddenCount() >= 1) {
          ProgressManager.unlockAchievement('first_hidden_level');
        }
      }
      // 检查真结局解锁
      if (ProgressManager.checkTrueEndingUnlock(chapterSelect.chaptersData)) {
        showToast('🌟 真结局已解锁！');
      }
    }
  }

  // === 成就检查（已迁移至 GameController，向后兼容转发） ===
  function checkAchievements(timeSeconds, errors, hints, grade) {
    if (!gameController) return;
    gameController.checkAchievements(timeSeconds, errors, hints, grade);
  }

  // === 检查 note_master 成就（已迁移至 GameController，向后兼容转发） ===
  function checkNoteMasterAchievement() {
    if (!gameController) return;
    gameController.checkNoteMasterAchievement();
  }

  // === 印记系统：通关检查（已迁移至 GameController，向后兼容转发） ===
  function checkSealsOnComplete(timeSeconds, errors, hints) {
    if (!gameController) return;
    gameController.checkSealsOnComplete(timeSeconds, errors, hints);
  }

  // === 印记解锁动画 ===
  function showSealUnlockAnimation(sealDef) {

    return gameController.showSealUnlockAnimation(sealDef);

  }

  // === 技巧使用记录（用于技巧类成就） ===
  // 映射表已迁移到 game/achievement-coordinator.js (全局 TECHNIQUE_NAME_TO_ID)
  // detectTechniqueForFill 和 recordTechniqueUsage 已迁移到 GameController
  // 向后兼容：转发到 gameController

  /**
   * 检测玩家填入某格数字时使用的技巧（技术判定方案a）
   * 原理：创建 TechRater 并模拟求解过程，直到目标格被解出，
   *       记录解出该格时使用的"最低级可用技巧"。
   * @param {number} r - 行索引
   * @param {number} c - 列索引
   * @param {number} num - 填入的数字
   * @returns {string|null} 技巧ID（TechRater 风格，如 'nakedSingle'），无法检测则返回 null
   */
  function detectTechniqueForFill(r, c, num) {

    return gameController.detectTechniqueForFill(r, c, num);

  }

  /**
   * 记录技巧使用（接受中文名或 TechRater 风格ID）
   * 自动累计次数并检查技巧类成就
   * @param {string} techniqueName - 技巧名（中文名或TechRater ID）
   */
  function recordTechniqueUsage(techniqueName) {

    return gameController.recordTechniqueUsage(techniqueName);

  }

  // === 成就解锁Toast（第七阶段抽离至 achievementCoordinator） ===
  function showAchievementToast(achievement) {
    if (!achievementCoordinator) return;
    achievementCoordinator.showAchievementToast(achievement);
  }

  // === Grade Calculation ===
  function calculateGrade(elapsedSeconds, errors, hints) {

    return gameController.calculateGrade(elapsedSeconds, errors, hints);

  }

  // === Play Clear Dialog ===
  // 第七阶段抽离至 story/StoryOrchestrator.js
  function playClearDialog(callback) {
    return StoryOrchestrator.playClearDialog(callback);
  }

  // === Next Level ===
  function setupNextLevel() {

    return gameController.setupNextLevel();

  }

  function updateNextLevelButton() {


    return gameController.updateNextLevelButton();


  }

  function isLastLevelOfChapter() {
    if (!currentChapterData || !currentChapterData.levels) return false;
    const levels = currentChapterData.levels;
    // 只考虑普通关卡（非隐藏关）作为章节的最后一关
    const normalLevels = levels.filter(function(lvl) { return !lvl.isHidden; });
    if (normalLevels.length === 0) return false;
    const lastNormalLevel = normalLevels[normalLevels.length - 1];
    return parseInt(lastNormalLevel.levelId) === parseInt(currentLevelId);
  }

  function isLastChapterOfGame() {
    if (!global.CHAPTER_DATA || !global.CHAPTER_DATA.chapters) return false;
    const chapters = global.CHAPTER_DATA.chapters;
    // 真结局章如果已解锁则视为最后一章，否则只考虑普通章节
    const normalChapters = chapters.filter(function(ch) {
      if (global.ProgressManager && ProgressManager.isTrueEndingUnlocked()) {
        return true;
      }
      return !ch.isTrueEnding;
    });
    return normalChapters.length > 0 &&
      normalChapters[normalChapters.length - 1].chapterId === currentChapterData.chapterId;
  }

  function handleNextLevel() {


    return gameController.handleNextLevel();


  }

  /**
   * 在当前章节中查找下一个非隐藏关卡的ID
   * @param {number} currentId - 当前关卡ID
   * @returns {number|null} 下一关的ID，如果没有则返回null
   */
  function _findNextLevelId(currentId) {

    return gameController._findNextLevelId(currentId);

  }

  // === Chapter Epilogue ===
  // 第七阶段抽离至 story/StoryOrchestrator.js
  function playChapterEpilogue(callback) {
    return StoryOrchestrator.playChapterEpilogue(callback);
  }

  // === Chapter Transition Screen ===
  function showChapterTransition(callback) {
    const transition = document.getElementById('chapter-transition');
    if (!transition) {
      if (callback) callback();
      return;
    }

    const nextChapterId = currentChapterData.chapterId + 1;
    const nextChapter = findChapterById(nextChapterId);

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

  function findChapterById(chapterId) {
    if (!global.CHAPTER_DATA || !global.CHAPTER_DATA.chapters) return null;
    for (const ch of global.CHAPTER_DATA.chapters) {
      if (ch.chapterId === chapterId) return ch;
    }
    return null;
  }

  function goToNextChapter() {


    return gameController.goToNextChapter();


  }

  // === Game Ending（已抽离到 story/EndingManager.js）===
  function showGameEnding() { return EndingManager.showGameEnding(); }
  function showTrueEnding() { return EndingManager.showTrueEnding(); }
  function addTrueEndingReturnButton() { return EndingManager.addTrueEndingReturnButton(); }
  function addEndingReturnButton() { return EndingManager.addEndingReturnButton(); }

  // === Character Bubble ===
  /**
   * Show a lightweight character speech bubble (转发到 CharBubble).
   */
  function showCharacterBubble(characterId, options) { return CharBubble.show(characterId, options); }

  /**
   * Format bubble text with technique name highlighting (转发到 CharBubble).
   */
  function formatBubbleText(text, type) { return CharBubble.format(text, type); }

  /**
   * Hide the current character bubble (转发到 CharBubble).
   */
  function hideCharacterBubble() { return CharBubble.hide(); }

  // === Expert System Character Handlers（已抽离到 expert/ExpertCharacterHandler.js）===
  function registerExpertCharacterHandlers() { return ExpertCharacterHandler.registerExpertCharacterHandlers(); }
  function _getExpertDialogText(id) { return ExpertCharacterHandler._getExpertDialogText(id); }

  // === Pause Menu（已抽离到 ui/PauseManager.js）===
  function togglePause() { return PauseManager.togglePause(); }
  function showPauseMenu() { return PauseManager.showPauseMenu(); }
  function hidePauseMenu() { return PauseManager.hidePauseMenu(); }
  function updatePauseTime() { return PauseManager.updatePauseTime(); }
  // 弹窗栈管理工具（转发到 PauseManager）
  function _lockBodyScroll() { return PauseManager._lockBodyScroll(); }
  function _unlockBodyScroll() { return PauseManager._unlockBodyScroll(); }
  function _pushModal(id) { return PauseManager._pushModal(id); }
  function _popModal(id) { return PauseManager._popModal(id); }
  // 转发到 GameController
  function restartLevel() { return PauseManager.restartLevel(); }
  function goToChapterSelect() { return PauseManager.goToChapterSelect(); }
  function goToMainMenu() { return PauseManager.goToMainMenu(); }

  // === Toast (转发到 UIManager) ===
  function showToast(msg, duration) { return UIManager.showToast(msg, duration); }
  function hideToast() { return UIManager.hideToast(); }

  // === 调试工具集（已抽离到 core/DebugTools.js） ===
  const DEBUG_TOOLS = DebugTools.create({
    get board() { return board; },
    get renderer() { return renderer; },
    get GuideBattle() { return typeof GuideBattle !== 'undefined' ? GuideBattle : null; },
    restartLevel: restartLevel,
  });
  // 挂到window上，方便控制台直接调用
  global.DEBUG = DEBUG_TOOLS;

  // Expose
  global.guideInit = initBoard;
  global.showToast = showToast;
  global.showCharacterBubble = showCharacterBubble;
  global.hideCharacterBubble = hideCharacterBubble;

  // ============================================================
  //  自动化测试外部接口（方案A：JS API 直连，非 DOM 模拟）
  //  供 Playwright / Node.js 通过 page.evaluate 调用
  // ============================================================

  /**
   * 读取当前棋盘数字
   * @returns {number[][]} 9×9 二维数组，0 表示空白格，1~9 为数字（含固定题目数字和玩家填入数字）
   */
  global.getBoard = function () {
    if (!board || !board.cells) {
      console.warn('[AutoTest] getBoard: board not ready');
      return Array(9).fill(null).map(() => Array(9).fill(0));
    }
    const size = board.size || 9;
    const result = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        row.push(cell.fixedNum || cell.fillNum || 0);
      }
      result.push(row);
    }
    return result;
  };

  /**
   * 读取当前棋盘所有笼子数据（杀手数独求解必需）
   * @returns {Array<{sum: number, cells: Array<[number, number]>}>} 笼子数组，每个笼子包含和值和格子坐标列表
   */
  global.getCages = function () {
    if (!board || !board.cages) {
      return [];
    }
    return board.cages.map(function (cage) {
      return {
        sum: cage.sum,
        cells: cage.cells ? cage.cells.map(function (c) { return [c[0], c[1]]; }) : [],
      };
    });
  };

  /**
   * 在指定位置填入数字（同步触发 UI 渲染和冲突校验）
   * @param {number} row - 行号 (0~8)
   * @param {number} col - 列号 (0~8)
   * @param {number} num - 数字 (1~9)，传 0 表示擦除
   * @returns {{success: boolean, reason?: string}} 操作结果
   */
  global.setCell = function (row, col, num) {
    if (!board || !board.cells) {
      return { success: false, reason: 'board not ready' };
    }
    const size = board.size || 9;
    if (row < 0 || row >= size || col < 0 || col >= size) {
      return { success: false, reason: 'index out of range' };
    }
    const cell = board.cells[row][col];
    // 保护固定数字：题目预置数字禁止修改
    if (cell.fixedNum) {
      return { success: false, reason: 'fixed cell, cannot modify' };
    }
    if (cell.isLocked) {
      return { success: false, reason: 'cell is locked' };
    }
    if (num === 0 || num === null || num === undefined) {
      // 擦除
      cell.fillNum = null;
      cell.candidates.clear();
      cell.eliminations.clear();
    } else {
      if (num < 1 || num > size) {
        return { success: false, reason: 'num out of range' };
      }
      // 使用 board.setNumberAt，会触发冲突检测、自动清除笔记等
      const ok = board.setNumberAt(row, col, num, { recordHistory: false, autoClear: false });
      if (!ok) {
        return { success: false, reason: 'setNumberAt failed' };
      }
    }
    // 重新计算全棋盘错误标记
    if (typeof board._recomputeAllErrors === 'function') {
      board._recomputeAllErrors();
    } else {
      // 降级：逐格校验
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cc = board.cells[r][c];
          if (cc.fillNum) {
            const v = board._validateCell(r, c);
            cc.isError = v.hasConflict;
          }
        }
      }
    }
    // 触发渲染
    if (renderer) {
      renderer.forceRender = true;
      renderer.render(board);
    }
    return { success: true };
  };

  /**
   * 异步创建一局新题目（自动化测试专用，跳过剧情/对话/BGM）
   * @param {number|string} level - 关卡 ID 或难度标识
   * @returns {Promise<{success: boolean, levelId: number, reason?: string}>}
   */
  global.createNewGame = function (level) {
    return new Promise(async function (resolve) {
      try {
        const levelId = typeof level === 'number' ? level : (parseInt(level, 10) || 101);

        // 清理上一局的运行时状态
        try { _cleanupLevelState(); } catch (e) { /* ignore */ }

        currentLevelId = levelId;
        isCompleted = false;
        errorCount = 0;
        hintCount = 0;
        usedNotes = false;

        // 加载关卡数据
        await loadLevel(levelId);

        // 查找章节数据
        findChapter();

        // 直接初始化棋盘（跳过剧情、对话、BGM、Boss战等）
        initBoard();

        // 确保交互解锁
        setInteractionLocked(false);
        const canvas = document.getElementById('gameCanvas');
        if (canvas) canvas.style.pointerEvents = '';

        // 启动计时器
        if (gameTimer) {
          gameTimer.start();
        } else {
          startTime = Date.now();
        }

        // 保存上次游玩关卡
        if (global.ProgressManager && typeof ProgressManager.setLastPlayedLevel === 'function') {
          ProgressManager.setLastPlayedLevel(currentLevelId);
        }

        // 等待下一帧确保渲染完成
        requestAnimationFrame(() => {
          resolve({ success: true, levelId: levelId });
        });
      } catch (e) {
        resolve({ success: false, levelId: levelId, reason: String(e) });
      }
    });
  };

  /**
   * 校验当前棋盘完整性和规则合法性
   * @returns {{isComplete: boolean, errors: Array<{row: number, col: number, type: string}>}}
   */
  global.verifyAll = function () {
    if (!board || !board.cells) {
      return { isComplete: false, errors: [{ row: -1, col: -1, type: 'board_not_ready' }] };
    }
    const result = validateBoard();
    // 转换格式：errors 中的 r/c 改为 row/col
    const errors = (result.errors || []).map(e => ({
      row: e.r,
      col: e.c,
      type: e.type || 'unknown',
    }));
    return {
      isComplete: !!result.valid,
      errors: errors,
    };
  };

  // === 自动化测试专用接口 ===

  /**
   * 测试专用：直接启动Boss战（跳过所有对话）
   * @param {number} chapterId - 章节ID（默认当前章节）
   * @returns {{success: boolean, reason?: string}}
   */
  global.__testStartBossBattle = function (chapterId) {
    try {
      if (typeof GuideBattle === 'undefined') {
        return { success: false, reason: 'GuideBattle not loaded' };
      }
      const chId = chapterId || (currentChapterData?.chapterId);
      if (!chId) {
        return { success: false, reason: 'No chapterId' };
      }
      const bossConfig = GuideBattle.getBossConfig(chId);
      if (!bossConfig) {
        return { success: false, reason: 'No boss config for chapter ' + chId };
      }
      // 直接初始化Boss战，跳过对话
      _initBossBattle(bossConfig);
      return { success: true };
    } catch (e) {
      return { success: false, reason: String(e) };
    }
  };

  // 标记接口已就绪，供外部轮询检测
  global.__autoTestReady = true;

  // ============================================================
  //  PC 双栏布局切换逻辑（已抽离到 ui/PcLayoutManager.js）
  // ============================================================

  const pcLayoutManager = new PcLayoutManager({
    get board() { return board; },
    get renderer() { return renderer; },
    UIManager: UIManager,
    CharBubble: CharBubble,
    log: log,
  });
  pcLayoutManager.initEventListeners();

  // 向后兼容：转发函数
  function _isPcLayoutActive() { return pcLayoutManager.isPcLayoutActive(); }
  function _switchToPcLayout() { return pcLayoutManager.switchToPcLayout(); }
  function _switchToMobileLayout() { return pcLayoutManager.switchToMobileLayout(); }
  function _updateLayout() { return pcLayoutManager.updateLayout(); }
  function _syncRule45ToPc() { return pcLayoutManager.syncRule45ToPc(); }
  function _syncWhatIfToPc() { return pcLayoutManager.syncWhatIfToPc(); }
  function _syncTimerToPc() { return pcLayoutManager.syncTimerToPc(); }
  function _syncHintsToPc(count) { return pcLayoutManager.syncHintsToPc(count); }
  function _initPcButtons() { return pcLayoutManager.initPcButtons(); }
  function _syncToolbarState() { return pcLayoutManager.syncToolbarState(); }
  function _syncNumPadState() { return pcLayoutManager.syncNumPadState(); }

  // 暴露到全局供外部调用
  global.updatePcLayout = _updateLayout;
  global.syncRule45ToPc = _syncRule45ToPc;
  global.syncWhatIfToPc = _syncWhatIfToPc;
  global.syncToolbarStateToPc = _syncToolbarState;
  global.syncNumPadStateToPc = _syncNumPadState;
  global.syncTimerToPc = _syncTimerToPc;
  global.syncHintsToPc = _syncHintsToPc;
  global.isPcLayout = function() { return pcLayoutManager.isPcLayout(); };

})(window);
