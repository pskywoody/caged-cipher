// HintPlayer - 提示播放器（从 guide.js 抽离）
// 动画式推理展示：观察 → 聚焦 → 排除 → 揭示 → 完成
//
// 阶段五：抽离提示播放器和解说系统
//   - 物理分离，逻辑不变
//   - 所有原 guide.js 中的提示动画相关函数完整迁移
//   - 通过 window.HintPlayer 暴露
//   - 依赖：renderer, techMatrix, WhatIfState, AudioService,
//           showCharacterBubble, NarrationSystem, showFloatBar/hideFloatBar/updateFloatBarTabIcon
//   - 使用 init(deps) 注入依赖

;(function(global) {
  'use strict';

  // ============================================================
  //  提示播放器状态
  // ============================================================
  const HintPlayerState = {
    playing: false,
    currentHint: null,
    totalSteps: 0,
    currentStep: 0,
    // P2优化：统一管理提示相关的定时器，可一键清理
    _timers: new Set(),
    // 注册定时器，返回timer ID
    _setTimeout(fn, delay) {
      const timer = setTimeout(() => {
        this._timers.delete(timer);
        fn();
      }, delay);
      this._timers.add(timer);
      return timer;
    },
    // 清理所有提示相关定时器
    _clearAllTimers() {
      for (const timer of this._timers) {
        clearTimeout(timer);
      }
      this._timers.clear();
      // 同时清理打字机定时器
      if (global.NarrationSystem && global.NarrationSystem.state) {
        global.NarrationSystem.clearTypewriterTimer();
      }
    },
  };

  // ============================================================
  //  依赖注入
  // ============================================================
  let deps = {
    getRenderer: () => null,
    getTechMatrix: () => null,
    getWhatIfState: () => null,
    getAudioService: () => null,
    showCharacterBubble: () => {},
    showFloatBar: () => {},
    hideFloatBar: () => {},
    updateFloatBarTabIcon: () => {},
    getNarrationSystem: () => global.NarrationSystem,
  };

  function init(dependencyMap) {
    deps = Object.assign({}, deps, dependencyMap || {});
  }

  // 便捷获取器
  function _renderer() { return deps.getRenderer(); }
  function _techMatrix() { return deps.getTechMatrix(); }
  function _whatIf() { return deps.getWhatIfState(); }
  function _audio() { return deps.getAudioService(); }
  function _narration() { return deps.getNarrationSystem(); }

  // ============================================================
  //  工具函数
  // ============================================================

  /**
   * 获取提示角色对应的头像 emoji
   */
  function _getHintAvatar(characterId) {
    const AVATAR_MAP = {
      ayan: '💡',
      cagekeeper: '🔒',
      ying: '✨',
      ray: '🔍',
      weaver: '🕸️',
      setter_secret: '🎭',
    };
    return AVATAR_MAP[characterId] || '💡';
  }

  /**
   * 将动画步骤类型映射到证据链层级索引
   * 0=观察, 1=排除, 2=结论, -1=无对应
   */
  function _stepTypeToEvidenceLayer(stepType) {
    switch (stepType) {
      case 'observe':
      case 'focus':
        return 0; // 观察层
      case 'eliminate':
        return 1; // 排除层
      case 'reveal':
      case 'complete':
        return 2; // 结论层
      default:
        return -1;
    }
  }

  /**
   * 根据提示信息构建推理链箭头数据
   */
  function _buildArrowData(hint, targetCell) {
    if (!targetCell) return null;
    const { technique, evidence } = hint;
    const techType = (evidence && evidence.type) || technique;

    let from = null;

    if (techType === 'nakedSingle') {
      // 裸单：从目标格所在行出发（也可以是列或宫，选行作为主观察区）
      from = { type: 'row', index: targetCell[0] };
    } else if (techType === 'hiddenSingle') {
      if (evidence) {
        if (evidence.scopeType === 'row' && evidence.scopeIndex !== undefined) {
          from = { type: 'row', index: evidence.scopeIndex };
        } else if (evidence.scopeType === 'col' && evidence.scopeIndex !== undefined) {
          from = { type: 'col', index: evidence.scopeIndex };
        } else if (evidence.scopeType === 'box' && evidence.scopeIndex !== undefined) {
          from = { type: 'box', index: evidence.scopeIndex };
        }
      }
      if (!from) {
        from = { type: 'row', index: targetCell[0] };
      }
    } else if (techType === 'cageUnique' || techType === 'rule45') {
      if (evidence) {
        if (evidence.cageId !== undefined) {
          from = { type: 'cage', index: evidence.cageId };
        } else if (evidence.intersectingCages && evidence.intersectingCages.length > 0) {
          from = { type: 'cage', index: evidence.intersectingCages[0] };
        }
      }
    } else if (techType === 'nakedPair' || techType === 'hiddenPair') {
      // 数对：从第一个配对格出发
      if (evidence && evidence.pairCells && evidence.pairCells.length > 0) {
        from = { type: 'cell', index: evidence.pairCells[0] };
      }
    } else if (techType === 'pointingClaiming') {
      if (evidence) {
        if (evidence.boxIndex !== undefined) {
          from = { type: 'box', index: evidence.boxIndex };
        } else if (evidence.row !== undefined) {
          from = { type: 'row', index: evidence.row };
        } else if (evidence.col !== undefined) {
          from = { type: 'col', index: evidence.col };
        }
      }
    } else if (techType === 'xWing' || techType === 'swordfish') {
      // 从第一行出发
      from = { type: 'row', index: targetCell[0] };
    }

    if (!from) {
      // 默认：从目标格所在行出发
      from = { type: 'row', index: targetCell[0] };
    }

    return {
      from: from,
      to: targetCell,
    };
  }

  /**
   * 规范化证据数据，确保技术矩阵有足够的信息显示
   */
  function _normalizeEvidence(hint) {
    const { technique, evidence: origEvidence, target, targetValue } = hint;
    const techType = (origEvidence && origEvidence.type) || technique;

    // 提取目标格
    let targetCell = null;
    if (target) {
      if (target.row !== undefined && target.col !== undefined) {
        targetCell = [target.row, target.col];
      } else if (target.r !== undefined && target.c !== undefined) {
        targetCell = [target.r, target.c];
      }
    }

    const evidence = origEvidence ? { ...origEvidence } : {};
    evidence.type = techType;

    // 确保有 targetCell
    if (!evidence.targetCell && targetCell) {
      evidence.targetCell = targetCell;
    }

    // 确保有 targetValue
    if (evidence.targetValue === undefined) {
      if (target && target.value !== undefined) {
        evidence.targetValue = target.value;
      } else if (target && target.num !== undefined) {
        evidence.targetValue = target.num;
      } else if (targetValue !== undefined) {
        evidence.targetValue = targetValue;
      }
    }

    // 为裸单补充观察数据（行/列/宫的数字）
    if (techType === 'nakedSingle' && !evidence.candidates && targetCell) {
      evidence.candidates = [];
    }

    return evidence;
  }

  /**
   * 从 hint 对象构建动画步骤序列
   */
  function _buildHintAnimationSteps(hint) {
    const steps = [];
    const { target, targetCells, technique, hintLevel } = hint;
    const narration = _narration();

    // 规范化证据数据
    const evidence = _normalizeEvidence(hint);

    // 提取目标格子
    let targetCell = null;
    if (target) {
      if (target.row !== undefined && target.col !== undefined) {
        targetCell = [target.row, target.col];
      } else if (target.r !== undefined && target.c !== undefined) {
        targetCell = [target.r, target.c];
      } else if (target.cells && target.cells.length > 0) {
        const first = target.cells[0];
        targetCell = [first.row !== undefined ? first.row : first.r, first.col !== undefined ? first.col : first.c];
      }
    }

    // 相关格子数组（用于观察高亮）
    const observeCells = targetCells ? targetCells.map(c => {
      if (c.row !== undefined) return [c.row, c.col];
      if (c.r !== undefined) return [c.r, c.c];
      return c;
    }) : (targetCell ? [targetCell] : []);

    // 步骤 1: 观察 - 高亮相关区域
    const observeData = { cells: observeCells };

    // 如果有 evidence，提取行/列/宫/笼子信息
    if (evidence) {
      const techType = evidence.type || technique;
      if (techType === 'nakedSingle') {
        observeData.rows = targetCell ? [targetCell[0]] : [];
        observeData.cols = targetCell ? [targetCell[1]] : [];
      } else if (techType === 'hiddenSingle') {
        if (evidence.scopeType === 'row' && evidence.scopeIndex !== undefined) {
          observeData.rows = [evidence.scopeIndex];
        } else if (evidence.scopeType === 'col' && evidence.scopeIndex !== undefined) {
          observeData.cols = [evidence.scopeIndex];
        } else if (evidence.scopeType === 'box' && evidence.scopeIndex !== undefined) {
          observeData.boxes = [evidence.scopeIndex];
        } else {
          observeData.rows = evidence.row !== undefined ? [evidence.row] : [];
          observeData.cols = evidence.col !== undefined ? [evidence.col] : [];
          observeData.boxes = evidence.box !== undefined ? [evidence.box] : [];
        }
      } else if (techType === 'cageUnique' || techType === 'rule45') {
        observeData.cageIds = evidence.cageId !== undefined ? [evidence.cageId] :
          (evidence.intersectingCages ? evidence.intersectingCages.slice(0, 2) : []);
      } else if (techType === 'nakedPair' || techType === 'hiddenPair') {
        observeData.cells = evidence.pairCells || observeCells;
      } else if (techType === 'xWing' || techType === 'swordfish') {
        observeData.cells = observeCells;
      }
    }

    // 构建推理链箭头数据
    const arrow = targetCell ? _buildArrowData(hint, targetCell) : null;
    if (arrow) {
      observeData.arrow = arrow;
    }

    const observeNarration = narration ? narration.generateNarration('observe', observeData, hint) : '';
    steps.push({
      type: 'observe',
      duration: Math.max(1200, 800 + observeNarration.length * 40), // 给阅读时间
      data: observeData,
      narration: observeNarration,
      speaker: hint.character || 'ayan',
    });

    // 步骤 2: 聚焦 - 目标格子脉动
    if (targetCell) {
      const focusData = { targetCell };
      if (arrow) focusData.arrow = arrow; // 保持箭头显示
      const focusNarration = narration ? narration.generateNarration('focus', focusData, hint) : '';
      steps.push({
        type: 'focus',
        duration: Math.max(1000, 700 + focusNarration.length * 40),
        data: focusData,
        narration: focusNarration,
        speaker: hint.character || 'ayan',
      });
    }

    // 步骤 3: 排除（仅 Level 2/3，根据技巧类型生成排除内容）
    if (hintLevel >= 2 && evidence && targetCell) {
      const techType = evidence.type || technique;
      let eliminated = [];
      let elimCell = targetCell;

      if (techType === 'nakedSingle' && evidence.candidates) {
        const targetNum = evidence.targetValue;
        eliminated = evidence.candidates.filter(n => n !== targetNum);
      } else if (techType === 'hiddenSingle') {
        // 隐单法：排除的是"这个数字在其他格子里的可能"
        // 简化展示：不展示具体排除数字，用文字解说
        eliminated = [];
      } else if (techType === 'nakedPair' || techType === 'hiddenPair') {
        // 数对：排除的是同行/列/宫其他格中的这两个数字
        eliminated = evidence.eliminatedNumbers || evidence.pairValues || [];
      } else if (techType === 'cageUnique' || techType === 'rule45') {
        // 笼子/45法则：排除的是不可能的组合
        eliminated = evidence.eliminatedValues || [];
      } else if (techType === 'xWing' || techType === 'swordfish') {
        // X-Wing/Swordfish：排除的是同列其他格的数字
        eliminated = evidence.eliminatedNumbers || [evidence.targetValue];
      }

      // 有具体排除数字时才显示排除动画
      if (eliminated.length > 0) {
        const elimData = {
          cell: elimCell,
          numbers: eliminated.slice(0, 8), // 最多展示8个，避免太挤
        };
        if (arrow) elimData.arrow = arrow; // 保持箭头显示
        const elimNarration = narration ? narration.generateNarration('eliminate', elimData, hint) : '';
        steps.push({
          type: 'eliminate',
          duration: Math.max(1800, 1200 + elimNarration.length * 40),
          data: elimData,
          narration: elimNarration,
          speaker: hint.character || 'ayan',
        });
      } else if (hintLevel >= 2) {
        // 没有具体数字可排除时，用"逻辑排除"的解说文字，延长聚焦步
        // 保持 focus 步的解说已经涵盖，这里不加额外步骤
      }
    }

    // 步骤 4: 揭示 - 目标数字填入（仅 Level 3）
    if (hintLevel >= 3 && targetCell && evidence && evidence.targetValue !== undefined) {
      const revealData = {
        cell: targetCell,
        number: evidence.targetValue,
      };
      if (arrow) revealData.arrow = arrow; // 保持箭头显示
      const revealNarration = narration ? narration.generateNarration('reveal', revealData, hint) : '';
      steps.push({
        type: 'reveal',
        duration: Math.max(1200, 800 + revealNarration.length * 40),
        data: revealData,
        narration: revealNarration,
        speaker: hint.character || 'ayan',
      });
    } else if (hintLevel >= 3 && targetCell && target.num !== undefined) {
      const revealData = {
        cell: targetCell,
        number: target.num,
      };
      if (arrow) revealData.arrow = arrow; // 保持箭头显示
      const revealNarration = narration ? narration.generateNarration('reveal', revealData, hint) : '';
      steps.push({
        type: 'reveal',
        duration: Math.max(1200, 800 + revealNarration.length * 40),
        data: revealData,
        narration: revealNarration,
        speaker: hint.character || 'ayan',
      });
    }

    // 步骤 5: 完成 - 微闪
    const completeNarration = narration ? narration.generateNarration('complete', {}, hint) : '';
    steps.push({
      type: 'complete',
      duration: Math.max(800, 500 + completeNarration.length * 30),
      data: {},
      narration: completeNarration,
      speaker: hint.character || 'ayan',
    });

    return steps;
  }

  // ============================================================
  //  公开 API
  // ============================================================

  /**
   * 播放提示动画
   */
  function playAnimation(hint) {
    const renderer = _renderer();
    const narration = _narration();
    const whatIf = _whatIf();
    const techMatrix = _techMatrix();

    if (!renderer || typeof renderer.playHintAnimation !== 'function') return;
    if (!hint) return;

    // 规范化证据数据（供动画步骤和技术矩阵共用）
    if (!hint._evidenceNormalized) {
      const normalizedEvidence = _normalizeEvidence(hint);
      hint.evidence = normalizedEvidence;
      hint._evidenceNormalized = true;
    }

    const steps = _buildHintAnimationSteps(hint);
    if (steps.length === 0) return;

    HintPlayerState.playing = true;
    HintPlayerState.currentHint = hint;
    HintPlayerState.totalSteps = steps.length;
    HintPlayerState.currentStep = 0;

    // 显示右侧浮条进度
    const hintProg = document.getElementById('hint-progress-indicator');
    const stack = document.getElementById('whatif-snapshot-stack');
    if (!whatIf || !whatIf.active) {
      deps.showFloatBar(false); // 显示拉扣头
    }
    if (hintProg) {
      hintProg.style.display = 'flex';
      document.getElementById('hint-current-step').textContent = '1';
      document.getElementById('hint-total-steps').textContent = String(steps.length);
    }
    if (stack && whatIf && !whatIf.active) stack.style.display = 'none';
    deps.updateFloatBarTabIcon();

    // 显示解说气泡（第一步的内容会在 onStepStart 中设置）
    const techName = hint.techniqueName || '';

    // 启动动画
    renderer.playHintAnimation(
      steps,
      // onStepStart: 每步开始时更新解说文字
      (stepIndex, step) => {
        HintPlayerState.currentStep = stepIndex;
        const stepNarration = step.narration || '';
        const stepNum = stepIndex;
        const totalSteps = steps.length;

        // 更新进度
        const curEl = document.getElementById('hint-current-step');
        if (curEl) curEl.textContent = String(stepIndex + 1);

        // 技术矩阵证据链联动：根据步骤类型高亮对应层级
        if (techMatrix && hint.hintType === 'deduction') {
          const layerIndex = _stepTypeToEvidenceLayer(step.type);
          if (layerIndex >= 0) {
            techMatrix.highlightEvidenceStep(layerIndex, hint);
          }
        }

        if (stepNarration && narration) {
          // 如果气泡还没显示，先显示
          const bubble = document.getElementById('hint-narration-bubble');
          if (bubble && bubble.style.display === 'none') {
            narration.showBubble({
              text: stepNarration,
              techniqueName: techName,
              avatar: _getHintAvatar(hint.character),
              stepNum: stepNum,
              totalSteps: totalSteps,
            });
          } else {
            // 已显示，更新文字和步骤号
            narration.updateText(stepNarration);
            narration.updateStep(stepNum, totalSteps);
            // 更新头像
            const avatarEl = document.getElementById('hint-narration-avatar');
            if (avatarEl) avatarEl.textContent = _getHintAvatar(hint.character);
            // 更新技巧名
            const techEl = document.getElementById('hint-narration-tech');
            if (techEl && techName) {
              techEl.textContent = techName;
              techEl.style.display = 'block';
            }
          }
        }
      },
      // onStepComplete: 每步完成回调
      (stepIndex) => {
        HintPlayerState.currentStep = stepIndex + 1;
        const curEl = document.getElementById('hint-current-step');
        if (curEl) curEl.textContent = String(Math.min(stepIndex + 2, steps.length));
        // 跳过打字机效果（让文字立即显示完整）
        if (narration) {
          narration.skipTypewriter();
        }
      },
      // onComplete: 全部完成回调
      () => {
        _onHintAnimationComplete(hint);
      }
    );
  }

  /**
   * 提示动画完成后的处理
   */
  function _onHintAnimationComplete(hint) {
    const narration = _narration();
    const whatIf = _whatIf();
    const techMatrix = _techMatrix();

    HintPlayerState.playing = false;

    // 隐藏解说气泡（延迟一点，让完成感更强）
    HintPlayerState._setTimeout(() => {
      if (narration) {
        narration.hideBubble();
      }
    }, 400);

    // 隐藏进度指示器（延迟一点，让完成感更强）
    HintPlayerState._setTimeout(() => {
      const hintProg = document.getElementById('hint-progress-indicator');
      if (hintProg) hintProg.style.display = 'none';
      // 如果 What If 模式未激活，隐藏浮条
      if (!whatIf || !whatIf.active) {
        deps.hideFloatBar();
      }
      deps.updateFloatBarTabIcon();
    }, 500);

    // 显示角色气泡对话
    const { character, characterName, dialogue, techniqueName } = hint;
    const prefix = techniqueName ? `【${techniqueName}】` : '';
    deps.showCharacterBubble(character || 'ayan', {
      text: prefix + dialogue,
      speakerName: characterName,
      duration: 4500,
      type: 'hint',
    });

    // 更新技术矩阵证据链
    if (techMatrix && hint.hintType === 'deduction') {
      techMatrix.showEvidence(hint);
    }
  }

  /**
   * 跳过当前提示步骤
   * P2优化：立即跳过，响应 < 50ms
   */
  function skipStep() {
    const renderer = _renderer();
    const audio = _audio();
    const narration = _narration();

    if (!renderer || !HintPlayerState.playing) return;
    // 跳过打字机效果
    if (narration) {
      narration.skipTypewriter();
    }
    if (typeof renderer.skipHintStep === 'function') {
      renderer.skipHintStep();
    }
    if (audio && audio.sfx && typeof audio.sfx.play === 'function') {
      audio.sfx.play('click');
    }
  }

  /**
   * 停止提示动画
   * P2优化：立即中断所有定时器链（打字机、气泡、动画等），响应 < 50ms
   */
  function stopAnimation() {
    const renderer = _renderer();
    const narration = _narration();
    const whatIf = _whatIf();
    const techMatrix = _techMatrix();

    if (!renderer) return;
    // 立即清理所有提示相关定时器
    HintPlayerState._clearAllTimers();
    // 停止renderer中的提示动画
    if (typeof renderer.stopHintAnimation === 'function') {
      renderer.stopHintAnimation();
    }
    HintPlayerState.playing = false;
    HintPlayerState.currentHint = null;
    // 立即隐藏解说气泡（不等待动画）
    if (narration) {
      narration.hideBubble();
    }
    const hintProg = document.getElementById('hint-progress-indicator');
    if (hintProg) hintProg.style.display = 'none';
    // 立即清理技术矩阵提示高亮
    if (techMatrix && typeof techMatrix.clearHighlight === 'function') {
      techMatrix.clearHighlight();
    }
    if (!whatIf || !whatIf.active) {
      deps.hideFloatBar();
    }
    deps.updateFloatBarTabIcon();
  }

  // ============================================================
  //  模块暴露
  // ============================================================

  const HintPlayer = {
    state: HintPlayerState,
    init: init,
    playAnimation: playAnimation,
    skipStep: skipStep,
    stopAnimation: stopAnimation,
    _buildHintAnimationSteps: _buildHintAnimationSteps,
    _normalizeEvidence: _normalizeEvidence,
    _buildArrowData: _buildArrowData,
    _stepTypeToEvidenceLayer: _stepTypeToEvidenceLayer,
    _getHintAvatar: _getHintAvatar,
    _onHintAnimationComplete: _onHintAnimationComplete,
  };

  global.HintPlayer = HintPlayer;

})(typeof window !== 'undefined' ? window : globalThis);
