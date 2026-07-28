// ============================================================
//  WinConditionManager - 分层过关逻辑管理器
// ============================================================
//  从 guide.js 抽离，物理分离，逻辑不变
//  负责胜利条件判定、各种模式的通关逻辑、进度计算、自动补全等
//
//  关卡类型与通关条件：
//    - 新手关 (novice):   填完所有 simple 格
//    - 中盘关 (midgame):  填完所有 simple + 至少 1 个 gate
//    - 收官关 (endgame):  填完所有 simple + 所有 gate
//    - Boss 关 (boss):    填完所有空格 (100%) —— 由 Boss 战系统接管
//
//  通关后表现：
//    - 新手关/中盘关：剩余 core/gate 自动补全
//    - 收官关：剩余 core 自动补全，播放"雪崩"动画
//    - Boss 关：完整胜利动画（现有逻辑）
// ============================================================

;(function(global) {
  'use strict';

  const log = new Logger('WinCondition');

  const WinConditionManager = (function() {

    // 关卡类型枚举
    const LEVEL_TYPES = {
      NOVICE: 'novice',     // 新手关
      MIDGAME: 'midgame',   // 中盘关
      ENDGAME: 'endgame',   // 收官关
      BOSS: 'boss',         // Boss 关
    };

    // pristine heatmap 缓存（每关只生成一次）
    let _pristineCache = {
      levelId: null,
      heatmap: null,
    };

    /**
     * 判断关卡类型
     * @param {Object} levelData - 当前关卡数据
     * @param {boolean} isBossLevel - 是否为 Boss 关（章节最后一关）
     * @returns {string} 关卡类型 LEVEL_TYPES.*
     */
    function getLevelType(levelData, isBossLevel) {
      if (!levelData) return LEVEL_TYPES.MIDGAME;

      // 优先使用关卡数据中自定义的 winCondition 类型
      if (levelData.winCondition && levelData.winCondition.type) {
        const customType = levelData.winCondition.type;
        if (Object.values(LEVEL_TYPES).includes(customType)) {
          return customType;
        }
      }

      // Boss 关（每章最后一关）
      if (isBossLevel) {
        return LEVEL_TYPES.BOSS;
      }

      const levelId = parseInt(levelData.levelId) || 0;
      const gridSize = levelData.gridSize || 9;
      const difficultyLevel = levelData.difficultyLevel || _inferDifficultyLevel(levelData);

      // 新手关：gridSize=4 或 levelId 101~109 或 difficultyLevel<=1
      if (gridSize <= 4 ||
          (levelId >= 101 && levelId <= 109) ||
          difficultyLevel <= 1) {
        return LEVEL_TYPES.NOVICE;
      }

      // 收官关：levelId 501~706 或 difficultyLevel 4-5
      if ((levelId >= 501 && levelId <= 706) ||
          difficultyLevel >= 4) {
        return LEVEL_TYPES.ENDGAME;
      }

      // 中盘关：levelId 204~406 或 difficultyLevel 2-3（默认）
      return LEVEL_TYPES.MIDGAME;
    }

    /**
     * 从关卡数据推断难度等级 (1~5)
     * 没有 difficultyLevel 字段时，根据 difficulty 字符串推断
     */
    function _inferDifficultyLevel(levelData) {
      const diffStr = levelData.difficulty || '';
      const diffMap = {
        '入门': 1,
        '简单': 1,
        '初级': 2,
        '中等': 3,
        '中等偏难': 4,
        '困难': 5,
        '极难': 5,
        '终极': 5,
      };
      return diffMap[diffStr] || 3; // 默认中等
    }

    /**
     * 从 board 和 solution 获取玩家已正确填入的格子信息
     * @param {Object} board - Board 实例
     * @param {Array} solution - 正确答案二维数组
     * @returns {Object} { filledCorrect: Set<"r,c">, filledWrong: Set<"r,c"> }
     */
    function _getFilledCells(board, solution) {
      const filledCorrect = new Set();
      const filledWrong = new Set();
      const size = board.size;

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = board.cells[r][c];
          const val = cell.fillNum; // 只算玩家填的，不算 fixedNum
          if (val > 0) {
            if (solution && solution[r] && solution[r][c] === val) {
              filledCorrect.add(`${r},${c}`);
            } else {
              filledWrong.add(`${r},${c}`);
            }
          }
        }
      }

      return { filledCorrect, filledWrong };
    }

    /**
     * 获取初始（原始）热力图（基于只有固定数字，无玩家填入）
     * 用于获取关卡初始状态下各格子的分类（simple/gate/core）
     * 带缓存：同一关卡只生成一次
     * 
     * 优先级：levelData.threeAct（生成器原生三幕） > TechRaterAdapter（运行时分类）
     * 
     * @param {Object} board - 当前 Board 实例
     * @param {Object} levelData - 关卡数据
     * @param {boolean} [isBossLevel=false] - 是否 Boss 关
     * @returns {Object|null} PristineHeatmapResult
     */
    function getPristineHeatmap(board, levelData, isBossLevel) {
      if (!board || !levelData) {
        return null;
      }

      const levelId = levelData.levelId;

      // 缓存命中
      if (_pristineCache.levelId === levelId && _pristineCache.heatmap) {
        return _pristineCache.heatmap;
      }

      try {
        const size = board.size;
        const levelType = getLevelType(levelData, isBossLevel);

        // ===== 优先路径：关卡有 threeAct 原生元数据 =====
        if (levelData.threeAct && _isValidThreeAct(levelData.threeAct)) {
          const heatmap = _buildHeatmapFromThreeAct(
            levelData.threeAct, size, levelType,
            levelData.boardData  // 传入初始盘面，标记预填格为 filled
          );
          if (heatmap) {
            _pristineCache.levelId = levelId;
            _pristineCache.heatmap = heatmap;
            return heatmap;
          }
        }

        // ===== 回退路径：用 TechRaterAdapter 分类 =====
        if (typeof TechRaterAdapter === 'undefined') {
          return null;
        }

        // 从 levelData.boardData 创建一个只有固定数字的"干净"board
        const BoardClass = board.constructor;
        const pristineBoard = new BoardClass(size);
        pristineBoard.loadLevel({
          cells: levelData.boardData,
          cages: levelData.cages || [],
        });

        const adapter = new TechRaterAdapter(pristineBoard);
        const heatmap = adapter.generateHeatmap(levelType);

        // 存入缓存
        _pristineCache.levelId = levelId;
        _pristineCache.heatmap = heatmap;

        return heatmap;
      } catch (e) {
        log.error('[WinConditionManager] getPristineHeatmap error:', e);
        return null;
      }
    }

    /**
     * 校验 threeAct 数据是否有效
     */
    function _isValidThreeAct(threeAct) {
      if (!threeAct) return false;
      const { opening, breakthrough, avalanche } = threeAct;
      if (!Array.isArray(opening) || opening.length === 0) return false;
      if (!Array.isArray(breakthrough)) return false;
      if (!Array.isArray(avalanche)) return false;
      // 至少有 opening 格
      return opening.length > 0;
    }

    /**
     * 从 threeAct 元数据构建 heatmap（生成器原生三幕优先）
     * threeAct 映射：opening → simple, breakthrough → gate, avalanche → core
     * @param {Object} threeAct - 三幕元数据
     * @param {number} size - 盘面大小
     * @param {string} levelType - 关卡类型
     * @param {number[][]} [boardData] - 初始盘面数据，用于标记预填格
     */
    function _buildHeatmapFromThreeAct(threeAct, size, levelType, boardData) {
      const { opening, breakthrough, avalanche } = threeAct;

      // boardData 防御性浅拷贝（防止外部引用修改导致热力图数据不同步）
      const board = boardData ? boardData.map(row => row.slice()) : null;

      // 构建分类映射表
      const categoryMap = {}; // key: "r,c" → { category, orderIndex }
      // 全局递增索引（跨三幕连续计数，用于整体顺序判断）
      let globalOrder = 0;

      // opening → simple（全局顺序 0 ~ N-1）
      opening.forEach((cell) => {
        categoryMap[cell[0] + ',' + cell[1]] = { category: 'simple', orderIndex: globalOrder++ };
      });

      // breakthrough → gate（接在 simple 后面）
      breakthrough.forEach((cell) => {
        categoryMap[cell[0] + ',' + cell[1]] = { category: 'gate', orderIndex: globalOrder++ };
      });

      // avalanche → core（接在 gate 后面）
      avalanche.forEach((cell) => {
        categoryMap[cell[0] + ',' + cell[1]] = { category: 'core', orderIndex: globalOrder++ };
      });

      // 构建 gridMeta
      const gridMeta = new Array(size);
      const COLORS = {
        simple: '#4CAF50',
        gate: '#FF9800',
        core: '#9E9E9E',
        filled: '#2196F3',
      };

      // 统计各类别数量（只统计空格，即非预填格）
      const stats = {
        simple: { total: 0, filled: 0, ratio: 0 },
        gate: { total: 0, filled: 0, ratio: 0 },
        core: { total: 0, filled: 0, ratio: 0 },
        total: { total: 0, filled: 0, ratio: 0 },
      };

      for (let r = 0; r < size; r++) {
        gridMeta[r] = new Array(size);
        for (let c = 0; c < size; c++) {
          const key = r + ',' + c;
          const info = categoryMap[key];

          // 检查是否是预填格
          const isPreFilled = board && board[r] && board[r][c] !== 0;

          let category;
          if (isPreFilled) {
            category = 'filled';
          } else {
            category = info ? info.category : 'core';
          }

          gridMeta[r][c] = {
            category: category,
            color: COLORS[category] || COLORS.core,
            depth: info ? info.orderIndex : 999,
            difficultyScore: info ? info.orderIndex * 10 : 9999,
            fromThreeAct: true,
          };

          // 统计非预填格（即玩家需要填的空格）
          if (!isPreFilled && category !== 'filled') {
            stats.total.total++;
            if (stats[category]) {
              stats[category].total++;
            }
          }
        }
      }

      // 构建 rhythmTimeline（从 threeAct 顺序直接映射，排除预填格）
      // 格式与 TechRaterAdapter 的 _buildTimeline 保持一致
      const openingKeys = opening
        .filter(([r, c]) => !board || !board[r] || board[r][c] === 0)
        .map(([r, c]) => r + ',' + c);
      const gateKeys = breakthrough
        .filter(([r, c]) => !board || !board[r] || board[r][c] === 0)
        .map(([r, c]) => r + ',' + c);
      const dominoKeys = avalanche
        .filter(([r, c]) => !board || !board[r] || board[r][c] === 0)
        .map(([r, c]) => r + ',' + c);

      const rhythmTimeline = {
        totalSteps: openingKeys.length + gateKeys.length + dominoKeys.length,
        phases: {
          opening: {
            cellKeys: openingKeys,
            count: openingKeys.length,
          },
          breakthrough: {
            gateCells: gateKeys,
            count: gateKeys.length,
          },
          avalanche: {
            dominoSequence: dominoKeys,
            count: dominoKeys.length,
          },
        },
      };

      return {
        status: 'valid',
        gridMeta: gridMeta,
        stats: stats,
        rhythmTimeline: rhythmTimeline,
        levelType: levelType,
        fromThreeAct: true,
      };
    }

    /**
     * 清除 pristine 缓存（关卡切换时调用）
     */
    function clearPristineCache() {
      _pristineCache.levelId = null;
      _pristineCache.heatmap = null;
    }

    /**
     * 统计各类格子的总数和已正确填入数
     * 使用原始（初始状态）heatmap 进行分类，用当前 board 统计填入数
     * @param {Object} board - 当前 Board 实例
     * @param {Object} pristineHeatmap - 初始状态的 HeatmapResult（分类基准）
     * @param {Array} solution - 正确答案
     * @returns {Object} 各类别统计 { simple:{total,filled}, gate:{...}, core:{...}, total:{...} }
     */
    function _countByCategory(board, pristineHeatmap, solution) {
      const stats = {
        simple: { total: 0, filled: 0 },
        gate: { total: 0, filled: 0 },
        core: { total: 0, filled: 0 },
        total: { total: 0, filled: 0 },
      };

      if (!pristineHeatmap || !pristineHeatmap.gridMeta) return stats;

      const size = board.size;
      const gridMeta = pristineHeatmap.gridMeta;

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const meta = gridMeta[r]?.[c];
          if (!meta) continue;

          const category = meta.category;
          // 只统计非 filled 类（即玩家需要填的空格）
          // 注意：这里用的是 pristine heatmap，初始状态的空格分类
          if (category === 'filled' || category === 'unknown') continue;

          stats.total.total++;

          if (stats[category]) {
            stats[category].total++;
          }

          // 检查玩家是否已正确填入该格（用当前 board）
          const cell = board.cells[r]?.[c];
          if (!cell) continue;
          const val = cell.fillNum; // 只算玩家填入的，不算 fixedNum 已在 pristine 中被排除
          if (val > 0 && solution && solution[r] && solution[r][c] === val) {
            stats.total.filled++;
            if (stats[category]) {
              stats[category].filled++;
            }
          }
        }
      }

      return stats;
    }

    /**
     * 检查是否满足通关条件
     * 使用初始（pristine）heatmap 进行分类判断
     * @param {Object} board - Board 实例
     * @param {Object} levelData - 关卡数据
     * @param {boolean} isBossLevel - 是否 Boss 关
     * @returns {boolean} 是否通关
     */
    function checkWinCondition(board, levelData, isBossLevel) {
      if (!board || !levelData) return false;

      const levelType = getLevelType(levelData, isBossLevel);
      const solution = levelData.solution;

      // Boss 关：100% 填满且正确（由 Boss 战系统接管，这里返回 false 让原逻辑处理）
      if (levelType === LEVEL_TYPES.BOSS) {
        return false;
      }

      // 获取初始热力图（用于分类基准）
      const pristineHeatmap = getPristineHeatmap(board, levelData, isBossLevel);
      if (!pristineHeatmap) return false;

      const stats = _countByCategory(board, pristineHeatmap, solution);

      // 有错误填入时不能算通关
      const { filledWrong } = _getFilledCells(board, solution);
      if (filledWrong.size > 0) return false;

      // ===== 通关阈值配置（百分比 + 绝对最小数 双保险） =====
      // 防止"填1个就过关"：即使百分比到了，也要满足最小填数
      // 按规格书 v3.0 精确值
      const THRESHOLDS = {
        novice: {
          simpleRatio: 0.50,   // simple 格填 50% 即达标
          minFill: 3,          // 至少填 3 个 simple 格
        },
        midgame: {
          simpleRatio: 0.40,   // simple 格填 40%
          minSimpleFill: 4,    // 至少填 4 个 simple
          gateRequired: 1,     // 至少 1 个 gate
        },
        endgame: {
          totalRatio: 0.30,    // (simple+gate) 填 30%
          minTotalFill: 5,     // 至少填 5 个
          gateRequired: 'all', // 所有 gate 必须填完
        },
      };

      switch (levelType) {
        case LEVEL_TYPES.NOVICE: {
          // 新手关：simple 格填 60% 且至少 3 个
          if (stats.simple.total === 0) return false;
          const ratio = stats.simple.filled / stats.simple.total;
          return ratio >= THRESHOLDS.novice.simpleRatio &&
                 stats.simple.filled >= THRESHOLDS.novice.minFill;
        }

        case LEVEL_TYPES.MIDGAME: {
          // 中盘关：simple 填 50% 且至少 5 个 + 至少 1 个 gate
          if (stats.simple.total === 0) return false;
          const simpleRatio = stats.simple.filled / stats.simple.total;
          if (simpleRatio < THRESHOLDS.midgame.simpleRatio) return false;
          if (stats.simple.filled < THRESHOLDS.midgame.minSimpleFill) return false;
          // 如果没有 gate 格，只看 simple
          if (stats.gate.total === 0) {
            return true;
          }
          return stats.gate.filled >= THRESHOLDS.midgame.gateRequired;
        }

        case LEVEL_TYPES.ENDGAME: {
          // 收官关：simple+gate 填 40% 且至少 8 个 + 所有 gate 填完
          const totalTarget = stats.simple.total + stats.gate.total;
          if (totalTarget === 0) return false;
          const totalFilled = stats.simple.filled + stats.gate.filled;
          const totalRatio = totalFilled / totalTarget;
          if (totalRatio < THRESHOLDS.endgame.totalRatio) return false;
          if (totalFilled < THRESHOLDS.endgame.minTotalFill) return false;
          // 所有 gate 必须填完
          if (stats.gate.total > 0 && stats.gate.filled < stats.gate.total) {
            return false;
          }
          return true;
        }

        default:
          return false;
      }
    }

    /**
     * 获取当前进度
     * 使用初始（pristine）heatmap 进行分类判断
     * @param {Object} board - Board 实例
     * @param {Object} levelData - 关卡数据
     * @param {boolean} isBossLevel - 是否 Boss 关
     * @returns {Object} { current, total, percent, type, description }
     */
    function getProgress(board, levelData, isBossLevel) {
      if (!board || !levelData) {
        return { current: 0, total: 0, percent: 0, type: 'unknown', description: '' };
      }

      const levelType = getLevelType(levelData, isBossLevel);
      const solution = levelData.solution;

      // 获取初始热力图（用于分类基准）
      const pristineHeatmap = getPristineHeatmap(board, levelData, isBossLevel);
      if (!pristineHeatmap) {
        return { current: 0, total: 0, percent: 0, type: levelType, description: '' };
      }

      const stats = _countByCategory(board, pristineHeatmap, solution);

      let current = 0;
      let total = 0;
      let description = '';

      // ===== 进度目标按新阈值计算（不是 total，而是 threshold target） =====
      // 与 checkWinCondition 的阈值保持一致
      const THRESHOLDS = {
        novice: { simpleRatio: 0.50, minFill: 3 },
        midgame: { simpleRatio: 0.40, minSimpleFill: 4, gateRequired: 1 },
        endgame: { totalRatio: 0.30, minTotalFill: 5, gateRequired: 'all' },
      };

      switch (levelType) {
        case LEVEL_TYPES.NOVICE: {
          // 目标：max(simple总数*60%, 最少3个)
          const target = Math.max(
            Math.ceil(stats.simple.total * THRESHOLDS.novice.simpleRatio),
            THRESHOLDS.novice.minFill
          );
          current = Math.min(stats.simple.filled, target);
          total = target;
          description = `心流速填 ${stats.simple.filled}/${stats.simple.total}（目标 ${target}）`;
          break;
        }

        case LEVEL_TYPES.MIDGAME: {
          const simpleTarget = Math.max(
            Math.ceil(stats.simple.total * THRESHOLDS.midgame.simpleRatio),
            THRESHOLDS.midgame.minSimpleFill
          );
          const gateTarget = stats.gate.total > 0 ? THRESHOLDS.midgame.gateRequired : 0;
          current = Math.min(stats.simple.filled, simpleTarget) +
                    Math.min(stats.gate.filled, gateTarget);
          total = simpleTarget + gateTarget;
          description = `开局 ${stats.simple.filled}/${stats.simple.total}，破局 ${stats.gate.filled}/${stats.gate.total}`;
          break;
        }

        case LEVEL_TYPES.ENDGAME: {
          const totalTargetRaw = stats.simple.total + stats.gate.total;
          const totalTarget = Math.max(
            Math.ceil(totalTargetRaw * THRESHOLDS.endgame.totalRatio),
            THRESHOLDS.endgame.minTotalFill
          );
          // endgame 还要求所有 gate 填完
          const gateFilledOk = stats.gate.total === 0 || stats.gate.filled >= stats.gate.total;
          current = Math.min(stats.simple.filled + stats.gate.filled, totalTarget);
          total = totalTarget;
          description = `收官 ${stats.simple.filled + stats.gate.filled}/${totalTargetRaw}（破局 ${stats.gate.filled}/${stats.gate.total}）`;
          break;
        }

        case LEVEL_TYPES.BOSS:
          current = stats.total.filled;
          total = stats.total.total;
          description = `Boss战 ${current}/${total}`;
          break;
      }

      const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

      return { current, total, percent, type: levelType, description, stats };
    }

    /**
     * 获取通关后需要自动补全的格子列表
     * 返回按求解顺序排列的格子，用于动画播放
     * 使用初始（pristine）heatmap 进行分类和排序
     * @param {Object} board - Board 实例
     * @param {Object} levelData - 关卡数据
     * @param {boolean} isBossLevel - 是否 Boss 关
     * @returns {Array<{r: number, c: number, value: number, category: string}>}
     */
    function getAutoFillCells(board, levelData, isBossLevel) {
      if (!board || !levelData || !levelData.solution) return [];

      const levelType = getLevelType(levelData, isBossLevel);
      const solution = levelData.solution;
      const size = board.size;

      // Boss 关不自动补全
      if (levelType === LEVEL_TYPES.BOSS) return [];

      // 获取初始热力图（用于分类和雪崩顺序）
      const pristineHeatmap = getPristineHeatmap(board, levelData, isBossLevel);
      if (!pristineHeatmap) return [];

      const autoFillCells = [];
      const timeline = pristineHeatmap?.rhythmTimeline;

      // ============================================================
      // 构建完整的求解顺序索引（从 rhythmTimeline 的三个阶段合并）
      // 顺序：opening.simpleCells → breakthrough.gateCells → avalanche.dominoSequence
      // 这确保了补全顺序严格遵循求解链的时间顺序
      // ============================================================
      const solveOrder = new Map(); // key → 全局顺序索引
      let orderIdx = 0;

      // 1. 开局阶段（simple 格）的求解顺序
      const openingKeys = timeline?.phases?.opening?.cellKeys || [];
      for (const key of openingKeys) {
        if (!solveOrder.has(key)) {
          solveOrder.set(key, orderIdx++);
        }
      }

      // 2. 破局阶段（gate 格）的求解顺序
      const gateKeys = timeline?.phases?.breakthrough?.gateCells || [];
      for (const key of gateKeys) {
        if (!solveOrder.has(key)) {
          solveOrder.set(key, orderIdx++);
        }
      }

      // 3. 雪崩阶段（core 格）的求解顺序（核心：dominoSequence）
      const dominoKeys = timeline?.phases?.avalanche?.dominoSequence || [];
      for (const key of dominoKeys) {
        if (!solveOrder.has(key)) {
          solveOrder.set(key, orderIdx++);
        }
      }

      // 收集需要自动补全的格子
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = board.cells[r][c];
          // 跳过已填格（包括固定数字和玩家填入）
          if (cell.fixedNum > 0 || cell.fillNum > 0) continue;

          const meta = pristineHeatmap?.gridMeta?.[r]?.[c];
          const category = meta?.category || 'core';

          // 根据关卡类型决定哪些格自动补全
          let shouldFill = false;

          switch (levelType) {
            case LEVEL_TYPES.NOVICE:
              // 新手关：所有 core 和 gate 都自动补全
              shouldFill = (category === 'core' || category === 'gate');
              break;

            case LEVEL_TYPES.MIDGAME:
              // 中盘关：所有 core 和未填的 gate 都自动补全
              shouldFill = (category === 'core' || category === 'gate');
              break;

            case LEVEL_TYPES.ENDGAME:
              // 收官关：只有 core 自动补全（gate 需要玩家全部填完）
              shouldFill = (category === 'core');
              break;
          }

          if (shouldFill) {
            const key = `${r},${c}`;
            autoFillCells.push({
              r,
              c,
              value: solution[r][c],
              category,
              order: solveOrder.has(key) ? solveOrder.get(key) : 9999,
            });
          }
        }
      }

      // 按求解顺序排序（雪崩效果），没有顺序信息的按坐标排序
      autoFillCells.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        if (a.r !== b.r) return a.r - b.r;
        return a.c - b.c;
      });

      return autoFillCells;
    }

    /**
     * 从当前 board 生成 heatmap
     * @param {Object} board - Board 实例
     * @returns {Object|null} HeatmapResult
     */
    function generateHeatmapFromBoard(board) {
      if (!board || typeof TechRaterAdapter === 'undefined') {
        return null;
      }
      try {
        const adapter = new TechRaterAdapter(board);
        return adapter.generateHeatmap();
      } catch (e) {
        log.error('[WinConditionManager] generateHeatmap error:', e);
        return null;
      }
    }

    /**
     * 直接设置 pristine heatmap 缓存（用于预加载）
     * 在关卡初始化时提前生成并缓存，避免首次调用时的延迟
     * @param {number} levelId - 关卡ID
     * @param {Object} heatmap - HeatmapResult 对象
     */
    function setPristineCache(levelId, heatmap) {
      if (!levelId || !heatmap) return;
      _pristineCache.levelId = parseInt(levelId);
      _pristineCache.heatmap = heatmap;
    }

    // 公开 API
    return {
      LEVEL_TYPES,
      getLevelType,
      checkWinCondition,
      getProgress,
      getAutoFillCells,
      getPristineHeatmap,
      setPristineCache,
      clearPristineCache,
      generateHeatmapFromBoard,
    };

  })();

  // 暴露到全局
  global.WinConditionManager = WinConditionManager;

})(window);
