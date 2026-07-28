// GameContext.js - 中央状态系统（五层联动核心基础设施）
// 统一的游戏状态容器，打通"感知→决策→行动"完整数据流
// 所有层级通过 window.GameContext 读写共享状态
// 从 guide.js 抽离：物理分离，逻辑不变

;(function(global) {
  'use strict';

  /**
   * 创建 GameContext 中央状态对象
   * @param {Object} [options] - 可选配置
   * @param {Object} [options.logger] - 日志对象（需有 info 方法）
   * @returns {Object} GameContext 实例
   */
  function createGameContext(options = {}) {
    const log = options.logger || { info: () => {} };

    const GameContext = {
      // === 玩家状态（感知层写入）===
      player: {
        combo: 0,
        flow: 'cold',           // cold | stale | flow | eureka
        stuck: false,
        anxious: false,
        consecutiveWrong: 0,
        totalCorrect: 0,
        totalWrong: 0,
        lastActionTime: 0,
        hintUsageCount: 0,
      },
      // === 关卡状态（三幕式/游戏循环写入）===
      level: {
        act: 1,                 // 1 | 2 | 3
        simpleFilled: 0,
        simpleTotal: 0,
        gateFilled: 0,
        gateTotal: 0,
        coreFilled: 0,
        coreTotal: 0,
        elapsedTime: 0,
        levelId: null,
        chapterId: null,
        isBossBattle: false,
      },
      // === 决策状态（决策层读写）===
      decision: {
        lastAction: null,
        lastActionTime: 0,
        cooldowns: {},          // { actionKey: expiryTime }
      },
      // === 学习状态（学习层读写）===
      learning: {
        style: 'balanced',      // precise | experimental | cautious | balanced
        mastery: {},            // { techniqueId: masteryLevel }
        accuracyRate: 0,
        hintUsageRate: 0,
      },

      // === 便捷方法 ===

      /**
       * 检查某个动作是否在冷却中
       * @param {string} key - 冷却键名
       * @returns {boolean}
       */
      isInCooldown(key) {
        try {
          return Date.now() < (this.decision.cooldowns[key] || 0);
        } catch (e) {
          console.warn('[GameContext] isInCooldown error:', e);
          return false;
        }
      },

      /**
       * 设置某个动作的冷却时间
       * @param {string} key - 冷却键名
       * @param {number} ms - 冷却毫秒数
       */
      setCooldown(key, ms) {
        try {
          this.decision.cooldowns[key] = Date.now() + ms;
        } catch (e) {
          console.warn('[GameContext] setCooldown error:', e);
        }
      },

      /**
       * 批量更新玩家状态
       * @param {Object} patch - 要更新的玩家状态字段
       */
      updatePlayer(patch) {
        try {
          Object.assign(this.player, patch);
          this.player.lastActionTime = Date.now();
        } catch (e) {
          console.warn('[GameContext] updatePlayer error:', e);
        }
      },

      /**
       * 批量更新关卡状态
       * @param {Object} patch - 要更新的关卡状态字段
       */
      updateLevel(patch) {
        try {
          Object.assign(this.level, patch);
        } catch (e) {
          console.warn('[GameContext] updateLevel error:', e);
        }
      },

      /**
       * 批量更新学习状态
       * @param {Object} patch - 要更新的学习状态字段
       */
      updateLearning(patch) {
        try {
          Object.assign(this.learning, patch);
        } catch (e) {
          console.warn('[GameContext] updateLearning error:', e);
        }
      },

      /**
       * 重置为新关卡初始状态
       */
      resetForNewLevel(levelInfo = {}) {
        try {
          this.player = {
            combo: 0,
            flow: 'cold',
            stuck: false,
            anxious: false,
            consecutiveWrong: 0,
            totalCorrect: 0,
            totalWrong: 0,
            lastActionTime: Date.now(),
            hintUsageCount: 0,
          };
          this.level = Object.assign({
            act: 1,
            simpleFilled: 0,
            simpleTotal: 0,
            gateFilled: 0,
            gateTotal: 0,
            coreFilled: 0,
            coreTotal: 0,
            elapsedTime: 0,
            levelId: null,
            chapterId: null,
            isBossBattle: false,
          }, levelInfo);
          this.decision = {
            lastAction: null,
            lastActionTime: 0,
            cooldowns: {},
          };
          log.info('[GameContext] 已重置为新关卡状态, levelId:', levelInfo.levelId || 'unknown');
        } catch (e) {
          console.warn('[GameContext] resetForNewLevel error:', e);
        }
      },

      /**
       * 获取完整状态快照（用于调试/日志）
       * @returns {Object}
       */
      snapshot() {
        try {
          return {
            player: { ...this.player },
            level: { ...this.level },
            decision: {
              lastAction: this.decision.lastAction,
              lastActionTime: this.decision.lastActionTime,
              cooldownCount: Object.keys(this.decision.cooldowns).length,
            },
            learning: {
              style: this.learning.style,
              accuracyRate: this.learning.accuracyRate,
              hintUsageRate: this.learning.hintUsageRate,
              masteryCount: Object.keys(this.learning.mastery).length,
            },
          };
        } catch (e) {
          console.warn('[GameContext] snapshot error:', e);
          return {};
        }
      },
    };

    log.info('[GameContext] 中央状态系统已初始化');
    return GameContext;
  }

  // 暴露到全局
  global.GameContext = null; // 初始为 null，由 initGameContext 赋值
  global.createGameContext = createGameContext;

  /**
   * 初始化并挂载 GameContext 到全局
   * 向后兼容：替代 guide.js 中的 _initGameContext()
   * @param {Object} [options] - 可选配置
   * @returns {Object} GameContext 实例
   */
  global.initGameContext = function(options) {
    const ctx = createGameContext(options);
    global.GameContext = ctx;
    return ctx;
  };

})(typeof window !== 'undefined' ? window : this);
