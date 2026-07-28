// DebugTools.js - 调试工具集
// 从 pages/guide.js 抽离，物理分离，逻辑不变
// 保持全局可访问：window.DEBUG 不变

;(function(global) {
  'use strict';

  /**
   * 创建调试工具集
   * @param {Object} deps - 依赖注入
   * @param {Object} deps.board - 棋盘对象
   * @param {Object} deps.renderer - 渲染器
   * @param {Object} deps.GuideBattle - Boss战对象
   * @param {Function} deps.restartLevel - 重启关卡函数
   * @returns {Object} 调试工具集对象
   */
  function createDebugTools(deps) {
    deps = deps || {};

    const DEBUG_TOOLS = {
      // 1. 渲染状态检查
      checkRender: function() {
        const renderer = deps.renderer || global.renderer;
        const board = deps.board || global.board;
        const GuideBattle = deps.GuideBattle || global.GuideBattle;
        console.log('=== [Debug] cellSize:', renderer ? renderer.cellSize : 'renderer not found');
        console.log('[Debug] board size:', board ? board.size : 'board not found');
        console.log('[Debug] selectedCell:', board && board.selectedCell ? '(' + board.selectedCell.r + ',' + board.selectedCell.c + ')' : 'none');
        console.log('[Debug] history length:', board ? board.history.length : 0);
        if (board && board.history.length > 0) {
          const last = board.history[board.history.length - 1];
          console.log('[Debug] last action:', last.type, last.r !== undefined ? '(' + last.r + ',' + last.c + ')' : '', last.value !== undefined ? '=' + last.value : '');
        }
        console.log('[Debug] bossBattleStarted:', global.bossBattleStarted);
        console.log('[Debug] GuideBattle.active:', GuideBattle ? GuideBattle.active : 'N/A');
        if (GuideBattle && GuideBattle.active) {
          console.log('[Debug] playerCount:', GuideBattle.playerCount, '/', GuideBattle.winTarget);
          console.log('[Debug] aiCount:', GuideBattle.aiCount, '/', GuideBattle.winTarget);
        }
      },

      // 2. 棋盘快照
      snapshot: function() {
        const board = deps.board || global.board;
        if (!board) return;
        console.log('=== [Debug] Board Snapshot ===');
        for (let r = 0; r < board.size; r++) {
          let row = '';
          for (let c = 0; c < board.size; c++) {
            const cell = board.cells[r][c];
            const v = cell.fixedNum || cell.fillNum || 0;
            const ai = cell.isAiFilled ? '*' : ' ';
            row += v + ai + ' ';
          }
          console.log(row);
        }
      },

      // 3. AI状态追踪
      traceAI: function() {
        const GuideBattle = deps.GuideBattle || global.GuideBattle;
        if (!GuideBattle || !GuideBattle.active) {
          console.log('[Debug] No active boss battle');
          return;
        }
        console.log('=== [Debug] AI State ===');
        console.log('AI personality:', GuideBattle._aiPlayer ? GuideBattle._aiPlayer.getPersonality().name : 'N/A');
        console.log('AI move count:', GuideBattle._aiPlayer ? GuideBattle._aiPlayer.getMoveCount() : 0);
        console.log('AI thinking:', GuideBattle._aiThinking);
        if (GuideBattle._aiPlayer) {
          const step = GuideBattle._aiPlayer.think();
          if (step) {
            console.log('AI next would fill:', '(' + step.row + ',' + step.col + ')=' + step.num, 'tech:', step.techniqueName, 'thinkTime:', Math.round(step.thinkTime) + 'ms');
          } else {
            console.log('AI has no move (stuck!)');
          }
        }
      },

      // 4. 强制AI立刻走一步
      forceAIMove: function() {
        const GuideBattle = deps.GuideBattle || global.GuideBattle;
        if (GuideBattle && GuideBattle.active) {
          GuideBattle._aiMove();
          console.log('[Debug] Forced AI move');
        }
      },

      // 5. 重置当前关卡
      reload: function() {
        const restartLevel = deps.restartLevel || global.restartLevel;
        if (restartLevel) restartLevel();
        console.log('[Debug] Level reloaded');
      },

      // 6. 开启AI详细日志
      toggleAILog: function(enabled) {
        global.DEBUG_AI = enabled !== false;
        console.log('[Debug] AI debug logging:', global.DEBUG_AI ? 'ON' : 'OFF');
      },

      // 7. 显示AI所有数字（作弊模式，调试用）
      revealAINumbers: function() {
        const board = deps.board || global.board;
        const renderer = deps.renderer || global.renderer;
        const GuideBattle = deps.GuideBattle || global.GuideBattle;
        if (!board || !(GuideBattle && GuideBattle.active)) return;
        for (let r = 0; r < board.size; r++) {
          for (let c = 0; c < board.size; c++) {
            const cell = board.cells[r][c];
            if (cell.isAiFilled && cell._aiNum) {
              cell.fillNum = cell._aiNum;
            }
          }
        }
        if (renderer) renderer.render(board);
        console.log('[Debug] AI numbers revealed');
      },

      // 8. 隐藏AI数字（恢复正常）
      hideAINumbers: function() {
        const board = deps.board || global.board;
        const renderer = deps.renderer || global.renderer;
        if (!board) return;
        for (let r = 0; r < board.size; r++) {
          for (let c = 0; c < board.size; c++) {
            const cell = board.cells[r][c];
            if (cell.isAiFilled) {
              cell.fillNum = null;
            }
          }
        }
        if (renderer) renderer.render(board);
        console.log('[Debug] AI numbers hidden');
      },

      // 9. 打印最近错误日志
      dumpErrors: function(count) {
        const ErrorReporter = global.ErrorReporter;
        if (!ErrorReporter) {
          console.log('[Debug] ErrorReporter not available');
          return;
        }
        const n = Math.min(count || 10, ErrorReporter.getErrorCount());
        const logs = ErrorReporter.getLogs();
        const recent = logs.slice(0, n);
        console.log('=== [Debug] Recent Errors (' + n + '/' + ErrorReporter.getErrorCount() + ') ===');
        if (recent.length === 0) {
          console.log('  (no errors recorded)');
          return;
        }
        recent.forEach(function(log, i) {
          const time = new Date(log.timestamp).toLocaleString();
          const levelInfo = log.levelId ? '[L' + log.levelId + '] ' : '';
          console.log(
            '  [' + i + '] [' + log.severity + '] [' + log.type + '] ' +
            levelInfo + log.message +
            '\n      time: ' + time +
            (log.source ? '\n      source: ' + log.source + ':' + log.lineno + ':' + log.colno : '') +
            (log.pageUrl ? '\n      page: ' + log.pageUrl : '')
          );
          if (log.stack) {
            console.log('      stack:\n' + log.stack.split('\n').map(function(l) { return '        ' + l; }).join('\n'));
          }
        });
      },

      // 10. 清除所有错误日志
      clearErrors: function() {
        const ErrorReporter = global.ErrorReporter;
        if (!ErrorReporter) {
          console.log('[Debug] ErrorReporter not available');
          return;
        }
        const count = ErrorReporter.getErrorCount();
        ErrorReporter.clearLogs();
        console.log('[Debug] Cleared ' + count + ' error log(s)');
      },

      // 11. P3-2: 玩家画像摘要
      profile: function() {
        console.log('=== [Debug] Player Profile ===');
        try {
          // 尝试从 ExpertSystem 获取 LearningSystem 实例
          let learning = null;
          if (global.ExpertSystem && global.ExpertSystem.learning) {
            learning = global.ExpertSystem.learning;
          } else if (global._learningSystemInstance) {
            learning = global._learningSystemInstance;
          }

          if (!learning || typeof learning.getProfileSummary !== 'function') {
            console.log('[Debug] LearningSystem not available, showing basic info');

            // 显示 GameContext 中的基本学习数据
            const ctx = global.GameContext;
            if (ctx && ctx.learning) {
              console.log('  Style:', ctx.learning.style || 'N/A');
              console.log('  Accuracy Rate:', ctx.learning.accuracyRate != null ?
                Math.round(ctx.learning.accuracyRate * 100) + '%' : 'N/A');
              console.log('  Hint Usage Rate:', ctx.learning.hintUsageRate != null ?
                Math.round(ctx.learning.hintUsageRate * 100) + '%' : 'N/A');
            } else {
              console.log('  No learning data available');
            }
            return;
          }

          const summary = learning.getProfileSummary();
          console.log('  Style:', summary.style,
            '(confidence:', summary.styleConfidence + ')');
          console.log('  Accuracy:', summary.accuracyRate);
          console.log('  Levels Completed:', summary.totalLevelsCompleted);
          console.log('  Total Play Time:', summary.totalPlayTime);
          console.log('  Mastered Techniques:', summary.masteredTechniques);
          console.log('  Top Technique:', summary.topTechnique);
          console.log('  Achievements Unlocked:', summary.achievementsUnlocked);
          console.log('  Seals:', summary.seals);

          // 显示技巧掌握度排名前5
          const ranking = learning.getMasteryRanking();
          if (ranking.length > 0) {
            console.log('--- Technique Ranking (Top 5) ---');
            ranking.slice(0, 5).forEach(function(t, i) {
              console.log('  ' + (i + 1) + '. ' + t.name +
                ' - Lv.' + t.level +
                ' (' + t.usageCount + ' uses, ' + t.proficiency + '%)');
            });
          }

          // 返回完整画像对象以便进一步查看
          console.log('---');
          console.log('[Debug] Use LearningSystem.getPlayerProfile() for full profile');
          return learning.getPlayerProfile();
        } catch (e) {
          console.warn('[Debug] profile() error:', e);
          return null;
        }
      },
    };

    return DEBUG_TOOLS;
  }

  // 暴露工厂函数到全局
  global.DebugTools = {
    create: createDebugTools,
  };

})(window);
