// ============================================================
//  TestHarness.js - 自动化测试外部接口
//  供 Playwright / Node.js 通过 page.evaluate 调用
//  方案A：JS API 直连，非 DOM 模拟
// ============================================================

(function(global) {
  'use strict';

  /**
   * 自动化测试接口
   * 将测试相关的全局 API 集中管理
   */
  class TestHarness {
    /**
     * @param {Object} options
     * @param {Function} options.getBoard - 获取 board
     * @param {Function} options.getRenderer - 获取 renderer
     * @param {Function} options.getCurrentLevelId - 获取当前关卡 ID
     * @param {Function} options.getCurrentLevelData - 获取当前关卡数据
     * @param {Function} options.getCurrentChapterData - 获取当前章节数据
     * @param {Function} options.getGameTimer - 获取 gameTimer
     * @param {Function} options.getIsCompleted - 获取 isCompleted
     * @param {Function} options.setIsCompleted - 设置 isCompleted
     * @param {Function} options.getErrorCount - 获取 errorCount
     * @param {Function} options.setErrorCount - 设置 errorCount
     * @param {Function} options.getHintCount - 获取 hintCount
     * @param {Function} options.setHintCount - 设置 hintCount
     * @param {Function} options.getUsedNotes - 获取 usedNotes
     * @param {Function} options.setUsedNotes - 设置 usedNotes
     * @param {Function} options.loadLevel - 加载关卡
     * @param {Function} options.findChapter - 查找章节
     * @param {Function} options.initBoard - 初始化棋盘
     * @param {Function} options.setInteractionLocked - 设置交互锁定
     * @param {Function} options.cleanupLevelState - 清理关卡状态
     */
    constructor(options = {}) {
      this.getBoard = options.getBoard || (() => null);
      this.getRenderer = options.getRenderer || (() => null);
      this.getCurrentLevelId = options.getCurrentLevelId || (() => 0);
      this.setCurrentLevelId = options.setCurrentLevelId || (() => {});
      this.getCurrentLevelData = options.getCurrentLevelData || (() => null);
      this.getCurrentChapterData = options.getCurrentChapterData || (() => null);
      this.getGameTimer = options.getGameTimer || (() => null);
      this.getIsCompleted = options.getIsCompleted || (() => false);
      this.setIsCompleted = options.setIsCompleted || (() => {});
      this.getErrorCount = options.getErrorCount || (() => 0);
      this.setErrorCount = options.setErrorCount || (() => {});
      this.getHintCount = options.getHintCount || (() => 0);
      this.setHintCount = options.setHintCount || (() => {});
      this.getUsedNotes = options.getUsedNotes || (() => false);
      this.setUsedNotes = options.setUsedNotes || (() => {});
      this.loadLevel = options.loadLevel || (async () => {});
      this.findChapter = options.findChapter || (() => {});
      this.initBoard = options.initBoard || (() => {});
      this.setInteractionLocked = options.setInteractionLocked || (() => {});
      this.cleanupLevelState = options.cleanupLevelState || (() => {});
    }

    /**
     * 读取当前棋盘数字
     * @returns {number[][]} 9×9 二维数组，0 表示空白格
     */
    getBoardArray() {
      const board = this.getBoard();
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
    }

    /**
     * 读取当前棋盘所有笼子数据
     * @returns {Array<{sum: number, cells: Array<[number, number]>}>}
     */
    getCages() {
      const board = this.getBoard();
      if (!board || !board.cages) {
        return [];
      }
      return board.cages.map(function (cage) {
        return {
          sum: cage.sum,
          cells: cage.cells ? cage.cells.map(function (c) { return [c[0], c[1]]; }) : [],
        };
      });
    }

    /**
     * 在指定位置填入数字
     * @param {number} row - 行号 (0~8)
     * @param {number} col - 列号 (0~8)
     * @param {number} num - 数字 (1~9)，传 0 表示擦除
     * @returns {{success: boolean, reason?: string}}
     */
    setCell(row, col, num) {
      const board = this.getBoard();
      const renderer = this.getRenderer();
      if (!board || !board.cells) {
        return { success: false, reason: 'board not ready' };
      }
      const size = board.size || 9;
      if (row < 0 || row >= size || col < 0 || col >= size) {
        return { success: false, reason: 'index out of range' };
      }
      const cell = board.cells[row][col];
      // 保护固定数字
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
        // 使用 board.setNumberAt
        const ok = board.setNumberAt(row, col, num, { recordHistory: false, autoClear: false });
        if (!ok) {
          return { success: false, reason: 'setNumberAt failed' };
        }
      }
      // 重新计算全棋盘错误标记
      if (typeof board._recomputeAllErrors === 'function') {
        board._recomputeAllErrors();
      } else {
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
    }

    /**
     * 异步创建一局新题目（自动化测试专用，跳过剧情/对话/BGM）
     * @param {number|string} level - 关卡 ID 或难度标识
     * @returns {Promise<{success: boolean, levelId: number, reason?: string}>}
     */
    async createNewGame(level) {
      return new Promise(async (resolve) => {
        try {
          const levelId = typeof level === 'number' ? level : (parseInt(level, 10) || 101);

          // 清理上一局的运行时状态
          try { this.cleanupLevelState(); } catch (e) { /* ignore */ }

          this.setCurrentLevelId(levelId);
          this.setIsCompleted(false);
          this.setErrorCount(0);
          this.setHintCount(0);
          this.setUsedNotes(false);

          // 加载关卡数据
          await this.loadLevel(levelId);

          // 查找章节数据
          this.findChapter();

          // 直接初始化棋盘（跳过剧情、对话、BGM、Boss战等）
          this.initBoard();

          // 确保交互解锁
          this.setInteractionLocked(false);
          const canvas = document.getElementById('gameCanvas');
          if (canvas) canvas.style.pointerEvents = '';

          // 启动计时器
          const gameTimer = this.getGameTimer();
          if (gameTimer) {
            gameTimer.start();
          }

          // 保存上次游玩关卡
          if (global.ProgressManager && typeof ProgressManager.setLastPlayedLevel === 'function') {
            ProgressManager.setLastPlayedLevel(levelId);
          }

          // 等待下一帧确保渲染完成
          requestAnimationFrame(() => {
            resolve({ success: true, levelId: levelId });
          });
        } catch (e) {
          resolve({ success: false, levelId: levelId, reason: String(e) });
        }
      });
    }

    /**
     * 校验当前棋盘完整性和规则合法性
     * @returns {{isComplete: boolean, errors: Array<{row: number, col: number, type: string}>}}
     */
    verifyAll() {
      const board = this.getBoard();
      if (!board || !board.cells) {
        return { isComplete: false, errors: [{ row: -1, col: -1, type: 'board_not_ready' }] };
      }
      const result = BoardValidator.validateBoard(board);
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
    }

    /**
     * 测试专用：直接启动Boss战（跳过所有对话）
     * @param {number} chapterId - 章节ID（默认当前章节）
     * @returns {{success: boolean, reason?: string}}
     */
    testStartBossBattle(chapterId) {
      try {
        if (typeof GuideBattle === 'undefined') {
          return { success: false, reason: 'GuideBattle not loaded' };
        }
        const chId = chapterId || (this.getCurrentChapterData()?.chapterId);
        if (!chId) {
          return { success: false, reason: 'No chapterId' };
        }
        const bossConfig = GuideBattle.getBossConfig(chId);
        if (!bossConfig) {
          return { success: false, reason: 'No boss config for chapter ' + chId };
        }
        // 调用全局的 _initBossBattle
        if (typeof global._initBossBattle === 'function') {
          global._initBossBattle(bossConfig);
        }
        return { success: true };
      } catch (e) {
        return { success: false, reason: String(e) };
      }
    }

    /**
     * 将所有测试接口挂载到全局
     */
    mountToGlobal() {
      const self = this;
      global.getBoard = function () { return self.getBoardArray(); };
      global.getCages = function () { return self.getCages(); };
      global.setCell = function (row, col, num) { return self.setCell(row, col, num); };
      global.createNewGame = function (level) { return self.createNewGame(level); };
      global.verifyAll = function () { return self.verifyAll(); };
      global.__testStartBossBattle = function (chapterId) { return self.testStartBossBattle(chapterId); };
      // 标记接口已就绪
      global.__autoTestReady = true;
    }
  }

  // 导出到全局
  global.TestHarness = TestHarness;

})(window);
