// GameController.js - 游戏流程控制器
// 从 guide.js 抽离，物理分离，逻辑不变
// 包含：关卡加载、通关判定、Boss协调、存档评级、下一关/重开等核心流程

;(function(global) {
  'use strict';

  // 技巧名映射表（用于 recordTechniqueUsage）
  const TECHNIQUE_NAME_TO_ID = {
    // 基础技巧
    '裸单法': 'nakedSingle',
    '隐单法': 'hiddenSingle',
    '笼子唯一组合': 'cageUnique',
    // 杀手数独技巧
    '45法则': 'rule45',
    '笼和推导': 'cageUnique',
    '笼和数对': 'cageUnique',
    // 进阶技巧
    '裸数对': 'nakedPair',
    '隐数对': 'hiddenPair',
    '区块排除': 'pointingClaiming',
    '裸三数组': 'nakedTriplet',
    // 高阶技巧
    '二连纵横阵': 'xWing',
    '三才游鱼阵': 'swordfish',
    // 教学系统 newSkill 命名兼容
    'row_rule': 'nakedSingle',
    'col_rule': 'nakedSingle',
    'palace_rule': 'nakedSingle',
    'box_rule': 'nakedSingle',
    'rule_of_45': 'rule45',
    'naked_single': 'nakedSingle',
    'hidden_single': 'hiddenSingle',
    'naked_pair': 'nakedPair',
    'hidden_pair': 'hiddenPair',
    'x_wing': 'xWing',
  };

  class GameController {
    constructor(options) {
      // === 依赖注入：系统对象 ===
      this.LevelLoader = options.LevelLoader || global.LevelLoader;
      this.AudioService = options.AudioService || global.AudioService;
      this.ProgressManager = options.ProgressManager || global.ProgressManager;
      this.BoardClass = options.BoardClass || global.Board;
      this.RendererClass = options.RendererClass || global.Renderer;
      this.HintSystemClass = options.HintSystemClass || global.HintSystem;
      this.TeachingSystemClass = options.TeachingSystemClass || global.TeachingSystem;
      this.NoteSystemClass = options.NoteSystemClass || global.NoteSystem;
      this.TechMatrixClass = options.TechMatrixClass || global.TechMatrix;
      this.TechRaterClass = options.TechRaterClass || global.TechRater;
      this.ComboSystemClass = options.ComboSystemClass || global.ComboSystem;
      this.ComedySystemClass = options.ComedySystemClass || global.ComedySystem;
      this.GameTimerClass = options.GameTimerClass || global.GameTimer;
      this.ChapterSelectClass = options.ChapterSelectClass || global.ChapterSelect;
      this.AchievementPanelClass = options.AchievementPanelClass || global.AchievementPanel;
      this.GalleryPanelClass = options.GalleryPanelClass || global.GalleryPanel;
      this.SealAnimationInstance = options.SealAnimationInstance || global.SealAnimationInstance;
      this.WinConditionManager = options.WinConditionManager || global.WinConditionManager;
      this.ThreeActGuide = options.ThreeActGuide || global.ThreeActGuide;
      this.GuideBattle = options.GuideBattle || global.GuideBattle;
      this.Rule45Class = options.Rule45Class || global.Rule45;
      this.GameContext = options.GameContext || global.GameContext;

      // === 依赖注入：引用对象（可能为 null，后续更新） ===
      this.board = options.board || null;
      this.renderer = options.renderer || null;
      this.expertSystem = options.expertSystem || null;
      this.comboSystem = options.comboSystem || null;
      this.comedySystem = options.comedySystem || null;
      this.storyEngine = options.storyEngine || null;
      this.hintSystem = options.hintSystem || null;
      this.gameTimer = options.gameTimer || null;
      this.chapterSelect = options.chapterSelect || null;
      this.achievementPanel = options.achievementPanel || null;
      this.settingsPanel = options.settingsPanel || null;
      this.galleryPanel = options.galleryPanel || null;
      this.techMatrix = options.techMatrix || null;
      this.lessonPlayer = options.lessonPlayer || null;
      this.whatIfManager = options.whatIfManager || null;

      // === 状态变量 ===
      this.currentLevelData = null;
      this.currentChapterData = null;
      this.currentLevelId = 101;
      this.isCompleted = false;
      this.startTime = 0;
      this.hintCount = 0;
      this.errorCount = 0;
      this.usedNotes = false;
      this.startedFromSelect = false;
      this.isPaused = false;

      // === 回调函数 ===
      this.onShowToast = options.onShowToast || function(msg) {
        if (global.UIManager) global.UIManager.showToast(msg);
      };
      this.onVibrate = options.onVibrate || function() {};
      this.onSetUIVisible = options.onSetUIVisible || function() {};
      this.onSetInteractionLocked = options.onSetInteractionLocked || function() {};
      this.onUpdateRule45Banner = options.onUpdateRule45Banner || function() {};
      this.onUpdateNumBtnCompletedState = options.onUpdateNumBtnCompletedState || function() {};
      this.onUpdateNoteButtonState = options.onUpdateNoteButtonState || function() {};
      this.onResetRule45Banner = options.onResetRule45Banner || function() {};
      this.onHidePauseMenu = options.onHidePauseMenu || function() {};
      this.onNavigateTo = options.onNavigateTo || function(url) { window.location.href = url; };
      this.onPlayClimaxAnimation = options.onPlayClimaxAnimation || function(cb) { if (cb) cb(); };
      this.onPlayClearDialog = options.onPlayClearDialog || function(cb) { if (cb) cb(); };
      this.onPlayChapterEpilogue = options.onPlayChapterEpilogue || function(cb) { if (cb) cb(); };
      this.onShowChapterTransition = options.onShowChapterTransition || function(cb) { if (cb) cb(); };
      this.onShowGameEnding = options.onShowGameEnding || function() {};
      this.onPlayPrologue = options.onPlayPrologue || async function() {};
      this.onPlayPreDialog = options.onPlayPreDialog || async function() {};
      this.onStartBossBattle = options.onStartBossBattle || function() {};
      this.onCleanupLevelState = options.onCleanupLevelState || function() {};
      this.onStartLessonPlayer = options.onStartLessonPlayer || function() {};
      this.onIsFirstLevelOfChapter = options.onIsFirstLevelOfChapter || function() { return false; };
      this.onIsLastLevelOfChapter = options.onIsLastLevelOfChapter || function() { return false; };
      this.onIsLastChapterOfGame = options.onIsLastChapterOfGame || function() { return false; };
      this.onFindChapter = options.onFindChapter || function() {};
      this.onFindChapterById = options.onFindChapterById || function() { return null; };
      this.onInitBoard = options.onInitBoard || null; // 可选：外部自定义 initBoard
      this.onShowSealUnlockAnimation = options.onShowSealUnlockAnimation || function() {};
      this.onUpdateFloatBarTabIcon = options.onUpdateFloatBarTabIcon || function() {};

      // 日志
      this.log = options.log || {
        info: function() {},
        warn: function() {},
        error: function() {},
        debug: function() {},
      };
    }

    // === 外部状态更新接口 ===
    setBoard(board) { this.board = board; }
    setRenderer(renderer) { this.renderer = renderer; }
    setExpertSystem(sys) { this.expertSystem = sys; }
    setComboSystem(sys) { this.comboSystem = sys; }
    setComedySystem(sys) { this.comedySystem = sys; }
    setStoryEngine(eng) { this.storyEngine = eng; }
    setHintSystem(sys) { this.hintSystem = sys; }
    setGameTimer(timer) { this.gameTimer = timer; }
    setChapterSelect(cs) { this.chapterSelect = cs; }
    setAchievementPanel(panel) { this.achievementPanel = panel; }
    setSettingsPanel(panel) { this.settingsPanel = panel; }
    setGalleryPanel(panel) { this.galleryPanel = panel; }
    setTechMatrix(tm) { this.techMatrix = tm; }
    setLessonPlayer(lp) { this.lessonPlayer = lp; }
    setWhatIfManager(wim) { this.whatIfManager = wim; }
    setCurrentLevelData(data) { this.currentLevelData = data; }
    setCurrentChapterData(data) { this.currentChapterData = data; }
    setCurrentLevelId(id) { this.currentLevelId = id; }
    setIsCompleted(v) { this.isCompleted = v; }
    setErrorCount(v) { this.errorCount = v; }
    setHintCount(v) { this.hintCount = v; }
    setUsedNotes(v) { this.usedNotes = v; }
    setStartedFromSelect(v) { this.startedFromSelect = v; }

    // ============================================================
    //  === 关卡加载 ===
    // ============================================================

    /**
     * 加载关卡数据
     */
    async loadLevel(levelId) {
      try {
        const data = await this.LevelLoader.getChapterData();

        // 支持延迟加载模式：加载所有章节到 chapters 数组，保持向后兼容
        if (data._lazy && typeof data.getAllChapters === 'function') {
          const allChapters = await data.getAllChapters();
          data.chapters = allChapters; // 填充到 chapters 字段，兼容旧代码
        }

        global.CHAPTER_DATA = data;

        // Find level in chapter data
        let foundLevel = null;
        let foundChapter = null;
        for (const ch of data.chapters) {
          for (const lvl of ch.levels) {
            if (lvl.levelId === levelId) {
              foundLevel = lvl;
              foundChapter = ch;
              break;
            }
          }
          if (foundLevel) break;
        }

        if (!foundLevel) {
          this.log.warn('Level not found in chapter data:', levelId);
          return;
        }

        this.currentChapterData = foundChapter;

        // 尝试加载 v2 优化关卡数据并合并
        if (this.LevelLoader.USE_OPTIMIZED_LEVELS) {
          try {
            const v2Map = await this.LevelLoader.loadV2Levels();
            if (v2Map && v2Map.has(parseInt(levelId))) {
              const v2Level = v2Map.get(parseInt(levelId));
              this.currentLevelData = this.LevelLoader.mergeV2Level(foundLevel, v2Level);
              this.log.info('[V2Levels] 使用优化版关卡数据:', levelId);
              if (this.currentLevelData.threeAct) {
                this.log.info('[ThreeAct] 使用原生三幕数据: opening=' +
                  this.currentLevelData.threeAct.opening.length +
                  ', breakthrough=' + this.currentLevelData.threeAct.breakthrough.length +
                  ', avalanche=' + this.currentLevelData.threeAct.avalanche.length);
              } else {
                this.log.info('[ThreeAct] 无原生三幕数据，将使用分类器兜底');
              }
              return;
            }
          } catch (v2Err) {
            this.log.warn('[V2Levels] 加载 v2 数据失败，使用原始关卡数据:', v2Err);
          }
        }

        // 回退：使用章节中的原始数据
        this.currentLevelData = foundLevel;
        if (this.currentLevelData && this.currentLevelData.threeAct) {
          this.log.info('[ThreeAct] 使用章节三幕数据: opening=' +
            this.currentLevelData.threeAct.opening.length +
            ', breakthrough=' + this.currentLevelData.threeAct.breakthrough.length +
            ', avalanche=' + this.currentLevelData.threeAct.avalanche.length);
        }
      } catch(e) {
        this.log.error('Failed to load level:', e);
      }
    }

    /**
     * 开始关卡
     */
    async startLevel(levelId) {
      // ===== 关卡切换：清理所有运行时状态和定时器 =====
      this.onCleanupLevelState();

      this.currentLevelId = levelId;
      this.isCompleted = false;
      this.errorCount = 0;
      this.hintCount = 0;
      this.usedNotes = false;

      // Load level data
      await this.loadLevel(levelId);

      // Find chapter data
      this.onFindChapter();

      // 剧情播放期间暂停计时器
      if (this.gameTimer) this.gameTimer.pauseForDialog();

      // Play prologue (first level of chapter only)
      if (this.onIsFirstLevelOfChapter()) {
        await this.onPlayPrologue();
      }

      // Play pre-dialog (level-specific teaching dialogue)
      await this.onPlayPreDialog();

      // 三幕式引导·钩子1：第一幕引子（棋盘前的纯对话）
      if (typeof this.ThreeActGuide !== 'undefined' && this.ThreeActGuide) {
        try { await this.ThreeActGuide.playAct1Intro(); } catch(e) {}
      }

      // 剧情结束，恢复计时器
      if (this.gameTimer) this.gameTimer.resumeFromDialog();

      // 切换BGM：序章用intro，正式关卡用对应章节BGM，Boss关用boss战音乐
      const chapterId = this.currentChapterData ? this.currentChapterData.chapterId : 1;
      if (this.onIsLastLevelOfChapter()) {
        // 每章最后一关是Boss战，播放Boss战音乐
        this.AudioService.bgm.playFile('boss_battle.mp3');
      } else {
        // 普通关卡播放章节BGM（如 chapter_1.mp3）
        this.AudioService.bgm.play(chapterId);
      }

      // Init board
      this.initBoard();

      // ===== GameContext: 重置为新关卡状态 =====
      if (this.GameContext) {
        const chapterId = this.currentChapterData ? this.currentChapterData.chapterId : null;
        const isBoss = this.onIsLastLevelOfChapter();
        this.GameContext.resetForNewLevel({
          levelId: levelId,
          chapterId: chapterId,
          isBossBattle: isBoss,
        });
      }

      // 三幕式引导·钩子2：第一幕揭盘（棋盘渲染后，高亮 + 对话）
      if (typeof this.ThreeActGuide !== 'undefined' && this.ThreeActGuide) {
        try { await this.ThreeActGuide.playAct1BoardReveal(); } catch(e) {}
      }

      // 异步预加载关卡关键音效（不阻塞主流程）
      try {
        if (this.AudioService && this.AudioService.sfx && this.AudioService.sfx.preloadLevelSfx) {
          this.AudioService.sfx.preloadLevelSfx(this.currentLevelId, this.currentLevelData);
        }
      } catch(e) {
        this.log.debug('preloadLevelSfx failed:', e);
      }

      // 启动Boss战（如果是章节最后一关）
      if (typeof this.GuideBattle !== 'undefined' && this.GuideBattle && this.onIsLastLevelOfChapter()) {
        this.onStartBossBattle();
      }

      // Setup next level button
      this.setupNextLevel();

      // 兜底：确保交互是解锁状态
      this.onSetInteractionLocked(false);
      // 确保棋盘 pointer-events 正常
      const canvas = document.getElementById('gameCanvas');
      if (canvas) canvas.style.pointerEvents = '';
      // 确保数字键和工具栏可点击
      document.querySelectorAll('.num-btn, #toolbar button').forEach(el => {
        el.style.pointerEvents = '';
      });
      // 确保技术矩阵是关闭的
      if (this.techMatrix && typeof this.techMatrix.hide === 'function') {
        this.techMatrix.hide();
      }

      // Start level
      if (this.gameTimer) {
        this.gameTimer.start();
      } else {
        this.startTime = Date.now();
      }
      this.hintCount = 0;
      this.expertSystem.onLevelStart();

      // 保存上次游玩关卡
      if (this.ProgressManager && typeof this.ProgressManager.setLastPlayedLevel === 'function') {
        this.ProgressManager.setLastPlayedLevel(this.currentLevelId);
      }

      // 启动教学引导（如果有 lessonPlan）
      this.onStartLessonPlayer();

      this.log.info('Level started:', this.currentLevelId);
    }

    /**
     * 初始化棋盘
     */
    initBoard() {
      if (!this.currentLevelData) return;

      this.board = new this.BoardClass(this.currentLevelData.gridSize || 9);
      this.board.loadLevel({
        cells: this.currentLevelData.boardData,
        cages: this.currentLevelData.cages || [],
        levelId: this.currentLevelId,
        // Boss战机制数据（普通关卡没有这些字段，loadLevel 会自动设为 null）
        lockCells: this.currentLevelData.lockCells,
        fakeCells: this.currentLevelData.fakeCells,
        regionLocks: this.currentLevelData.regionLocks,
        cageCollapse: this.currentLevelData.cageCollapse,
        dualPath: this.currentLevelData.dualPath,
        phases: this.currentLevelData.phases,
      });

      this.renderer = new this.RendererClass('gameCanvas');
      // Set theme for chapter
      const chapterId = this.currentChapterData ? this.currentChapterData.chapterId : 1;
      this.renderer.setTheme(chapterId);
      // 设置关卡专属背景（每关一张独立背景图）
      if (typeof this.renderer.setLevelBackground === 'function') {
        this.renderer.setLevelBackground(this.currentLevelId);
      }
      this.renderer.recalcCellSize(this.board);
      this.renderer.render(this.board);

      // Initialize Note System (candidate display)
      if (typeof this.NoteSystemClass !== 'undefined' && this.NoteSystemClass) {
        const noteSys = new this.NoteSystemClass(this.board, this.renderer, {
          perspective: 'hero', // hero/yan/ying - default hero mode
          mode: 'classic',     // 经典模式：笔记模式下全显
          maxGlimpseCount: 3,
          glimpseDuration: 3000,
        });
        window.gameNoteSystem = noteSys;
        this.renderer.setNoteSystem(noteSys);
        global.guideNoteSystem = noteSys;
      }

      // Initialize hint system
      // Initialize teaching system (role-guided learning)
      let teachingSys = null;
      if (typeof this.TeachingSystemClass !== 'undefined' && this.TeachingSystemClass) {
        teachingSys = new this.TeachingSystemClass();
        teachingSys.load();
        global.guideTeachingSystem = teachingSys;
      }

      // Initialize hint system with teaching integration
      this.hintSystem = new this.HintSystemClass(this.board, this.currentLevelData.solution, {
        teachingSystem: teachingSys
      });

      // Initialize Rule45 banner (顶部常驻 HUD，仅 9x9 显示，201关起解锁)
      const banner = document.getElementById('rule45-banner');
      const pcNotebook = document.getElementById('pc-rule45-notebook');
      const levelIdNum = parseInt(this.currentLevelId);
      const rule45Unlocked = levelIdNum >= 201;
      if (typeof this.Rule45Class !== 'undefined' && this.Rule45Class &&
          this.board.cages.length > 0 && this.board.size === 9 && rule45Unlocked) {
        if (banner) banner.style.display = 'block';
        if (pcNotebook) pcNotebook.style.display = '';
        // 调用外部 initRule45Banner
        if (typeof this.onInitRule45Banner === 'function') {
          this.onInitRule45Banner();
        }
        this.onUpdateRule45Banner(null);
      } else {
        if (banner) banner.style.display = 'none';
        if (pcNotebook) pcNotebook.style.display = 'none';
        this.onResetRule45Banner();
      }

      // Initialize TechMatrix (技术矩阵)
      if (typeof this.TechMatrixClass !== 'undefined' && this.TechMatrixClass) {
        if (this.techMatrix) {
          // 更新现有实例
          this.techMatrix.setBoard(this.board);
          this.techMatrix.setRenderer(this.renderer);
        } else {
          this.techMatrix = new this.TechMatrixClass({
            board: this.board,
            techRater: typeof this.TechRaterClass !== 'undefined' ? this.TechRaterClass : null,
            renderer: this.renderer,
            onClose: () => {
              // 关闭时清理高亮
            },
          });
          global.guideTechMatrix = this.techMatrix;
        }
      }

      global.guideBoard = this.board;
      global.guideRenderer = this.renderer;

      // Configure expert system with board (enables replay system and dynamic thresholds)
      if (this.expertSystem && typeof this.expertSystem.init === 'function') {
        let levelsCompleted = 0;
        if (this.ProgressManager && this.ProgressManager._data && this.ProgressManager._data.levelScores) {
          levelsCompleted = Object.keys(this.ProgressManager._data.levelScores).length;
        }
        this.expertSystem.init({
          board: this.board,
          dynamicThresholds: true,
          levelsCompleted: levelsCompleted,
          onFeedback: (msg, level) => this.onShowToast(msg),
        });
        // 设置盘面尺寸，动态调整心流/EUREKA 阈值
        const gridSize = this.currentLevelData.gridSize || 9;
        if (typeof this.expertSystem.setGridSize === 'function') {
          this.expertSystem.setGridSize(gridSize);
        }
      }

      // Initialize Combo System (连击系统)
      if (typeof this.ComboSystemClass !== 'undefined' && this.ComboSystemClass) {
        const gridSize = this.currentLevelData.gridSize || 9;
        const chapterId = this.currentChapterData ? this.currentChapterData.chapterId : 1;
        const isNewPlayer = chapterId <= 1 && gridSize <= 4; // 第1章4x4为新手保护
        this.comboSystem = new this.ComboSystemClass({
          gridSize: gridSize,
          isNewPlayer: isNewPlayer,
          onComboChange: (count) => {
            // 同步连击数到渲染器（燃烧效果）
            if (this.renderer && typeof this.renderer.setComboCount === 'function') {
              this.renderer.setComboCount(count);
            }
            // 吐槽系统：连击变化
            if (this.comedySystem) {
              this.comedySystem.onComboChange(count);
            }
          },
          onMilestone: (level, milestone) => {
            // 里程碑音效
            if (milestone.sfx && this.AudioService) {
              this.AudioService.sfx.play(milestone.sfx);
            }
            // 由外部处理震动等其他里程碑效果
            if (typeof this.onComboMilestone === 'function') {
              this.onComboMilestone(level, milestone);
            }
          },
        });
        global.guideComboSystem = this.comboSystem;
      }

      // 自动填充候选数（受全局设置控制）
      const shouldAutoFill = this.settingsPanel && this.settingsPanel.get
        ? this.settingsPanel.get('game.autoFillCandidates')
        : false;

      if (shouldAutoFill === true) {
        const noteSys = window.gameNoteSystem || global.guideNoteSystem;
        if (noteSys) {
          if (typeof noteSys._autoFillTheoreticalCandidates === 'function') {
            noteSys._autoFillTheoreticalCandidates();
          } else if (typeof noteSys.autoFill === 'function') {
            noteSys.autoFill();
          }
        } else if (this.board && typeof this.board.autoFillCandidates === 'function') {
          this.board.autoFillCandidates();
        }
        // 触发重绘
        if (this.renderer) {
          this.renderer.forceRender = true;
          this.renderer.render(this.board);
        }
      }
    }

    // ============================================================
    //  === 通关判定与棋盘验证 ===
    // ============================================================

    /**
     * 独立规则校验：不依赖 solution 数组，验证数独所有规则
     * 包括：每行/列/宫 1-size 不重复，每个笼子和值正确，没有空格子
     * @returns {Object} { valid: boolean, filled: boolean, errors: [{r, c, type}] }
     */
    validateBoard() {
      if (!this.board) return { valid: false, filled: false, errors: [] };

      const size = this.board.size;
      const errors = [];
      let filled = true;

      // 检查是否所有格子都填了
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = this.board.cells[r][c];
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
          const val = this.board.cells[r][c].fixedNum || this.board.cells[r][c].fillNum;
          if (!val) continue;
          if (seen.has(val)) {
            // 找到冲突的两个格子
            for (let cc = 0; cc < c; cc++) {
              const pv = this.board.cells[r][cc].fixedNum || this.board.cells[r][cc].fillNum;
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
          const val = this.board.cells[r][c].fixedNum || this.board.cells[r][c].fillNum;
          if (!val) continue;
          if (seen.has(val)) {
            for (let rr = 0; rr < r; rr++) {
              const pv = this.board.cells[rr][c].fixedNum || this.board.cells[rr][c].fillNum;
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
      const { boxW, boxH } = this.board.getBoxSize ? this.board.getBoxSize() : { boxW: 3, boxH: 3 };
      const boxRows = Math.ceil(size / boxH);
      const boxCols = Math.ceil(size / boxW);
      for (let boxR = 0; boxR < boxRows; boxR++) {
        for (let boxC = 0; boxC < boxCols; boxC++) {
          const seen = new Map();
          for (let r = boxR * boxH; r < boxR * boxH + boxH && r < size; r++) {
            for (let c = boxC * boxW; c < boxC * boxW + boxW && c < size; c++) {
              const val = this.board.cells[r][c].fixedNum || this.board.cells[r][c].fillNum;
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
      if (this.board.cages && this.board.cages.length > 0) {
        for (const cage of this.board.cages) {
          if (!cage.cells || cage.hiddenSum || typeof cage.sum !== 'number') continue;
          let sum = 0;
          let allFilled = true;
          const seen = new Set();
          let hasDup = false;
          for (const [r, c] of cage.cells) {
            const val = this.board.cells[r]?.[c]?.fixedNum || this.board.cells[r]?.[c]?.fillNum;
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
     */
    isBoardComplete() {
      if (!this.board || !this.currentLevelData) return false;

      // 主校验：独立规则校验
      const result = this.validateBoard();
      if (!result.valid) return false;

      // 辅助校验：与 solution 比对（双重保险）
      const solution = this.currentLevelData.solution;
      if (solution) {
        for (let r = 0; r < this.board.size; r++) {
          for (let c = 0; c < this.board.size; c++) {
            const cell = this.board.cells[r][c];
            const filled = cell.fixedNum || cell.fillNum;
            if (filled !== solution[r][c]) return false;
          }
        }
      }

      return true;
    }

    /**
     * 高亮所有错误格子（当棋盘填满但有错误时）
     */
    highlightAllErrors() {
      if (!this.board) return;
      const result = this.validateBoard();
      if (!result.filled) return false;

      // 标记所有错误格子
      for (const err of result.errors) {
        const cell = this.board.cells[err.r]?.[err.c];
        if (cell) {
          cell.isError = true;
        }
      }

      if (this.renderer) {
        this.renderer.render(this.board);
      }

      return result.errors.length > 0;
    }

    /**
     * 检查棋盘是否填满但有错误
     */
    _checkFilledWithErrors() {
      const result = this.validateBoard();
      if (result.filled && result.errors.length > 0) {
        try { this.highlightAllErrors(); } catch(e) {}
        this.onShowToast('还有地方不对哦~');
        this.onVibrate('ERROR');
      }
    }

    /**
     * 检查通关
     */
    checkCompletion() {
      // Boss战中，由Boss战系统控制胜负，不自动通关
      if (typeof this.GuideBattle !== 'undefined' && this.GuideBattle &&
          (this.GuideBattle.active || this.GuideBattle.ended)) {
        return;
      }
      // 已经通关的不重复触发
      if (this.isCompleted) return;

      try {
        const isBossLvl = this.onIsLastLevelOfChapter();

        // === 1. 检查是否100%完成（Boss关必须100%，非Boss关也可能玩家手动填完） ===
        if (this.isBoardComplete()) {
          this._triggerLevelComplete();
          return;
        }

        // === 2. 非Boss关：检查分层过关条件 ===
        if (!isBossLvl && this.currentLevelData && this.board) {
          // 三幕式引导：检测阶段切换（simple→gate→avalanche）
          if (typeof this.ThreeActGuide !== 'undefined' && this.ThreeActGuide) {
            try { this.ThreeActGuide.onFillCheck(); } catch(e) {}
          }

          // 检查是否满足分层通关条件（内部使用 pristine heatmap）
          const won = this.WinConditionManager.checkWinCondition(
            this.board, this.currentLevelData, isBossLvl
          );

          if (won) {
            // 满足通关条件：先自动补全，再触发通关
            const autoFillCells = this.WinConditionManager.getAutoFillCells(
              this.board, this.currentLevelData, isBossLvl
            );

            const levelType = this.WinConditionManager.getLevelType(this.currentLevelData, isBossLvl);
            this.log.info('[WinCondition] 分层通关触发:', levelType, '自动补全', autoFillCells.length, '格');

            this._playAutoFillAnimation(autoFillCells, levelType, () => {
              this._triggerLevelComplete();
            });
            return;
          }
        }

        // === 3. 未通关：检查是否填满但有错误（原逻辑） ===
        this._checkFilledWithErrors();

      } catch(e) {
        this.log.error('checkCompletion error:', e);
      }
    }

    /**
     * 播放自动补全动画（逐格填入，带雪崩加速效果）
     * @param {Array} autoFillCells - 需要自动补全的格子列表 [{r, c, value, category, order}]
     * @param {string} levelType - 关卡类型（决定动画速度和加速曲线）
     * @param {Function} onComplete - 完成回调
     */
    _playAutoFillAnimation(autoFillCells, levelType, onComplete) {
      if (!autoFillCells || autoFillCells.length === 0) {
        if (onComplete) onComplete();
        return;
      }

      this.isCompleted = true; // 标记为已通关，防止重复触发
      // 暂停计时器（通关时刻开始算）
      if (this.gameTimer) try { this.gameTimer.pause(); } catch(e) {}

      const total = autoFillCells.length;
      const self = this;

      // ============================================================
      // 速度配置（根据关卡类型）
      // ============================================================
      let baseDelay;      // 初始延迟（ms）
      let minDelay;       // 最小延迟（ms）— 防止太快看不清
      let acceleration;   // 加速度系数（0~1，越大加速越猛）

      switch (levelType) {
        case 'novice':
          // 新手关：慢节奏，轻度加速（让玩家理解发生了什么）
          baseDelay = 80;
          minDelay = 40;
          acceleration = 0.4;  // 最快到 60% 速度
          break;

        case 'midgame':
          // 中盘关：中等节奏，中度加速
          baseDelay = 65;
          minDelay = 25;
          acceleration = 0.55; // 最快到 45% 速度
          break;

        case 'endgame':
        default:
          // 收官关（雪崩）：快节奏，强力加速（越往后越快的爽感）
          baseDelay = 50;
          minDelay = 12;
          acceleration = 0.75; // 最快到 25% 速度
          break;
      }

      // 格子很多时整体提速（避免动画太长）
      if (total > 50) {
        const scaleFactor = Math.max(0.5, 1 - (total - 50) * 0.01);
        baseDelay = Math.max(minDelay, baseDelay * scaleFactor);
      }

      let index = 0;
      let prevCellInfo = null;  // 上一个被填的格子，用于绘制雪崩光线

      // 雪崩开始音效（仅 endgame 类型播放完整雪崩音效）
      if (levelType === 'endgame') {
        try { this.AudioService.synth.playAvalancheStart(); } catch(e) {}
      } else {
        // novice/midgame 用简单的 success 音效
        try { this.AudioService.sfx.play('success'); } catch(e) {}
      }

      // 雪崩开始：清空旧的光线
      if (levelType === 'endgame' && this.renderer && typeof this.renderer.clearAvalancheRays === 'function') {
        try { this.renderer.clearAvalancheRays(); } catch(e) {}
      }

      function fillNext() {
        if (index >= total) {
          // 动画完成：确保最后一帧完整渲染
          self.onUpdateNumBtnCompletedState();
          if (self.renderer) {
            try { self.renderer.render(self.board); } catch(e) {}
          }

          // 雪崩结束音效（仅 endgame 类型）
          if (levelType === 'endgame') {
            try { self.AudioService.synth.playAvalancheEnd(); } catch(e) {}
          }

          if (onComplete) onComplete();
          return;
        }

        const cellInfo = autoFillCells[index];
        const { r, c, value, category } = cellInfo;

        // 雪崩光线：从上一个 core 格连接到当前格（仅 endgame 类型）
        if (levelType === 'endgame' && prevCellInfo && self.renderer &&
            typeof self.renderer.addAvalancheRay === 'function') {
          try {
            self.renderer.addAvalancheRay(prevCellInfo.r, prevCellInfo.c, r, c, 400);
          } catch(e) {}
        }

        // 填入数字（不记入历史，因为是自动补全）
        try {
          self.board.setNumberAt(r, c, value, {
            recordHistory: false,
            autoClear: true,
          });
        } catch (e) {
          // 兜底：直接设置 fillNum
          const cell = self.board.cells[r]?.[c];
          if (cell && !cell.fixedNum) {
            cell.fillNum = value;
          }
        }

        // 触发填数动画
        if (self.renderer && typeof self.renderer.triggerFillAnimation === 'function') {
          try {
            self.renderer.triggerFillAnimation(r, c, 200);
          } catch(e) {}
        }

        // 记录上一个格子位置（用于下一条光线）
        prevCellInfo = cellInfo;

        // 渲染策略：每 N 格重绘一次（格子越多，间隔越大，保证流畅）
        // 收官关（雪崩）渲染间隔更大，强化"飞速填满"的视觉感
        let renderInterval;
        if (levelType === 'endgame') {
          renderInterval = total > 40 ? 5 : (total > 20 ? 4 : 3);
        } else {
          renderInterval = total > 40 ? 4 : 3;
        }

        if (index % renderInterval === 0 || index === total - 1) {
          if (self.renderer) {
            try { self.renderer.render(self.board); } catch(e) {}
          }
        }

        // 播放音效
        // 雪崩阶段（endgame）：使用合成器的渐进式音阶音效
        // 其他阶段：使用普通 fill_correct 音效
        if (levelType === 'endgame') {
          // 雪崩音效：使用合成器，音高随进度上升
          // 控制播放频率：前半段间隔稍长，后半段更密集
          const progress = index / total;
          let sfxInterval;
          if (progress < 0.5) {
            // 前半段：间隔稍大（约每3-4格播一次）
            sfxInterval = 3;
          } else {
            // 后半段：更密集（约每2格播一次），配合加速感
            sfxInterval = 2;
          }

          if (index % sfxInterval === 0) {
            try {
              // 用当前已填入的数量作为"tick"索引，音高随进度上升
              self.AudioService.synth.playAvalancheTick(index, total);
            } catch(e) {}
          }
        } else {
          // 非雪崩关卡：使用普通 fill_correct 音效，固定间隔
          const sfxInterval = 4;
          if (index % sfxInterval === 0) {
            try { self.AudioService.sfx.play('fill_correct'); } catch(e) {}
          }
        }

        index++;

        // ============================================================
        // 雪崩加速：使用 ease-in 二次曲线
        // delay = baseDelay * (1 - acceleration * progress^2)
        // 特点：开始慢，后面越来越快，符合"雪崩"的感觉
        // ============================================================
        let delay = baseDelay;
        if (total > 10 && acceleration > 0) {
          const progress = index / total;
          // 二次方曲线：前半段平缓加速，后半段猛烈加速
          const speedFactor = 1 - acceleration * progress * progress;
          delay = baseDelay * speedFactor;
          delay = Math.max(minDelay, delay);
        }

        setTimeout(fillNext, delay);
      }

      // 开始动画
      fillNext();
    }

    // ============================================================
    //  === 通关流程 ===
    // ============================================================

    /**
     * 触发关卡完成（统一通关逻辑，供 checkCompletion 和自动补全完成后调用）
     */
    _triggerLevelComplete() {
      this.isCompleted = true;

      // 三幕指示灯：设置为通关状态
      if (typeof this.ThreeActGuide !== 'undefined' && this.ThreeActGuide) {
        try { this.ThreeActGuide.setComplete(); } catch(e) {}
      }

      // Stop BGM
      try { this.AudioService.bgm.stop(); } catch(e) { this.log.warn('BGM stop error:', e); }

      // Get expert report
      let report = { totalWrong: 0 };
      try {
        report = this.expertSystem.onLevelEnd();
      } catch(e) {
        this.log.error('expertSystem.onLevelEnd error:', e);
      }

      // === GameContext 学习层：关卡结束时更新玩家风格 ===
      try {
        if (this.expertSystem && this.expertSystem.learning &&
            typeof this.expertSystem.learning.updateStyleFromContext === 'function') {
          this.expertSystem.learning.updateStyleFromContext();
        }
      } catch(e) {
        this.log.warn('learning.updateStyleFromContext error:', e);
      }

      // 用 gameTimer 获取时间（如果可用），否则回退到 startTime 计算
      const elapsed = this.gameTimer ? this.gameTimer.getTime() : Math.floor((Date.now() - this.startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;

      // 暂停计时器（如果还没暂停）
      if (this.gameTimer) try { this.gameTimer.pause(); } catch(e) {}

      // Calculate grade
      let grade = { letter: 'C', color: '#ffc107' };
      try {
        grade = this.calculateGrade(elapsed, report.totalWrong || this.errorCount || 0, this.hintCount);
      } catch(e) { this.log.error('calculateGrade error:', e); }

      // Save progress
      try {
        this.saveProgress(elapsed, report.totalWrong || this.errorCount || 0, this.hintCount, grade.letter);
      } catch(e) { this.log.error('saveProgress error:', e); }

      // Play victory BGM
      try { this.AudioService.bgm.playFile('victory_full.wav'); } catch(e) {}

      const self = this;

      // Play clear dialog first, then show overlay
      const showOverlay = function() {
        try {
          // Show completion overlay
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

            document.getElementById('complete-time').textContent = '用时 ' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
            document.getElementById('complete-errors').textContent = '错误 ' + (report.totalWrong || 0) + ' 次';

            // Add hints display
            const hintsEl = document.getElementById('complete-hints');
            if (hintsEl) {
              hintsEl.textContent = '提示 ' + self.hintCount + ' 次';
            }

            let insight = '';
            try {
              const learning = self.expertSystem.getLearning();
              insight = learning.generateComment({
                nonTrivialRatio: 0.3,
                maxTechLevel: 5,
                score: 500,
              });
            } catch(e) { self.log.error('learning.generateComment error:', e); }
            document.getElementById('complete-insight').textContent = insight;

            // Update next level button text based on position
            try { self.updateNextLevelButton(); } catch(e) {}
          }

          // Play victory sound
          try { self.AudioService.sfx.play('victory'); } catch(e) {}
          self.log.info('Level completed:', self.currentLevelId, 'grade:', grade.letter);
        } catch(e) {
          self.log.error('Show completion overlay error:', e);
          // 最后兜底：直接显示结算画面
          const overlay = document.getElementById('complete-overlay');
          if (overlay) overlay.style.display = 'flex';
        }
      };

      // Play clear dialog first, then play climax animation, then show overlay
      const playClimaxAndShowOverlay = function() {
        // 判断是否播放高潮动画：排除 Boss 战和新手关（101-109）
        const isBossLevel = self.onIsLastLevelOfChapter();
        const levelIdNum = parseInt(self.currentLevelId);
        const isNoviceLevel = levelIdNum >= 101 && levelIdNum <= 109;

        if (isBossLevel || isNoviceLevel) {
          // 跳过高潮动画，直接显示结算面板
          showOverlay();
          return;
        }

        // 播放通关高潮动画
        try {
          self.onPlayClimaxAnimation(showOverlay);
        } catch(e) {
          self.log.error('playClimaxAnimation error:', e);
          showOverlay();
        }
      };

      // Play clear dialog first, then show overlay
      try {
        this.onPlayClearDialog(playClimaxAndShowOverlay);
      } catch(e) {
        this.log.error('playClearDialog error:', e);
        playClimaxAndShowOverlay();
      }
    }

    // ============================================================
    //  === 存档与评级 ===
    // ============================================================

    /**
     * 保存进度
     */
    saveProgress(timeSeconds, errors, hints, grade) {
      if (!this.ProgressManager) return;

      // Save level score
      const isNewBest = this.ProgressManager.setLevelScore(this.currentLevelId, {
        time: timeSeconds,
        errors: errors,
        hints: hints,
        grade: grade,
      });

      // 检查成就
      this.checkAchievements(timeSeconds, errors, hints, grade);

      // 刷新成就面板
      if (this.achievementPanel) {
        try { this.achievementPanel.refresh(); } catch (e) {}
      }

      // Unlock next chapter if this is the last level of current chapter
      if (this.onIsLastLevelOfChapter() && this.currentChapterData) {
        const nextChapterId = this.currentChapterData.chapterId + 1;
        if (this.onFindChapterById(nextChapterId)) {
          this.ProgressManager.unlockChapter(nextChapterId);
          this.log.info('Unlocked chapter:', nextChapterId);
        }
      }

      // 检查隐藏关解锁
      if (this.currentChapterData && this.chapterSelect && this.chapterSelect.chaptersData) {
        const newUnlocked = this.ProgressManager.checkAndUnlockHiddenLevels(
          this.currentChapterData.chapterId,
          this.chapterSelect.chaptersData
        );
        if (newUnlocked.length > 0) {
          this.onShowToast('✨ 新的隐藏关已解锁！');
          // 检查 all_hidden / all_hidden_levels 成就
          if (this.ProgressManager.getUnlockedHiddenCount() >=
              this.ProgressManager.getTotalHiddenCount(this.chapterSelect.chaptersData)) {
            this.ProgressManager.unlockAchievement('all_hidden');
            this.ProgressManager.unlockAchievement('all_hidden_levels');
          }
          // 检查 first_hidden_level 成就（第一个隐藏关解锁）
          if (this.ProgressManager.getUnlockedHiddenCount() >= 1) {
            this.ProgressManager.unlockAchievement('first_hidden_level');
          }
        }
        // 检查真结局解锁
        if (this.ProgressManager.checkTrueEndingUnlock(this.chapterSelect.chaptersData)) {
          this.onShowToast('🌟 真结局已解锁！');
        }
      }
    }

    /**
     * 计算评级
     */
    calculateGrade(elapsedSeconds, errors, hints) {
      // Estimate expected time based on grid size and difficulty
      const gridSize = this.currentLevelData ? (this.currentLevelData.gridSize || 9) : 9;
      const baseTime = gridSize <= 4 ? 60 : gridSize <= 6 ? 180 : 360;

      // Apply cycle difficulty modifiers
      let timeMultiplier = 1.0;
      let errorPenaltyMult = 1.0;
      if (this.ProgressManager) {
        const mods = this.ProgressManager.getCycleModifiers();
        timeMultiplier = mods.timeMultiplier;
        errorPenaltyMult = mods.errorPenalty / 0.15;
      }

      // Penalty factors
      const timeRatio = elapsedSeconds / (baseTime * timeMultiplier);
      const errorPenalty = errors * 0.15 * errorPenaltyMult;
      const hintPenalty = hints * 0.1;

      // Score: 100 base, subtract penalties
      let score = 100;
      score -= Math.max(0, (timeRatio - 0.5) * 40); // More than 50% of base time starts penalty
      score -= errorPenalty * 100;
      score -= hintPenalty * 100;

      let letter, color;
      if (score >= 90) { letter = 'S'; color = '#fbbf24'; }
      else if (score >= 75) { letter = 'A'; color = '#22c55e'; }
      else if (score >= 60) { letter = 'B'; color = '#3b82f6'; }
      else if (score >= 40) { letter = 'C'; color = '#a855f7'; }
      else { letter = 'D'; color = '#ef4444'; }

      return { letter, color, score: Math.max(0, Math.min(100, score)) };
    }

    /**
     * 检查成就
     */
    checkAchievements(timeSeconds, errors, hints, grade) {
      if (!this.ProgressManager) return;

      // first_clear: 首次通关（保留旧成就兼容）
      this.ProgressManager.unlockAchievement('first_clear');

      // === 进度类成就（8个）===

      if (this.currentChapterData && this.chapterSelect && this.chapterSelect.chaptersData) {
        const chId = this.currentChapterData.chapterId;

        // 检查各章通关成就（chapter1_clear ~ chapter7_clear）
        const chapterClearAchievements = {
          1: 'chapter1_clear',
          2: 'chapter2_clear',
          3: 'chapter3_clear',
          4: 'chapter4_clear',
          5: 'chapter5_clear',
          6: 'chapter6_clear',
          7: 'chapter7_clear',
        };
        for (const [chapId, achId] of Object.entries(chapterClearAchievements)) {
          if (this.ProgressManager.isChapterCleared(parseInt(chapId), this.chapterSelect.chaptersData)) {
            this.ProgressManager.unlockAchievement(achId);
          }
        }

        // all_chapters_clear: 全部章节通关
        if (this.ProgressManager.isAllChaptersCleared(this.chapterSelect.chaptersData)) {
          this.ProgressManager.unlockAchievement('all_chapters_clear');
        }

        // chapter1_s: 第一章全S级（保留旧成就）
        if (this.ProgressManager.isChapterAllS(1, this.chapterSelect.chaptersData)) {
          this.ProgressManager.unlockAchievement('chapter1_s');
        }
      }

      // === 挑战类成就（5个）===

      // speed_demon: 120秒内完成任意关卡
      if (timeSeconds > 0 && timeSeconds <= 120 && !this.currentLevelData.isHidden) {
        this.ProgressManager.unlockAchievement('speed_demon');
      }

      // speed_5min: 5分钟内通关任意9×9关卡（保留旧成就兼容）
      const gridSize = this.currentLevelData ? (this.currentLevelData.gridSize || 9) : 9;
      if (gridSize === 9 && timeSeconds <= 300 && !this.currentLevelData.isHidden) {
        this.ProgressManager.unlockAchievement('speed_5min');
      }

      // flawless_victory: 单关零错误通关
      if (errors === 0 && !this.currentLevelData.isHidden) {
        this.ProgressManager.unlockAchievement('flawless_victory');
      }

      // no_hint_run: 连续3关不使用提示通关
      if (hints === 0 && !this.currentLevelData.isHidden) {
        const streak = this.ProgressManager.incrementNoHintStreak();
        if (streak >= 3) {
          this.ProgressManager.unlockAchievement('no_hint_run');
        }
      } else {
        // 使用了提示，重置连击
        this.ProgressManager.resetNoHintStreak();
      }

      // no_hint_chapter: 一章内全程无提示
      // 在章节最后一关通关时，检查本章是否全程未使用提示
      if (this.currentChapterData && this.onIsLastLevelOfChapter() && !this.currentLevelData.isHidden) {
        const chapterId = this.currentChapterData.chapterId;
        // 如果本章全程无提示，标记并解锁成就
        if (hints === 0 && this.ProgressManager.markChapterNoHint(chapterId)) {
          this.ProgressManager.unlockAchievement('no_hint_chapter');
        }
      }

      // no_hint_ch1: 第一章某关不使用提示通关（保留旧成就兼容）
      if (hints === 0 && this.currentLevelId >= 100 && this.currentLevelId < 200 &&
          !this.currentLevelData.isHidden) {
        this.ProgressManager.unlockAchievement('no_hint_ch1');
      }

      // true_ending: 真结局通关（在 setTrueEndingCleared 中触发，此处补检）
      if (this.ProgressManager.isTrueEndingCleared()) {
        this.ProgressManager.unlockAchievement('true_ending');
      }

      // persistent: 累计游戏时长超过1小时（在 tick 中检查，这里补一次检查）
      if (this.ProgressManager.getTotalPlayTime() >= 3600) {
        this.ProgressManager.unlockAchievement('persistent');
      }

      // === 探索类成就（3个）===

      // first_hidden_level: 解锁第一个隐藏关
      if (this.ProgressManager.getUnlockedHiddenCount() >= 1) {
        this.ProgressManager.unlockAchievement('first_hidden_level');
      }

      // all_hidden_levels: 解锁全部隐藏关
      if (this.chapterSelect && this.chapterSelect.chaptersData) {
        const totalHidden = this.ProgressManager.getTotalHiddenCount(this.chapterSelect.chaptersData);
        if (totalHidden > 0 && this.ProgressManager.getUnlockedHiddenCount() >= totalHidden) {
          this.ProgressManager.unlockAchievement('all_hidden_levels');
        }
      }

      // seal_collector: 收集全部5枚印记
      if (this.ProgressManager.getUnlockedSealCount && this.ProgressManager.getUnlockedSealCount() >= 5) {
        this.ProgressManager.unlockAchievement('seal_collector');
      }

      // === 技巧类成就 ===
      // 技巧成就主要在 recordTechniqueUsage 中触发
      // 此处补检一次，确保已使用过的技巧都能解锁
      if (typeof this.ProgressManager.checkTechniqueAchievements === 'function') {
        this.ProgressManager.checkTechniqueAchievements();
      }

      // note_master: 单关标记超过50个候选数
      this.checkNoteMasterAchievement();

      // === 印记系统 ===
      this.checkSealsOnComplete(timeSeconds, errors, hints);
    }

    /**
     * 检查 note_master 成就
     */
    checkNoteMasterAchievement() {
      if (!this.ProgressManager || !this.board) return;
      if (this.ProgressManager.hasAchievement('note_master')) return;

      let noteCount = 0;
      for (let r = 0; r < this.board.size; r++) {
        for (let c = 0; c < this.board.size; c++) {
          noteCount += this.board.cells[r][c].candidates.size;
        }
      }
      if (noteCount >= 50) {
        this.ProgressManager.unlockAchievement('note_master');
      }
    }

    /**
     * 印记系统：通关检查
     */
    checkSealsOnComplete(timeSeconds, errors, hints) {
      if (!this.ProgressManager) return;
      if (!this.currentLevelData || !this.currentLevelData.isHidden) return;

      const levelId = this.currentLevelData.levelId;
      const sealDef = this.ProgressManager.getSealDefByLevel(levelId);
      if (!sealDef) return;
      if (this.ProgressManager.isSealUnlocked(sealDef.id)) return;

      const stats = {
        errors: errors || 0,
        hints: hints || 0,
        timeSeconds: timeSeconds || 0,
        usedNotes: this.usedNotes,
        levelId: levelId
      };

      if (this.ProgressManager.checkSealCondition(sealDef.id, stats)) {
        const levelScore = {
          time: timeSeconds,
          errors: errors,
          hints: hints,
          grade: 'S'
        };
        this.ProgressManager.unlockSeal(sealDef.id, levelScore);
        this.onShowSealUnlockAnimation(sealDef);
        this.log.info('Seal unlocked:', sealDef.id, sealDef.name);
        // 检查 seal_collector 成就（收集全部5枚印记）
        if (this.ProgressManager.getUnlockedSealCount && this.ProgressManager.getUnlockedSealCount() >= 5) {
          this.ProgressManager.unlockAchievement('seal_collector');
        }
      }
    }

    /**
     * 记录技巧使用（接受中文名或 TechRater 风格ID）
     * 自动累计次数并检查技巧类成就
     */
    recordTechniqueUsage(techniqueName) {
      if (!this.ProgressManager || !techniqueName) return;

      // 中文名 -> TechRater ID
      let techId = TECHNIQUE_NAME_TO_ID[techniqueName];
      if (!techId) {
        // 如果已经是 TechRater 风格 ID，直接使用
        techId = techniqueName;
      }

      // 使用 ProgressManager 的新 API（自动累计 + 成就检测）
      if (typeof this.ProgressManager.addSkillUsage === 'function') {
        this.ProgressManager.addSkillUsage(techId);
      } else {
        // 回退：旧版 addSkillCount
        const statMap = {
          'nakedSingle': 'nakedSingle',
          'hiddenSingle': 'hiddenSingle',
          'rule45': 'rule45',
          'nakedPair': 'nakedPair',
          'hiddenPair': 'hiddenPair',
          'pointingClaiming': 'pointingPair',
          'cageUnique': 'cageSum',
          'nakedTriplet': 'nakedTriplet',
          'xWing': 'xWing',
          'swordfish': 'swordfish',
        };
        const statKey = statMap[techId];
        if (statKey) {
          this.ProgressManager.addSkillCount(statKey, 1);
        }
      }
    }

    /**
     * 检测玩家填入某格数字时使用的技巧（技术判定方案a）
     * 原理：创建 TechRater 并模拟求解过程，直到目标格被解出，
     *       记录解出该格时使用的"最低级可用技巧"。
     */
    detectTechniqueForFill(r, c, num) {
      if (!this.board) return null;

      try {
        const TechRaterClass = this.TechRaterClass;
        if (!TechRaterClass) return null;

        // 从当前棋盘状态创建 TechRater 实例
        const techRater = new TechRaterClass(this.board);
        if (!techRater.findNextStep || !techRater._fillCell) return null;

        const maxSteps = techRater.size * techRater.size;

        // 逐步求解，直到目标格被解出或达到最大步数
        for (let i = 0; i < maxSteps; i++) {
          const step = techRater.findNextStep();
          if (!step) break;

          if (step.row === r && step.col === c) {
            // 目标格被解出，返回使用的技巧
            return step.technique;
          }

          // 应用这一步，继续求解
          techRater._fillCell(step.row, step.col, step.num);
        }
      } catch (e) {
        console.warn('[detectTechniqueForFill] 检测失败:', e);
      }
      return null;
    }

    // ============================================================
    //  === 下一关 / 重新开始 / 导航 ===
    // ============================================================

    /**
     * 设置下一关按钮
     */
    setupNextLevel() {
      const btn = document.getElementById('btn-next-level');
      if (btn) {
        btn.addEventListener('click', () => {
          this.handleNextLevel();
        });
      }
    }

    /**
     * 更新下一关按钮文字
     */
    updateNextLevelButton() {
      const btn = document.getElementById('btn-next-level');
      if (!btn) return;

      const isHiddenLevel = this.currentLevelData && this.currentLevelData.isHidden;
      const isLastLevel = this.onIsLastLevelOfChapter();
      const isLastChapter = this.onIsLastChapterOfGame();

      if (isHiddenLevel) {
        btn.textContent = '返回章节选择';
      } else if (isLastLevel && isLastChapter) {
        btn.textContent = '查看结局';
      } else if (isLastLevel) {
        btn.textContent = '进入结局';
      } else {
        btn.textContent = '下一关';
      }
    }

    /**
     * 处理下一关
     */
    handleNextLevel() {
      const isLast = this.onIsLastLevelOfChapter();
      const isHiddenLevel = this.currentLevelData && this.currentLevelData.isHidden;

      // 隐藏关通关后返回章节选择
      if (isHiddenLevel) {
        const overlay = document.getElementById('complete-overlay');
        if (overlay) overlay.style.display = 'none';
        if (this.chapterSelect) {
          this.chapterSelect._render();
          this.chapterSelect.show();
        }
        return;
      }

      if (isLast) {
        // Chapter end: play epilogue then transition
        this.onPlayChapterEpilogue(() => {
          if (this.onIsLastChapterOfGame()) {
            this.onShowGameEnding();
          } else {
            this.onShowChapterTransition(() => {
              this.goToNextChapter();
            });
          }
        });
      } else {
        // Normal next level: 从当前章节中找到下一个非隐藏关卡
        const nextLevelId = this._findNextLevelId(this.currentLevelId);
        if (nextLevelId) {
          if (this.startedFromSelect && this.chapterSelect) {
            // Use in-page navigation when coming from chapter select
            this.startLevel(nextLevelId);
            // Hide completion overlay
            const overlay = document.getElementById('complete-overlay');
            if (overlay) overlay.style.display = 'none';
          } else {
            this.onNavigateTo('guide.html?id=' + nextLevelId);
          }
        } else {
          // Fallback: try currentLevelId + 1
          const fallbackId = this.currentLevelId + 1;
          if (this.startedFromSelect && this.chapterSelect) {
            this.startLevel(fallbackId);
          } else {
            this.onNavigateTo('guide.html?id=' + fallbackId);
          }
        }
      }
    }

    /**
     * 在当前章节中查找下一个非隐藏关卡的ID
     */
    _findNextLevelId(currentId) {
      if (!this.currentChapterData || !this.currentChapterData.levels) return null;
      const levels = this.currentChapterData.levels;
      const numId = parseInt(currentId);
      const currentIndex = levels.findIndex(lvl => parseInt(lvl.levelId) === numId);
      if (currentIndex === -1) return null;

      // 从下一个关卡开始找，跳过隐藏关
      for (let i = currentIndex + 1; i < levels.length; i++) {
        if (!levels[i].isHidden) {
          return parseInt(levels[i].levelId);
        }
      }
      return null; // 没有更多非隐藏关卡
    }

    /**
     * 进入下一章
     */
    goToNextChapter() {
      const nextChapterId = this.currentChapterData.chapterId + 1;
      const nextChapter = this.onFindChapterById(nextChapterId);
      if (nextChapter && nextChapter.levels && nextChapter.levels.length > 0) {
        // 找到第一个非隐藏关卡
        const firstNormalLevel = nextChapter.levels.find(function(lvl) { return !lvl.isHidden; });
        const firstLevelId = firstNormalLevel ? parseInt(firstNormalLevel.levelId) : parseInt(nextChapter.levels[0].levelId);
        if (this.startedFromSelect && this.chapterSelect) {
          // In-page navigation
          this.startLevel(firstLevelId);
        } else {
          this.onNavigateTo('guide.html?id=' + firstLevelId);
        }
      } else {
        // Fallback: try currentLevelId + 1
        if (this.startedFromSelect && this.chapterSelect) {
          this.startLevel(parseInt(this.currentLevelId) + 1);
        } else {
          this.onNavigateTo('guide.html?id=' + (parseInt(this.currentLevelId) + 1));
        }
      }
    }

    /**
     * 重新开始关卡
     */
    restartLevel() {
      this.onHidePauseMenu();
      // 延迟一下再开始，让暂停菜单有时间消失
      setTimeout(() => {
        this.startLevel(this.currentLevelId);
      }, 300);
    }

    /**
     * 返回章节选择
     */
    goToChapterSelect() {
      this.onHidePauseMenu();
      if (this.chapterSelect) {
        this.chapterSelect.show();
      }
    }

    /**
     * 返回主菜单
     */
    goToMainMenu() {
      this.onHidePauseMenu();
      // 保存当前进度
      if (this.ProgressManager && this.currentLevelId) {
        this.ProgressManager.setLastPlayedLevel(this.currentLevelId);
      }
      // 重置三幕式 BGM
      if (typeof this.ThreeActGuide !== 'undefined' && this.ThreeActGuide) {
        try { this.ThreeActGuide.resetBgm(); } catch(e) {}
      }
      // 跳转到主菜单（带翻页过渡）
      this.onNavigateTo('menu.html');
    }
  }

  // 暴露到全局
  if (typeof window !== 'undefined') {
    window.GameController = GameController;
  }

})(typeof window !== 'undefined' ? window : globalThis);
