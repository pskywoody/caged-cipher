// ============================================================
//  LevelStateManager.js - 关卡状态管理器
//  负责关卡切换时的状态清理和 Boss 战棋盘重初始化
// ============================================================

(function(global) {
  'use strict';

  /**
   * 关卡状态清理器
   * 关卡切换时清理所有运行时状态和定时器，防止内存泄漏和状态残留
   */
  class LevelStateManager {
    constructor(options = {}) {
      // 状态引用 getter
      this.getBoard = options.getBoard || (() => null);
      this.getRenderer = options.getRenderer || (() => null);
      this.getInputRouter = options.getInputRouter || (() => null);
      this.getComboSystem = options.getComboSystem || (() => null);
      this.getComboUI = options.getComboUI || (() => null);
      this.getComedySystem = options.getComedySystem || (() => null);
      this.getBossCoordinator = options.getBossCoordinator || (() => null);
      this.getLessonUICoordinator = options.getLessonUICoordinator || (() => null);
      this.getAchievementCoordinator = options.getAchievementCoordinator || (() => null);
      this.getNoteMode = options.getNoteMode || (() => false);
      this.setNoteMode = options.setNoteMode || (() => {});
      this.getIsPaused = options.getIsPaused || (() => false);
      this.setIsPaused = options.setIsPaused || (() => {});

      // 回调
      this.updateNoteButtonState = options.updateNoteButtonState || (() => {});
      this.hideCharBubble = options.hideCharBubble || (() => {});
      this.hidePauseMenu = options.hidePauseMenu || (() => {});
    }

    /**
     * 清理关卡状态
     */
    cleanupLevelState() {
      const board = this.getBoard();
      const inputRouter = this.getInputRouter();
      const comboSystem = this.getComboSystem();
      const comboUI = this.getComboUI();
      const comedySystem = this.getComedySystem();
      const bossCoordinator = this.getBossCoordinator();
      const lessonUICoordinator = this.getLessonUICoordinator();
      const achievementCoordinator = this.getAchievementCoordinator();
      const renderer = this.getRenderer();

      // 清理输入路由状态（长按、拖拽、连填等）
      if (inputRouter) {
        inputRouter.cleanupLevelState();
      }

      // 清理笔记模式状态
      this.setNoteMode(false);
      if (board) {
        board.setInputMode('normal');
      }
      this.updateNoteButtonState();

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
      this.hideCharBubble();

      // 清理完成状态标志
      this.setIsPaused(false);
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
      }

      // 清理连击UI显示
      if (comboUI && typeof comboUI.cleanup === 'function') {
        comboUI.cleanup();
      }

      // 清理吐槽系统
      if (comedySystem) {
        if (typeof comedySystem.destroy === 'function') {
          comedySystem.destroy();
        }
      }

      // 清理Boss战系统
      if (bossCoordinator && typeof bossCoordinator.cleanup === 'function') {
        bossCoordinator.cleanup();
      }

      // 清理教学引导系统
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

    /**
     * 用当前 currentLevelData 重新初始化棋盘（用于对战关卡切换）
     * @param {Object} currentLevelData - 当前关卡数据
     * @param {number} currentLevelId - 当前关卡 ID
     * @param {Object} renderer - 渲染器对象
     * @param {Object} [dependencies] - 可选的依赖对象
     * @returns {Object} 新创建的 board 对象
     */
    reinitBoardForBattle(currentLevelData, currentLevelId, renderer, dependencies = {}) {
      if (!currentLevelData) return null;

      // 重新创建Board
      const gridSize = currentLevelData.gridSize || 9;
      const board = new Board(gridSize);
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

      // 同步到 StoryOrchestrator
      if (dependencies.storyOrchestrator) {
        dependencies.storyOrchestrator.setBoard(board);
      }

      // 同步到 ThreeActEngine
      if (dependencies.threeActEngine) {
        dependencies.threeActEngine.setBoard(board);
        dependencies.threeActEngine.setRenderer(renderer);
      }

      // 同步到 BossCoordinator
      if (dependencies.bossCoordinator) {
        dependencies.bossCoordinator.setBoard(board);
        dependencies.bossCoordinator.setRenderer(renderer);
      }

      return board;
    }
  }

  // 导出到全局
  global.LevelStateManager = LevelStateManager;

})(window);
