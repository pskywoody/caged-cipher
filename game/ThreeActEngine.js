// ==========================================
//  ThreeActEngine - 三幕式引导引擎
// ==========================================
//  从 guide.js 抽离，物理分离，逻辑不变
//  三幕式节奏引导系统（升级版）
//
//  触发时机：
//    - 第一幕·引子（钩子1）：playPreDialog 之后、initBoard 之前，纯 StoryEngine 对话
//    - 第一幕·揭盘（钩子2）：initBoard 渲染完成后，高亮 simple 格 + StoryEngine 对话
//    - 第二幕·破局（运行时）：填完所有 simple 格时，高亮 gate 格 + StoryEngine 对话
//    - 第三幕·雪崩（运行时）：填完所有 gate 格时，快速气泡飘过 + 雪崩音效
//
//  启用条件：
//    - features.threeActGuide === true
//    - 或：新手关（101~109）且 difficultyLevel >= 2
//    - 有 lessonPlan 的关卡不启用（优先使用 LessonPlayer）
//
//  使用 localStorage 记录每关各幕的显示状态，首次进入才显示。
// ==========================================

;(function(global) {
  'use strict';

  const STORAGE_KEY = 'cagemaster3_three_act_shown';
  const ACTS = {
    ACT1: 'act1',       // 第一幕（引子 + 揭盘）
    ACT2: 'act2',       // 第二幕·破局
    ACT3: 'act3',       // 第三幕·雪崩
  };

  // 幕次参数配置：影响游戏节奏的核心参数
  // 第一幕：速填（轻松入场，熟悉盘面）
  // 第二幕：博弈（正面博弈，节奏加快）
  // 第三幕：雪崩（节奏拉满，最后冲刺）
  const ACT_PARAMS = {
    1: {
      aiSpeedMultiplier: 0.7,      // AI 慢（给玩家熟悉时间）
      hintCooldownMultiplier: 0.8,  // 提示冷却短（鼓励探索）
      timePressureMultiplier: 0.0,  // 无时间压力
      comboMultiplier: 1.2,         // 连击加成高（快速进入心流）
      label: '序章',
      description: '轻松入场，熟悉盘面',
    },
    2: {
      aiSpeedMultiplier: 1.0,      // AI 正常速度
      hintCooldownMultiplier: 1.0,  // 提示冷却正常
      timePressureMultiplier: 0.5,  // 轻度时间压力
      comboMultiplier: 1.0,         // 正常连击
      label: '破局',
      description: '正面博弈，节奏加快',
    },
    3: {
      aiSpeedMultiplier: 1.4,      // AI 加速（紧迫感）
      hintCooldownMultiplier: 1.5,  // 提示冷却加长（逼玩家自己想）
      timePressureMultiplier: 1.0,  // 强时间压力
      comboMultiplier: 1.5,         // 高连击奖励（高潮释放）
      label: '雪崩',
      description: '节奏拉满，最后冲刺',
    },
  };

  // 默认幕次参数（非三幕关卡使用第二幕作为基准）
  const DEFAULT_ACT_PARAMS = ACT_PARAMS[2];

  // 默认台词（如果关卡没有配置 threeActDialog）
  const DEFAULT_DIALOG = {
    act1Intro: [
      { speaker: '阿妍', text: '这一关的节奏分三步走~' },
      { speaker: '阿妍', text: '第一步：先把这些绿色格子填了，都是送分题！' },
      { speaker: '阿妍', text: '快速建立节奏，后面就顺了~' },
    ],
    act1Reveal: [
      { speaker: '阿妍', text: '看，这些绿色的都是开局就能秒填的~' },
      { speaker: '守笼人', text: '等你把绿色都填完，红色破局点就会出现啦！' },
    ],
    act2: [
      { speaker: '阿妍', text: '绿色清完了！现在看这些红色格子~' },
      { speaker: '守笼人', text: '它们是破局关键，填对一个就能连锁解锁好多！' },
      { speaker: '阿妍', text: '试试用你学过的技巧突破吧~' },
    ],
    act3: '进入雪崩阶段啦~',
  };

  class ThreeActEngine {
    /**
     * @param {Object} deps - 依赖注入
     * @param {Object} deps.board - 棋盘对象（可选，运行时设置）
     * @param {Object} deps.renderer - 渲染器（可选，运行时设置）
     * @param {Object} deps.storyEngine - 故事引擎（可选，运行时设置）
     * @param {Object} deps.levelData - 当前关卡数据（可选，运行时设置）
     * @param {Object} deps.chapterData - 当前章节数据（可选，运行时设置）
     * @param {Function} deps.setInteractionLocked - 设置交互锁定
     * @param {Function} deps.showCharacterBubble - 显示角色气泡
     * @param {Function} deps.isLastLevelOfChapter - 是否为章节最后一关
     */
    constructor(deps = {}) {
      // 依赖
      this._board = deps.board || null;
      this._renderer = deps.renderer || null;
      this._storyEngine = deps.storyEngine || null;
      this._levelData = deps.levelData || null;
      this._chapterData = deps.chapterData || null;
      this._setInteractionLocked = deps.setInteractionLocked || (() => {});
      this._showCharacterBubble = deps.showCharacterBubble || null;
      this._isLastLevelOfChapter = deps.isLastLevelOfChapter || (() => false);

      // 运行时状态
      this._enabled = false;
      this._currentAct = 0;       // 当前幕次（0=未开始，1/2/3）
      this._act1Started = false;
      this._act2Triggered = false;
      this._act3Triggered = false;
      this._lastSimpleCompleted = false;
      this._lastGateCompleted = false;
      this._highlightTimer = null;
      this._firstCellClickListener = null;
      this._bgmManaged = false;  // BGM 是否已由三幕式接管（避免重复干预）
      this._actTitleEl = null;   // 幕次切换全屏标题元素

      // 常量
      this.ACTS = ACTS;
      this.ACT_PARAMS = ACT_PARAMS;
    }

    // ============================================================
    // 依赖设置（运行时更新）
    // ============================================================

    setBoard(board) { this._board = board; }
    setRenderer(renderer) { this._renderer = renderer; }
    setStoryEngine(engine) { this._storyEngine = engine; }
    setLevelData(data) { this._levelData = data; }
    setChapterData(data) { this._chapterData = data; }

    // ============================================================
    // BGM 动态强度控制
    // 只有在 features.threeActGuide 开启且非 Boss 战时才生效
    // 强度级别：Normal → Intense → Intense (雪崩) → Eureka
    // ============================================================

    _isBossBattle() {
      return typeof GuideBattle !== 'undefined' && GuideBattle.active;
    }

    _setBgmIntensity(intensity, fadeMs) {
      if (!this._enabled) return;
      if (this._isBossBattle()) return; // Boss 战 BGM 由 Boss 战系统管理
      if (typeof AudioService === 'undefined') return;
      if (!AudioService.bgm || !AudioService.bgmPlaying) return;
      try {
        AudioService.bgm.transition(intensity, fadeMs);
        this._bgmManaged = true;
        if (typeof log !== 'undefined') {
          log.info('[ThreeActGuide] BGM intensity -> ' + intensity + ' (' + fadeMs + 'ms)');
        }
      } catch(e) {
        console.debug('[ThreeActGuide] BGM transition failed:', e);
      }
    }

    resetBgm() {
      if (!this._bgmManaged) return;
      this._setBgmIntensity('Normal', 2000);
      this._bgmManaged = false;
    }

    // ============================================================
    // 幕次参数系统
    // ============================================================

    /**
     * 获取当前幕次参数
     * 非三幕关卡返回默认参数（第二幕基准）
     * @returns {Object} 幕次参数对象
     */
    getActParams() {
      if (!this._enabled || this._currentAct < 1) {
        return { ...DEFAULT_ACT_PARAMS };
      }
      return { ...(ACT_PARAMS[this._currentAct] || DEFAULT_ACT_PARAMS) };
    }

    /**
     * 获取当前幕次（1/2/3），未启用或未开始返回 0
     * @returns {number}
     */
    getCurrentAct() {
      if (!this._enabled) return 0;
      return this._currentAct;
    }

    /**
     * 应用幕次参数到各系统
     * 在幕次切换时调用，平滑过渡参数
     * @param {number} actNum - 幕次（1/2/3）
     */
    _applyActParams(actNum) {
      const params = ACT_PARAMS[actNum];
      if (!params) return;

      this._currentAct = actNum;

      // 同步到 GameContext
      this._syncActToGameContext(actNum);

      if (typeof log !== 'undefined') {
        log.info('[ThreeActGuide] 幕次参数切换: act=' + actNum +
          ' label=' + params.label +
          ' aiSpeed=' + params.aiSpeedMultiplier +
          ' hintCd=' + params.hintCooldownMultiplier +
          ' combo=' + params.comboMultiplier);
      }

      // === 1. AI 速度调整（仅 Boss 战生效）===
      try {
        if (typeof AISpeedController !== 'undefined' && AISpeedController.setMultiplier) {
          // 注意：aiSpeedMultiplier 的语义与 AISpeedController 一致
          // <1 = 变慢（delay 变大），>1 = 变快（delay 变小）
          // GuideBattle 中 ctxMul 直接乘到 delay 上
          // 所以 ACT_PARAMS 中 0.7 表示 AI 变慢（delay * 0.7 其实是变快...）
          // 等一下，需要确认语义：
          // GuideBattle: delay = baseDelay * ... * ctxMul
          // ctxMul < 1 → delay 变小 → AI 变快
          // ctxMul > 1 → delay 变大 → AI 变慢
          //
          // ACT_PARAMS.aiSpeedMultiplier 语义：
          // 0.7 = AI 慢（给玩家熟悉时间）→ delay 应该变大 → ctxMul = 1/0.7 ≈ 1.43
          // 1.0 = 正常 → ctxMul = 1.0
          // 1.4 = AI 快（紧迫感）→ delay 应该变小 → ctxMul = 1/1.4 ≈ 0.71
          //
          // 所以转换因子是 1 / aiSpeedMultiplier
          const speedFactor = 1 / params.aiSpeedMultiplier;
          AISpeedController.setMultiplier(speedFactor, 'three_act', 0, {
            log: typeof log !== 'undefined' ? log : undefined,
          });
        }
      } catch (e) {
        console.warn('[ThreeActGuide] AI 速度调整失败:', e);
      }

      // === 2. 提示冷却调整 ===
      try {
        if (typeof ExpertSystem !== 'undefined' && ExpertSystem.perception) {
          if (typeof ExpertSystem.perception.setHintCooldownMultiplier === 'function') {
            ExpertSystem.perception.setHintCooldownMultiplier(params.hintCooldownMultiplier);
          }
        }
      } catch (e) {
        console.warn('[ThreeActGuide] 提示冷却调整失败:', e);
      }

      // === 3. 连击加成调整 ===
      try {
        const comboSys = typeof guideComboSystem !== 'undefined'
          ? guideComboSystem
          : (typeof window !== 'undefined' && window.guideComboSystem);
        if (comboSys && typeof comboSys.setActMultiplier === 'function') {
          comboSys.setActMultiplier(params.comboMultiplier);
        }
      } catch (e) {
        console.warn('[ThreeActGuide] 连击加成调整失败:', e);
      }

      // === 4. 触发全局事件（供其他系统监听）===
      try {
        if (typeof EventBus !== 'undefined' && EventBus.publish) {
          EventBus.publish('three-act:act-changed', {
            act: actNum,
            params: { ...params },
          });
        }
      } catch (e) {
        // 静默失败，EventBus 可能不存在
      }

      // === 5. 视觉：幕次切换全屏标题动画 ===
      this._showActTitle(actNum, params);
    }

    /**
     * 显示幕次切换全屏标题动画
     * @param {number} actNum - 幕次
     * @param {Object} params - 幕次参数
     */
    _showActTitle(actNum, params) {
      try {
        // 移除之前的标题元素
        if (this._actTitleEl && this._actTitleEl.parentNode) {
          this._actTitleEl.parentNode.removeChild(this._actTitleEl);
        }

        const el = document.createElement('div');
        el.className = 'three-act-title-overlay';
        el.style.cssText = `
          position: fixed;
          top: 0; left: 0;
          width: 100%; height: 100%;
          z-index: 20000;
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.5s ease;
        `;

        // 根据幕次选择颜色
        const actColors = {
          1: { main: '#22c55e', glow: 'rgba(34, 197, 94, 0.6)' },   // 绿色·序章
          2: { main: '#f59e0b', glow: 'rgba(245, 158, 11, 0.6)' },   // 琥珀·破局
          3: { main: '#ef4444', glow: 'rgba(239, 68, 68, 0.7)' },    // 红色·雪崩
        };
        const color = actColors[actNum] || actColors[2];

        el.innerHTML = `
          <div class="act-title-content" style="text-align: center; transform: scale(0.9); transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);">
            <div class="act-title-label" style="
              font-size: 20px;
              font-weight: 500;
              color: ${color.main};
              letter-spacing: 8px;
              margin-bottom: 12px;
              opacity: 0.9;
              text-transform: uppercase;
            ">第 ${actNum} 幕</div>
            <div class="act-title-name" style="
              font-size: 64px;
              font-weight: 900;
              color: #fff;
              letter-spacing: 16px;
              text-shadow: 0 0 30px ${color.glow}, 0 0 60px ${color.glow}, 0 4px 16px rgba(0,0,0,0.5);
              font-family: 'Impact', 'Arial Black', 'Microsoft YaHei', sans-serif;
              line-height: 1;
            ">${params.label}</div>
            <div class="act-title-desc" style="
              font-size: 16px;
              color: rgba(255,255,255,0.7);
              margin-top: 16px;
              letter-spacing: 4px;
            ">${params.description}</div>
            <div class="act-title-divider" style="
              width: 120px;
              height: 2px;
              background: linear-gradient(90deg, transparent, ${color.main}, transparent);
              margin: 20px auto 0;
            "></div>
          </div>
        `;

        document.body.appendChild(el);
        this._actTitleEl = el;

        // 淡入 + 缩放
        requestAnimationFrame(() => {
          el.style.opacity = '1';
          const content = el.querySelector('.act-title-content');
          if (content) content.style.transform = 'scale(1)';
        });

        // 2 秒后淡出
        setTimeout(() => {
          if (this._actTitleEl === el) {
            el.style.opacity = '0';
            const content = el.querySelector('.act-title-content');
            if (content) content.style.transform = 'scale(1.1)';
            setTimeout(() => {
              if (this._actTitleEl === el && el.parentNode) {
                el.parentNode.removeChild(el);
                this._actTitleEl = null;
              }
            }, 500);
          }
        }, 2000);
      } catch (e) {
        console.warn('[ThreeActGuide] 幕次标题动画失败:', e);
      }
    }

    // ============================================================
    // 存储管理
    // ============================================================

    _loadShownMap() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch(e) {}
      return {};
    }

    _saveShownMap(map) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
      } catch(e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          console.warn('[Guide] Storage quota exceeded on shown map save');
        }
      }
    }

    _hasShown(levelId, act) {
      const map = this._loadShownMap();
      return !!(map[levelId] && map[levelId][act]);
    }

    _markShown(levelId, act) {
      const map = this._loadShownMap();
      if (!map[levelId]) map[levelId] = {};
      map[levelId][act] = true;
      this._saveShownMap(map);
    }

    // ============================================================
    // 启用条件判断
    // ============================================================

    /**
     * 判断三幕引导是否对当前关卡启用
     */
    isEnabled(levelData) {
      if (!levelData) return false;

      // 有 lessonPlan 的关卡不显示三幕引导（优先使用 LessonPlayer）
      if (levelData.lessonPlan) return false;

      // 检查 features 显式开关
      if (levelData.features && levelData.features.threeActGuide === true) {
        return true;
      }

      // 新手关（101~109）且 difficultyLevel >= 2 时默认启用
      const levelId = parseInt(levelData.levelId) || 0;
      const difficultyLevel = levelData.difficultyLevel || 1;
      if (levelId >= 101 && levelId <= 109 && difficultyLevel >= 2) {
        return true;
      }

      return false;
    }

    // ============================================================
    // 格子获取
    // ============================================================

    _getCellsByCategory(category) {
      if (!this._board || typeof WinConditionManager === 'undefined') return [];
      const isBoss = this._isLastLevelOfChapter();
      const heatmap = WinConditionManager.getPristineHeatmap(this._board, this._levelData, isBoss);
      if (!heatmap || !heatmap.gridMeta) return [];

      const cells = [];
      const size = this._board.size;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const meta = heatmap.gridMeta[r]?.[c];
          if (meta && meta.category === category) {
            cells.push({ r, c });
          }
        }
      }
      return cells;
    }

    // ============================================================
    // 对话配置获取
    // ============================================================

    _getDialog(key) {
      const custom = this._levelData && this._levelData.threeActDialog;
      if (custom && custom[key] && Array.isArray(custom[key]) && custom[key].length > 0) {
        return custom[key];
      }
      return DEFAULT_DIALOG[key] || [];
    }

    _getAct3Line() {
      const custom = this._levelData && this._levelData.threeActDialog;
      if (custom && custom.act3) {
        if (Array.isArray(custom.act3) && custom.act3.length > 0) {
          return custom.act3[0].text || DEFAULT_DIALOG.act3;
        }
        if (typeof custom.act3 === 'string') return custom.act3;
        if (custom.act3.text) return custom.act3.text;
      }
      return DEFAULT_DIALOG.act3;
    }

    // ============================================================
    // 高亮工具
    // ============================================================

    _highlightCells(cells, type, key) {
      if (!this._renderer || typeof this._renderer.highlightHintCells !== 'function') return;
      if (!cells || cells.length === 0) return;
      try {
        this._renderer.highlightHintCells(cells, type, key);
      } catch(e) {}
    }

    _clearHighlight(key) {
      if (!this._renderer || typeof this._renderer.clearHintHighlights !== 'function') return;
      try {
        this._renderer.clearHintHighlights(key);
      } catch(e) {}
    }

    _clearHighlightTimer() {
      if (this._highlightTimer) {
        clearTimeout(this._highlightTimer);
        this._highlightTimer = null;
      }
    }

    /**
     * 设置首次点击格子时清除高亮
     * 绑定到 canvas 的 pointerdown 事件，检测是否点击了有效格子
     */
    _setupFirstClickClear(key) {
      // 移除之前的监听器
      if (this._firstCellClickListener) {
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
          canvas.removeEventListener('pointerdown', this._firstCellClickListener);
        }
        this._firstCellClickListener = null;
      }

      this._firstCellClickListener = () => {
        // 只要玩家点击了棋盘区域就清除高亮
        this._clearHighlight(key);
        this._clearHighlightTimer();
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
          canvas.removeEventListener('pointerdown', this._firstCellClickListener);
        }
        this._firstCellClickListener = null;
      };

      // 延迟一点再绑定，避免对话结束的点击误触发
      setTimeout(() => {
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
          canvas.addEventListener('pointerdown', this._firstCellClickListener, { once: true });
        }
      }, 300);
    }

    // ============================================================
    // 第一幕·引子（钩子1）—— initBoard 之前，纯对话
    // ============================================================

    /**
     * 播放第一幕引子对话（棋盘还没初始化，只有对话）
     * @returns {Promise} 对话结束后 resolve
     */
    playAct1Intro() {
      return new Promise((resolve) => {
        if (!this._levelData) { resolve(); return; }

        // 初始化启用状态
        this._enabled = this.isEnabled(this._levelData);
        this._currentAct = 0;
        if (typeof UIManager !== 'undefined') {
          UIManager.setThreeActEnabled(this._enabled);
        }
        this._act1Started = false;
        this._act2Triggered = false;
        this._act3Triggered = false;
        this._lastSimpleCompleted = false;
        this._lastGateCompleted = false;

        if (!this._enabled) { resolve(); return; }
        if (!this._storyEngine) {
          // 即使没有 storyEngine，也要设置 BGM 强度
          this._setBgmIntensity('Normal', 1500);
          resolve();
          return;
        }

        const levelId = this._levelData.levelId;

        // 无论是否已显示过对话，都设置第一幕 BGM 强度
        this._setBgmIntensity('Normal', 1500);

        if (this._hasShown(levelId, ACTS.ACT1)) { resolve(); return; }

        this._act1Started = true;

        // 设置场景键用于已读记录
        const chapterId = this._chapterData ? this._chapterData.chapterId : 0;
        this._storyEngine.setSceneKey(chapterId + '_' + levelId + '_act1_intro');

        const dialog = this._getDialog('act1Intro');
        if (typeof log !== 'undefined') {
          log.info('[ThreeActGuide] 播放第一幕·引子 (%d 句)', dialog.length);
        }

        // 对话期间锁定交互
        this._setInteractionLocked(true);
        this._storyEngine.sayLines(dialog, () => {
          this._setInteractionLocked(false);
          resolve();
        });
      });
    }

    // ============================================================
    // 第一幕·揭盘（钩子2）—— initBoard 之后，高亮 + 对话
    // ============================================================

    /**
     * 播放第一幕揭盘（棋盘渲染好后，高亮 simple 格 + 对话）
     * @returns {Promise} 对话结束后 resolve
     */
    playAct1BoardReveal() {
      return new Promise((resolve) => {
        if (!this._enabled || !this._act1Started) { resolve(); return; }
        if (!this._storyEngine || !this._renderer) { resolve(); return; }
        if (!this._levelData) { resolve(); return; }

        // === 进入第一幕：应用幕次参数 + 统计各幕格子总数 ===
        this._applyActParams(1);

        const levelId = this._levelData.levelId;
        if (this._hasShown(levelId, ACTS.ACT1)) { resolve(); return; }

        // 高亮所有 simple 格（绿色调）
        const simpleCells = this._getCellsByCategory('simple');
        if (simpleCells.length > 0) {
          this._highlightCells(simpleCells, 'hint', 'three_act_act1');
        }

        // 切换渲染器到第一幕模式（simple 绿）
        if (typeof this._renderer.setThreeActMode === 'function') {
          this._renderer.setThreeActMode('simple');
          this._renderer.render(this._board);
        }

        // 初始化幕次指示器
        if (typeof WinConditionManager !== 'undefined') {
          const stats = WinConditionManager.getProgress(this._board, this._levelData, false).stats;
          this._updateActIndicator(stats);
        }

        // 设置场景键
        const chapterId = this._chapterData ? this._chapterData.chapterId : 0;
        this._storyEngine.setSceneKey(chapterId + '_' + levelId + '_act1_reveal');

        const dialog = this._getDialog('act1Reveal');
        if (typeof log !== 'undefined') {
          log.info('[ThreeActGuide] 播放第一幕·揭盘 (%d 句, %d simple 格)', dialog.length, simpleCells.length);
        }

        this._setInteractionLocked(true);
        this._storyEngine.sayLines(dialog, () => {
          this._setInteractionLocked(false);

          // 标记第一幕已显示
          this._markShown(levelId, ACTS.ACT1);

          // 2 秒后自动清除高亮，或玩家点击第一个格子时清除
          this._clearHighlightTimer();
          this._highlightTimer = setTimeout(() => {
            this._clearHighlight('three_act_act1');
            this._highlightTimer = null;
          }, 2000);

          this._setupFirstClickClear('three_act_act1');

          resolve();
        });
      });
    }

    // ============================================================
    // 第二幕·破局（运行时触发）—— simple 填完后
    // ============================================================

    _playAct2Breakthrough() {
      if (!this._enabled) return;
      if (!this._storyEngine || !this._renderer) return;
      if (!this._levelData) return;

      const levelId = this._levelData.levelId;
      if (this._act2Triggered) return;

      this._act2Triggered = true;

      // === 进入第二幕：应用幕次参数 ===
      this._applyActParams(2);

      // 第二幕 BGM：Intense 强度（紧张博弈）—— 无论是否已显示对话都设置
      this._setBgmIntensity('Intense', 1500);

      // 如果已显示过，只更新 BGM，不播放对话
      if (this._hasShown(levelId, ACTS.ACT2)) return;

      this._markShown(levelId, ACTS.ACT2);

      // 高亮所有 gate 格（红色调，用 error 类型）
      const gateCells = this._getCellsByCategory('gate');
      if (gateCells.length > 0) {
        this._highlightCells(gateCells, 'error', 'three_act_act2');
      }

      // 切换渲染器到第二幕模式（gate 红）
      if (typeof this._renderer.setThreeActMode === 'function') {
        this._renderer.setThreeActMode('gate');
        this._renderer.render(this._board);
      }

      // 触发 Gate 格红色脉动闪烁（3 秒，0.7s 周期）
      if (gateCells.length > 0 && typeof this._renderer.triggerGatePulse === 'function') {
        try {
          this._renderer.triggerGatePulse(gateCells, 3000);
        } catch(e) {}
      }

      // 播放破局专属音效
      try {
        if (typeof AudioService !== 'undefined' && AudioService.synth) {
          if (typeof AudioService.synth.playActBreakthrough === 'function') {
            AudioService.synth.playActBreakthrough();
          }
        }
      } catch(e) {
        console.debug('[ThreeActGuide] breakthrough sfx failed:', e);
      }

      // 设置场景键
      const chapterId = this._chapterData ? this._chapterData.chapterId : 0;
      this._storyEngine.setSceneKey(chapterId + '_' + levelId + '_act2');

      const dialog = this._getDialog('act2');
      if (typeof log !== 'undefined') {
        log.info('[ThreeActGuide] 播放第二幕·破局 (%d 句, %d gate 格)', dialog.length, gateCells.length);
      }

      this._setInteractionLocked(true);
      this._storyEngine.sayLines(dialog, () => {
        this._setInteractionLocked(false);

        // 3 秒后清除高亮，或玩家选中 gate 格时清除
        this._clearHighlightTimer();
        this._highlightTimer = setTimeout(() => {
          this._clearHighlight('three_act_act2');
          this._highlightTimer = null;
        }, 3000);

        this._setupFirstClickClear('three_act_act2');
      });
    }

    // ============================================================
    // 第三幕·雪崩（运行时触发）—— gate 填完后
    // ============================================================

    _playAct3Avalanche() {
      if (!this._enabled) return;
      if (!this._levelData) return;

      const levelId = this._levelData.levelId;
      if (this._act3Triggered) return;

      this._act3Triggered = true;

      // === 进入第三幕：应用幕次参数 ===
      this._applyActParams(3);

      // 第三幕 BGM：保持 Intense 强度（雪崩阶段已足够紧张）—— 无论是否已显示都设置
      this._setBgmIntensity('Intense', 1500);

      // 如果已显示过，只更新 BGM，不播放动画
      if (this._hasShown(levelId, ACTS.ACT3)) return;

      this._markShown(levelId, ACTS.ACT3);

      // 停止 Gate 格脉动（如果还在运行）
      if (this._renderer && typeof this._renderer.stopGatePulse === 'function') {
        try { this._renderer.stopGatePulse(); } catch(e) {}
      }

      // 切换渲染器到第三幕模式（core 金）
      if (typeof this._renderer.setThreeActMode === 'function') {
        this._renderer.setThreeActMode('core');
        this._renderer.render(this._board);
      }

      const line = this._getAct3Line();
      if (typeof log !== 'undefined') {
        log.info('[ThreeActGuide] 第三幕·雪崩:', line);
      }

      // 快速飘过气泡，不阻塞
      try {
        if (this._showCharacterBubble) {
          this._showCharacterBubble('ayan', {
            text: line,
            speakerName: '阿妍',
            type: 'eureka',
            duration: 2500,
          });
        } else if (typeof showCharacterBubble !== 'undefined') {
          showCharacterBubble('ayan', {
            text: line,
            speakerName: '阿妍',
            type: 'eureka',
            duration: 2500,
          });
        }
      } catch(e) {
        console.warn('[ThreeActGuide] showCharacterBubble failed:', e);
      }

      // 雪崩音效
      try {
        if (typeof AudioService !== 'undefined') {
          if (AudioService.synth && typeof AudioService.synth.playAvalancheStart === 'function') {
            AudioService.synth.playAvalancheStart();
          } else {
            AudioService.sfx.play('eureka');
          }
        }
      } catch(e) {}
    }

    // ============================================================
    // 填数检测（运行时）
    // ============================================================

    /**
     * 更新棋盘上方三幕指示灯（圆点 + 文字）
     * 转发到 UIManager
     * @param {number} act - 幕次 1/2/3，或 'complete' 表示通关
     */
    _updateThreeActDot(act) {
      if (typeof UIManager !== 'undefined') {
        return UIManager.updateThreeActDot(act);
      }
    }

    /**
     * 更新顶部幕次指示器（文本 + 进度条）
     * 转发到 UIManager
     */
    _updateActIndicator(stats) {
      if (typeof UIManager !== 'undefined') {
        return UIManager.updateActIndicator(stats);
      }
    }

    // ============================================================
    //  GameContext 同步：三幕进度写入中央状态
    // ============================================================

    /**
     * 将当前幕次和三幕进度同步到 GameContext.level
     * 在幕次切换和填数检查时调用
     * @param {number} actNum - 当前幕次（1/2/3）
     */
    _syncActToGameContext(actNum) {
      try {
        const ctx = global.GameContext;
        if (!ctx || !ctx.level) return;

        ctx.level.act = actNum;

        // 同步幕次参数到 GameContext，供各系统读取
        const params = this.getActParams();
        if (ctx.level.actParams) {
          Object.assign(ctx.level.actParams, params);
        } else {
          ctx.level.actParams = { ...params };
        }

        // 如果可以获取到详细进度，也同步过去
        if (typeof WinConditionManager !== 'undefined' && this._board && this._levelData) {
          try {
            const progress = WinConditionManager.getProgress(this._board, this._levelData, false);
            if (progress && progress.stats) {
              const s = progress.stats;
              ctx.level.simpleFilled = s.simple ? s.simple.filled : 0;
              ctx.level.simpleTotal = s.simple ? s.simple.total : 0;
              ctx.level.gateFilled = s.gate ? s.gate.filled : 0;
              ctx.level.gateTotal = s.gate ? s.gate.total : 0;
              ctx.level.coreFilled = s.core ? s.core.filled : 0;
              ctx.level.coreTotal = s.core ? s.core.total : 0;
            }
          } catch (e) {
            // 获取进度失败不影响主流程
          }
        }

        if (typeof log !== 'undefined') {
          log.debug('[ThreeActGuide] GameContext 同步: act=' + actNum);
        }
      } catch (e) {
        console.warn('[ThreeActGuide] _syncActToGameContext error:', e);
      }
    }

    /**
     * 更新 GameContext 中的三幕进度（每次填数后调用，轻量级）
     */
    _syncActProgressToGameContext() {
      try {
        const ctx = global.GameContext;
        if (!ctx || !ctx.level) return;
        if (typeof WinConditionManager === 'undefined' || !this._board || !this._levelData) return;

        const progress = WinConditionManager.getProgress(this._board, this._levelData, false);
        if (!progress || !progress.stats) return;

        const s = progress.stats;
        ctx.level.simpleFilled = s.simple ? s.simple.filled : 0;
        ctx.level.simpleTotal = s.simple ? s.simple.total : 0;
        ctx.level.gateFilled = s.gate ? s.gate.filled : 0;
        ctx.level.gateTotal = s.gate ? s.gate.total : 0;
        ctx.level.coreFilled = s.core ? s.core.filled : 0;
        ctx.level.coreTotal = s.core ? s.core.total : 0;
      } catch (e) {
        // 静默失败
      }
    }

    /**
     * 每次填数后检查阶段切换（在 checkCompletion 中调用）
     * 检测 simple 完成 → 第二幕·破局
     * 检测 gate 完成 → 第三幕·雪崩
     */
    onFillCheck() {
      if (!this._enabled) return;
      if (!this._board || !this._levelData) return;
      if (typeof WinConditionManager === 'undefined') return;

      const stats = WinConditionManager.getProgress(this._board, this._levelData, false).stats;
      if (!stats) return;

      // 更新幕次指示器
      this._updateActIndicator(stats);

      // === GameContext 同步：每次填数后更新三幕进度 ===
      this._syncActProgressToGameContext();

      // 检测 simple 完成状态切换 → 第二幕
      const simpleCompleted = stats.simple.total > 0 && stats.simple.filled >= stats.simple.total;
      if (simpleCompleted && !this._lastSimpleCompleted) {
        this._playAct2Breakthrough();
      }
      this._lastSimpleCompleted = simpleCompleted;

      // 检测 gate 完成状态切换 → 第三幕
      const gateCompleted = stats.gate.total > 0 && stats.gate.filled >= stats.gate.total;
      if (gateCompleted && !this._lastGateCompleted) {
        this._playAct3Avalanche();
      }
      this._lastGateCompleted = gateCompleted;
    }

    // ============================================================
    // 兼容 API：旧的 onLevelStart（保留用于兼容，不再做实际工作）
    // ============================================================

    onLevelStart() {
      // v2 系统使用两阶段钩子（playAct1Intro + playAct1BoardReveal）
      // 此函数保留用于向后兼容，实际引导在 startLevel 的钩子中触发
      if (!this._levelData) return;
      this._enabled = this.isEnabled(this._levelData);
      this._currentAct = 0;
      if (typeof UIManager !== 'undefined') {
        UIManager.setThreeActEnabled(this._enabled);
      }
      this._act1Started = false;
      this._act2Triggered = false;
      this._act3Triggered = false;
      this._lastSimpleCompleted = false;
      this._lastGateCompleted = false;

      // 初始化幕次指示器
      if (this._enabled && this._board && typeof WinConditionManager !== 'undefined') {
        try {
          const stats = WinConditionManager.getProgress(this._board, this._levelData, false).stats;
          this._updateActIndicator(stats);
        } catch (e) {
          // 忽略初始化错误
        }
      } else {
        // 未启用三幕引导，隐藏指示器
        const indicator = document.getElementById('act-indicator');
        if (indicator) indicator.style.display = 'none';
        // 隐藏棋盘上方指示灯
        this._updateThreeActDot(null);
      }
    }

    /**
     * 设置指示灯为通关状态（外部在关卡完成时调用）
     */
    setComplete() {
      if (!this._enabled) return;
      this._updateThreeActDot('complete');
      // 通关：Eureka 强度（高潮版）
      this._setBgmIntensity('Eureka', 500);
    }

    // ============================================================
    // 清理
    // ============================================================

    cleanup() {
      this._clearHighlightTimer();
      this._clearHighlight('three_act_act1');
      this._clearHighlight('three_act_act2');

      // 停止 Gate 格脉动动画
      if (this._renderer && typeof this._renderer.stopGatePulse === 'function') {
        try { this._renderer.stopGatePulse(); } catch(e) {}
      }
      // 清除雪崩光线
      if (this._renderer && typeof this._renderer.clearAvalancheRays === 'function') {
        try { this._renderer.clearAvalancheRays(); } catch(e) {}
      }

      if (this._firstCellClickListener) {
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
          canvas.removeEventListener('pointerdown', this._firstCellClickListener);
        }
        this._firstCellClickListener = null;
      }

      // 隐藏棋盘上方指示灯
      this._updateThreeActDot(null);

      // 重置 BGM 强度
      this.resetBgm();

      // 重置 AI 速度倍率
      try {
        if (typeof AISpeedController !== 'undefined' && AISpeedController.resetMultiplier) {
          AISpeedController.resetMultiplier('three_act', {
            log: typeof log !== 'undefined' ? log : undefined,
          });
        }
      } catch (e) {
        console.warn('[ThreeActGuide] cleanup: AI speed reset failed:', e);
      }

      // 重置提示冷却倍率
      try {
        if (typeof ExpertSystem !== 'undefined' && ExpertSystem.perception) {
          if (typeof ExpertSystem.perception.setHintCooldownMultiplier === 'function') {
            ExpertSystem.perception.setHintCooldownMultiplier(1.0);
          }
        }
      } catch (e) {
        console.warn('[ThreeActGuide] cleanup: hint cooldown reset failed:', e);
      }

      // 重置连击加成倍率
      try {
        const comboSys = typeof guideComboSystem !== 'undefined'
          ? guideComboSystem
          : (typeof window !== 'undefined' && window.guideComboSystem);
        if (comboSys && typeof comboSys.setActMultiplier === 'function') {
          comboSys.setActMultiplier(1.0);
        }
      } catch (e) {
        console.warn('[ThreeActGuide] cleanup: combo multiplier reset failed:', e);
      }

      // 清除幕次标题元素
      if (this._actTitleEl && this._actTitleEl.parentNode) {
        this._actTitleEl.parentNode.removeChild(this._actTitleEl);
      }
      this._actTitleEl = null;

      this._enabled = false;
      this._currentAct = 0;
      if (typeof UIManager !== 'undefined') {
        UIManager.setThreeActEnabled(false);
      }
      this._act1Started = false;
      this._act2Triggered = false;
      this._act3Triggered = false;
      this._lastSimpleCompleted = false;
      this._lastGateCompleted = false;
    }
  }

  // 暴露到全局
  global.ThreeActEngine = ThreeActEngine;

})(typeof window !== 'undefined' ? window : this);
