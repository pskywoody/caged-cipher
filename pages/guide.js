// Guide.js - Main game controller (modular version)
// Expert system driven, modular, maintainable
// 第十一阶段：进一步瘦身，核心逻辑迁移到独立模块

;(function(global) {
  'use strict';

  // ============================================================
  //  模块导入（物理拆分，逻辑不变）
  // ============================================================
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
  const EventBinder = window.EventBinder;
  const EventBinderConfigurator = window.EventBinderConfigurator;
  const AISpeedController = window.AISpeedController;
  const BoardValidator = window.BoardValidator;
  const LevelStateManager = window.LevelStateManager;
  const GuideOrchestrator = window.GuideOrchestrator;

  // 常量（从 constants.js 导入）
  const Z_INDEX = window.Z_INDEX;
  const VIBRATE_PRESETS = window.VIBRATE_PRESETS;
  const CHAR_EMOJI = window.CHAR_EMOJI;
  const NAME_TO_CHAR = window.NAME_TO_CHAR;
  const UI_SELECTORS = window.UI_SELECTORS;

  const log = new Logger('Guide');

  // ============================================================
  //  状态变量
  // ============================================================
  let board = null;
  let renderer = null;
  let inputRouter = null;
  let expertSystem = null;
  let comboSystem = null;
  let comedySystem = null;
  let storyEngine = null;
  let currentLevelData = null;
  let currentChapterData = null;
  let currentLevelId = 101;
  let isCompleted = false;
  let startTime = 0;
  let noteMode = false;
  let hintSystem = null;
  let hintCount = 0;
  let errorCount = 0;
  let chapterSelect = null;
  let startedFromSelect = false;
  let settingsPanel = null;
  let techMatrix = null;
  let gameTimer = null;
  let isPaused = false;
  let pauseElapsedTime = 0;
  let usedNotes = false;
  let _debugMode = false;
  let _techniquePanelVisible = false;

  // 子模块实例引用
  let eventBinder = null;
  let cellInputHandler = null;
  let gameController = null;
  let whatIfManager = null;
  let autoHintSystem = null;
  let lessonUICoordinator = null;
  let achievementCoordinator = null;
  let heatmapManager = null;
  let techniqueEncyclopedia = null;
  let levelFeatureApplier = null;
  let threeActEngine = null;
  let bossCoordinator = null;
  let comboUI = null;
  let HintPlayerState = HintPlayer ? HintPlayer.state : null;
  let NarrationState = NarrationSystem ? NarrationSystem.state : null;
  let WhatIfState = null;

  // 管理器实例
  let orchestrator = null;

  // ============================================================
  //  全局属性暴露（供其他模块访问）
  // ============================================================
  Object.defineProperty(global, 'guideNoteMode', {
    get: function() { return noteMode; },
    set: function(v) { noteMode = v; },
    configurable: true,
  });
  Object.defineProperty(global, 'guideBoard', {
    get: function() { return board; },
    set: function(v) { board = v; },
    configurable: true,
  });

  // ============================================================
  //  工具函数（小函数，不拆）
  // ============================================================

  /**
   * 统一震动函数
   */
  function vibrate(pattern, presetName) {
    if (!board || !board.settings || board.settings.vibration === false) return;
    if (typeof navigator.vibrate !== 'function') return;
    try { navigator.vibrate(pattern); } catch(e) {}
  }

  /**
   * 带过渡动画的页面跳转
   */
  let _isNavigating = false;
  function navigateTo(url, options) {
    if (_isNavigating) return;
    _isNavigating = true;
    options = options || {};
    const delay = options.delay !== undefined ? options.delay : 400;
    const playSound = options.playSound !== false;
    if (playSound && typeof AudioService !== 'undefined' && AudioService.sfx) {
      try { AudioService.sfx.play('book_flip'); } catch(e) {}
    }
    const root = document.querySelector('.page-transition-root') || document.body;
    root.classList.add('page-leave');
    setTimeout(() => { window.location.href = url; }, delay);
  }

  /**
   * 交互锁定
   */
  function setInteractionLocked(locked) {
    const canvas = document.getElementById('gameCanvas');
    if (canvas) { canvas.style.pointerEvents = locked ? 'none' : ''; }
    document.querySelectorAll('.num-btn, #toolbar button').forEach(el => {
      el.style.pointerEvents = locked ? 'none' : '';
    });
  }

  // ============================================================
  //  查找章节
  // ============================================================
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
  function findChapterById(chapterId) {
    if (!global.CHAPTER_DATA || !global.CHAPTER_DATA.chapters) return null;
    for (const ch of global.CHAPTER_DATA.chapters) {
      if (ch.chapterId === chapterId) return ch;
    }
    return null;
  }
  function isFirstLevelOfChapter() {
    if (!currentChapterData || !currentChapterData.levels) return false;
    const normalLevels = currentChapterData.levels.filter(l => !l.isHidden);
    return normalLevels.length > 0 && normalLevels[0].levelId === currentLevelId;
  }
  function isLastLevelOfChapter() {
    if (!currentChapterData || !currentChapterData.levels) return false;
    const normalLevels = currentChapterData.levels.filter(l => !l.isHidden);
    if (normalLevels.length === 0) return false;
    return parseInt(normalLevels[normalLevels.length - 1].levelId) === parseInt(currentLevelId);
  }
  function isLastChapterOfGame() {
    if (!global.CHAPTER_DATA || !global.CHAPTER_DATA.chapters) return false;
    const normalChapters = global.CHAPTER_DATA.chapters.filter(ch => {
      if (global.ProgressManager && ProgressManager.isTrueEndingUnlocked()) return true;
      return !ch.isTrueEnding;
    });
    return normalChapters.length > 0 &&
      normalChapters[normalChapters.length - 1].chapterId === currentChapterData.chapterId;
  }

  // ============================================================
  //  What If 浮条管理（小函数，保留转发）
  // ============================================================
  function toggleFloatBarPanel() {
    const bar = document.getElementById('right-floating-bar');
    if (!bar) return;
    bar.classList.toggle('panel-open');
  }
  function showFloatBar(showPanel = false) {
    const bar = document.getElementById('right-floating-bar');
    if (!bar) return;
    bar.style.display = 'flex';
    if (showPanel) bar.classList.add('panel-open');
  }
  function hideFloatBar() {
    const bar = document.getElementById('right-floating-bar');
    if (!bar) return;
    bar.style.display = 'none';
    bar.classList.remove('panel-open');
  }
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

  // ============================================================
  //  初始化管理器实例（转发到 GuideOrchestrator）
  // ============================================================
  function _initManagers() {
    // 创建上下文对象，包含所有状态引用和回调
    const ctx = {
      // 状态引用
      board, renderer, inputRouter, expertSystem, comboSystem,
      comedySystem, storyEngine, hintSystem, techMatrix, gameTimer,
      chapterSelect, settingsPanel, achievementCoordinator,
      lessonUICoordinator, bossCoordinator, threeActEngine, comboUI,
      whatIfManager, autoHintSystem, heatmapManager,
      techniqueEncyclopedia, levelFeatureApplier,
      currentLevelData, currentChapterData, currentLevelId,
      isCompleted, isPaused, noteMode, hintCount, errorCount,
      usedNotes, startTime, WhatIfState, HintPlayerState,
      VIBRATE_PRESETS, NAME_TO_CHAR,
      gameController, _debugMode,
      // log
      log,
      // 回调函数
      showToast, showCharacterBubble, setUIVisible, setInteractionLocked,
      vibrate, navigateTo, updateNoteButtonState, updateRule45Banner,
      updateNumBtnCompletedState, hidePauseMenu, toggleNoteMode,
      recordTechniqueUsage, isLastLevelOfChapter, isFirstLevelOfChapter,
      isLastChapterOfGame, findChapter, findChapterById, initRule45Banner,
      playClimaxAnimation, playClearDialog, playChapterEpilogue,
      showChapterTransition, showGameEnding, playPrologue, playPreDialog,
      startBossBattle, showSealUnlockAnimation, playFirstEncounterTeaching,
      playHintAnimation, showFloatBar, hideFloatBar, _updateFloatBarTabIcon,
      showAutoHint, _normalizeEvidence, restartLevel, _showCompleteOverlay,
      goToChapterSelect, unlockBackground, _reinitBoardForBattle,
      _cleanupLevelState, _startLessonPlayer, loadLevel, initBoard, startLevel,
      calculateGrade, checkAchievements, updateNextLevelButton,
    };
    // 让 ctx 可以访问到自身的属性（用于 getter 闭包）
    orchestrator = new GuideOrchestrator(ctx);
    orchestrator.initManagers();

    // 同步关键状态回闭包（orchestrator 可能修改了 ctx 上的值）
    _syncCtxToClosure(ctx);
  }

  // 将 ctx 上的状态同步回 guide.js 闭包变量
  // 解决"值拷贝导致 ctx 和闭包变量不同步"的问题
  function _syncCtxToClosure(ctx) {
    board = ctx.board;
    renderer = ctx.renderer;
    inputRouter = ctx.inputRouter;
    expertSystem = ctx.expertSystem;
    comboSystem = ctx.comboSystem;
    comedySystem = ctx.comedySystem;
    storyEngine = ctx.storyEngine;
    hintSystem = ctx.hintSystem;
    techMatrix = ctx.techMatrix;
    gameTimer = ctx.gameTimer;
    chapterSelect = ctx.chapterSelect;
    settingsPanel = ctx.settingsPanel;
    achievementCoordinator = ctx.achievementCoordinator;
    lessonUICoordinator = ctx.lessonUICoordinator;
    bossCoordinator = ctx.bossCoordinator;
    threeActEngine = ctx.threeActEngine;
    comboUI = ctx.comboUI;
    whatIfManager = ctx.whatIfManager;
    autoHintSystem = ctx.autoHintSystem;
    heatmapManager = ctx.heatmapManager;
    techniqueEncyclopedia = ctx.techniqueEncyclopedia;
    levelFeatureApplier = ctx.levelFeatureApplier;
    currentLevelData = ctx.currentLevelData;
    currentChapterData = ctx.currentChapterData;
    currentLevelId = ctx.currentLevelId;
    isCompleted = ctx.isCompleted;
    isPaused = ctx.isPaused;
    noteMode = ctx.noteMode;
    hintCount = ctx.hintCount;
    errorCount = ctx.errorCount;
    usedNotes = ctx.usedNotes;
    startTime = ctx.startTime;
    WhatIfState = ctx.WhatIfState;
    HintPlayerState = ctx.HintPlayerState;
    gameController = ctx.gameController;
    _debugMode = ctx._debugMode;
  }

  // 初始化函数（转发到 orchestrator）
  function _initGameController() { orchestrator.initGameController(); }
  function _initAchievementCoordinator() { orchestrator.initAchievementCoordinator(); }
  function _initAutoHintSystem() { orchestrator.initAutoHintSystem(); }
  function _initWhatIfManager() { orchestrator.initWhatIfManager(); }
  function _initHintPlayer() { orchestrator.initHintPlayer(); }
  function _initLessonUICoordinator() { orchestrator.initLessonUICoordinator(); }
  function _initNarrationSystem() { orchestrator.initNarrationSystem(); }
  function initGameTimer() { orchestrator.initGameTimer(); }

  // 关卡状态管理（转发到 orchestrator）
  function _cleanupLevelState() { orchestrator.cleanupLevelState(); }
  function _reinitBoardForBattle() { orchestrator.reinitBoardForBattle(); }

  // ============================================================
  //  棋盘校验（转发到 BoardValidator）
  // ============================================================
  function validateBoard() {
    return BoardValidator.validateBoard(board);
  }
  function isBoardComplete() {
    return BoardValidator.isBoardComplete(board, currentLevelData);
  }
  function highlightAllErrors() {
    return BoardValidator.highlightAllErrors(board, renderer);
  }

  // ============================================================
  //  通关检查（转发到 LevelCompleter）
  // ============================================================
  function checkCompletion() {
    levelCompleter.checkCompletion();
  }

  function _triggerLevelComplete() {
    levelCompleter.triggerLevelComplete();
  }

  function saveProgress(timeSeconds, errors, hints, grade) {
    levelCompleter.saveProgress(timeSeconds, errors, hints, grade);
  }

  function _showCompleteOverlay() {
    // 旧版兼容：直接调用 levelCompleter 的触发逻辑
    levelCompleter.triggerLevelComplete();
  }

  // ============================================================
  //  提示相关（转发到 HintManager）
  // ============================================================
  function showHint() {
    hintManager.showHint();
  }
  function getMaxHints() {
    return hintManager.getMaxHints();
  }
  function canUseHint() {
    return hintManager.canUseHint();
  }

  // ============================================================
  //  初始化入口（转发到 GuideOrchestrator）
  // ============================================================
  window.onload = async function() {
    // 先初始化管理器（orchestrator 需要先创建）
    _initManagers();
    await orchestrator.bootstrap();
  };

  // ============================================================
  //  关卡加载与启动（转发到 GameController）
  //  注意：gameController 由 orchestrator 在 initGameController 中创建
  //  必须从 orchestrator.ctx 读取，不能直接用闭包变量（值拷贝问题）
  // ============================================================
  async function loadLevel(levelId) {
    const gc = orchestrator ? orchestrator.ctx.gameController : gameController;
    if (!gc) throw new Error('gameController 未初始化');
    return gc.loadLevel(levelId);
  }

  async function startLevel(levelId) {
    const gc = orchestrator ? orchestrator.ctx.gameController : gameController;
    if (!gc) throw new Error('gameController 未初始化');
    return gc.startLevel(levelId);
  }

  // ============================================================
  //  Chapter Select
  // ============================================================
  function setupChapterSelect() { orchestrator.setupChapterSelect(); }

  function initBoard(levelData) { return orchestrator.initBoard(levelData); }

  // ============================================================
  //  教学引导（转发到 LessonUICoordinator）
  // ============================================================
  function _startLessonPlayer() {
    if (!lessonUICoordinator) _initLessonUICoordinator();
    if (!lessonUICoordinator) return;
    lessonUICoordinator.start();
  }
  function _lessonHandleCellFill(r, c, num) {
    if (!lessonUICoordinator) return null;
    return lessonUICoordinator.handleCellFill(r, c, num);
  }

  // ============================================================
  //  剧情编排（转发到 StoryOrchestrator）
  // ============================================================
  function unlockCharactersFromDialog(d) { return StoryOrchestrator.unlockCharactersFromDialog(d); }
  function unlockBackgroundsFromDialog(d) { return StoryOrchestrator.unlockBackgroundsFromDialog(d); }
  function unlockBackground(bg) { return StoryOrchestrator.unlockBackground(bg); }
  function playPreDialog() { return StoryOrchestrator.playPreDialog(); }
  function playPrologue() { return StoryOrchestrator.playPrologue(); }
  function playFirstEncounterTeaching(d, c, t, cells) { return StoryOrchestrator.playFirstEncounterTeaching(d, c, t, cells); }
  function showTeachingBadge(t) { return StoryOrchestrator._showTeachingBadge(t); }
  function playClearDialog(cb) { return StoryOrchestrator.playClearDialog(cb); }
  function playChapterEpilogue(cb) { return StoryOrchestrator.playChapterEpilogue(cb); }

  // ============================================================
  //  Boss 战（转发到 BossCoordinator）
  // ============================================================
  Object.defineProperty(global, 'bossBattleStarted', {
    get: function() { return bossCoordinator ? bossCoordinator.isStarted : false; },
    configurable: true,
  });
  Object.defineProperty(global, 'currentBossConfig', {
    get: function() { return bossCoordinator ? bossCoordinator.currentBossConfig : null; },
    configurable: true,
  });
  function startBossBattle() { if (bossCoordinator) bossCoordinator.startBossBattle(); }
  function retryBossBattle() { if (bossCoordinator) bossCoordinator.retryBossBattle(); }
  function toggleDifficultyPanel() { if (bossCoordinator) bossCoordinator.toggleDifficultyPanel(); }
  function setDifficulty(d) { if (bossCoordinator) bossCoordinator.setDifficulty(d); }
  function updateDifficultyUI() { if (bossCoordinator) bossCoordinator.updateDifficultyUI(); }
  function applyDifficultyToBoss(bc, d) { return bossCoordinator ? bossCoordinator.applyDifficultyToBoss(bc, d) : bc; }
  function _initBossBattle(bc) { if (bossCoordinator) bossCoordinator._initBossBattle(bc); }
  function onBossBattleEnd(r, bc) { if (bossCoordinator) bossCoordinator.onBossBattleEnd(r, bc); }
  function _showBattleResultOverlay(r, bc) { if (bossCoordinator) bossCoordinator._showBattleResultOverlay(r, bc); }

  // ============================================================
  //  自动提示（转发到 AutoHintSystem）
  // ============================================================
  function showAutoHint(params = {}) {
    if (!autoHintSystem) _initAutoHintSystem();
    if (!autoHintSystem) return;
    autoHintSystem.showAutoHint(params);
  }

  // ============================================================
  //  三幕式引导（向后兼容变量）
  // ============================================================
  let ThreeActGuide = null;

  // ============================================================
  //  热力图（转发到 HeatmapManager）
  // ============================================================
  function _preloadPristineHeatmap() { if (heatmapManager) heatmapManager.preloadPristineHeatmap(); }
  function _toggleHeatmapDisplay() { if (heatmapManager) heatmapManager.toggleDisplay(); }

  // ============================================================
  //  关卡特性（转发到 LevelFeatureApplier）
  // ============================================================
  function applyLevelFeatures() { if (levelFeatureApplier) levelFeatureApplier.apply(); }

  // ============================================================
  //  技巧图鉴（转发到 TechniqueEncyclopedia）
  // ============================================================
  function toggleTechniqueEncyclopedia() { if (techniqueEncyclopedia) techniqueEncyclopedia.toggle(); }
  function showTechniqueEncyclopedia() { if (techniqueEncyclopedia) techniqueEncyclopedia.show(); }
  function hideTechniqueEncyclopedia() { if (techniqueEncyclopedia) techniqueEncyclopedia.hide(); }

  // ============================================================
  //  Event Binding（转发到 EventBinder）
  // ============================================================
  function bindEvents() {
    if (eventBinder && eventBinder.isBound) return;
    if (!EventBinder || !EventBinderConfigurator) return;

    const config = EventBinderConfigurator.createConfig({
      board, renderer, storyEngine, techMatrix, comboSystem,
      expertSystem, hintSystem, comedySystem, settingsPanel,
      achievementCoordinator, AudioService, VIBRATE_PRESETS,
      WhatIfState, HintPlayerState, lessonUICoordinator,
      chapterSelect, currentLevelData,
      isCompleted, isPaused, noteMode, debugMode: _debugMode,
      techniquePanelVisible: _techniquePanelVisible, usedNotes,
      errorCount,
      handleNumberInput, handleErase, toggleNoteMode, showHint,
      toggleWhatIfMode, undo, togglePause, skipHintStep,
      handleBoardLongPress, updateMultiSelectHint, updateNoteButtonState,
      updateRule45Banner, showToast, vibrate, enterWhatIfMode,
      exitWhatIfMode, adoptWhatIfChanges, undoWhatIfStep,
      toggleRule45Banner, checkBoardAnswer, autoFillCandidates,
      adjustSelectedNumber, toggleTechniqueEncyclopedia,
      hideTechniqueEncyclopedia, toggleHeatmapDisplay: _toggleHeatmapDisplay,
      updateNumBtnActiveState, updateNumBtnCompletedState,
      toggleFloatBarPanel, showPauseMenu, restartLevel,
      goToChapterSelect, goToMainMenu, hasChangesFromRoot: _hasChangesFromRoot,
      validateBoard, highlightAllErrors, checkCompletion,
      addWhatIfSnapshot, lessonHandleCellFill: _lessonHandleCellFill,
      detectTechniqueForFill, recordTechniqueUsage,
    });

    // 补全状态 setter
    config.setNoteMode = (v) => { noteMode = v; };
    config.setUsedNotes = (v) => { usedNotes = v; };
    config.incErrorCount = () => { errorCount++; };
    config.getSolution = () => currentLevelData?.solution;

    eventBinder = new EventBinder(config);
    eventBinder.bind();
    inputRouter = eventBinder.getInputRouter();
    cellInputHandler = eventBinder.getCellInputHandler();
  }

  // ============================================================
  //  输入路由（转发到 InputRouter）
  // ============================================================
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

  // CellInputHandler 转发
  function checkBoardAnswer() { return cellInputHandler && cellInputHandler.checkBoardAnswer(); }
  function autoFillCandidates() { return cellInputHandler && cellInputHandler.autoFillCandidates(); }
  function adjustSelectedNumber(delta) { return cellInputHandler && cellInputHandler.adjustSelectedNumber(delta); }
  function handleErase() { return cellInputHandler && cellInputHandler.handleErase(); }
  function undo() { return cellInputHandler && cellInputHandler.undo(); }
  function eraseCell() { return cellInputHandler && cellInputHandler.eraseCell(); }
  function toggleNoteMode(forceValue) { return cellInputHandler && cellInputHandler.toggleNoteMode(forceValue); }
  function handleNumberInput(num, targetCell) { return cellInputHandler && cellInputHandler.handleNumberInput(num, targetCell); }

  // ============================================================
  //  What If 模式（转发到 WhatIfManager）
  // ============================================================
  function _createWhatIfSnapshot(l) { return whatIfManager._createWhatIfSnapshot(l); }
  function _hasChangesFromRoot(r) { return whatIfManager._hasChangesFromRoot(r); }
  function _restoreWhatIfSnapshot(s) { return whatIfManager._restoreWhatIfSnapshot(s); }
  function _createSnapshotThumbnail(s, i) { return whatIfManager._createSnapshotThumbnail(s, i); }
  function _renderWhatIfSnapshots() { return whatIfManager._renderWhatIfSnapshots(); }
  function _updateFloatBarBadge() { return whatIfManager._updateFloatBarBadge(); }
  function _syncWhatIfSnapshotsToPc() { return whatIfManager._syncWhatIfSnapshotsToPc(); }
  function enterWhatIfMode() { return whatIfManager.enterMode(); }
  function _doEnterWhatIf() { return whatIfManager._doEnter(); }
  function exitWhatIfMode(a) { return whatIfManager.exitMode(a); }
  function toggleWhatIfMode() { return whatIfManager.toggleMode(); }
  function addWhatIfSnapshot(l) { return whatIfManager.addSnapshot(l); }
  function jumpToWhatIfSnapshot(i) { return whatIfManager.jumpToSnapshot(i); }
  function undoWhatIfStep() { return whatIfManager.undoStep(); }
  function adoptWhatIfChanges() { return whatIfManager.adoptChanges(); }
  function resetWhatIfToRoot() { return whatIfManager.resetToRoot(); }

  // ============================================================
  //  HintPlayer / NarrationSystem 转发
  // ============================================================
  function playHintAnimation(hint) { return HintPlayer.playAnimation(hint); }
  function skipHintStep() { return HintPlayer.skipStep(); }
  function stopHintAnimation() { return HintPlayer.stopAnimation(); }
  function showNarrationBubble(o) { return NarrationSystem.showBubble(o); }
  function updateNarrationText(t, s) { return NarrationSystem.updateText(t, s); }
  function updateNarrationStep(n, t) { return NarrationSystem.updateStep(n, t); }
  function hideNarrationBubble() { return NarrationSystem.hideBubble(); }
  function _generateNarration(t, s, h) { return NarrationSystem.generateNarration(t, s, h); }
  function _skipTypewriter() { return NarrationSystem.skipTypewriter(); }
  function _getNarrationTemplate(t) { return NarrationSystem._getNarrationTemplate(t); }
  function _startTypewriter(t, e, s) { return NarrationSystem._startTypewriter(t, e, s); }
  function _stepTypeToEvidenceLayer(t) { return HintPlayer._stepTypeToEvidenceLayer(t); }
  function _buildArrowData(h, t) { return HintPlayer._buildArrowData(h, t); }
  function _normalizeEvidence(h) { return HintPlayer._normalizeEvidence(h); }
  function _buildHintAnimationSteps(h) { return HintPlayer._buildHintAnimationSteps(h); }
  function _getHintAvatar(c) { return HintPlayer._getHintAvatar(c); }
  function _onHintAnimationComplete(h) { return HintPlayer._onHintAnimationComplete(h); }
  const NARRATION_TEMPLATES = NarrationSystem ? NarrationSystem.templates : {};

  // ============================================================
  //  UI 转发（UIManager / PauseManager 等）
  // ============================================================
  function setUIVisible(v) { return UIManager.setUIVisible(v); }
  function updateMultiSelectHint() { return UIManager.updateMultiSelectHint(); }
  function updateNoteButtonState() { return UIManager.updateNoteButtonState(); }
  function initRule45Banner() { return UIManager.initRule45Banner(); }
  function showRule45Banner() { return UIManager.showRule45Banner(); }
  function hideRule45Banner() { return UIManager.hideRule45Banner(); }
  function toggleRule45Banner() { return UIManager.toggleRule45Banner(); }
  function updateRule45Banner(c) { return UIManager.updateRule45Banner(c); }
  function updateNumPad() { return UIManager.updateNumPad(); }
  function updateNumBtnCompletedState() { return UIManager.updateNumBtnCompletedState(); }
  function showToast(msg, d) { return UIManager.showToast(msg, d); }
  function hideToast() { return UIManager.hideToast(); }
  function showCharacterBubble(c, o) { return CharBubble.show(c, o); }
  function formatBubbleText(t, type) { return CharBubble.format(t, type); }
  function hideCharacterBubble() { return CharBubble.hide(); }
  function togglePause() { return PauseManager.togglePause(); }
  function showPauseMenu() { return PauseManager.showPauseMenu(); }
  function hidePauseMenu() { return PauseManager.hidePauseMenu(); }
  function updatePauseTime() { return PauseManager.updatePauseTime(); }
  function _lockBodyScroll() { return PauseManager._lockBodyScroll(); }
  function _unlockBodyScroll() { return PauseManager._unlockBodyScroll(); }
  function _pushModal(id) { return PauseManager._pushModal(id); }
  function _popModal(id) { return PauseManager._popModal(id); }
  function restartLevel() { return PauseManager.restartLevel(); }
  function goToChapterSelect() { return PauseManager.goToChapterSelect(); }
  function goToMainMenu() { return PauseManager.goToMainMenu(); }
  function showGameEnding() { return EndingManager.showGameEnding(); }
  function showTrueEnding() { return EndingManager.showTrueEnding(); }
  function addTrueEndingReturnButton() { return EndingManager.addTrueEndingReturnButton(); }
  function addEndingReturnButton() { return EndingManager.addEndingReturnButton(); }
  function registerExpertCharacterHandlers() { return ExpertCharacterHandler.registerExpertCharacterHandlers(); }
  function _getExpertDialogText(id) { return ExpertCharacterHandler._getExpertDialogText(id); }

  // ============================================================
  //  GameController 转发
  // ============================================================
  function checkAchievements(t, e, h, g) { if (gameController) gameController.checkAchievements(t, e, h, g); }
  function checkNoteMasterAchievement() { if (gameController) gameController.checkNoteMasterAchievement(); }
  function checkSealsOnComplete(t, e, h) { if (gameController) gameController.checkSealsOnComplete(t, e, h); }
  function showSealUnlockAnimation(s) { return gameController.showSealUnlockAnimation(s); }
  function detectTechniqueForFill(r, c, n) { return gameController.detectTechniqueForFill(r, c, n); }
  function recordTechniqueUsage(n) { return gameController.recordTechniqueUsage(n); }
  function showAchievementToast(a) { if (achievementCoordinator) achievementCoordinator.showAchievementToast(a); }
  function calculateGrade(t, e, h) { return gameController.calculateGrade(t, e, h); }
  function setupNextLevel() { return gameController.setupNextLevel(); }
  function updateNextLevelButton() { return gameController.updateNextLevelButton(); }
  function handleNextLevel() { return gameController.handleNextLevel(); }
  function _findNextLevelId(id) { return gameController._findNextLevelId(id); }
  function goToNextChapter() { return gameController.goToNextChapter(); }

  // ============================================================
  //  章节转场
  // ============================================================
  function showChapterTransition(callback) { orchestrator.showChapterTransition(callback); }

  // ============================================================
  //  高潮动画（转发到 AchievementCoordinator）
  // ============================================================
  function playClimaxAnimation(callback) {
    if (!achievementCoordinator) { if (callback) callback(); return; }
    achievementCoordinator.playClimaxAnimation(callback);
  }

  // ============================================================
  //  AI 速度调整（转发到 AISpeedController）
  // ============================================================
  function _setAISpeedMultiplier(factor, reason, durationMs) {
    AISpeedController.setMultiplier(factor, reason, durationMs, { log: log });
  }
  function _resetAISpeedMultiplier(reason) {
    AISpeedController.resetMultiplier(reason, { log: log });
  }
  global._setAISpeedMultiplier = _setAISpeedMultiplier;
  global._resetAISpeedMultiplier = _resetAISpeedMultiplier;

  // ============================================================
  //  GameContext 向后兼容
  // ============================================================
  function _initGameContext() {
    if (typeof initGameContext === 'function') return initGameContext({ logger: log });
    return null;
  }

  // ============================================================
  //  PC 布局管理器
  // ============================================================
  const pcLayoutManager = new PcLayoutManager({
    get board() { return board; },
    get renderer() { return renderer; },
    UIManager: UIManager,
    CharBubble: CharBubble,
    log: log,
  });
  pcLayoutManager.initEventListeners();
  function _isPcLayoutActive() { return pcLayoutManager.isPcLayoutActive(); }
  function _switchToPcLayout() { return pcLayoutManager.switchToPcLayout(); }
  function _switchToMobileLayout() { return pcLayoutManager.switchToMobileLayout(); }
  function _updateLayout() { return pcLayoutManager.updateLayout(); }
  function _syncRule45ToPc() { return pcLayoutManager.syncRule45ToPc(); }
  function _syncWhatIfToPc() { return pcLayoutManager.syncWhatIfToPc(); }
  function _syncTimerToPc() { return pcLayoutManager.syncTimerToPc(); }
  function _syncHintsToPc(c) { return pcLayoutManager.syncHintsToPc(c); }
  function _initPcButtons() { return pcLayoutManager.initPcButtons(); }
  function _syncToolbarState() { return pcLayoutManager.syncToolbarState(); }
  function _syncNumPadState() { return pcLayoutManager.syncNumPadState(); }
  global.updatePcLayout = _updateLayout;
  global.syncRule45ToPc = _syncRule45ToPc;
  global.syncWhatIfToPc = _syncWhatIfToPc;
  global.syncToolbarStateToPc = _syncToolbarState;
  global.syncNumPadStateToPc = _syncNumPadState;
  global.syncTimerToPc = _syncTimerToPc;
  global.syncHintsToPc = _syncHintsToPc;
  global.isPcLayout = function() { return pcLayoutManager.isPcLayout(); };

  // ============================================================
  //  调试工具
  // ============================================================
  const DEBUG_TOOLS = DebugTools.create({
    get board() { return board; },
    get renderer() { return renderer; },
    get GuideBattle() { return typeof GuideBattle !== 'undefined' ? GuideBattle : null; },
    restartLevel: restartLevel,
  });
  global.DEBUG = DEBUG_TOOLS;

  // ============================================================
  //  全局暴露
  // ============================================================
  global.guideInit = initBoard;
  global.showToast = showToast;
  global.showCharacterBubble = showCharacterBubble;
  global.hideCharacterBubble = hideCharacterBubble;

})(window);
