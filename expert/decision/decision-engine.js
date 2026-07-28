// DecisionEngine - Decision Layer
// Rules engine that generates commands from player state

;(function(global) {
  'use strict';

  class DecisionEngine {
    constructor(config = {}) {
      this._lastDecision = null;
      this._coolDownMap = {};
      this._levelActive = false;

      // 盘面尺寸（影响动态阈值）
      this.gridSize = config.gridSize || 9;

      // Default (base) thresholds
      this._baseCoolDowns = {
        stuck_guide: config.stuckCooldown || 30000,
        anxiety_cooldown: config.anxietyCooldown || 15000,
        flow_encouragement: config.flowCooldown || 10000,
        teaching_nudge: config.teachingCooldown || 60000,
        eureka_burst: config.eurekaCooldown || 30000,
        progress_milestone: config.progressCooldown || 5000,
        // 自动提示冷却
        auto_hint_stuck: config.autoHintStuckCooldown || 60000,
        auto_hint_anxiety: config.autoHintAnxietyCooldown || 45000,
        auto_hint_flow_drop: config.autoHintFlowDropCooldown || 90000,
        auto_hint_novice: config.autoHintNoviceCooldown || 30000,
      };

      // Current active cooldowns (may be adjusted dynamically)
      this.coolDowns = { ...this._baseCoolDowns };

      // Dynamic threshold state
      this._dynamicConfig = {
        enabled: config.dynamicThresholds !== false,
        playerLevel: 'intermediate', // novice / intermediate / advanced
        levelsCompleted: config.levelsCompleted || 0,
      };

      // Reference to learning system (optional, for proficiency-based adjustment)
      this._learningSystem = null;

      this._rules = this._buildRules();
    }

    _buildRules() {
      return [
        {
          id: 'teaching_trigger',
          priority: 100,
          check: (s) => s.isStuck && s.consecutiveWrong >= 2,
          action: 'SHOW_DIALOG',
          payload: { dialogId: 'stuck_guide' },
          cooldownKey: 'teaching_nudge',
        },
        {
          id: 'eureka_burst',
          priority: 90,
          check: (s) => s.consecutiveCorrect >= (s.eurekaCount || 8) && s.inFlowState,
          action: 'EUREKA',
          payload: { level: 3, message: '连击爆发！' },
          cooldownKey: 'eureka_burst',
        },
        // === 规则 A：卡住自动提示 ===
        // 玩家真的卡住了，主动递一个提示（L1 观察级）
        {
          id: 'auto_hint_stuck',
          priority: 85,
          check: (s) => {
            if (!s.isStuck) return false;
            if (!s.hintCooldown) return false;
            // 卡住持续 >= 60秒
            if ((s.stuckDuration || 0) < 60000) return false;
            // 提示冷却已过
            if (!s.hintCooldown.canAutoHint) return false;
            return true;
          },
          action: 'TRIGGER_HINT',
          payload: { hintLevel: 1, reason: 'stuck', character: 'ayan' },
          cooldownKey: 'auto_hint_stuck',
        },
        {
          id: 'stuck_guide',
          priority: 80,
          check: (s) => s.isStuck,
          action: 'SHOW_TOAST',
          payload: { message: '需要提示吗？试试换个角度看盘面。' },
          cooldownKey: 'stuck_guide',
        },
        // === 规则 B：焦虑自动提示 ===
        // 玩家越错越急，给个提示帮他稳住（L1 或 L2）
        {
          id: 'auto_hint_anxiety',
          priority: 75,
          check: (s) => {
            if (!s.isAnxious) return false;
            if (!s.hintCooldown) return false;
            // 连续错误 >= 3次
            if (s.consecutiveWrong < 3) return false;
            // 提示冷却已过
            if (!s.hintCooldown.canAutoHint) return false;
            return true;
          },
          action: 'TRIGGER_HINT',
          payload: {
            hintLevel: (s) => s.consecutiveWrong >= 5 ? 2 : 1,
            reason: 'anxiety',
            character: 'cagekeeper',
          },
          cooldownKey: 'auto_hint_anxiety',
        },
        {
          id: 'anxiety_cooldown',
          priority: 70,
          check: (s) => s.isAnxious,
          action: 'SHOW_TOAST',
          payload: { message: '别急，慢慢来。错误是学习的一部分。' },
          cooldownKey: 'anxiety_cooldown',
        },
        // === 规则 D：新手保护提示 ===
        // 新手第一次遇到困难技巧，主动教学（L1 观察级，更详细）
        {
          id: 'auto_hint_novice',
          priority: 65,
          check: (s) => {
            // 玩家等级判定：总正确数 < 20 视为新手
            if (s.totalCorrect > 20) return false;
            if (!s.isStuck) return false;
            if (!s.hintCooldown) return false;
            // 卡住 30秒以上
            if ((s.stuckDuration || 0) < 30000) return false;
            // 提示冷却已过
            if (!s.hintCooldown.canAutoHint) return false;
            return true;
          },
          action: 'TRIGGER_HINT',
          payload: { hintLevel: 1, reason: 'novice', character: 'ying', isNovice: true },
          cooldownKey: 'auto_hint_novice',
        },
        {
          id: 'flow_encouragement',
          priority: 60,
          check: (s) => s.consecutiveCorrect >= Math.max(3, Math.floor((s.eurekaCount || 8) * 0.625)) && s.inFlowState,
          action: 'SHOW_TOAST',
          payload: { message: '心流状态！继续保持！' },
          cooldownKey: 'flow_encouragement',
        },
        // === 规则 C：心流减弱提示 ===
        // 心流断了，轻轻推一把（Toast 鼓励 + 暗示方向）
        {
          id: 'auto_hint_flow_drop',
          priority: 50,
          check: (s) => {
            // 曾经进入过心流（flowDepth > 0 但当前不在 flow）
            if (s.inFlowState) return false;
            if ((s.flowDepth || 0) <= 0) return false;
            // 当前有点卡住（但还没到 stuck 状态）
            if (!s.isStuck) return false;
            if ((s.stuckDuration || 0) < 20000) return false;
            return true;
          },
          action: 'SHOW_TOAST',
          payload: {
            message: '刚才能感很好，继续那个思路试试？',
            level: 'encourage',
            character: 'ayan',
          },
          cooldownKey: 'auto_hint_flow_drop',
        },
        {
          id: 'progress_milestone',
          priority: 30,
          check: (s) => s.totalCorrect > 0 && s.totalCorrect % 10 === 0,
          action: 'SHOW_TOAST',
          payload: { message: '已完成 10 个数字！' },
          cooldownKey: 'progress_milestone',
        },
      ];
    }

    /**
     * Set the learning system reference for proficiency-based adjustments.
     */
    setLearningSystem(learningSystem) {
      this._learningSystem = learningSystem;
    }

    /**
     * Adjust thresholds dynamically based on player state and learning data.
     * Called before each decision cycle to adapt cooldowns and thresholds.
     *
     * @param {Object} state - player state from PlayerStateMonitor
     * @returns {Object} adjusted thresholds that should be applied to perception layer
     */
    adjustThresholds(state) {
      if (!this._dynamicConfig.enabled) {
        return null;
      }

      // Start from base values
      const adjusted = { ...this._baseCoolDowns };

      // --- Factor 1: Player level (long-term adaptation)
      const levelFactor = this._getLevelFactor();

      // --- Factor 2: Real-time state (short-term adaptation)
      const stateMultipliers = this._getStateMultipliers(state);

      // --- Factor 3: Learning proficiency (when learning system available)
      const proficiencyFactor = this._getProficiencyFactor();

      // Apply combined adjustments to each cooldown
      for (const key of Object.keys(adjusted)) {
        let value = adjusted[key];

        // Apply level factor
        value = value * levelFactor.cooldownMultiplier;

        // Apply state-specific multipliers
        if (key === 'stuck_guide' || key === 'teaching_nudge') {
          value = value * stateMultipliers.stuckGuide;
        }
        if (key === 'anxiety_cooldown') {
          value = value * stateMultipliers.anxiety;
        }
        if (key === 'flow_encouragement' || key === 'eureka_burst') {
          value = value * stateMultipliers.encouragement;
        }
        // 自动提示相关冷却
        if (key === 'auto_hint_stuck') {
          value = value * stateMultipliers.stuckGuide;
        }
        if (key === 'auto_hint_anxiety') {
          value = value * stateMultipliers.anxiety;
        }
        if (key === 'auto_hint_flow_drop') {
          value = value * stateMultipliers.encouragement;
        }
        if (key === 'auto_hint_novice') {
          value = value * stateMultipliers.stuckGuide * 0.8; // 新手提示更频繁
        }

        // Apply proficiency adjustment
        value = value * proficiencyFactor.cooldownMultiplier;

        adjusted[key] = Math.round(value);
      }

      this.coolDowns = adjusted;

      // Return perception threshold adjustments for the caller to apply
      return {
        stuckMs: Math.round(
          (state.stuckMs || 45000) * levelFactor.stuckMultiplier * stateMultipliers.stuckTime,
        ),
        anxiousErrorCount: Math.max(
          2,
          Math.round((state.anxiousErrorCount || 3) * stateMultipliers.anxietyThreshold),
        ),
        flowCount: Math.max(
          2,
          Math.round((state.flowCount || 3) * proficiencyFactor.flowThreshold),
        ),
      };
    }

    /**
     * Get level-based adjustment factors.
     * 新手期 (novice, 0-3 levels): shorter cooldowns, faster stuck detection
     * 成长期 (intermediate, 4-10 levels): gradual increase
     * 熟练期 (advanced, 10+ levels): default thresholds
     */
    _getLevelFactor() {
      let cooldownMultiplier = 1.0;
      let stuckMultiplier = 1.0;
      const levels = this._dynamicConfig.levelsCompleted;
      const explicitLevel = this._dynamicConfig.playerLevel;

      if (levels === 0 && explicitLevel) {
        // Explicit level set by user, no levelsCompleted to infer from
        if (explicitLevel === 'novice') {
          cooldownMultiplier = 0.5;
          stuckMultiplier = 0.6;
        } else if (explicitLevel === 'intermediate') {
          cooldownMultiplier = 0.75;
          stuckMultiplier = 0.8;
        } else {
          cooldownMultiplier = 1.0;
          stuckMultiplier = 1.0;
        }
      } else {
        // Auto-detect from levelsCompleted
        if (levels <= 3) {
          cooldownMultiplier = 0.5;
          stuckMultiplier = 0.6;
          this._dynamicConfig.playerLevel = 'novice';
        } else if (levels <= 10) {
          // Gradual transition: 0.5 at level 4, 1.0 at level 10
          const t = (levels - 3) / 7;
          cooldownMultiplier = 0.5 + t * 0.5;
          stuckMultiplier = 0.6 + t * 0.4;
          this._dynamicConfig.playerLevel = 'intermediate';
        } else {
          cooldownMultiplier = 1.0;
          stuckMultiplier = 1.0;
          this._dynamicConfig.playerLevel = 'advanced';
        }
      }

      return { cooldownMultiplier, stuckMultiplier };
    }

    /**
     * Get real-time state-based multipliers.
     * - Flow state: reduce encouragement frequency, increase stuck time
     * - Anxious / consecutive wrong: shorter cooldowns, more encouragement
     * - Stuck / long idle: delayed hints but not intrusive
     */
    _getStateMultipliers(state) {
      let stuckGuide = 1.0;
      let anxiety = 1.0;
      let encouragement = 1.0;
      let stuckTime = 1.0;
      let anxietyThreshold = 1.0;

      // Flow state: player is doing well, less encouragement, more patience
      if (state.inFlowState) {
        encouragement = 1.5;      // less frequent encouragement
        stuckTime = 1.3;             // take longer to consider "stuck"
        stuckGuide = 1.3;            // less frequent stuck hints
      }

      // Consecutive wrong: player is struggling, more support
      if (state.consecutiveWrong >= 2) {
        anxiety = 0.5;             // more frequent anxiety support
        stuckGuide = 0.6;           // faster stuck hints come sooner
        encouragement = 0.7;               // more encouragement
        anxietyThreshold = 0.7;       // easier to trigger anxiety
      }

      // Heavy struggle
      // (state.is && state.consecutiveWrong >= 3: even more support
      if (state.consecutiveWrong >= 3) {
        anxiety = 0.4;
        stuckGuide = 0.5;
      }

      // High consecutive correct (but not yet flow): steady encouragement
      if (state.consecutiveCorrect >= 3 && !state.inFlowState) {
        encouragement = 0.8;
      }

      return {
        stuckGuide,
        anxiety,
        encouragement,
        stuckTime,
        anxietyThreshold,
      };
    }

    /**
     * Get proficiency-based factors from learning system.
     * Higher proficiency = higher starting hint levels (more含蓄).
     */
    _getProficiencyFactor() {
      let cooldownMultiplier = 1.0;
      let flowThreshold = 1.0;

      if (this._learningSystem) {
        const style = this._learningSystem.getStyle();
        const accuracy = this._learningSystem._data ?
          (this._learningSystem._data.totalFills > 0 ?
            this._learningSystem._data.correctFills / this._learningSystem._data.totalFills :
            0.5) :
          0.5;

        // Precise players need less hand-holding
        if (style.value === 'precise') {
          cooldownMultiplier = 1.2;
          flowThreshold = 0.8;
        } else if (style.value === 'experimental') {
          cooldownMultiplier = 0.8;
          flowThreshold = 1.2;
        } else if (style.value === 'cautious') {
          cooldownMultiplier = 0.9;
        }

        // Overall accuracy adjusts baseline
        if (accuracy > 0.9) {
          cooldownMultiplier *= 1.1;
        } else if (accuracy < 0.6) {
          cooldownMultiplier *= 0.8;
        }
      }

      return { cooldownMultiplier, flowThreshold };
    }

    /**
     * Update the number of completed levels for level-based adjustment.
     */
    setLevelsCompleted(count) {
      this._dynamicConfig.levelsCompleted = count;
    }

    /**
     * Set player level explicitly (novice' / 'intermediate' / 'advanced').
     */
    setPlayerLevel(level) {
      this._dynamicConfig.playerLevel = level;
      this._dynamicConfig.levelsCompleted = 0; // use explicit level instead
    }

    /**
     * 设置盘面尺寸，用于动态调整冷却时间和规则阈值
     * 小盘面冷却时间更短，因为游戏节奏更快
     * @param {number} size
     */
    setGridSize(size) {
      this.gridSize = size;

      // 首次调用时保存原始基础冷却时间
      if (!this._originalBaseCoolDowns) {
        this._originalBaseCoolDowns = { ...this._baseCoolDowns };
      }

      // 根据盘面尺寸计算比例
      let ratio = 1.0;
      if (size <= 4) {
        ratio = 0.6; // 4x4：冷却更短
      } else if (size === 6) {
        ratio = 0.8; // 6x6：适度缩短
      } else {
        ratio = 1.0; // 9x9：标准
      }

      // 应用比例到基础冷却
      for (const key of Object.keys(this._originalBaseCoolDowns)) {
        this._baseCoolDowns[key] = Math.round(this._originalBaseCoolDowns[key] * ratio);
      }
      this.coolDowns = { ...this._baseCoolDowns };
    }

    /**
     * Enable or disable dynamic threshold adjustment.
     */
    setDynamicThresholdsEnabled(enabled) {
      this._dynamicConfig.enabled = enabled;
      if (!enabled) {
        this.coolDowns = { ...this._baseCoolDowns };
      }
    }

    onLevelStart() {
      this._levelActive = true;
      this._coolDownMap = {};
      this._lastDecision = null;
    }

    onLevelEnd() {
      this._levelActive = false;
    }

    decide(state) {
      if (!this._levelActive) return [];

      const commands = [];
      const now = Date.now();

      for (const rule of this._rules) {
        if (!rule.check(state)) continue;

        const lastTime = this._coolDownMap[rule.id] || 0;
        const coolDown = this.coolDowns[rule.cooldownKey] || 10000;
        if (now - lastTime < coolDown) continue;

        this._coolDownMap[rule.id] = now;

        // 处理动态 payload：如果 payload 的值是函数，传入 state 计算
        const payload = {};
        if (rule.payload) {
          for (const key of Object.keys(rule.payload)) {
            const val = rule.payload[key];
            payload[key] = typeof val === 'function' ? val(state) : val;
          }
        }

        commands.push({
          target: 'ExpressionDirector',
          action: rule.action,
          priority: rule.priority,
          payload,
        });

        // High priority rules stop processing
        if (rule.priority >= 80) break;
      }

      this._lastDecision = commands.length > 0 ? commands[0] : null;
      return commands;
    }

    /**
     * 从 GameContext 读取状态进行决策
     * 这是五层联动的主入口：感知层/ComboSystem 写入 GameContext → 触发此方法
     * 同时执行"行动型"规则（如 AI 速度调整）
     * @returns {Array} 决策命令列表
     */
    evaluateFromContext() {
      try {
        const ctx = global.GameContext;
        if (!ctx || !ctx.player) return [];

        if (!this._levelActive) return [];

        const player = ctx.player;
        const level = ctx.level;

        // 构建兼容旧版 state 对象（向后兼容现有规则）
        const state = {
          isStuck: player.stuck,
          stuckDuration: player.stuck ? 60000 : 0, // 简化值，感知层有更精确的数据
          isAnxious: player.anxious,
          anxiousDuration: player.anxious ? 5000 : 0,
          inFlowState: player.flow === 'flow' || player.flow === 'eureka',
          flowDepth: player.combo,
          consecutiveCorrect: player.combo,
          consecutiveWrong: player.consecutiveWrong,
          totalCorrect: player.totalCorrect,
          totalWrong: player.totalWrong,
          eurekaCount: this.gridSize <= 4 ? 4 : (this.gridSize === 6 ? 6 : 8),
          gridSize: this.gridSize,
          hintCooldown: {
            canAutoHint: this._canAutoHintFromContext(),
          },
          // 三幕式信息
          act: level.act,
          isBossBattle: level.isBossBattle,
        };

        // 执行行动型规则（直接作用于游戏，不经表达层）
        this._executeActionRules(player, level);

        // 执行表达型规则（经表达层输出）
        return this.decide(state);
      } catch (e) {
        console.warn('[DecisionEngine] evaluateFromContext error:', e);
        return [];
      }
    }

    /**
     * 从 GameContext 推断自动提示是否可用
     * @returns {boolean}
     */
    _canAutoHintFromContext() {
      try {
        // 如果有感知层实例，用它的精确判断
        if (global.ExpertSystem && global.ExpertSystem.perception &&
            typeof global.ExpertSystem.perception.canAutoHint === 'function') {
          return global.ExpertSystem.perception.canAutoHint();
        }
        // 降级：简单基于提示次数判断
        return true;
      } catch (e) {
        return true;
      }
    }

    /**
     * 执行行动型规则（不经过表达层，直接改变游戏参数）
     * 目前包括：AI 速度调整
     * @param {Object} player - GameContext.player
     * @param {Object} level - GameContext.level
     */
    _executeActionRules(player, level) {
      // 行动型规则只在 Boss 战中生效（非 Boss 战没有 AI）
      if (!level.isBossBattle) return;

      const now = Date.now();
      const ctx = global.GameContext;

      // --- 规则 1：EUREKA 驱动 AI 加速 ---
      // flow === 'eureka' 时，AI 速度 ×1.2
      const eurekaKey = 'ai_speed_eureka';
      if (player.flow === 'eureka') {
        if (!ctx.isInCooldown(eurekaKey + '_active')) {
          this._applyAISpeedMultiplier(1.2, 'eureka');
          ctx.setCooldown(eurekaKey + '_active', 8000); // 8秒内不重复触发
          ctx.setCooldown(eurekaKey + '_applied', 8000); // 标记正在生效
        }
      } else {
        // 退出 eureka 状态且生效期已过，重置
        if (ctx.isInCooldown(eurekaKey + '_applied')) {
          // 等冷却自然过期后由定时器清理
        }
      }

      // --- 规则 2：心流驱动 AI 加速 ---
      // flow === 'flow' && combo >= 10 时，AI 速度 ×1.1
      const flowKey = 'ai_speed_flow';
      if (player.flow === 'flow' && player.combo >= 10) {
        if (!ctx.isInCooldown(flowKey + '_active')) {
          this._applyAISpeedMultiplier(1.1, 'flow');
          ctx.setCooldown(flowKey + '_active', 10000); // 10秒内不重复触发
          ctx.setCooldown(flowKey + '_applied', 10000);
        }
      }

      // --- 规则 3：焦虑时 AI 减速 ---
      // anxious === true && consecutiveWrong >= 3 时，AI 速度 ×0.7
      const anxietyKey = 'ai_speed_anxiety';
      if (player.anxious && player.consecutiveWrong >= 3) {
        if (!ctx.isInCooldown(anxietyKey + '_active')) {
          this._applyAISpeedMultiplier(0.7, 'anxiety');
          ctx.setCooldown(anxietyKey + '_active', 12000); // 12秒内不重复触发
          ctx.setCooldown(anxietyKey + '_applied', 12000);
        }
      }
    }

    /**
     * 应用 AI 速度调整（调用全局函数）
     * @param {number} factor - 速度倍率
     * @param {string} reason - 调整原因
     */
    _applyAISpeedMultiplier(factor, reason) {
      try {
        if (typeof global._setAISpeedMultiplier === 'function') {
          // 持续时间根据 reason 不同而不同
          const durations = {
            eureka: 8000,
            flow: 10000,
            anxiety: 12000,
          };
          const duration = durations[reason] || 8000;
          global._setAISpeedMultiplier(factor, reason, duration);
        }
      } catch (e) {
        console.warn('[DecisionEngine] _applyAISpeedMultiplier error:', e);
      }
    }
  }

  global.DecisionEngine = DecisionEngine;
})(window);
