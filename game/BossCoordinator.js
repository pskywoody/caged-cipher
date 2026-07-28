// ==========================================
//  BossCoordinator - Boss 战协调器
// ==========================================
//  从 guide.js 抽离，物理分离，逻辑不变
//  负责 Boss 战的 UI 协调、事件绑定、难度管理、结算面板
//  战斗核心逻辑在 game/guide-battle.js (GuideBattle) 中
// ==========================================

;(function(global) {
  'use strict';

  // 难度倍率配置
  const DIFFICULTY_MULTIPLIERS = {
    easy:   { speed: 1.8, mistake: 1.8, intercept: 0.5, discovery: 0.6 },  // 简单：AI慢，失误多
    normal: { speed: 1.0, mistake: 1.0, intercept: 1.0, discovery: 1.0 },  // 普通：基准
    hard:   { speed: 0.7, mistake: 0.5, intercept: 1.5, discovery: 1.2 },  // 困难：AI快，失误少
  };

  class BossCoordinator {
    /**
     * @param {Object} deps - 依赖注入
     * @param {Object} deps.board - 棋盘对象
     * @param {Object} deps.renderer - 渲染器
     * @param {Object} deps.storyEngine - 故事引擎
     * @param {Function} deps.setInteractionLocked - 设置交互锁定
     * @param {Function} deps.restartLevel - 重启关卡
     * @param {Function} deps.showCompleteOverlay - 显示通关遮罩
     * @param {Function} deps.goToChapterSelect - 返回章节选择
     * @param {Function} deps.unlockBackground - 解锁背景
     * @param {Function} deps.reinitBoardForBattle - 为战斗重新初始化棋盘
     * @param {Function} deps.getChapterData - 获取当前章节数据
     * @param {Function} deps.getLevelData - 获取当前关卡数据
     * @param {Function} deps.setLevelData - 设置当前关卡数据
     */
    constructor(deps = {}) {
      // 依赖
      this._board = deps.board || null;
      this._renderer = deps.renderer || null;
      this._storyEngine = deps.storyEngine || null;
      this._setInteractionLocked = deps.setInteractionLocked || (() => {});
      this._restartLevel = deps.restartLevel || (() => {});
      this._showCompleteOverlay = deps.showCompleteOverlay || (() => {});
      this._goToChapterSelect = deps.goToChapterSelect || (() => {});
      this._unlockBackground = deps.unlockBackground || (() => {});
      this._reinitBoardForBattle = deps.reinitBoardForBattle || (() => {});
      this._getChapterData = deps.getChapterData || (() => null);
      this._getLevelData = deps.getLevelData || (() => null);
      this._setLevelData = deps.setLevelData || (() => {});

      // 状态
      this._bossBattleStarted = false;
      this._currentBossConfig = null;
      this._currentDifficulty = 'normal'; // easy / normal / hard
      this._hudInterval = null;

      // 初始化：从本地存储读取难度设置
      try {
        const savedDiff = localStorage.getItem('boss_difficulty');
        if (savedDiff && DIFFICULTY_MULTIPLIERS[savedDiff]) {
          this._currentDifficulty = savedDiff;
        }
      } catch(e) {}
    }

    // ============================================================
    // 依赖设置（运行时更新）
    // ============================================================

    setBoard(board) { this._board = board; }
    setRenderer(renderer) { this._renderer = renderer; }
    setStoryEngine(engine) { this._storyEngine = engine; }
    setLevelData(data) { this._currentLevelData = data; }
    setChapterData(data) { this._currentChapterData = data; }
    setGameController(gc) { this._gameController = gc; }

    get isStarted() { return this._bossBattleStarted; }
    get currentBossConfig() { return this._currentBossConfig; }
    get currentDifficulty() { return this._currentDifficulty; }

    // ============================================================
    // 主题色管理
    // ============================================================

    /**
     * 应用Boss战主题色到CSS变量
     * 根据Boss配置的color字段动态调整整体UI色调
     */
    _applyBossTheme(bossConfig) {
      const root = document.documentElement;
      if (!root) return;

      const bossColor = bossConfig.color || '#ef4444';

      // 将hex颜色转换为rgba的辅助函数
      function hexToRgba(hex, alpha) {
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }

      // 计算颜色的深浅变体
      function lightenHex(hex, amount) {
        const h = hex.replace('#', '');
        let r = parseInt(h.substring(0, 2), 16);
        let g = parseInt(h.substring(2, 4), 16);
        let b = parseInt(h.substring(4, 6), 16);
        r = Math.min(255, Math.floor(r + (255 - r) * amount));
        g = Math.min(255, Math.floor(g + (255 - g) * amount));
        b = Math.min(255, Math.floor(b + (255 - b) * amount));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }

      function darkenHex(hex, amount) {
        const h = hex.replace('#', '');
        let r = parseInt(h.substring(0, 2), 16);
        let g = parseInt(h.substring(2, 4), 16);
        let b = parseInt(h.substring(4, 6), 16);
        r = Math.max(0, Math.floor(r * (1 - amount)));
        g = Math.max(0, Math.floor(g * (1 - amount)));
        b = Math.max(0, Math.floor(b * (1 - amount)));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }

      const bossLight = lightenHex(bossColor, 0.3);
      const bossDark = darkenHex(bossColor, 0.2);
      const bossBg = hexToRgba(bossColor, 0.15);
      const bossBorder = hexToRgba(bossColor, 0.5);
      const bossHudBg = hexToRgba(bossColor, 0.08);

      // 应用Boss主题变量
      root.style.setProperty('--boss-accent', bossColor);
      root.style.setProperty('--boss-accent-light', bossLight);
      root.style.setProperty('--boss-accent-dark', bossDark);
      root.style.setProperty('--boss-bg', bossBg);
      root.style.setProperty('--boss-border', bossBorder);
      root.style.setProperty('--boss-hud-bg', bossHudBg);

      // 给body添加boss-mode类，触发过渡动画
      document.body.classList.add('boss-mode');
    }

    /**
     * 重置Boss战主题，恢复普通主题
     */
    _resetBossTheme() {
      const root = document.documentElement;
      if (!root) return;

      // 移除boss-mode类，触发过渡动画
      document.body.classList.remove('boss-mode');

      // 延迟清除CSS变量（等待过渡动画完成）
      setTimeout(() => {
        // 恢复为默认值（与:root中定义的一致）
        root.style.setProperty('--boss-accent', '#ef4444');
        root.style.setProperty('--boss-accent-light', '#f87171');
        root.style.setProperty('--boss-accent-dark', '#dc2626');
        root.style.setProperty('--boss-bg', 'rgba(127, 29, 29, 0.3)');
        root.style.setProperty('--boss-border', 'rgba(239, 68, 68, 0.5)');
        root.style.setProperty('--boss-hud-bg', 'rgba(30, 10, 10, 0.92)');
      }, 400);
    }

    // ============================================================
    // 难度管理
    // ============================================================

    /**
     * 将难度倍率应用到Boss配置
     */
    applyDifficultyToBoss(bossConfig, difficulty) {
      const mult = DIFFICULTY_MULTIPLIERS[difficulty] || DIFFICULTY_MULTIPLIERS.normal;

      // 深拷贝配置
      const adjusted = JSON.parse(JSON.stringify(bossConfig));

      // 调整基础速度
      adjusted.speedMin = Math.round(bossConfig.speedMin * mult.speed);
      adjusted.speedMax = Math.round(bossConfig.speedMax * mult.speed);

      // 调整基础失误率
      adjusted.mistakeChance = Math.min(0.5, bossConfig.mistakeChance * mult.mistake);

      // 调整AI难度
      if (!adjusted.aiDifficulty) {
        adjusted.aiDifficulty = {};
      }
      const baseDiff = bossConfig.aiDifficulty || {};
      adjusted.aiDifficulty.speedMultiplier = (baseDiff.speedMultiplier || 1.0) * mult.speed;
      adjusted.aiDifficulty.mistakeMultiplier = (baseDiff.mistakeMultiplier || 1.0) * mult.mistake;
      adjusted.aiDifficulty.interceptMultiplier = (baseDiff.interceptMultiplier !== undefined ? baseDiff.interceptMultiplier : 1.0) * mult.intercept;
      adjusted.aiDifficulty.discoveryMultiplier = (baseDiff.discoveryMultiplier || 1.0) * mult.discovery;

      return adjusted;
    }

    /**
     * 设置难度
     */
    setDifficulty(diff) {
      if (!DIFFICULTY_MULTIPLIERS[diff]) return;
      this._currentDifficulty = diff;
      this.updateDifficultyUI();
      if (typeof log !== 'undefined') {
        log.info('[Boss] 难度切换为:', diff);
      }

      // 保存到本地存储
      try {
        localStorage.setItem('boss_difficulty', diff);
      } catch(e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          console.warn('[Guide] Storage quota exceeded on difficulty save');
        }
      }

      // 如果战斗进行中，自动重开
      if (this._bossBattleStarted && typeof GuideBattle !== 'undefined' && GuideBattle.active) {
        setTimeout(() => {
          this.retryBossBattle();
        }, 300);
      }
    }

    /**
     * 更新难度UI状态
     */
    updateDifficultyUI() {
      document.querySelectorAll('.boss-diff-btn').forEach((btn) => {
        const diff = btn.getAttribute('data-diff');
        if (diff === this._currentDifficulty) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    /**
     * 切换难度面板显示
     */
    toggleDifficultyPanel() {
      const panel = document.getElementById('boss-difficulty-panel');
      if (panel) {
        panel.classList.toggle('show');
      }
    }

    // ============================================================
    // Boss 战启动
    // ============================================================

    startBossBattle() {
      if (typeof GuideBattle === 'undefined') return;
      const chapterData = this._getChapterData();
      if (!chapterData) return;

      const chapterId = chapterData.chapterId;
      const bossConfig = GuideBattle.getBossConfig(chapterId);
      if (!bossConfig) {
        console.warn('[Boss] No boss config for chapter', chapterId);
        return;
      }

      this._currentBossConfig = bossConfig;
      this._bossBattleStarted = true;
      if (typeof log !== 'undefined') {
        log.info('[Boss] Starting battle vs', bossConfig.name, '难度:', this._currentDifficulty);
      }

      // ===== 应用Boss战主题色到CSS变量 =====
      this._applyBossTheme(bossConfig);

      // 更新HUD
      const bossNameEl = document.getElementById('boss-hud-boss-name');
      if (bossNameEl) bossNameEl.textContent = bossConfig.name;

      // 更新Boss头像
      const portraitEl = document.getElementById('boss-hud-portrait');
      if (portraitEl && bossConfig.portrait) {
        portraitEl.src = 'assets/images/portraits/' + bossConfig.portrait;
        portraitEl.onerror = function() {
          this.style.display = 'none';
        };
      }

      // 更新头像边框颜色为Boss主题色
      const portraitRing = document.querySelector('.boss-hud-portrait-ring');
      if (portraitRing && bossConfig.color) {
        portraitRing.style.borderTopColor = bossConfig.color;
        portraitRing.style.borderRightColor = bossConfig.color + '66';
      }
      const portraitImg = document.querySelector('.boss-hud-portrait');
      if (portraitImg && bossConfig.color) {
        portraitImg.style.borderColor = bossConfig.color + '99';
      }

      const hud = document.getElementById('boss-battle-hud');
      if (hud) hud.classList.add('visible');

      // 绑定重试按钮
      const retryBtn = document.getElementById('boss-hud-retry');
      if (retryBtn) {
        retryBtn.onclick = () => {
          this.retryBossBattle();
        };
      }

      // 绑定难度按钮
      const diffBtn = document.getElementById('boss-hud-difficulty');
      if (diffBtn) {
        diffBtn.onclick = (e) => {
          e.stopPropagation();
          this.toggleDifficultyPanel();
        };
      }

      // 绑定难度选项
      document.querySelectorAll('.boss-diff-btn').forEach((btn) => {
        btn.onclick = () => {
          const diff = btn.getAttribute('data-diff');
          this.setDifficulty(diff);
        };
      });

      // 点击外部关闭难度面板
      document.addEventListener('click', this._outsideClickListener = (e) => {
        const panel = document.getElementById('boss-difficulty-panel');
        const diffBtnEl = document.getElementById('boss-hud-difficulty');
        if (panel && panel.classList.contains('show') &&
            !panel.contains(e.target) && e.target !== diffBtnEl) {
          panel.classList.remove('show');
        }

        // 右侧浮条面板：点击外部关闭
        const floatBar = document.getElementById('right-floating-bar');
        if (floatBar && floatBar.classList.contains('panel-open')) {
          const floatPanel = floatBar.querySelector('.float-bar-panel');
          if (!floatBar.contains(e.target)) {
            floatBar.classList.remove('panel-open');
          }
        }
      });

      // 更新难度按钮状态
      this.updateDifficultyUI();

      // 应用难度到Boss配置
      const adjustedConfig = this.applyDifficultyToBoss(bossConfig, this._currentDifficulty);

      // 播放战前对话（如果有）
      if (adjustedConfig.preDialog && adjustedConfig.preDialog.length > 0 && this._storyEngine) {
        this._setInteractionLocked(true);
        const dialogLines = adjustedConfig.preDialog.map(line => ({
          speaker: line.speaker,
          text: line.text,
          emotion: line.emotion || 'default',
        }));
        this._storyEngine.sayLines(dialogLines, () => {
          this._setInteractionLocked(false);
          this._initBossBattle(adjustedConfig);
        });
      } else {
        this._initBossBattle(adjustedConfig);
      }
    }

    /**
     * 重试Boss战
     */
    retryBossBattle() {
      if (!this._currentBossConfig) return;

      if (typeof log !== 'undefined') {
        log.info('[Boss] Retry battle');
      }

      // 停止当前战斗
      if (typeof GuideBattle !== 'undefined' && GuideBattle.active) {
        GuideBattle.stop();
      }

      // 重置棋盘
      const levelData = this._getLevelData();
      if (levelData && this._board) {
        this._board.loadLevel({
          cells: levelData.boardData,
          cages: levelData.cages || [],
          levelId: levelData.levelId,
        });
        if (this._renderer) {
          this._renderer.render(this._board);
        }
      }

      // 关闭难度面板
      const panel = document.getElementById('boss-difficulty-panel');
      if (panel) panel.classList.remove('show');

      // 重新开始（用当前难度）
      this._bossBattleStarted = false;
      setTimeout(() => {
        this.startBossBattle();
      }, 300);
    }

    // ============================================================
    // 战斗初始化
    // ============================================================

    _initBossBattle(bossConfig) {
      if (!this._board) return;
      const levelData = this._getLevelData();
      if (!levelData) return;

      // 切换到Boss战专属BGM（支持Boss自定义BGM）
      try {
        if (typeof AudioService !== 'undefined' && AudioService.bgm && AudioService.bgm.playBoss) {
          AudioService.bgm.playBoss(bossConfig.id, { bgmFile: bossConfig.bgm });
        } else {
          AudioService.bgm.playFile('boss_battle.mp3');
        }
      } catch(e) {
        if (typeof log !== 'undefined') {
          log.warn('[Boss] Boss BGM play failed, fallback to default:', e);
        }
        try { AudioService.bgm.playFile('boss_battle.mp3'); } catch(e2) {}
      }

      // 对战专用关卡：优先使用 battleData（内嵌数据），其次用 battleLevelId 从章节数据查
      if (bossConfig.battleData) {
        if (typeof log !== 'undefined') {
          log.info('[Boss] 使用内嵌对战关卡:', bossConfig.battleData.levelId, bossConfig.battleData.title);
        }
        // 保存原始关卡数据（战斗结束后恢复）
        bossConfig._originalLevelData = levelData;
        bossConfig._originalLevelId = levelData.levelId;
        // 用对战关卡数据
        this._setLevelData(bossConfig.battleData, bossConfig.battleData.levelId);
        // 重新初始化棋盘
        this._reinitBoardForBattle();
      } else if (bossConfig.battleLevelId && bossConfig.battleLevelId !== levelData.levelId) {
        const battleLevel = typeof LevelLoader !== 'undefined' && LevelLoader.findLevelData
          ? LevelLoader.findLevelData(bossConfig.battleLevelId)
          : null;
        if (battleLevel) {
          if (typeof log !== 'undefined') {
            log.info('[Boss] 使用对战专用关卡:', battleLevel.levelId, battleLevel.name);
          }
          // 保存原始关卡数据（战斗结束后恢复）
          bossConfig._originalLevelData = levelData;
          bossConfig._originalLevelId = levelData.levelId;
          // 用对战关卡重新初始化棋盘
          this._setLevelData(battleLevel, battleLevel.levelId);
          // 重新初始化棋盘
          this._reinitBoardForBattle();
        }
      }

      // 启动Boss战
      GuideBattle.start({
        board: this._board,
        renderer: this._renderer,
        solution: this._getLevelData().solution,
        opponent: bossConfig,
        onEnd: (result, config) => this.onBossBattleEnd(result, config),
      });

      // === GameContext 同步：Boss战启动，更新关卡信息 ===
      try {
        if (global.GameContext && global.GameContext.level) {
          global.GameContext.level.isBossBattle = true;
          global.GameContext.level.levelId = this._getLevelData().levelId;
        }
      } catch (e) {}

      // 启动HUD更新
      this._startBossHudUpdate();
    }

    // ============================================================
    // HUD 更新
    // ============================================================

    _startBossHudUpdate() {
      if (this._hudInterval) {
        clearInterval(this._hudInterval);
      }
      this._hudInterval = setInterval(() => {
        if (!GuideBattle.active && !GuideBattle.ended) {
          clearInterval(this._hudInterval);
          this._hudInterval = null;
          return;
        }
        this._updateBossHud();
      }, 200);
    }

    _updateBossHud() {
      if (!GuideBattle || !GuideBattle.winTarget) return;

      // 支持加权得分模式
      const isWeighted = GuideBattle.isWeightedScoreEnabled && GuideBattle.isWeightedScoreEnabled();

      let playerPct, aiPct;
      if (isWeighted) {
        const progress = GuideBattle.getScoreProgress();
        playerPct = progress.playerPercent;
        aiPct = progress.aiPercent;
      } else {
        playerPct = Math.min(100, (GuideBattle.playerCount / GuideBattle.winTarget) * 100);
        aiPct = Math.min(100, (GuideBattle.aiCount / GuideBattle.winTarget) * 100);
      }

      const playerFill = document.getElementById('boss-hud-player-fill');
      const aiFill = document.getElementById('boss-hud-ai-fill');
      if (playerFill) playerFill.style.width = playerPct + '%';
      if (aiFill) aiFill.style.width = aiPct + '%';

      // 更新得分文字（加权模式下显示三色得分明细）
      const playerScoreEl = document.getElementById('boss-hud-player-score');
      const aiScoreEl = document.getElementById('boss-hud-ai-score');

      if (isWeighted) {
        const progress = GuideBattle.getScoreProgress();
        if (playerScoreEl) {
          playerScoreEl.textContent = Math.round(progress.playerScore) + ' / ' + Math.round(progress.winScore);
        }
        if (aiScoreEl) {
          aiScoreEl.textContent = Math.round(progress.aiScore) + ' / ' + Math.round(progress.winScore);
        }
      } else {
        if (playerScoreEl) {
          playerScoreEl.textContent = GuideBattle.playerCount + ' / ' + GuideBattle.winTarget;
        }
        if (aiScoreEl) {
          aiScoreEl.textContent = GuideBattle.aiCount + ' / ' + GuideBattle.winTarget;
        }
      }
    }

    // ============================================================
    // 战斗结束处理
    // ============================================================

    onBossBattleEnd(result, bossConfig) {
      if (typeof log !== 'undefined') {
        log.info('[Boss] Battle ended:', result);
      }
      try {
        // 如果使用了对战专用关卡，战斗结束后恢复原始关卡
        if (bossConfig._originalLevelData) {
          this._setLevelData(bossConfig._originalLevelData, bossConfig._originalLevelId);
          bossConfig._originalLevelData = null;
          bossConfig._originalLevelId = null;
          if (typeof log !== 'undefined') {
            log.info('[Boss] 恢复原始关卡:', this._getLevelData().levelId);
          }
        }

        // 隐藏HUD
        const hud = document.getElementById('boss-battle-hud');
        if (hud) hud.classList.remove('visible');

        // ===== 恢复普通主题 =====
        this._resetBossTheme();

        // 清除HUD更新定时器
        if (this._hudInterval) {
          clearInterval(this._hudInterval);
          this._hudInterval = null;
        }

        // 停止Boss战系统（保留得分数据用于结算面板）
        GuideBattle.stop();
        this._bossBattleStarted = false;
        this._setInteractionLocked(false);

        // 停止BGM
        try {
          if (AudioService.bgm && AudioService.bgm.stopBoss) {
            AudioService.bgm.stopBoss(result === 'win' ? 800 : 500);
          } else {
            AudioService.bgm.stop();
          }
        } catch(e) {
          try { AudioService.bgm.stop(); } catch(e2) {}
        }

        // 胜利时切换到楼梯间背景 + 播放胜利BGM
        if (result === 'win') {
          const stairwellBg = 'assets/images/backgrounds/bg_scene12_stairwell.jpg';
          // 解锁背景图鉴
          this._unlockBackground(stairwellBg);
          const testImg = new Image();
          testImg.onload = function() {
            document.body.style.setProperty('background-image', `url('${stairwellBg}')`, 'important');
            document.body.style.setProperty('background-size', 'cover', 'important');
            document.body.style.setProperty('background-position', 'center', 'important');
            document.body.style.setProperty('background-attachment', 'fixed', 'important');
          };
          testImg.src = stairwellBg;

          setTimeout(() => {
            AudioService.bgm.playFile('victory.wav');
          }, 300);
        }

        // 获取得分明细
        const breakdown = GuideBattle.getScoreBreakdown();
        const playerScore = breakdown.player.total;
        const aiScore = breakdown.ai.total;

        // 计算对战时长（秒）
        const durationMs = Date.now() - (GuideBattle._startTime || Date.now());
        const durationSec = Math.floor(durationMs / 1000);

        // 构造对话数据（面板显示后由组件播放）
        let dialogLines = null;
        if (result === 'win' && bossConfig.winDialog && bossConfig.winDialog.length > 0) {
          dialogLines = bossConfig.winDialog.map(line => ({
            speaker: line.speaker,
            text: line.text,
            emotion: line.emotion || 'default',
            voiceId: line.voiceId,
          }));
        } else if (result === 'lose' && bossConfig.loseDialog && bossConfig.loseDialog.length > 0) {
          dialogLines = bossConfig.loseDialog.map(line => ({
            speaker: line.speaker,
            text: line.text,
            emotion: line.emotion || 'default',
            voiceId: line.voiceId,
          }));
        }

        // 调用独立组件显示对战结算面板
        if (typeof BattleResultOverlay !== 'undefined') {
          BattleResultOverlay.show({
            result: result,
            bossName: bossConfig?.name || '对手',
            bossPortrait: bossConfig?.portrait ? ('assets/images/portraits/' + bossConfig.portrait) : '',
            playerScore: playerScore,
            aiScore: aiScore,
            winTarget: breakdown.winScore,
            isWeighted: breakdown.isWeighted || breakdown.weightedEnabled || false,
            scoreBreakdown: {
              // 传入 { count, score } 格式，组件可正确显示格数和得分
              player: {
                simple: { count: (breakdown.playerCount?.simple ?? breakdown.player.simple), score: breakdown.player.simple },
                core:   { count: (breakdown.playerCount?.core   ?? breakdown.player.core),   score: breakdown.player.core },
                gate:   { count: (breakdown.playerCount?.gate   ?? breakdown.player.gate),   score: breakdown.player.gate },
              },
              ai: {
                simple: { count: (breakdown.aiCount?.simple ?? breakdown.ai.simple), score: breakdown.ai.simple },
                core:   { count: (breakdown.aiCount?.core   ?? breakdown.ai.core),   score: breakdown.ai.core },
                gate:   { count: (breakdown.aiCount?.gate   ?? breakdown.ai.gate),   score: breakdown.ai.gate },
              },
            },
            duration: durationSec,
            dialog: dialogLines,
            onRetry: () => {
              BattleResultOverlay.hide();
              setTimeout(() => {
                this._restartLevel();
              }, 250);
            },
            onContinue: () => {
              // 胜利：关闭面板，进入普通通关结算
              BattleResultOverlay.hide();
              setTimeout(() => {
                this._showCompleteOverlay();
              }, 250);
            },
            onBackToLevel: () => {
              // 失败：返回章节选择
              BattleResultOverlay.hide();
              setTimeout(() => {
                if (typeof chapterSelect !== 'undefined' && chapterSelect) {
                  chapterSelect.show();
                } else {
                  this._goToChapterSelect();
                }
              }, 250);
            },
          });
        } else {
          // 兜底：组件未加载时使用旧函数
          if (typeof log !== 'undefined') {
            log.warn('[Boss] BattleResultOverlay not found, fallback to _showBattleResultOverlay');
          }
          this._showBattleResultOverlay(result, bossConfig);
        }
      } catch (e) {
        if (typeof log !== 'undefined') {
          log.error('[Boss] onBossBattleEnd error:', e);
        }
        // 兜底：直接触发通关结算
        try {
          if (result === 'win') {
            this._showCompleteOverlay();
          }
        } catch (e2) {
          if (typeof log !== 'undefined') {
            log.error('[Boss] fallback completion also failed:', e2);
          }
        }
      }
    }

    // ============================================================
    // 兜底结算面板（旧版，BattleResultOverlay 未加载时使用）
    // ============================================================

    /**
     * 显示对战结算面板
     * @param {string} result - 'win' | 'lose'
     * @param {Object} bossConfig - Boss配置
     */
    _showBattleResultOverlay(result, bossConfig) {
      const overlay = document.getElementById('battle-result-overlay');
      if (!overlay) return;

      const isWin = result === 'win';
      const titleEl = document.getElementById('battle-result-title');
      const iconEl = document.getElementById('battle-result-icon');
      const opponentEl = document.getElementById('battle-result-opponent');
      const playerScoreEl = document.getElementById('battle-result-player-score');
      const aiScoreEl = document.getElementById('battle-result-ai-score');
      const playerBarEl = document.getElementById('battle-result-player-bar');
      const aiBarEl = document.getElementById('battle-result-ai-bar');
      const durationEl = document.getElementById('battle-result-duration').querySelector('span');
      const breakdownEl = document.getElementById('battle-result-breakdown');

      // 设置标题和图标
      if (isWin) {
        titleEl.textContent = '胜利';
        titleEl.style.color = '#4ade80';
        titleEl.style.textShadow = '0 0 30px rgba(74, 222, 128, 0.5)';
        iconEl.textContent = '🏆';
      } else {
        titleEl.textContent = '失败';
        titleEl.style.color = '#f87171';
        titleEl.style.textShadow = '0 0 30px rgba(248, 113, 113, 0.5)';
        iconEl.textContent = '💔';
      }

      // 设置对手名称
      opponentEl.textContent = `VS ${bossConfig?.name || '对手'}`;

      // 获取得分明细
      const breakdown = GuideBattle.getScoreBreakdown();
      const playerTotal = breakdown.player.total;
      const aiTotal = breakdown.ai.total;
      const maxScore = breakdown.maxScore || breakdown.totalCells;

      // 设置对战时长
      const durationMs = Date.now() - (GuideBattle._startTime || Date.now());
      const durationSec = Math.floor(durationMs / 1000);
      const min = Math.floor(durationSec / 60);
      const sec = durationSec % 60;
      durationEl.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

      // 如果未启用加权得分，隐藏三色明细
      if (!breakdown.weightedEnabled) {
        breakdownEl.style.display = 'none';
      } else {
        breakdownEl.style.display = 'block';

        // 兼容新旧两种 getScoreBreakdown 返回格式
        const isNewFormat = typeof breakdown.player.simple === 'number';
        const pSimple = isNewFormat ? { count: breakdown.playerCount?.simple ?? breakdown.player.simple, score: breakdown.player.simple } : breakdown.player.simple;
        const aSimple = isNewFormat ? { count: breakdown.aiCount?.simple ?? breakdown.ai.simple,     score: breakdown.ai.simple }     : breakdown.ai.simple;
        const pCore   = isNewFormat ? { count: breakdown.playerCount?.core ?? breakdown.player.core,     score: breakdown.player.core }   : breakdown.player.core;
        const aCore   = isNewFormat ? { count: breakdown.aiCount?.core ?? breakdown.ai.core,             score: breakdown.ai.core }       : breakdown.ai.core;
        const pGate   = isNewFormat ? { count: breakdown.playerCount?.gate ?? breakdown.player.gate,     score: breakdown.player.gate }   : breakdown.player.gate;
        const aGate   = isNewFormat ? { count: breakdown.aiCount?.gate ?? breakdown.ai.gate,             score: breakdown.ai.gate }       : breakdown.ai.gate;

        // 设置三色明细文字
        document.getElementById('battle-result-simple').textContent =
          `你 ${pSimple.count} / 对手 ${aSimple.count}  ×1 = ${(pSimple.score + aSimple.score).toFixed(1)}`;
        document.getElementById('battle-result-core').textContent =
          `你 ${pCore.count} / 对手 ${aCore.count}  ×1.5 = ${(pCore.score + aCore.score).toFixed(1)}`;
        document.getElementById('battle-result-gate').textContent =
          `你 ${pGate.count} / 对手 ${aGate.count}  ×2 = ${(pGate.score + aGate.score).toFixed(1)}`;

        // 设置三色进度条
        const totalSimple = pSimple.score + aSimple.score || 1;
        const totalCore = pCore.score + aCore.score || 1;
        const totalGate = pGate.score + aGate.score || 1;

        setTimeout(() => {
          document.getElementById('battle-result-simple-player').style.width =
            (pSimple.score / totalSimple * 100) + '%';
          document.getElementById('battle-result-simple-ai').style.width =
            (aSimple.score / totalSimple * 100) + '%';
          document.getElementById('battle-result-core-player').style.width =
            (pCore.score / totalCore * 100) + '%';
          document.getElementById('battle-result-core-ai').style.width =
            (aCore.score / totalCore * 100) + '%';
          document.getElementById('battle-result-gate-player').style.width =
            (pGate.score / totalGate * 100) + '%';
          document.getElementById('battle-result-gate-ai').style.width =
            (aGate.score / totalGate * 100) + '%';
        }, 100);
      }

      // 数字滚动动画
      const animateNumber = (el, target, duration = 300) => {
        const start = 0;
        const startTime = Date.now();
        const isFloat = target % 1 !== 0;
        const step = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easeOut = 1 - Math.pow(1 - progress, 3);
          const current = start + (target - start) * easeOut;
          el.textContent = isFloat ? current.toFixed(1) : Math.round(current);
          if (progress < 1) {
            requestAnimationFrame(step);
          }
        };
        step();
      };

      // 显示面板（淡入 + 卡片弹出）
      overlay.style.display = 'flex';
      requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        overlay.classList.add('show');
      });

      // 延迟启动进度条和数字动画
      setTimeout(() => {
        const playerPct = Math.min((playerTotal / maxScore) * 100, 100);
        const aiPct = Math.min((aiTotal / maxScore) * 100, 100);
        playerBarEl.style.width = playerPct + '%';
        aiBarEl.style.width = aiPct + '%';
        animateNumber(playerScoreEl, playerTotal);
        animateNumber(aiScoreEl, aiTotal);
      }, 200);

      // 播放音效
      if (isWin) {
        AudioService.sfx.play('victory_short');
      } else {
        AudioService.sfx.play('error');
      }

      // 按钮事件
      const retryBtn = document.getElementById('btn-battle-retry');
      const backBtn = document.getElementById('btn-battle-back');

      const hideOverlay = () => {
        overlay.classList.remove('show');
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.style.display = 'none';
        }, 200);
      };

      // 胜利时右侧按钮改为"继续"（进入通关结算），失败时为"返回关卡"
      if (backBtn) {
        backBtn.textContent = isWin ? '继续' : '返回关卡';
      }

      const proceedToComplete = () => {
        hideOverlay();
        setTimeout(() => {
          this._showCompleteOverlay();
        }, 200);
      };

      if (retryBtn) {
        retryBtn.onclick = () => {
          hideOverlay();
          setTimeout(() => {
            this._restartLevel();
          }, 200);
        };
      }

      if (backBtn) {
        backBtn.onclick = () => {
          if (isWin) {
            // 胜利：进入通关结算
            proceedToComplete();
          } else {
            // 失败：返回关卡选择
            hideOverlay();
            setTimeout(() => {
              if (typeof chapterSelect !== 'undefined' && chapterSelect) {
                chapterSelect.show();
              } else {
                this._goToChapterSelect();
              }
            }, 200);
          }
        };
      }

      // 点击背景关闭
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          if (isWin) {
            // 胜利时点击背景继续正常通关流程
            proceedToComplete();
          } else {
            // 失败时点击背景仅关闭面板
            hideOverlay();
          }
        }
      });

      // ESC 键关闭
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', escHandler);
          if (isWin) {
            proceedToComplete();
          } else {
            hideOverlay();
          }
        }
      };
      document.addEventListener('keydown', escHandler);
    }

    // ============================================================
    // 清理
    // ============================================================

    cleanup() {
      // 停止战斗
      if (typeof GuideBattle !== 'undefined' && (GuideBattle.active || GuideBattle.ended)) {
        GuideBattle.stop();
      }
      this._bossBattleStarted = false;

      // 隐藏HUD
      const bossHud = document.getElementById('boss-battle-hud');
      if (bossHud) bossHud.classList.remove('visible');

      // 移除Boss气泡
      const bossBubble = document.getElementById('boss-bubble');
      if (bossBubble) bossBubble.remove();

      // 清除HUD定时器
      if (this._hudInterval) {
        clearInterval(this._hudInterval);
        this._hudInterval = null;
      }
      if (typeof GuideBattle !== 'undefined' && GuideBattle._hudInterval) {
        clearInterval(GuideBattle._hudInterval);
        GuideBattle._hudInterval = null;
      }

      // 移除点击外部监听
      if (this._outsideClickListener) {
        document.removeEventListener('click', this._outsideClickListener);
        this._outsideClickListener = null;
      }

      // 重置主题
      this._resetBossTheme();

      this._currentBossConfig = null;
    }
  }

  // 暴露到全局
  global.BossCoordinator = BossCoordinator;

})(typeof window !== 'undefined' ? window : this);
