// ============================================================
//  EventBinderConfigurator.js - EventBinder 配置器
//  封装 EventBinder 的依赖注入配置，集中管理所有回调映射
// ============================================================

(function(global) {
  'use strict';

  /**
   * 创建 EventBinder 的配置对象
   * @param {Object} ctx - 上下文对象，包含所有状态引用和回调
   * @returns {Object} EventBinder 配置
   */
  function createEventBinderConfig(ctx) {
    return {
      // 核心对象
      board: ctx.board,
      renderer: ctx.renderer,
      storyEngine: ctx.storyEngine,
      techMatrix: ctx.techMatrix,
      comboSystem: ctx.comboSystem,
      expertSystem: ctx.expertSystem,
      hintSystem: ctx.hintSystem,
      comedySystem: ctx.comedySystem,
      settingsPanel: ctx.settingsPanel,
      achievementCoordinator: ctx.achievementCoordinator,
      AudioService: ctx.AudioService,
      VIBRATE_PRESETS: ctx.VIBRATE_PRESETS,
      WhatIfState: ctx.WhatIfState,
      HintPlayerState: ctx.HintPlayerState,
      lessonUICoordinator: ctx.lessonUICoordinator,
      chapterSelect: ctx.chapterSelect,
      currentLevelData: ctx.currentLevelData,

      // 状态 getter / setter
      getIsCompleted: () => ctx.isCompleted,
      getIsPaused: () => ctx.isPaused,
      getNoteMode: () => ctx.noteMode,
      setNoteMode: (v) => { ctx.noteMode = v; },
      getDebugMode: () => ctx.debugMode,
      getTechniquePanelVisible: () => ctx.techniquePanelVisible,
      getUsedNotes: () => ctx.usedNotes,
      setUsedNotes: (v) => { ctx.usedNotes = v; },
      getErrorCount: () => ctx.errorCount,
      incErrorCount: () => { ctx.errorCount++; },
      getSolution: () => ctx.currentLevelData?.solution,

      // 业务回调 - 核心输入
      onNumberInput: ctx.handleNumberInput,
      onErase: ctx.handleErase,
      onToggleNote: ctx.toggleNoteMode,
      onHint: ctx.showHint,
      onWhatIfToggle: ctx.toggleWhatIfMode,
      onUndo: ctx.undo,
      onPauseToggle: ctx.togglePause,
      onSkipHintStep: ctx.skipHintStep,
      onBoardLongPress: ctx.handleBoardLongPress,
      onUpdateMultiSelectHint: ctx.updateMultiSelectHint,
      onUpdateNoteButtonState: ctx.updateNoteButtonState,
      onUpdateRule45Banner: ctx.updateRule45Banner,
      onShowToast: ctx.showToast,
      onVibrate: ctx.vibrate,
      onEnterWhatIf: ctx.enterWhatIfMode,
      onExitWhatIf: ctx.exitWhatIfMode,
      onAdoptWhatIf: ctx.adoptWhatIfChanges,
      onUndoWhatIfStep: ctx.undoWhatIfStep,
      onToggleRule45Banner: ctx.toggleRule45Banner,
      onCheckBoardAnswer: ctx.checkBoardAnswer,
      onAutoFillCandidates: ctx.autoFillCandidates,
      onAdjustSelectedNumber: ctx.adjustSelectedNumber,
      onToggleTechniqueEncyclopedia: ctx.toggleTechniqueEncyclopedia,
      onHideTechniqueEncyclopedia: ctx.hideTechniqueEncyclopedia,
      onToggleHeatmapDisplay: ctx.toggleHeatmapDisplay,
      onUpdateNumBtnActiveState: ctx.updateNumBtnActiveState,
      onUpdateNumBtnCompletedState: ctx.updateNumBtnCompletedState,

      // 业务回调 - UI操作
      showToast: ctx.showToast,
      vibrate: ctx.vibrate,
      toggleNoteMode: ctx.toggleNoteMode,
      undo: ctx.undo,
      eraseCell: ctx.eraseCell,
      showHint: ctx.showHint,
      toggleWhatIfMode: ctx.toggleWhatIfMode,
      adoptWhatIfChanges: ctx.adoptWhatIfChanges,
      undoWhatIfStep: ctx.undoWhatIfStep,
      resetWhatIfToRoot: ctx.resetWhatIfToRoot,
      exitWhatIfMode: ctx.exitWhatIfMode,
      toggleFloatBarPanel: ctx.toggleFloatBarPanel,
      toggleTechniqueEncyclopedia: ctx.toggleTechniqueEncyclopedia,
      togglePause: ctx.togglePause,
      showPauseMenu: ctx.showPauseMenu,
      restartLevel: ctx.restartLevel,
      goToChapterSelect: ctx.goToChapterSelect,
      goToMainMenu: ctx.goToMainMenu,

      // 业务回调 - WhatIf辅助
      hasChangesFromRoot: ctx.hasChangesFromRoot,

      // 业务回调 - CellInputHandler 专用
      validateBoard: ctx.validateBoard,
      highlightAllErrors: ctx.highlightAllErrors,
      checkCompletion: ctx.checkCompletion,
      addWhatIfSnapshot: ctx.addWhatIfSnapshot,
      lessonHandleCellFill: ctx.lessonHandleCellFill,
      detectTechniqueForFill: ctx.detectTechniqueForFill,
      recordTechniqueUsage: ctx.recordTechniqueUsage,
    };
  }

  // 导出到全局
  global.EventBinderConfigurator = {
    createConfig: createEventBinderConfig,
  };

})(window);
