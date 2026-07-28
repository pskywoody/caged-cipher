// ============================================================
//  AutoHintSystem - 自动提示系统
// ============================================================
//  从 guide.js 抽离，物理分离，逻辑不变
//  负责由决策层 TRIGGER_HINT 动作触发的自动提示
//
//  与手动提示的区别：
//  1. 带角色对话前缀"让我看看..."，更有代入感
//  2. 冷却时间独立计算（自动提示冷却更长）
//  3. 不消耗玩家提示次数（算0.5次，用于成就判定）
//  4. 自动提示时喜剧系统静音
//  5. Boss战中频率降低
// ============================================================

;(function(global) {
  'use strict';

  const log = new Logger('AutoHint');

  // 自动提示临时静音截止时间（喜剧系统防火墙）
  let _autoHintMuteUntil = 0;

  /**
   * 获取自动提示的开场白
   */
  function _getAutoHintIntro(charId, reason) {
    const intros = {
      ayan: {
        stuck: '让我看看...嗯，',
        anxiety: '别急，',
        novice: '这个嘛，',
        flow_drop: '刚才思路不错，',
      },
      cagekeeper: {
        stuck: '观察盘面。',
        anxiety: '冷静下来。',
        novice: '基础要打牢。',
        flow_drop: '保持节奏。',
      },
      ying: {
        stuck: '我来帮你看看！',
        anxiety: '别着急别着急~',
        novice: '我教你呀！',
        flow_drop: '加油加油！',
      },
    };
    const charIntros = intros[charId] || intros.ayan;
    return charIntros[reason] || charIntros.stuck;
  }

  /**
   * 获取角色中文名
   */
  function _getCharacterName(charId) {
    const names = {
      ayan: '阿妍',
      cagekeeper: '守笼人',
      ying: '莹莹',
    };
    return names[charId] || '阿妍';
  }

  class AutoHintSystem {
    /**
     * @param {Object} deps - 依赖注入
     * @param {Function} deps.getHintSystem - 获取提示系统
     * @param {Function} deps.getWhatIfState - 获取 WhatIf 状态
     * @param {Function} deps.getLessonUICoordinator - 获取教学引导协调器
     * @param {Function} deps.isLastLevelOfChapter - 是否为章节最后一关
     * @param {Function} deps.isBossBattleStarted - Boss 战是否已开始
     * @param {Function} deps.getExpertSystem - 获取专家系统
     * @param {Function} deps.getGameContext - 获取 GameContext
     * @param {Function} deps.getComedySystem - 获取喜剧系统
     * @param {Function} deps.getAchievementCoordinator - 获取成就协调器
     * @param {Function} deps.getHintCount - 获取提示次数
     * @param {Function} deps.addHintCount - 增加提示次数
     * @param {Function} deps.getProgressManager - 获取进度管理器
     * @param {Function} deps.getCurrentChapterData - 获取当前章节数据
     * @param {Function} deps.getCurrentLevelData - 获取当前关卡数据
     * @param {Function} deps.getRenderer - 获取渲染器
     * @param {Function} deps.getBoard - 获取棋盘
     * @param {Function} deps.getStoryEngine - 获取剧情引擎
     * @param {Function} deps.playFirstEncounterTeaching - 播放首次遭遇教学
     * @param {Function} deps.playHintAnimation - 播放提示动画
     * @param {Function} deps.getTechMatrix - 获取技巧矩阵
     * @param {Function} deps.normalizeEvidence - 归一化证据
     * @param {Function} deps.showCharacterBubble - 显示角色气泡
     */
    constructor(deps = {}) {
      this._getHintSystem = deps.getHintSystem || (() => null);
      this._getWhatIfState = deps.getWhatIfState || (() => null);
      this._getLessonUICoordinator = deps.getLessonUICoordinator || (() => null);
      this._isLastLevelOfChapter = deps.isLastLevelOfChapter || (() => false);
      this._isBossBattleStarted = deps.isBossBattleStarted || (() => false);
      this._getExpertSystem = deps.getExpertSystem || (() => null);
      this._getGameContext = deps.getGameContext || (() => null);
      this._getComedySystem = deps.getComedySystem || (() => null);
      this._getAchievementCoordinator = deps.getAchievementCoordinator || (() => null);
      this._getHintCount = deps.getHintCount || (() => 0);
      this._addHintCount = deps.addHintCount || (() => {});
      this._getProgressManager = deps.getProgressManager || (() => null);
      this._getCurrentChapterData = deps.getCurrentChapterData || (() => null);
      this._getCurrentLevelData = deps.getCurrentLevelData || (() => null);
      this._getRenderer = deps.getRenderer || (() => null);
      this._getBoard = deps.getBoard || (() => null);
      this._getStoryEngine = deps.getStoryEngine || (() => null);
      this._playFirstEncounterTeaching = deps.playFirstEncounterTeaching || (() => {});
      this._playHintAnimation = deps.playHintAnimation || (() => {});
      this._getTechMatrix = deps.getTechMatrix || (() => null);
      this._normalizeEvidence = deps.normalizeEvidence || (hint => hint && hint.evidence);
      this._showCharacterBubble = deps.showCharacterBubble || (() => {});
    }

    /**
     * 执行自动提示（由决策层 TRIGGER_HINT 动作触发）
     * @param {Object} params - { hintLevel, reason, character, isNovice, technique }
     */
    showAutoHint(params = {}) {
      const hintSystem = this._getHintSystem();
      if (!hintSystem) return;

      // What If 模式下不自动提示
      const WhatIfState = this._getWhatIfState();
      if (WhatIfState && WhatIfState.active) return;

      // 教学引导激活时不自动提示
      const lessonUICoordinator = this._getLessonUICoordinator();
      if (lessonUICoordinator && lessonUICoordinator.isActive) return;

      // Boss 战中自动提示频率降低（检查 Boss 战专用冷却）
      const isBoss = this._isLastLevelOfChapter();
      if (isBoss && this._isBossBattleStarted()) {
        // Boss战中，自动提示触发概率降低到 30%（模拟更有挑战感）
        if (Math.random() > 0.3) {
          log.info('[AutoHint] Boss战中抑制自动提示');
          return;
        }
      }

      const requestedLevel = params.hintLevel || 1;
      const reason = params.reason || 'stuck';
      const charId = params.character || 'ayan';

      // 记录自动提示到感知层（触发冷却）
      const expertSystem = this._getExpertSystem();
      if (expertSystem && typeof expertSystem.onHint === 'function') {
        expertSystem.onHint(true);
      }

      // === GameContext 同步：提示使用计数 ===
      try {
        const GameContext = this._getGameContext();
        if (GameContext && GameContext.player) {
          GameContext.player.hintUsageCount++;
        }
      } catch (e) {}

      // 调用 HintSystem 获取提示
      const hint = hintSystem.getHint();
      if (!hint) {
        log.warn('[AutoHint] HintSystem 返回空');
        return;
      }

      // 播放提示音效
      if (typeof AudioService !== 'undefined') {
        AudioService.sfx.play('hint');
      }

      // 喜剧系统防火墙：自动提示时喜剧静音（通过全局临时静音标志）
      const comedySystem = this._getComedySystem();
      if (comedySystem) {
        _autoHintMuteUntil = Date.now() + 5000; // 静音5秒
      }

      const { character, characterName, dialogue, target, targetCells, techniqueName,
              isFirstEncounter, teachingDialog } = hint;

      // 记录技巧遭遇（用于新手保护规则）
      if (hint.technique && expertSystem && typeof expertSystem.onTechniqueEncounter === 'function') {
        expertSystem.onTechniqueEncounter(hint.technique);
      }

      // 记录本次提示使用的技巧（用于正确填数时触发技巧类成就）
      const achievementCoordinator = this._getAchievementCoordinator();
      if (achievementCoordinator) achievementCoordinator.lastHintTechnique = techniqueName || null;

      // 自动提示的提示计数：算 0.5 次（不消耗完整次数）
      this._addHintCount(0.5);

      // 累计总提示次数（自动提示算半次）
      const ProgressManager = this._getProgressManager();
      const currentChapterData = this._getCurrentChapterData();
      const currentLevelData = this._getCurrentLevelData();
      if (ProgressManager) {
        ProgressManager.addHintCount(0.5);
        if (currentChapterData && !currentLevelData.isHidden) {
          ProgressManager.setChapterHintUsed(currentChapterData.chapterId);
        }
        ProgressManager.resetNoHintStreak();
      }

      if (typeof EventLogger !== 'undefined') {
        EventLogger.log('game:auto_hint', {
          character: characterName,
          target,
          targetCells,
          technique: techniqueName,
          reason,
          hintLevel: hint.hintLevel,
        });
      }

      const renderer = this._getRenderer();
      const board = this._getBoard();

      // 清除之前的提示高亮
      if (renderer && typeof renderer.clearHintHighlights === 'function') {
        renderer.clearHintHighlights('hint');
      }

      // 选中目标格
      if (target && board) {
        let tRow, tCol;
        if (target.row !== undefined && target.col !== undefined) {
          tRow = target.row;
          tCol = target.col;
        } else if (target.cells && target.cells.length > 0) {
          const first = target.cells[0];
          if (first.row !== undefined && first.col !== undefined) {
            tRow = first.row;
            tCol = first.col;
          }
        }
        if (tRow !== undefined && tCol !== undefined) {
          board.selectCell(tRow, tCol);
        }
      }

      renderer.render(board);

      // 首次遇到技巧：播放完整教学对话
      const storyEngine = this._getStoryEngine();
      if (isFirstEncounter && teachingDialog && teachingDialog.length > 0 && storyEngine) {
        this._playFirstEncounterTeaching(teachingDialog, character, techniqueName, targetCells);
        return;
      }

      // 使用动画播放器（所有 deduction 类型提示都用动画播放）
      if (renderer && typeof renderer.playHintAnimation === 'function'
          && hint.hintType === 'deduction') {
        // 自动提示添加前缀对话
        hint._autoHintIntro = _getAutoHintIntro(charId, reason);
        this._playHintAnimation(hint);
        return;
      }

      // Fallback: 高亮 + 角色气泡
      if (targetCells && targetCells.length > 0 && renderer && typeof renderer.highlightHintCells === 'function') {
        renderer.highlightHintCells(targetCells, 'hint', 'hint');
      }

      const techMatrix = this._getTechMatrix();
      if (techMatrix && hint.hintType === 'deduction') {
        if (!hint._evidenceNormalized) {
          hint.evidence = this._normalizeEvidence(hint);
          hint._evidenceNormalized = true;
        }
        techMatrix.showEvidence(hint);
      }

      // 自动提示：显示带角色前缀的气泡
      const intro = _getAutoHintIntro(charId, reason);
      const prefix = techniqueName ? `【${techniqueName}】` : '';
      const finalChar = params.character || character;
      const finalCharName = params.character ? _getCharacterName(params.character) : characterName;
      this._showCharacterBubble(finalChar, {
        text: intro + ' ' + prefix + dialogue,
        speakerName: finalCharName,
        duration: 5000,
        type: 'hint',
      });
    }

    /**
     * 获取自动提示临时静音截止时间（供外部查询，如喜剧系统）
     */
    getMuteUntil() {
      return _autoHintMuteUntil;
    }

    /**
     * 重置自动提示静音状态
     */
    resetMute() {
      _autoHintMuteUntil = 0;
    }
  }

  // 暴露到全局
  global.AutoHintSystem = AutoHintSystem;

})(window);
