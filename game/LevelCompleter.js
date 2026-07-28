// ============================================================
//  LevelCompleter.js - 关卡完成流程管理器
//  负责通关检查、自动补全动画、关卡完成触发、进度保存等
// ============================================================

(function(global) {
  'use strict';

  /**
   * 关卡完成流程管理器
   */
  class LevelCompleter {
    /**
     * @param {Object} options
     * @param {Function} options.getBoard - 获取 board
     * @param {Function} options.getRenderer - 获取 renderer
     * @param {Function} options.getCurrentLevelData - 获取当前关卡数据
     * @param {Function} options.getCurrentLevelId - 获取当前关卡 ID
     * @param {Function} options.getCurrentChapterData - 获取当前章节数据
     * @param {Function} options.getChapterSelect - 获取 chapterSelect
     * @param {Function} options.getExpertSystem - 获取 expertSystem
     * @param {Function} options.getGameTimer - 获取 gameTimer
     * @param {Function} options.getHintCount - 获取 hintCount
     * @param {Function} options.getErrorCount - 获取 errorCount
     * @param {Function} options.getComedySystem - 获取 comedySystem
     * @param {Function} options.getIsCompleted - 获取 isCompleted
     * @param {Function} options.setIsCompleted - 设置 isCompleted
     * @param {Function} options.getIsBossBattleActive - Boss 战是否激活
     * @param {Function} options.isLastLevelOfChapter - 是否章节最后一关
     * @param {Object} options.AudioService - 音频服务
     * @param {Object} options.log - Logger 实例
     * @param {Function} options.showToast - 显示 Toast
     * @param {Function} options.vibrate - 震动函数
     * @param {Function} options.updateNumBtnCompletedState - 更新数字按钮完成状态
     * @param {Function} options.playClearDialog - 播放通关对话
     * @param {Function} options.playClimaxAnimation - 播放高潮动画
     * @param {Function} options.calculateGrade - 计算评级
     * @param {Function} options.checkAchievements - 检查成就
     * @param {Function} options.refreshAchievementPanel - 刷新成就面板
     * @param {Function} options.updateNextLevelButton - 更新下一关按钮
     * @param {Function} options.findChapterById - 按 ID 查找章节
     */
    constructor(options = {}) {
      this.getBoard = options.getBoard || (() => null);
      this.getRenderer = options.getRenderer || (() => null);
      this.getCurrentLevelData = options.getCurrentLevelData || (() => null);
      this.getCurrentLevelId = options.getCurrentLevelId || (() => 0);
      this.getCurrentChapterData = options.getCurrentChapterData || (() => null);
      this.getChapterSelect = options.getChapterSelect || (() => null);
      this.getExpertSystem = options.getExpertSystem || (() => null);
      this.getGameTimer = options.getGameTimer || (() => null);
      this.getHintCount = options.getHintCount || (() => 0);
      this.getErrorCount = options.getErrorCount || (() => 0);
      this.getComedySystem = options.getComedySystem || (() => null);
      this.getIsCompleted = options.getIsCompleted || (() => false);
      this.setIsCompleted = options.setIsCompleted || (() => {});
      this.getIsBossBattleActive = options.getIsBossBattleActive || (() => false);
      this.isLastLevelOfChapter = options.isLastLevelOfChapter || (() => false);
      this.AudioService = options.AudioService || (typeof AudioService !== 'undefined' ? AudioService : null);
      this.log = options.log || console;
      this.showToast = options.showToast || (() => {});
      this.vibrate = options.vibrate || (() => {});
      this.updateNumBtnCompletedState = options.updateNumBtnCompletedState || (() => {});
      this.playClearDialog = options.playClearDialog || ((cb) => { if (cb) cb(); });
      this.playClimaxAnimation = options.playClimaxAnimation || ((cb) => { if (cb) cb(); });
      this.calculateGrade = options.calculateGrade || (() => ({ letter: 'C', color: '#ffc107' }));
      this.checkAchievements = options.checkAchievements || (() => {});
      this.refreshAchievementPanel = options.refreshAchievementPanel || (() => {});
      this.updateNextLevelButton = options.updateNextLevelButton || (() => {});
      this.findChapterById = options.findChapterById || (() => null);
    }

    // ============================================================
    //  通关检查
    // ============================================================
    checkCompletion() {
      // Boss战中，由Boss战系统控制胜负，不自动通关
      if (typeof GuideBattle !== 'undefined' && (GuideBattle.active || GuideBattle.ended)) {
        return;
      }
      // 已经通关的不重复触发
      if (this.getIsCompleted()) return;

      try {
        const board = this.getBoard();
        const currentLevelData = this.getCurrentLevelData();
        const isBossLvl = this.isLastLevelOfChapter();

        // 1. 检查是否100%完成
        if (BoardValidator.isBoardComplete(board, currentLevelData)) {
          this.triggerLevelComplete();
          return;
        }

        // 2. 非Boss关：检查分层过关条件
        if (!isBossLvl && currentLevelData && board) {
          // 三幕式引导：检测阶段切换
          if (typeof ThreeActGuide !== 'undefined') {
            try { ThreeActGuide.onFillCheck(); } catch(e) {}
          }

          // 检查是否满足分层通关条件
          const won = WinConditionManager.checkWinCondition(
            board, currentLevelData, isBossLvl
          );

          if (won) {
            // 满足通关条件：先自动补全，再触发通关
            const autoFillCells = WinConditionManager.getAutoFillCells(
              board, currentLevelData, isBossLvl
            );

            const levelType = WinConditionManager.getLevelType(currentLevelData, isBossLvl);
            this.log.info('[WinCondition] 分层通关触发:', levelType, '自动补全', autoFillCells.length, '格');

            this.playAutoFillAnimation(autoFillCells, levelType, () => {
              this.triggerLevelComplete();
            });
            return;
          }
        }

        // 3. 未通关：检查是否填满但有错误
        this._checkFilledWithErrors();

      } catch(e) {
        this.log.error('checkCompletion error:', e);
      }
    }

    /**
     * 检查棋盘是否填满但有错误
     */
    _checkFilledWithErrors() {
      const board = this.getBoard();
      const result = BoardValidator.validateBoard(board);
      if (result.filled && result.errors.length > 0) {
        try { BoardValidator.highlightAllErrors(board, this.getRenderer()); } catch(e) {}
        this.showToast('还有地方不对哦~');
        this.vibrate(global.VIBRATE_PRESETS ? VIBRATE_PRESETS.ERROR : [50, 30, 50]);
      }
    }

    // ============================================================
    //  自动补全动画（逐格填入，带雪崩加速效果）
    // ============================================================
    /**
     * 播放自动补全动画
     * @param {Array} autoFillCells - 需要自动补全的格子列表
     * @param {string} levelType - 关卡类型（novice/midgame/endgame）
     * @param {Function} onComplete - 完成回调
     */
    playAutoFillAnimation(autoFillCells, levelType, onComplete) {
      if (!autoFillCells || autoFillCells.length === 0) {
        if (onComplete) onComplete();
        return;
      }

      const board = this.getBoard();
      const renderer = this.getRenderer();
      const AudioService = this.AudioService;

      this.setIsCompleted(true); // 标记为已通关，防止重复触发
      // 暂停计时器（通关时刻开始算）
      const gameTimer = this.getGameTimer();
      if (gameTimer) try { gameTimer.pause(); } catch(e) {}

      const total = autoFillCells.length;

      // 速度配置（根据关卡类型）
      let baseDelay, minDelay, acceleration;
      switch (levelType) {
        case 'novice':
          baseDelay = 80; minDelay = 40; acceleration = 0.4; break;
        case 'midgame':
          baseDelay = 65; minDelay = 25; acceleration = 0.55; break;
        case 'endgame':
        default:
          baseDelay = 50; minDelay = 12; acceleration = 0.75; break;
      }

      // 格子很多时整体提速
      if (total > 50) {
        const scaleFactor = Math.max(0.5, 1 - (total - 50) * 0.01);
        baseDelay = Math.max(minDelay, baseDelay * scaleFactor);
      }

      let index = 0;
      let prevCellInfo = null;

      // 雪崩开始音效
      if (levelType === 'endgame') {
        try { AudioService.synth.playAvalancheStart(); } catch(e) {}
      } else {
        try { AudioService.sfx.play('success'); } catch(e) {}
      }

      // 清空旧的光线
      if (levelType === 'endgame' && renderer && typeof renderer.clearAvalancheRays === 'function') {
        try { renderer.clearAvalancheRays(); } catch(e) {}
      }

      const fillNext = () => {
        if (index >= total) {
          // 动画完成：确保最后一帧完整渲染
          this.updateNumBtnCompletedState();
          if (renderer) {
            try { renderer.render(board); } catch(e) {}
          }

          // 雪崩结束音效
          if (levelType === 'endgame') {
            try { AudioService.synth.playAvalancheEnd(); } catch(e) {}
          }

          if (onComplete) onComplete();
          return;
        }

        const cellInfo = autoFillCells[index];
        const { r, c, value, category } = cellInfo;

        // 雪崩光线
        if (levelType === 'endgame' && prevCellInfo && renderer &&
            typeof renderer.addAvalancheRay === 'function') {
          try {
            renderer.addAvalancheRay(prevCellInfo.r, prevCellInfo.c, r, c, 400);
          } catch(e) {}
        }

        // 填入数字
        try {
          board.setNumberAt(r, c, value, {
            recordHistory: false,
            autoClear: true,
          });
        } catch (e) {
          const cell = board.cells[r]?.[c];
          if (cell && !cell.fixedNum) {
            cell.fillNum = value;
          }
        }

        // 触发填数动画
        if (renderer && typeof renderer.triggerFillAnimation === 'function') {
          try { renderer.triggerFillAnimation(r, c, 200); } catch(e) {}
        }

        prevCellInfo = cellInfo;

        // 渲染策略：每 N 格重绘一次
        let renderInterval;
        if (levelType === 'endgame') {
          renderInterval = total > 40 ? 5 : (total > 20 ? 4 : 3);
        } else {
          renderInterval = total > 40 ? 4 : 3;
        }

        if (index % renderInterval === 0 || index === total - 1) {
          if (renderer) {
            try { renderer.render(board); } catch(e) {}
          }
        }

        // 播放音效
        if (levelType === 'endgame') {
          const progress = index / total;
          let sfxInterval = progress < 0.5 ? 3 : 2;
          if (index % sfxInterval === 0) {
            try { AudioService.synth.playAvalancheTick(index, total); } catch(e) {}
          }
        } else {
          if (index % 4 === 0) {
            try { AudioService.sfx.play('fill_correct'); } catch(e) {}
          }
        }

        index++;

        // 雪崩加速：ease-in 二次曲线
        let delay = baseDelay;
        if (total > 10 && acceleration > 0) {
          const progress = index / total;
          const speedFactor = 1 - acceleration * progress * progress;
          delay = baseDelay * speedFactor;
          delay = Math.max(minDelay, delay);
        }

        setTimeout(fillNext, delay);
      };

      fillNext();
    }

    // ============================================================
    //  触发关卡完成
    // ============================================================
    triggerLevelComplete() {
      this.setIsCompleted(true);

      const board = this.getBoard();
      const renderer = this.getRenderer();
      const currentLevelId = this.getCurrentLevelId();
      const AudioService = this.AudioService;
      const expertSystem = this.getExpertSystem();
      const comedySystem = this.getComedySystem();
      const gameTimer = this.getGameTimer();

      // 三幕指示灯：设置为通关状态
      if (typeof ThreeActGuide !== 'undefined') {
        try { ThreeActGuide.setComplete(); } catch(e) {}
      }

      // Stop BGM
      try { AudioService.bgm.stop(); } catch(e) { this.log.warn('BGM stop error:', e); }

      // Get expert report
      let report = { totalWrong: 0 };
      try {
        report = expertSystem.onLevelEnd();
      } catch(e) {
        this.log.error('expertSystem.onLevelEnd error:', e);
      }

      // GameContext 学习层：关卡结束时更新玩家风格
      try {
        if (expertSystem && expertSystem.learning &&
            typeof expertSystem.learning.updateStyleFromContext === 'function') {
          expertSystem.learning.updateStyleFromContext();
        }
      } catch(e) {
        this.log.warn('learning.updateStyleFromContext error:', e);
      }

      // 计算用时
      const elapsed = gameTimer ? gameTimer.getTime() : Math.floor((Date.now() - (gameTimer?.startTime || 0)) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;

      // 暂停计时器
      if (gameTimer) try { gameTimer.pause(); } catch(e) {}

      // 计算评级
      let grade = { letter: 'C', color: '#ffc107' };
      try {
        grade = this.calculateGrade(elapsed, report.totalWrong || this.getErrorCount() || 0, this.getHintCount());
      } catch(e) { this.log.error('calculateGrade error:', e); }

      // 保存进度
      try {
        this.saveProgress(elapsed, report.totalWrong || this.getErrorCount() || 0, this.getHintCount(), grade.letter);
      } catch(e) { this.log.error('saveProgress error:', e); }

      // Play victory BGM
      try { AudioService.bgm.playFile('victory_full.wav'); } catch(e) {}

      // 显示结算面板
      const showOverlay = () => {
        try {
          const overlay = document.getElementById('complete-overlay');
          if (overlay) {
            overlay.style.display = 'flex';
            overlay.style.opacity = '0';
            requestAnimationFrame(() => {
              overlay.style.transition = 'opacity 0.5s ease';
              overlay.style.opacity = '1';
            });

            const gradeEl = document.getElementById('complete-grade');
            if (gradeEl) {
              gradeEl.textContent = grade.letter;
              gradeEl.style.color = grade.color;
            }

            document.getElementById('complete-time').textContent =
              '用时 ' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
            document.getElementById('complete-errors').textContent =
              '错误 ' + (report.totalWrong || 0) + ' 次';

            const hintsEl = document.getElementById('complete-hints');
            if (hintsEl) {
              hintsEl.textContent = '提示 ' + this.getHintCount() + ' 次';
            }

            let insight = '';
            try {
              const learning = expertSystem.getLearning();
              insight = learning.generateComment({
                nonTrivialRatio: 0.3,
                maxTechLevel: 5,
                score: 500,
              });
            } catch(e) { this.log.error('learning.generateComment error:', e); }
            document.getElementById('complete-insight').textContent = insight;

            try { this.updateNextLevelButton(); } catch(e) {}
          }

          try { AudioService.sfx.play('victory'); } catch(e) {}
          this.log.info('Level completed:', currentLevelId, 'grade:', grade.letter);
        } catch(e) {
          this.log.error('Show completion overlay error:', e);
          const overlay = document.getElementById('complete-overlay');
          if (overlay) overlay.style.display = 'flex';
        }
      };

      // 播放高潮动画后显示结算
      const playClimaxAndShowOverlay = () => {
        const isBossLevel = this.isLastLevelOfChapter();
        const levelIdNum = parseInt(currentLevelId);
        const isNoviceLevel = levelIdNum >= 101 && levelIdNum <= 109;

        if (isBossLevel || isNoviceLevel) {
          showOverlay();
          return;
        }

        try {
          this.playClimaxAnimation(showOverlay);
        } catch(e) {
          this.log.error('playClimaxAnimation error:', e);
          showOverlay();
        }
      };

      // Play clear dialog first, then show overlay
      try {
        this.playClearDialog(playClimaxAndShowOverlay);
      } catch(e) {
        this.log.error('playClearDialog error:', e);
        playClimaxAndShowOverlay();
      }
    }

    // ============================================================
    //  保存进度
    // ============================================================
    saveProgress(timeSeconds, errors, hints, grade) {
      if (!global.ProgressManager) return;

      const currentLevelId = this.getCurrentLevelId();
      const currentChapterData = this.getCurrentChapterData();
      const chapterSelect = this.getChapterSelect();

      // Save level score
      const isNewBest = ProgressManager.setLevelScore(currentLevelId, {
        time: timeSeconds,
        errors: errors,
        hints: hints,
        grade: grade,
      });

      // 检查成就
      this.checkAchievements(timeSeconds, errors, hints, grade);

      // 刷新成就面板
      this.refreshAchievementPanel();

      // Unlock next chapter if this is the last level of current chapter
      if (this.isLastLevelOfChapter() && currentChapterData) {
        const nextChapterId = currentChapterData.chapterId + 1;
        if (this.findChapterById(nextChapterId)) {
          ProgressManager.unlockChapter(nextChapterId);
          this.log.info('Unlocked chapter:', nextChapterId);
        }
      }

      // 检查隐藏关解锁
      if (currentChapterData && chapterSelect && chapterSelect.chaptersData) {
        const newUnlocked = ProgressManager.checkAndUnlockHiddenLevels(
          currentChapterData.chapterId,
          chapterSelect.chaptersData
        );
        if (newUnlocked.length > 0) {
          this.showToast('✨ 新的隐藏关已解锁！');
          // 检查 all_hidden 成就
          if (ProgressManager.getUnlockedHiddenCount() >=
              ProgressManager.getTotalHiddenCount(chapterSelect.chaptersData)) {
            ProgressManager.unlockAchievement('all_hidden');
            ProgressManager.unlockAchievement('all_hidden_levels');
          }
          // 检查 first_hidden_level 成就
          if (ProgressManager.getUnlockedHiddenCount() >= 1) {
            ProgressManager.unlockAchievement('first_hidden_level');
          }
        }
        // 检查真结局解锁
        if (ProgressManager.checkTrueEndingUnlock(chapterSelect.chaptersData)) {
          this.showToast('🌟 真结局已解锁！');
        }
      }
    }
  }

  // 导出到全局
  global.LevelCompleter = LevelCompleter;

})(window);
