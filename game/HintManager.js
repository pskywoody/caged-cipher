// ============================================================
//  HintManager.js - 提示管理器
//  负责手动提示的展示逻辑、提示次数限制、首次教学触发等
// ============================================================

(function(global) {
  'use strict';

  /**
   * 提示管理器
   */
  class HintManager {
    /**
     * @param {Object} options
     * @param {Function} options.getBoard - 获取 board
     * @param {Function} options.getRenderer - 获取 renderer
     * @param {Function} options.getHintSystem - 获取 hintSystem
     * @param {Function} options.getTechMatrix - 获取 techMatrix
     * @param {Function} options.getExpertSystem - 获取 expertSystem
     * @param {Function} options.getComedySystem - 获取 comedySystem
     * @param {Function} options.getAchievementCoordinator - 获取 achievementCoordinator
     * @param {Function} options.getWhatIfState - 获取 WhatIf 状态
     * @param {Function} options.getStoryEngine - 获取 storyEngine
     * @param {Function} options.getCurrentLevelData - 获取当前关卡数据
     * @param {Function} options.getCurrentChapterData - 获取当前章节数据
     * @param {Function} options.getHintCount - 获取提示次数
     * @param {Function} options.addHintCount - 增加提示次数
     * @param {Object} options.AudioService - 音频服务
     * @param {Object} options.NAME_TO_CHAR - 角色名映射
     * @param {Function} options.showToast - 显示 Toast
     * @param {Function} options.showCharacterBubble - 显示角色气泡
     * @param {Function} options.playFirstEncounterTeaching - 播放首次教学
     * @param {Function} options.playHintAnimation - 播放提示动画
     * @param {Function} options.normalizeEvidence - 规范化证据
     */
    constructor(options = {}) {
      this.getBoard = options.getBoard || (() => null);
      this.getRenderer = options.getRenderer || (() => null);
      this.getHintSystem = options.getHintSystem || (() => null);
      this.getTechMatrix = options.getTechMatrix || (() => null);
      this.getExpertSystem = options.getExpertSystem || (() => null);
      this.getComedySystem = options.getComedySystem || (() => null);
      this.getAchievementCoordinator = options.getAchievementCoordinator || (() => null);
      this.getWhatIfState = options.getWhatIfState || (() => null);
      this.getStoryEngine = options.getStoryEngine || (() => null);
      this.getCurrentLevelData = options.getCurrentLevelData || (() => null);
      this.getCurrentChapterData = options.getCurrentChapterData || (() => null);
      this.getHintCount = options.getHintCount || (() => 0);
      this.addHintCount = options.addHintCount || ((delta) => {});
      this.AudioService = options.AudioService || (typeof AudioService !== 'undefined' ? AudioService : null);
      this.NAME_TO_CHAR = options.NAME_TO_CHAR || {};
      this.showToast = options.showToast || (() => {});
      this.showCharacterBubble = options.showCharacterBubble || (() => {});
      this.playFirstEncounterTeaching = options.playFirstEncounterTeaching || (() => {});
      this.playHintAnimation = options.playHintAnimation || (() => {});
      this.normalizeEvidence = options.normalizeEvidence || ((hint) => hint.evidence);
    }

    // ============================================================
    //  提示次数限制
    // ============================================================
    /**
     * 获取本关最大提示次数
     * @returns {number}
     */
    getMaxHints() {
      const currentLevelData = this.getCurrentLevelData();
      // Base hints based on grid size
      const gridSize = currentLevelData ? (currentLevelData.gridSize || 9) : 9;
      let baseHints = gridSize <= 4 ? 5 : gridSize <= 6 ? 8 : 12;

      // Apply cycle multiplier
      if (global.ProgressManager) {
        const mods = ProgressManager.getCycleModifiers();
        baseHints = Math.max(1, Math.floor(baseHints * mods.hintMultiplier));
      }

      return baseHints;
    }

    /**
     * 检查是否还可以使用提示
     * @returns {boolean}
     */
    canUseHint() {
      return this.getHintCount() < this.getMaxHints();
    }

    // ============================================================
    //  显示提示
    // ============================================================
    /**
     * 显示一个提示
     */
    showHint() {
      const hintSystem = this.getHintSystem();
      const WhatIfState = this.getWhatIfState();
      const board = this.getBoard();
      const renderer = this.getRenderer();
      const techMatrix = this.getTechMatrix();
      const expertSystem = this.getExpertSystem();
      const comedySystem = this.getComedySystem();
      const achievementCoordinator = this.getAchievementCoordinator();
      const storyEngine = this.getStoryEngine();
      const currentLevelData = this.getCurrentLevelData();
      const currentChapterData = this.getCurrentChapterData();

      if (!hintSystem) return;

      // What If 模式下提示不可用
      if (WhatIfState && WhatIfState.active) {
        this.showToast('假设模式下提示不可用');
        return;
      }

      // Check hint limit for current cycle
      if (!this.canUseHint()) {
        this.showToast('本周目提示次数已用完，请凭实力解谜');
        // 吐槽系统：提示用完
        if (comedySystem) {
          comedySystem.onHintsExhausted();
        }
        return;
      }

      const hint = hintSystem.getHint();
      if (!hint) {
        this.showToast('提示冷却中，请稍后再试');
        return;
      }

      this.AudioService.sfx.play('hint');

      if (hint.hintType === 'complete') {
        this.showToast(hint.dialogue);
        return;
      }

      const { character, characterName, dialogue, target, targetCells, techniqueName, isFirstEncounter, teachingDialog } = hint;

      // 记录本次提示使用的技巧（用于正确填数时触发技巧类成就）
      if (achievementCoordinator) achievementCoordinator.lastHintTechnique = techniqueName || null;

      // Clear previous hint highlights
      if (renderer && typeof renderer.clearHintHighlights === 'function') {
        renderer.clearHintHighlights('hint');
      }

      // Select the primary target cell
      if (target && board) {
        let tRow, tCol;
        if (target.row !== undefined && target.col !== undefined) {
          tRow = target.row;
          tCol = target.col;
        } else if (target.r !== undefined && target.c !== undefined) {
          tRow = target.r;
          tCol = target.c;
        } else if (target.cells && target.cells.length > 0) {
          const first = target.cells[0];
          if (first.row !== undefined && first.col !== undefined) {
            tRow = first.row;
            tCol = first.col;
          } else if (first.r !== undefined && first.c !== undefined) {
            tRow = first.r;
            tCol = first.c;
          }
        }
        if (tRow !== undefined && tCol !== undefined) {
          board.selectCell(tRow, tCol);
        }
      }

      renderer.render(board);

      this.addHintCount(1);
      expertSystem.onHint();

      // GameContext 同步：手动提示计数
      try {
        if (global.GameContext && global.GameContext.player) {
          global.GameContext.player.hintUsageCount++;
        }
      } catch (e) {}

      // 累计总提示次数（用于真结局判定）
      if (global.ProgressManager) {
        ProgressManager.addHintCount(1);
        // 标记当前章节使用了提示（用于 no_hint_chapter 成就判定）
        if (currentChapterData && !currentLevelData.isHidden) {
          ProgressManager.setChapterHintUsed(currentChapterData.chapterId);
        }
        // 使用了提示，重置连续无提示通关计数
        ProgressManager.resetNoHintStreak();
      }
      EventLogger.log('game:hint', { character: characterName, target, targetCells, technique: techniqueName });

      // First encounter: play full teaching dialogue via StoryEngine
      if (isFirstEncounter && teachingDialog && teachingDialog.length > 0 && storyEngine) {
        this.playFirstEncounterTeaching(teachingDialog, character, techniqueName, targetCells);
        return;
      }

      // 使用动画播放器（所有 deduction 类型提示都用动画播放）
      if (renderer && typeof renderer.playHintAnimation === 'function'
          && hint.hintType === 'deduction') {
        this.playHintAnimation(hint);
        return;
      }

      // Fallback: 旧版高亮 + 气泡方式
      if (targetCells && targetCells.length > 0 && renderer && typeof renderer.highlightHintCells === 'function') {
        renderer.highlightHintCells(targetCells, 'hint', 'hint');
      }

      // 更新技术矩阵的证据链
      if (techMatrix && hint.hintType === 'deduction') {
        if (!hint._evidenceNormalized && typeof this.normalizeEvidence === 'function') {
          hint.evidence = this.normalizeEvidence(hint);
          hint._evidenceNormalized = true;
        }
        techMatrix.showEvidence(hint);
      }

      // Regular hint: show character bubble
      const prefix = techniqueName ? `【${techniqueName}】` : '';
      this.showCharacterBubble(character || this.NAME_TO_CHAR[characterName] || 'ayan', {
        text: prefix + dialogue,
        speakerName: characterName,
        duration: 4500,
        type: 'hint',
      });
    }
  }

  // 导出到全局
  global.HintManager = HintManager;

})(window);
