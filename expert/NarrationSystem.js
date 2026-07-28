// NarrationSystem - 解说系统（从 guide.js 抽离）
// 提供解说气泡显示、打字机效果、解说模板等功能
//
// 阶段五：抽离提示播放器和解说系统
//   - 物理分离，逻辑不变
//   - 所有原 guide.js 中的解说相关函数完整迁移
//   - 通过 window.NarrationSystem 暴露

;(function(global) {
  'use strict';

  // ============================================================
  //  解说系统状态
  // ============================================================
  const NarrationState = {
    bubbleEl: null,
    textEl: null,
    techEl: null,
    avatarEl: null,
    stepBadgeEl: null,
    typewriterTimer: null,
    typewriterText: '',
    typewriterFull: '',
    typewriterIndex: 0,
    typewriterSpeed: 45, // ms per character for Chinese
    visible: false,
  };

  // ============================================================
  //  解说模板：按技巧类型和步骤类型生成解说文字
  //  每个技巧包含 observe / focus / eliminate / reveal 四个步骤的模板
  //  模板使用 {row}{col}{num}{numbers} 等占位符
  // ============================================================
  const NARRATION_TEMPLATES = {
    // ---------- 裸单法 (Naked Single) ----------
    nakedSingle: {
      observe: (data, hint, cell) => {
        const parts = [];
        if (data.rows && data.rows.length) {
          parts.push(`看看第 ${data.rows[0] + 1} 行`);
        }
        if (data.cols && data.cols.length) {
          parts.push(`第 ${data.cols[0] + 1} 列`);
        }
        if (cell) {
          const cellRow = cell[0] + 1;
          const cellCol = cell[1] + 1;
          if (parts.length === 0) {
            return `我们来观察第 ${cellRow} 行第 ${cellCol} 列这一格。`;
          }
          return `我们来观察${parts.join('、')}，以及其中的这一格。`;
        }
        return '让我们来观察一下这一区域。';
      },
      focus: (data, hint) => {
        if (data.targetCell) {
          return `注意第 ${data.targetCell[0] + 1} 行第 ${data.targetCell[1] + 1} 列这一格。`;
        }
        return '注意这个格子。';
      },
      eliminate: (data, hint) => {
        const nums = data.numbers || [];
        if (nums.length === 0) return '可以排除掉不少数字。';
        const numStr = nums.join('、');
        if (nums.length <= 4) {
          return `${numStr} 都已经在同行、同列或同宫里出现过了，可以排除。`;
        }
        return `${nums.length} 个数字（${numStr}）都已出现，全部可以排除。`;
      },
      reveal: (data, hint) => {
        const n = data.number;
        return `所以这一格只能是 ${n}。`;
      },
      complete: () => '明白了吗？这就是裸单法。',
    },

    // ---------- 隐单法 (Hidden Single) ----------
    hiddenSingle: {
      observe: (data, hint) => {
        const evidence = hint.evidence || {};
        if (evidence.scopeType === 'row') {
          return `看看第 ${evidence.scopeIndex + 1} 行，想想数字都在哪儿。`;
        }
        if (evidence.scopeType === 'col') {
          return `看看第 ${evidence.scopeIndex + 1} 列。`;
        }
        if (evidence.scopeType === 'box') {
          return `看看第 ${evidence.scopeIndex + 1} 宫。`;
        }
        if (data.boxes && data.boxes.length) {
          return `看看第 ${data.boxes[0] + 1} 宫。`;
        }
        return '让我们来观察这一区域。';
      },
      focus: (data, hint) => {
        if (data.targetCell) {
          return `数字 ${hint.evidence && hint.evidence.targetValue ? hint.evidence.targetValue : ''} 在这一区域里，只能放在这一格。`;
        }
        return '仔细看，有一个数字被锁定了。';
      },
      eliminate: (data, hint) => {
        const evidence = hint.evidence || {};
        const scopeLabel = evidence.scopeType === 'row' ? `第 ${evidence.scopeIndex + 1} 行`
          : evidence.scopeType === 'col' ? `第 ${evidence.scopeIndex + 1} 列`
          : evidence.scopeType === 'box' ? `第 ${evidence.scopeIndex + 1} 宫`
          : '这一区域';
        const val = evidence.targetValue || (data && data.numbers ? data.numbers[0] : '');
        if (val) {
          return `在${scopeLabel}里，数字 ${val} 没有别的容身之处了。`;
        }
        return '这个数字在这一区域别无去处。';
      },
      reveal: (data, hint) => {
        const n = data.number;
        return `所以这里一定是 ${n}。`;
      },
      complete: () => '这就是隐单法——表面看不出来，其实早已确定。',
    },

    // ---------- 笼子唯一组合 / 45法则 (cageUnique / rule45) ----------
    cageUnique: {
      observe: (data, hint) => {
        const evidence = hint.evidence || {};
        if (evidence.cageSum !== undefined) {
          return `看看这个笼子，它的和是 ${evidence.cageSum}。`;
        }
        if (data.cageIds && data.cageIds.length) {
          return '让我们来看看这个笼子。';
        }
        return '观察一下这个笼子。';
      },
      focus: (data, hint) => {
        const evidence = hint.evidence || {};
        if (evidence.comboCount !== undefined) {
          if (evidence.comboCount === 1) {
            return '这个笼子只有一种可能的组合。';
          }
          return `这个笼子只有 ${evidence.comboCount} 种可能的组合。`;
        }
        return '注意这个笼子里的格子。';
      },
      eliminate: (data, hint) => {
        const nums = data.numbers || [];
        if (nums.length > 0) {
          return `数字 ${nums.join('、')} 不可能出现在这里。`;
        }
        const evidence = hint.evidence || {};
        if (evidence.combos && evidence.combos.length > 0) {
          const comboStr = evidence.combos.slice(0, 2).map(c => Array.isArray(c) ? c.join('+') : c).join('、');
          return `可能的组合有：${comboStr}${evidence.combos.length > 2 ? '…' : ''}`;
        }
        return '通过笼和可以排除很多可能性。';
      },
      reveal: (data, hint) => {
        const n = data.number;
        return `所以这一格是 ${n}。`;
      },
      complete: () => '笼子的和值会告诉你很多秘密。',
    },

    rule45: {
      observe: (data, hint) => {
        const evidence = hint.evidence || {};
        const scopeLabel = evidence.scopeType === 'row' ? `第 ${evidence.scopeIndex + 1} 行`
          : evidence.scopeType === 'col' ? `第 ${evidence.scopeIndex + 1} 列`
          : evidence.scopeType === 'box' ? `第 ${evidence.scopeIndex + 1} 宫`
          : '这一宫';
        return `你知道吗？${scopeLabel}的总和一定是 45。`;
      },
      focus: (data, hint) => {
        const evidence = hint.evidence || {};
        const type = evidence.subtype === 'innie' ? '内突' : '外突';
        return `注意这个${type}的格子——它伸出了宫的边界。`;
      },
      eliminate: (data, hint) => {
        const evidence = hint.evidence || {};
        if (evidence.totalCageSum !== undefined) {
          const diff = Math.abs(evidence.totalCageSum - 45);
          return `相关笼子的总和是 ${evidence.totalCageSum}，与 45 的差值告诉我们答案。`;
        }
        return '用 45 减去已知的数字，就能知道还差多少。';
      },
      reveal: (data, hint) => {
        const n = data.number;
        const evidence = hint.evidence || {};
        const type = evidence.subtype === 'innie' ? '内突' : '外突';
        return `所以这个${type}格的值就是 ${n}。`;
      },
      complete: () => '这就是 45 法则，也叫星衡法则。',
    },

    // ---------- 裸数对 (Naked Pair) ----------
    nakedPair: {
      observe: (data, hint) => {
        const cells = data.cells || [];
        if (cells.length >= 2) {
          return `看看这两格，它们的候选数很特别。`;
        }
        return '观察这一行/列/宫里的格子。';
      },
      focus: (data, hint) => {
        const evidence = hint.evidence || {};
        const vals = evidence.pairValues || [];
        if (vals.length === 2) {
          return `这两格都只剩下 ${vals[0]} 和 ${vals[1]} 两个候选。`;
        }
        return '注意这两个格子。';
      },
      eliminate: (data, hint) => {
        const evidence = hint.evidence || {};
        const vals = evidence.pairValues || [];
        if (vals.length === 2) {
          return `它们构成了数对——同行/列/宫里其他格的 ${vals[0]} 和 ${vals[1]} 都可以排除。`;
        }
        return '它们组成了数对，可以排除同区域其他格的这两个数字。';
      },
      reveal: (data, hint) => {
        const n = data.number;
        if (n) return `所以这一格可以排除 ${n}。`;
        return '这就是数对排除法。';
      },
      complete: () => '裸数对——两个格子锁定两个数字。',
    },

    // ---------- 隐数对 (Hidden Pair) ----------
    hiddenPair: {
      observe: (data, hint) => {
        const evidence = hint.evidence || {};
        const scopeLabel = evidence.scopeType === 'row' ? '这一行'
          : evidence.scopeType === 'col' ? '这一列'
          : evidence.scopeType === 'box' ? '这一宫'
          : '这一区域';
        return `看看${scopeLabel}里的候选数。`;
      },
      focus: (data, hint) => {
        const evidence = hint.evidence || {};
        const vals = evidence.pairValues || [];
        if (vals.length === 2) {
          return `数字 ${vals[0]} 和 ${vals[1]} 只出现在这两格里。`;
        }
        return '有两个数字藏得很深。';
      },
      eliminate: (data, hint) => {
        return '这两格的其他候选数都可以排除——因为它们必须容纳这两个数字。';
      },
      reveal: (data, hint) => {
        const n = data.number;
        if (n) return `所以这一格的 ${n} 可以排除。`;
        return '这就是隐数对。';
      },
      complete: () => '隐数对——藏在候选数中的秘密。',
    },

    // ---------- X-Wing (二连纵横阵) ----------
    xWing: {
      observe: (data, hint) => {
        return '看看这两行（或两列），某个数字的位置很有意思。';
      },
      focus: (data, hint) => {
        const evidence = hint.evidence || {};
        const val = evidence.targetValue || (hint.target && hint.target.value) || '';
        if (val) {
          return `数字 ${val} 在这两行里，都只出现在同样的两列。`;
        }
        return '注意这四个格子，它们构成了一个矩形。';
      },
      eliminate: (data, hint) => {
        const evidence = hint.evidence || {};
        const val = evidence.targetValue || '';
        if (val) {
          return `这是一个 X-Wing 结构——对角线上的数字 ${val} 互相锁定。`;
        }
        return '四个角的数字互相制约，形成了矩形结构。';
      },
      reveal: (data, hint) => {
        const n = data.number;
        if (n) return `所以这一列其他位置的 ${n} 都可以排除。`;
        return '这样就可以排除这两列其他格的这个数字。';
      },
      complete: () => '这就是二连纵横阵——X-Wing。',
    },

    // ---------- Swordfish (三才游鱼阵) ----------
    swordfish: {
      observe: (data, hint) => {
        return '看看这三行，某个数字的分布很有规律。';
      },
      focus: (data, hint) => {
        const evidence = hint.evidence || {};
        const val = evidence.targetValue || '';
        if (val) {
          return `数字 ${val} 在这三行里，都只出现在同样的三列中。`;
        }
        return '注意这三行三列的交叉点。';
      },
      eliminate: (data, hint) => {
        return '这是 Swordfish 结构——三行三列，数字在其中游动。';
      },
      reveal: (data, hint) => {
        const n = data.number;
        if (n) return `所以这三列其他位置的 ${n} 都可以排除。`;
        return '这样就能排除这三列里其他格的这个数字。';
      },
      complete: () => '三才游鱼阵——Swordfish，高阶技巧。',
    },

    // ---------- 通用模板（fallback） ----------
    generic: {
      observe: (data, hint) => {
        if (data.rows && data.rows.length) {
          return `看看第 ${data.rows[0] + 1} 行。`;
        }
        if (data.cols && data.cols.length) {
          return `看看第 ${data.cols[0] + 1} 列。`;
        }
        if (data.boxes && data.boxes.length) {
          return `看看第 ${data.boxes[0] + 1} 宫。`;
        }
        return '让我们来观察一下这里。';
      },
      focus: (data, hint) => {
        if (data.targetCell) {
          return '注意这个格子。';
        }
        return '仔细看这里。';
      },
      eliminate: (data, hint) => {
        const nums = data.numbers || [];
        if (nums.length > 0) {
          return `这些数字（${nums.join('、')}）可以排除。`;
        }
        return '通过推理可以排除一些可能性。';
      },
      reveal: (data, hint) => {
        const n = data.number;
        if (n) return `所以答案是 ${n}。`;
        return '答案就在这里。';
      },
      complete: () => '想明白了吗？',
    },
  };

  // 向后兼容：cageUnique 和 rule45 可以互相兜底
  NARRATION_TEMPLATES.cageSumDeduction = NARRATION_TEMPLATES.cageUnique;

  // ============================================================
  //  内部函数
  // ============================================================

  /**
   * 根据技巧类型获取解说模板
   */
  function _getNarrationTemplate(technique) {
    return NARRATION_TEMPLATES[technique] || NARRATION_TEMPLATES.generic;
  }

  /**
   * 生成某一步的解说文字
   */
  function generateNarration(stepType, stepData, hint) {
    const technique = hint.technique || 'generic';
    const template = _getNarrationTemplate(technique);
    const generator = template[stepType];
    if (!generator) return '';
    try {
      // 获取目标格子信息（用于模板）
      let targetCell = null;
      if (stepData.targetCell) {
        targetCell = stepData.targetCell;
      }
      return generator(stepData, hint, targetCell) || '';
    } catch (e) {
      console.warn('[Narration] template error:', e);
      return '';
    }
  }

  /**
   * 打字机效果
   */
  function _startTypewriter(text, element, speed) {
    // 停止之前的打字机
    if (NarrationState.typewriterTimer) {
      clearTimeout(NarrationState.typewriterTimer);
      NarrationState.typewriterTimer = null;
    }

    if (!text || !element) return;

    const charSpeed = speed || NarrationState.typewriterSpeed;
    NarrationState.typewriterFull = text;
    NarrationState.typewriterIndex = 0;
    NarrationState.typewriterText = '';

    // 计算总时长限制：不要让打字速度根据文本长度自适应
    const maxDuration = 1500; // 最长打字时间
    const estimatedDuration = text.length * charSpeed;
    let actualSpeed = charSpeed;
    if (estimatedDuration > maxDuration) {
      actualSpeed = Math.max(15, Math.floor(maxDuration / text.length));
    }

    function typeNext() {
      if (NarrationState.typewriterIndex >= text.length) {
        // 打字完成，移除光标
        element.textContent = text;
        NarrationState.typewriterTimer = null;
        return;
      }

      NarrationState.typewriterIndex++;
      const currentText = text.substring(0, NarrationState.typewriterIndex);
      element.textContent = currentText + '▌';

      NarrationState.typewriterTimer = setTimeout(typeNext, actualSpeed);
    }

    typeNext();
  }

  /**
   * 立即完成打字机效果（显示完整文字）
   */
  function skipTypewriter() {
    if (!NarrationState.typewriterTimer) return;
    clearTimeout(NarrationState.typewriterTimer);
    NarrationState.typewriterTimer = null;

    const textEl = document.getElementById('hint-narration-text');
    if (textEl && NarrationState.typewriterFull) {
      textEl.textContent = NarrationState.typewriterFull;
    }
  }

  // ============================================================
  //  公开 API
  // ============================================================

  /**
   * 显示解说气泡
   */
  function showBubble(options) {
    options = options || {};
    const bubble = document.getElementById('hint-narration-bubble');
    if (!bubble) return;

    const textEl = document.getElementById('hint-narration-text');
    const techEl = document.getElementById('hint-narration-tech');
    const avatarEl = document.getElementById('hint-narration-avatar');
    const stepEl = document.getElementById('hint-narration-step');

    // 重置文字内容（避免闪现旧内容）
    if (textEl) textEl.textContent = '';

    // 设置头像
    if (avatarEl && options.avatar) {
      avatarEl.textContent = options.avatar;
    }

    // 设置技巧名
    if (techEl) {
      if (options.techniqueName) {
        techEl.textContent = options.techniqueName;
        techEl.style.display = 'block';
      } else {
        techEl.style.display = 'none';
      }
    }

    // 设置步骤徽章
    if (stepEl && options.stepNum !== undefined && options.totalSteps !== undefined) {
      stepEl.textContent = `${options.stepNum + 1}/${options.totalSteps}`;
      stepEl.style.display = 'flex';
    } else if (stepEl) {
      stepEl.style.display = 'none';
    }

    // 显示气泡
    bubble.style.display = 'flex';
    // 强制重排后添加 show 类触发动画
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bubble.classList.add('show');
      });
    });
    NarrationState.visible = true;

    // 设置文字（带打字机效果）—— 等淡入动画完成后再开始打字
    if (textEl && options.text) {
      // 250ms 是 CSS 中淡入动画的时长
      setTimeout(() => {
        if (NarrationState.visible) {
          _startTypewriter(options.text, textEl, options.speed);
        }
      }, 250);
    } else if (textEl) {
      textEl.textContent = options.text || '';
    }
  }

  /**
   * 更新解说气泡文字（用于切换步骤时）
   */
  function updateText(text, speed) {
    const textEl = document.getElementById('hint-narration-text');
    if (!textEl) return;
    _startTypewriter(text, textEl, speed);
  }

  /**
   * 更新步骤编号
   */
  function updateStep(stepNum, totalSteps) {
    const stepEl = document.getElementById('hint-narration-step');
    if (!stepEl) return;
    stepEl.textContent = `${stepNum + 1}/${totalSteps}`;
  }

  /**
   * 隐藏解说气泡
   */
  function hideBubble() {
    const bubble = document.getElementById('hint-narration-bubble');
    if (!bubble) return;

    // 停止打字机
    if (NarrationState.typewriterTimer) {
      clearTimeout(NarrationState.typewriterTimer);
      NarrationState.typewriterTimer = null;
    }

    bubble.classList.remove('show');
    NarrationState.visible = false;

    // 延迟隐藏（等动画结束），并重置内部状态
    setTimeout(() => {
      if (!NarrationState.visible) {
        bubble.style.display = 'none';
        // 重置内部状态，避免下次显示闪现旧内容
        const textEl = document.getElementById('hint-narration-text');
        const stepEl = document.getElementById('hint-narration-step');
        const techEl = document.getElementById('hint-narration-tech');
        if (textEl) textEl.textContent = '';
        if (stepEl) stepEl.style.display = 'none';
        if (techEl) techEl.style.display = 'none';
        NarrationState.typewriterFull = '';
        NarrationState.typewriterIndex = 0;
        NarrationState.typewriterText = '';
      }
    }, 300);
  }

  /**
   * 清理所有打字机定时器（供外部快速清理使用）
   */
  function clearTypewriterTimer() {
    if (NarrationState.typewriterTimer) {
      clearTimeout(NarrationState.typewriterTimer);
      NarrationState.typewriterTimer = null;
    }
  }

  // ============================================================
  //  模块暴露
  // ============================================================

  const NarrationSystem = {
    state: NarrationState,
    templates: NARRATION_TEMPLATES,
    showBubble: showBubble,
    updateText: updateText,
    updateStep: updateStep,
    hideBubble: hideBubble,
    generateNarration: generateNarration,
    skipTypewriter: skipTypewriter,
    clearTypewriterTimer: clearTypewriterTimer,
    _getNarrationTemplate: _getNarrationTemplate,
    _startTypewriter: _startTypewriter,
  };

  global.NarrationSystem = NarrationSystem;

})(typeof window !== 'undefined' ? window : globalThis);
