// ==========================================
//  ComedySystem - 吐槽系统
// ==========================================
//  在特定游戏场景下触发角色气泡对话，增加游戏趣味性
//  支持：守笼人 / 阿妍 / 莹莹 三位角色
//  带防火墙：教学/三幕/剧情/提示/Boss战中静音
// ==========================================

;(function(global) {
  'use strict';

  const log = new Logger('ComedySystem');

  // 角色 ID 映射（与 guide.js 中保持一致）
  const CHAR_IDS = {
    CAGEKEEPER: 'cagekeeper',
    AYAN: 'ayan',
    YING: 'ying',
  };

  // 角色中文名映射
  const CHAR_NAMES = {
    cagekeeper: '守笼人',
    ayan: '阿妍',
    ying: '莹莹',
  };

  // 各场景的台词池（随机选一条，增加变化感）
  const LINES = {
    // 同一格连续填错 3 次
    same_cell_wrong_3: {
      character: CHAR_IDS.CAGEKEEPER,
      type: 'error',
      pool: [
        '同一格错三次，故意的？',
        '这格已经错三次了，换个思路？',
        '年轻人，不要在同一个地方跌倒三次。',
      ],
    },
    // 连击达到 10
    combo_10: {
      character: CHAR_IDS.AYAN,
      type: 'encourage',
      pool: [
        '状态不错嘛。',
        '手感火热，继续保持~',
        '行云流水，就是这种感觉。',
      ],
    },
    // 闲置 60 秒
    idle_60s: {
      character: CHAR_IDS.CAGEKEEPER,
      type: 'info',
      pool: [
        '思考也是一种解题方式。',
        '卡住了？试试换个角度看。',
        '别急，好思路需要时间沉淀。',
      ],
    },
    // 通关 S 级
    clear_s_grade: {
      character: CHAR_IDS.CAGEKEEPER,
      type: 'encourage',
      pool: [
        '不错，老夫没看走眼。',
        'S级，名副其实。',
        '这水平，能走得更远。',
      ],
    },
    // 进入心流状态
    flow_state: {
      character: CHAR_IDS.AYAN,
      type: 'encourage',
      pool: [
        '行云流水~',
        '进入状态了呢。',
        '节奏很好，继续。',
      ],
    },
    // EUREKA 触发
    eureka: {
      character: CHAR_IDS.YING,
      type: 'eureka',
      pool: [
        '太厉害了！',
        'EUREKA！灵感爆发！',
        '想通了就是这种感觉~',
      ],
    },
    // 第一次使用笔记
    first_note: {
      character: CHAR_IDS.CAGEKEEPER,
      type: 'hint',
      pool: [
        '笔记是工具，不是答案。',
        '善用候选数，事半功倍。',
        '好记性不如烂笔头。',
      ],
    },
    // 提示用完
    hints_exhausted: {
      character: CHAR_IDS.CAGEKEEPER,
      type: 'error',
      pool: [
        '提示用完了，自己想。',
        '接下来靠你自己了。',
        '没有拐杖，才能真正学会走路。',
      ],
    },
  };

  // 冷却时间（同一类吐槽的最小间隔，毫秒）
  const COOLDOWN = {
    same_cell_wrong_3: 15000,   // 15 秒
    combo_10: 30000,            // 30 秒
    idle_60s: 60000,            // 60 秒
    clear_s_grade: 0,           // 无冷却（每关只一次）
    flow_state: 20000,          // 20 秒
    eureka: 30000,              // 30 秒
    first_note: 0,              // 无冷却（每关只一次）
    hints_exhausted: 0,         // 无冷却（每关只一次）
  };

  class ComedySystem {
    /**
     * @param {Object} config
     * @param {Function} config.showBubble - 显示角色气泡的函数 (characterId, {text, speakerName, type, duration}) => {}
     * @param {Function} config.isMuted - 检查是否应该静音的函数 () => boolean
     * @param {number} config.idleThresholdMs - 闲置阈值（默认 60 秒）
     */
    constructor(config = {}) {
      this._showBubble = config.showBubble || null;
      this._isMutedFn = config.isMuted || (() => false);
      this._idleThresholdMs = config.idleThresholdMs || 60000;

      // 状态
      this._lastTriggerTime = {};    // 各场景上次触发时间
      this._triggeredOnce = new Set(); // 每关只触发一次的场景
      this._sameCellWrongCount = {}; // { "r,c": count }
      this._lastWrongCell = null;    // 上一次填错的格子
      this._lastActionTime = 0;      // 上次玩家操作时间
      this._idleTimer = null;        // 闲置检测定时器
      this._enabled = true;          // 总开关
      this._currentLevelId = null;   // 当前关卡 ID（用于重置）

      log.info('ComedySystem initialized');
    }

    /**
     * 设置显示气泡的函数（延迟绑定）
     */
    setShowBubble(fn) {
      this._showBubble = fn;
    }

    /**
     * 设置静音检测函数（延迟绑定）
     */
    setMutedCheck(fn) {
      this._isMutedFn = fn;
    }

    /**
     * 启用 / 禁用
     */
    setEnabled(enabled) {
      this._enabled = enabled;
      if (!enabled) {
        this._stopIdleTimer();
      }
    }

    /**
     * 新关卡开始，重置状态
     */
    reset(levelId) {
      this._lastTriggerTime = {};
      this._triggeredOnce.clear();
      this._sameCellWrongCount = {};
      this._lastWrongCell = null;
      this._lastActionTime = Date.now();
      this._currentLevelId = levelId || null;
      this._restartIdleTimer();
      log.debug('ComedySystem reset for level', levelId);
    }

    /**
     * 销毁
     */
    destroy() {
      this._stopIdleTimer();
      this._showBubble = null;
      this._isMutedFn = null;
      this._lastTriggerTime = {};
      this._triggeredOnce.clear();
      this._sameCellWrongCount = {};
    }

    // =====================================================
    //  场景触发方法
    // =====================================================

    /**
     * 玩家填错时调用
     * @param {number} r
     * @param {number} c
     */
    onWrongFill(r, c) {
      if (!this._enabled || this._isMuted()) return;
      this._markAction();

      const key = `${r},${c}`;

      // 同一格连续错误计数
      if (this._lastWrongCell === key) {
        this._sameCellWrongCount[key] = (this._sameCellWrongCount[key] || 0) + 1;
      } else {
        this._sameCellWrongCount[key] = 1;
      }
      this._lastWrongCell = key;

      // 连续错 3 次触发
      if (this._sameCellWrongCount[key] >= 3) {
        this._trigger('same_cell_wrong_3');
        this._sameCellWrongCount[key] = 0; // 触发后重置计数
      }
    }

    /**
     * 玩家填对时调用
     * @param {number} r
     * @param {number} c
     */
    onCorrectFill(r, c) {
      if (!this._enabled) return;
      this._markAction();

      // 正确填数重置该格的错误计数
      const key = `${r},${c}`;
      if (this._sameCellWrongCount[key]) {
        this._sameCellWrongCount[key] = 0;
      }
      if (this._lastWrongCell === key) {
        this._lastWrongCell = null;
      }
    }

    /**
     * 连击数变化时调用
     * @param {number} comboCount - 当前连击数
     */
    onComboChange(comboCount) {
      if (!this._enabled || this._isMuted()) return;

      if (comboCount >= 10) {
        this._trigger('combo_10');
      }
    }

    /**
     * 心流状态变化时调用
     * @param {string} state - cold / stale / flow / eureka
     */
    onFlowStateChange(state) {
      if (!this._enabled || this._isMuted()) return;

      if (state === 'flow') {
        this._trigger('flow_state');
      }
    }

    /**
     * EUREKA 触发时调用
     * @param {string} type - combo / insight
     */
    onEureka(type) {
      if (!this._enabled || this._isMuted()) return;
      this._trigger('eureka');
    }

    /**
     * 首次切换笔记模式时调用
     */
    onFirstNote() {
      if (!this._enabled || this._isMuted()) return;
      this._trigger('first_note');
    }

    /**
     * 提示用完时调用
     */
    onHintsExhausted() {
      if (!this._enabled || this._isMuted()) return;
      this._trigger('hints_exhausted');
    }

    /**
     * 通关时调用
     * @param {string} grade - 评级（S/A/B/C/D）
     */
    onLevelClear(grade) {
      if (!this._enabled || this._isMuted()) return;
      this._stopIdleTimer();

      if (grade === 'S') {
        this._trigger('clear_s_grade');
      }
    }

    /**
     * 玩家操作（任意操作，用于闲置检测）
     */
    onPlayerAction() {
      if (!this._enabled) return;
      this._markAction();
    }

    // =====================================================
    //  内部方法
    // =====================================================

    _isMuted() {
      if (!this._isMutedFn) return false;
      try {
        return !!this._isMutedFn();
      } catch (e) {
        return false;
      }
    }

    _markAction() {
      this._lastActionTime = Date.now();
      this._restartIdleTimer();
    }

    _restartIdleTimer() {
      this._stopIdleTimer();
      if (!this._enabled) return;

      this._idleTimer = setTimeout(() => {
        this._onIdleTimeout();
      }, this._idleThresholdMs);
    }

    _stopIdleTimer() {
      if (this._idleTimer) {
        clearTimeout(this._idleTimer);
        this._idleTimer = null;
      }
    }

    _onIdleTimeout() {
      if (!this._enabled || this._isMuted()) {
        // 如果当前静音，延后再检测
        this._restartIdleTimer();
        return;
      }
      this._trigger('idle_60s');
      // 触发后重新计时，避免持续刷屏
      this._restartIdleTimer();
    }

    /**
     * 触发一个场景的吐槽
     * @param {string} sceneKey - 场景 key
     */
    _trigger(sceneKey) {
      const scene = LINES[sceneKey];
      if (!scene) return;

      // 检查是否是每关只触发一次的场景
      const onceScenes = ['clear_s_grade', 'first_note', 'hints_exhausted'];
      if (onceScenes.includes(sceneKey) && this._triggeredOnce.has(sceneKey)) {
        return;
      }

      // 检查冷却
      const cooldown = COOLDOWN[sceneKey] || 0;
      const lastTime = this._lastTriggerTime[sceneKey] || 0;
      if (cooldown > 0 && Date.now() - lastTime < cooldown) {
        return;
      }

      // 静音检查
      if (this._isMuted()) return;

      // 从台词池中随机选一条
      const pool = scene.pool;
      const text = pool[Math.floor(Math.random() * pool.length)];

      // 记录触发时间
      this._lastTriggerTime[sceneKey] = Date.now();
      if (onceScenes.includes(sceneKey)) {
        this._triggeredOnce.add(sceneKey);
      }

      // 显示气泡
      if (this._showBubble) {
        try {
          this._showBubble(scene.character, {
            text: text,
            speakerName: CHAR_NAMES[scene.character] || '',
            type: scene.type,
            duration: 3500,
          });
          log.debug('ComedySystem trigger:', sceneKey, '-', text);
        } catch (e) {
          log.warn('showBubble failed:', e);
        }
      }
    }

    /**
     * 直接触发某角色说某句话（调试用 / 外部手动触发）
     */
    say(character, text, type, duration) {
      if (!this._enabled || this._isMuted()) return;
      if (this._showBubble) {
        this._showBubble(character, {
          text: text,
          speakerName: CHAR_NAMES[character] || '',
          type: type || 'info',
          duration: duration || 3000,
        });
      }
    }
  }

  // 暴露到全局
  global.ComedySystem = ComedySystem;

})(typeof window !== 'undefined' ? window : this);
