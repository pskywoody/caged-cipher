// PlayerStateMonitor - Perception Layer
// Tracks player actions and derives high-level states

;(function(global) {
  'use strict';

  class PlayerStateMonitor {
    constructor(config = {}) {
      // 盘面尺寸（影响动态阈值）
      this.gridSize = config.gridSize || 9;

      // 基础阈值（9x9 标准值）
      this._baseThresholds = {
        stuckMs: config.stuckMs || 45000,
        anxiousWindowMs: config.anxiousWindowMs || 3000,
        anxiousErrorCount: config.anxiousErrorCount || 3,
        flowWindowMs: config.flowWindowMs || 8000,
        flowCount: config.flowCount || 3,
        eurekaCount: config.eurekaCount || 8,
      };

      // 当前生效阈值（根据 gridSize 动态计算）
      this.thresholds = this._calcThresholdsForSize(this.gridSize);

      this.dimensions = {
        stuck: { value: false, duration: 0, since: 0 },
        anxious: { value: false, duration: 0, since: 0 },
        flow: { value: false, depth: 0, since: 0 },
        rhythm: { value: 'neutral', fillRate: 0, avgInterval: 0 },
        technique: { failed: new Set(), successful: new Set() },
      };

      this.counters = {
        totalCorrect: 0,
        totalWrong: 0,
        totalHints: 0,
        totalAutoHints: 0,
        consecutiveCorrect: 0,
        consecutiveWrong: 0,
        totalAttempts: 0,
      };

      // 提示冷却状态
      this.hintCooldown = {
        lastHintTime: 0,       // 上次提示时间（手动+自动）
        lastAutoHintTime: 0,   // 上次自动提示时间
        manualCooldownMs: 30000,   // 手动提示冷却
        autoCooldownMs: 60000,     // 自动提示冷却
        crossCooldownMs: 45000,    // 交叉冷却（手动后自动、自动后手动都要等）
      };

      // 技巧遭遇跟踪（用于新手保护规则）
      this.techniqueEncounters = new Set();
      this.firstEncounterStuckTime = {}; // techniqueId -> stuckStartTime

      this._fillHistory = [];
      this._lastFillTime = Date.now();
      this._lastActionTime = Date.now();
      this._levelActive = false;
    }

    onLevelStart() {
      this._levelActive = true;
      this._lastActionTime = Date.now();
      this._lastFillTime = Date.now();
      this._fillHistory = [];
      this.counters = {
        totalCorrect: 0, totalWrong: 0, totalHints: 0, totalAutoHints: 0,
        consecutiveCorrect: 0, consecutiveWrong: 0, totalAttempts: 0,
      };
      this.dimensions.stuck = { value: false, duration: 0, since: 0 };
      this.dimensions.anxious = { value: false, duration: 0, since: 0 };
      this.dimensions.flow = { value: false, depth: 0, since: 0 };
      // 重置提示冷却
      this.hintCooldown.lastHintTime = 0;
      this.hintCooldown.lastAutoHintTime = 0;
      this.techniqueEncounters = new Set();
      this.firstEncounterStuckTime = {};

      // === GameContext 同步：关卡开始重置玩家状态 ===
      this._syncToGameContext();
    }

    onLevelEnd() {
      this._levelActive = false;
    }

    onFillCorrect(row, col, num) {
      const now = Date.now();
      const interval = now - this._lastFillTime;
      this._lastFillTime = now;
      this._lastActionTime = now;

      this.counters.totalCorrect++;
      this.counters.consecutiveCorrect++;
      this.counters.consecutiveWrong = 0;
      this.counters.totalAttempts++;

      this._fillHistory.push({ time: now, correct: true, interval });
      if (this._fillHistory.length > 50) this._fillHistory.shift();

      // Reset stuck
      this.dimensions.stuck = { value: false, duration: 0, since: 0 };

      // Check anxious recovery
      if (this.dimensions.anxious.value) {
        this.dimensions.anxious = { value: false, duration: 0, since: 0 };
      }

      // Check flow state
      this._updateFlow(now, interval, true);
      this._updateRhythm();

      // === GameContext 同步 + 触发决策 ===
      this._syncToGameContext();
      this._triggerDecisionIfReady();
    }

    onFillWrong(row, col, num) {
      const now = Date.now();
      const interval = now - this._lastFillTime;
      this._lastFillTime = now;
      this._lastActionTime = now;

      this.counters.totalWrong++;
      this.counters.consecutiveWrong++;
      this.counters.consecutiveCorrect = 0;
      this.counters.totalAttempts++;

      this._fillHistory.push({ time: now, correct: false, interval });
      if (this._fillHistory.length > 50) this._fillHistory.shift();

      // Check anxious state
      if (this.counters.consecutiveWrong >= this.thresholds.anxiousErrorCount) {
        this.dimensions.anxious = { value: true, duration: 0, since: now };
      }

      // Reset flow
      this.dimensions.flow = { value: false, depth: 0, since: 0 };
      this._updateRhythm();

      // === GameContext 同步 + 触发决策 ===
      this._syncToGameContext();
      this._triggerDecisionIfReady();
    }

    onNote(row, col, num) {
      this._lastActionTime = Date.now();
      this.dimensions.stuck = { value: false, duration: 0, since: 0 };
    }

    onHint(auto = false) {
      this.counters.totalHints++;
      if (auto) {
        this.counters.totalAutoHints++;
      }
      this._lastActionTime = Date.now();
      this.dimensions.stuck = { value: false, duration: 0, since: 0 };
      const now = Date.now();
      this.hintCooldown.lastHintTime = now;
      if (auto) {
        this.hintCooldown.lastAutoHintTime = now;
      }

      // === GameContext 同步 + 触发决策 ===
      this._syncToGameContext();
      this._triggerDecisionIfReady();
    }

    /**
     * 检查自动提示是否可用（冷却已过）
     * @returns {boolean}
     */
    canAutoHint() {
      const now = Date.now();
      const cd = this.hintCooldown;
      // 距离上次任何提示要超过交叉冷却
      if (now - cd.lastHintTime < cd.crossCooldownMs) return false;
      // 距离上次自动提示要超过自动冷却
      if (now - cd.lastAutoHintTime < cd.autoCooldownMs) return false;
      return true;
    }

    /**
     * 记录技巧遭遇（用于新手保护规则判断首次遇到）
     * @param {string} techniqueId
     */
    recordTechniqueEncounter(techniqueId) {
      if (!techniqueId) return;
      if (!this.techniqueEncounters.has(techniqueId)) {
        this.techniqueEncounters.add(techniqueId);
        this.firstEncounterStuckTime[techniqueId] = 0;
      }
    }

    /**
     * 检查是否首次遇到某技巧
     * @param {string} techniqueId
     * @returns {boolean}
     */
    isFirstTechniqueEncounter(techniqueId) {
      return techniqueId && !this.techniqueEncounters.has(techniqueId);
    }

    update(deltaTime) {
      if (!this._levelActive) return;

      const now = Date.now();
      const idleTime = now - this._lastActionTime;

      // Stuck detection
      if (idleTime > this.thresholds.stuckMs) {
        if (!this.dimensions.stuck.value) {
          this.dimensions.stuck = { value: true, duration: idleTime, since: this._lastActionTime };
        } else {
          this.dimensions.stuck.duration = idleTime;
        }
      } else {
        this.dimensions.stuck = { value: false, duration: 0, since: 0 };
      }

      // Anxious duration update
      if (this.dimensions.anxious.value && this.dimensions.anxious.since > 0) {
        this.dimensions.anxious.duration = now - this.dimensions.anxious.since;
        if (this.dimensions.anxious.duration > 10000) {
          this.dimensions.anxious = { value: false, duration: 0, since: 0 };
          this.counters.consecutiveWrong = 0;
        }
      }

      // === GameContext 同步（心跳更新）===
      // 状态变化时才同步，避免频繁写入
      if (this._prevStuck !== this.dimensions.stuck.value ||
          this._prevAnxious !== this.dimensions.anxious.value) {
        this._syncToGameContext();
        this._triggerDecisionIfReady();
        this._prevStuck = this.dimensions.stuck.value;
        this._prevAnxious = this.dimensions.anxious.value;
      }
    }

    _updateFlow(now, interval, correct) {
      if (correct && interval < this.thresholds.flowWindowMs) {
        this.dimensions.flow.depth++;
        if (this.dimensions.flow.depth >= this.thresholds.flowCount) {
          this.dimensions.flow.value = true;
          this.dimensions.flow.since = now;
        }
      } else {
        this.dimensions.flow.depth = 0;
        this.dimensions.flow.value = false;
      }
    }

    _updateRhythm() {
      const recent = this._fillHistory.slice(-10);
      if (recent.length < 3) {
        this.dimensions.rhythm = { value: 'neutral', fillRate: 0, avgInterval: 0 };
        return;
      }
      const avgInterval = recent.reduce((s, h) => s + h.interval, 0) / recent.length;
      const fillRate = recent.filter(h => h.correct).length / recent.length;
      let value = 'steady';
      if (avgInterval < 3000 && fillRate > 0.8) value = 'fast';
      else if (avgInterval > 15000) value = 'stalled';
      this.dimensions.rhythm = { value, fillRate, avgInterval };
    }

    /**
     * 设置盘面尺寸，动态调整所有阈值
     * 4x4 → 心流 2 连击，EUREKA 4 连击
     * 6x6 → 心流 3 连击，EUREKA 6 连击
     * 9x9 → 心流 4 连击，EUREKA 8 连击
     * @param {number} size
     */
    setGridSize(size) {
      this.gridSize = size;
      this.thresholds = this._calcThresholdsForSize(size);
    }

    /**
     * 根据盘面尺寸计算阈值
     * @param {number} size
     * @returns {Object} 调整后的阈值
     */
    _calcThresholdsForSize(size) {
      const base = this._baseThresholds;
      let flowRatio = 1.0;
      let eurekaRatio = 1.0;
      let stuckRatio = 1.0;

      if (size <= 4) {
        flowRatio = 2 / 3;   // 2 连击心流（基础是 3）
        eurekaRatio = 4 / 8; // 4 连击 EUREKA（基础是 8）
        stuckRatio = 0.6;    // 小盘面更快触发卡顿提示
      } else if (size === 6) {
        flowRatio = 3 / 3;   // 3 连击心流
        eurekaRatio = 6 / 8; // 6 连击 EUREKA
        stuckRatio = 0.8;
      } else {
        // 9x9：标准值
        flowRatio = 4 / 3;   // 4 连击心流
        eurekaRatio = 1.0;   // 8 连击 EUREKA
        stuckRatio = 1.0;
      }

      return {
        stuckMs: Math.round(base.stuckMs * stuckRatio),
        anxiousWindowMs: base.anxiousWindowMs,
        anxiousErrorCount: Math.max(2, Math.round(base.anxiousErrorCount * (size <= 4 ? 0.7 : 1))),
        flowWindowMs: base.flowWindowMs,
        flowCount: Math.max(2, Math.round(base.flowCount * flowRatio)),
        eurekaCount: Math.max(3, Math.round(base.eurekaCount * eurekaRatio)),
      };
    }

    getState() {
      this.update(0);
      const now = Date.now();
      return {
        isStuck: this.dimensions.stuck.value,
        stuckDuration: this.dimensions.stuck.duration,
        isAnxious: this.dimensions.anxious.value,
        anxiousDuration: this.dimensions.anxious.duration,
        inFlowState: this.dimensions.flow.value,
        flowDepth: this.dimensions.flow.depth,
        rhythm: this.dimensions.rhythm.value,
        consecutiveCorrect: this.counters.consecutiveCorrect,
        consecutiveWrong: this.counters.consecutiveWrong,
        totalCorrect: this.counters.totalCorrect,
        totalWrong: this.counters.totalWrong,
        totalAttempts: this.counters.totalAttempts,
        totalHints: this.counters.totalHints,
        totalAutoHints: this.counters.totalAutoHints,
        gridSize: this.gridSize,
        eurekaCount: this.thresholds.eurekaCount,
        // 提示冷却状态
        hintCooldown: {
          lastHintTime: this.hintCooldown.lastHintTime,
          lastAutoHintTime: this.hintCooldown.lastAutoHintTime,
          timeSinceLastHint: now - this.hintCooldown.lastHintTime,
          timeSinceLastAutoHint: now - this.hintCooldown.lastAutoHintTime,
          canAutoHint: this.canAutoHint(),
          crossCooldownMs: this.hintCooldown.crossCooldownMs,
          autoCooldownMs: this.hintCooldown.autoCooldownMs,
        },
        // 技巧遭遇
        techniqueEncounters: Array.from(this.techniqueEncounters),
      };
    }

    snapshot() {
      const state = this.getState();
      state.totalTime = (Date.now() - this._lastActionTime) / 1000;
      return state;
    }

    // ============================================================
    //  GameContext 集成方法
    // ============================================================

    /**
     * 将当前感知状态同步到 GameContext.player
     * 只写不读，GameContext 是单一数据源的写入目标
     */
    _syncToGameContext() {
      try {
        const ctx = global.GameContext;
        if (!ctx || !ctx.player) return;

        // 计算 flow 状态字符串
        let flowState = 'cold';
        if (this.dimensions.flow.value && this.dimensions.flow.depth >= this.thresholds.eurekaCount) {
          flowState = 'eureka';
        } else if (this.dimensions.flow.value) {
          flowState = 'flow';
        } else if (this.counters.consecutiveCorrect > 0) {
          flowState = 'stale';
        }

        ctx.updatePlayer({
          stuck: this.dimensions.stuck.value,
          anxious: this.dimensions.anxious.value,
          consecutiveWrong: this.counters.consecutiveWrong,
          totalCorrect: this.counters.totalCorrect,
          totalWrong: this.counters.totalWrong,
          // flow 和 combo 主要由 ComboSystem 写入，这里做兜底同步
          // 只有当 ComboSystem 不可用时才用感知层的值
        });

        // 如果 GameContext 的 flow 还是 cold 但感知层有 flow，同步过去
        // （ComboSystem 是主写入方，感知层做补充）
        if (flowState !== 'cold' && ctx.player.flow === 'cold') {
          ctx.player.flow = flowState;
        }
      } catch (e) {
        // 静默失败，避免感知层影响游戏主循环
        if (console && console.warn) {
          console.warn('[PlayerStateMonitor] _syncToGameContext error:', e);
        }
      }
    }

    /**
     * 触发决策引擎评估（节流版）
     * 最小间隔 500ms，避免频繁触发导致性能问题
     */
    _triggerDecisionIfReady() {
      try {
        const now = Date.now();
        if (!this._lastDecisionTriggerTime) {
          this._lastDecisionTriggerTime = 0;
        }
        // 500ms 节流
        if (now - this._lastDecisionTriggerTime < 500) return;
        this._lastDecisionTriggerTime = now;

        // 通过全局 DecisionEngine 触发
        // 优先使用 expertSystem.decision.evaluateFromContext()
        if (global.ExpertSystem && global.ExpertSystem.decision &&
            typeof global.ExpertSystem.decision.evaluateFromContext === 'function') {
          global.ExpertSystem.decision.evaluateFromContext();
          return;
        }

        // 降级：直接调用 DecisionEngine 的 evaluateFromContext
        if (global.DecisionEngine && global._decisionEngineInstance &&
            typeof global._decisionEngineInstance.evaluateFromContext === 'function') {
          global._decisionEngineInstance.evaluateFromContext();
        }
      } catch (e) {
        // 静默失败
        if (console && console.warn) {
          console.warn('[PlayerStateMonitor] _triggerDecisionIfReady error:', e);
        }
      }
    }
  }

  global.PlayerStateMonitor = PlayerStateMonitor;
})(window);
