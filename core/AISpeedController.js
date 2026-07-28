// ============================================================
//  AISpeedController.js - AI 速度控制器
//  全局 AI 速度调整，通过 GameContext → GuideBattle 的链路调整 AI 速度倍率
// ============================================================

(function(global) {
  'use strict';

  /**
   * 设置 AI 速度倍率
   * 速度倍率按 reason 独立管理，多个 reason 叠加相乘
   * @param {number} factor - 速度倍率（<1 变慢，>1 变快）
   * @param {string} reason - 调整原因（用于独立追踪和重置）
   * @param {number} durationMs - 持续时间（毫秒），到期自动恢复
   * @param {Object} [options] - 可选配置
   * @param {Object} [options.log] - Logger 实例
   */
  function setAISpeedMultiplier(factor, reason, durationMs, options = {}) {
    try {
      if (!global.GameContext) {
        console.warn('[AISpeed] GameContext 未初始化，跳过速度调整');
        return;
      }

      const ctx = global.GameContext;
      const log = options.log;

      // 确保 _aiSpeedModifiers 存在
      if (!ctx._aiSpeedModifiers) {
        ctx._aiSpeedModifiers = {};
      }

      // 设置该 reason 的倍率
      ctx._aiSpeedModifiers[reason] = {
        factor: factor,
        expiry: durationMs ? Date.now() + durationMs : 0,
      };

      // 计算总倍率
      let totalFactor = _calcTotalFactor(ctx);
      totalFactor = Math.max(0.3, Math.min(2.0, totalFactor));

      // 如果有活跃的 Boss 战，应用到 GuideBattle
      if (typeof guideBattle !== 'undefined' && guideBattle && guideBattle.active) {
        if (typeof guideBattle.setContextSpeedMultiplier === 'function') {
          guideBattle.setContextSpeedMultiplier(totalFactor, reason);
        }
      }

      if (log) {
        log.info('[AISpeed] 速度调整 reason=' + reason +
          ' factor=' + factor.toFixed(2) +
          ' total=' + totalFactor.toFixed(2) +
          ' duration=' + (durationMs || 'infinite'));
      }

      // 如果设置了持续时间，到期后自动清除并重算
      if (durationMs && durationMs > 0) {
        setTimeout(() => {
          try {
            resetAISpeedMultiplier(reason, options);
          } catch (e) {
            console.warn('[AISpeed] auto-reset error:', e);
          }
        }, durationMs);
      }
    } catch (e) {
      console.warn('[AISpeed] setAISpeedMultiplier error:', e);
    }
  }

  /**
   * 重置某个原因的 AI 速度倍率
   * @param {string} reason - 要重置的调整原因
   * @param {Object} [options] - 可选配置
   * @param {Object} [options.log] - Logger 实例
   */
  function resetAISpeedMultiplier(reason, options = {}) {
    try {
      if (!global.GameContext || !global.GameContext._aiSpeedModifiers) {
        return;
      }

      const ctx = global.GameContext;
      const log = options.log;
      delete ctx._aiSpeedModifiers[reason];

      let totalFactor = _calcTotalFactor(ctx);
      totalFactor = Math.max(0.3, Math.min(2.0, totalFactor));

      if (typeof guideBattle !== 'undefined' && guideBattle && guideBattle.active) {
        if (typeof guideBattle.setContextSpeedMultiplier === 'function') {
          guideBattle.setContextSpeedMultiplier(totalFactor, 'reset_' + reason);
        }
      }

      if (log) {
        log.info('[AISpeed] 速度重置 reason=' + reason + ' total=' + totalFactor.toFixed(2));
      }
    } catch (e) {
      console.warn('[AISpeed] resetAISpeedMultiplier error:', e);
    }
  }

  /**
   * 计算总倍率（内部函数）
   */
  function _calcTotalFactor(ctx) {
    let totalFactor = 1.0;
    for (const key in ctx._aiSpeedModifiers) {
      const mod = ctx._aiSpeedModifiers[key];
      // 检查是否过期
      if (mod.expiry > 0 && Date.now() > mod.expiry) {
        delete ctx._aiSpeedModifiers[key];
        continue;
      }
      totalFactor *= mod.factor;
    }
    return totalFactor;
  }

  // 导出到全局
  global.AISpeedController = {
    setMultiplier: setAISpeedMultiplier,
    resetMultiplier: resetAISpeedMultiplier,
  };

  // 向后兼容：全局函数
  global._setAISpeedMultiplier = function(factor, reason, durationMs) {
    return setAISpeedMultiplier(factor, reason, durationMs, { log: global.guideLog || console });
  };
  global._resetAISpeedMultiplier = function(reason) {
    return resetAISpeedMultiplier(reason, { log: global.guideLog || console });
  };

})(window);
