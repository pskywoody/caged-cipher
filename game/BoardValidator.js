// ============================================================
//  BoardValidator.js - 棋盘规则校验器
//  独立规则校验：不依赖 solution 数组，验证数独所有规则
//  包括：每行/列/宫 1-size 不重复，每个笼子和值正确，没有空格子
// ============================================================

(function(global) {
  'use strict';

  /**
   * 独立规则校验：验证数独所有规则
   * @param {Object} board - 棋盘对象
   * @param {Object} [currentLevelData] - 当前关卡数据（用于 solution 辅助校验）
   * @returns {Object} { valid: boolean, filled: boolean, errors: [{r, c, type}] }
   */
  function validateBoard(board) {
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
   * @param {Object} board - 棋盘对象
   * @param {Object} currentLevelData - 当前关卡数据
   * @returns {boolean}
   */
  function isBoardComplete(board, currentLevelData) {
    if (!board || !currentLevelData) return false;

    // 主校验：独立规则校验
    const result = validateBoard(board);
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
   * @param {Object} board - 棋盘对象
   * @param {Object} [renderer] - 渲染器对象（可选，用于重绘）
   * @returns {boolean} 是否有错误
   */
  function highlightAllErrors(board, renderer) {
    if (!board) return false;
    const result = validateBoard(board);
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

  // 导出到全局
  global.BoardValidator = {
    validateBoard: validateBoard,
    isBoardComplete: isBoardComplete,
    highlightAllErrors: highlightAllErrors,
  };

})(window);
