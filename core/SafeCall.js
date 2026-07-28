/**
 * ============================================================
 *  SafeCall - 安全调用工具
 * ============================================================
 *
 *  为可能卡死或抛错的操作提供超时保护和降级值。
 *  是纯工具函数，不依赖任何其他模块。
 *
 *  主要功能：
 *    - call()            安全调用同步函数（异常保护）
 *    - callWithTimeout() 同步调用 + 执行耗时警告（JS 单线程无法真正中断）
 *    - callAsync()       异步调用 + 真正的超时保护（Promise.race）
 *    - get()             安全访问嵌套属性
 *    - set()             安全设置嵌套属性
 *
 *  用法：
 *    const result = SafeCall.call(() => riskyOperation(), fallbackValue);
 *    const data = SafeCall.get(obj, 'player.combo', 0);
 *    SafeCall.set(obj, 'player.name', 'Alice');
 *
 * ============================================================
 */

;(function(global) {
  'use strict';

  const SafeCall = {
    /**
     * 安全调用同步函数
     * 捕获异常并返回降级值
     * @param {Function} fn - 要调用的函数
     * @param {*} fallback - 失败时的降级值
     * @param {Object} [options] - 配置
     * @param {string} [options.label] - 标签，用于日志标识
     * @param {boolean} [options.warn=true] - 是否输出警告日志
     * @returns {*} 函数返回值或降级值
     */
    call: function(fn, fallback, options) {
      options = options || {};
      try {
        const result = fn();
        return result !== undefined ? result : fallback;
      } catch (e) {
        if (options.warn !== false) {
          const label = options.label ? ' [' + options.label + ']' : '';
          console.warn('[SafeCall]' + label + ' 调用失败，使用降级值:', e.message);
        }
        return fallback;
      }
    },

    /**
     * 安全调用同步函数，并检测执行耗时
     * 注意：JavaScript 是单线程的，无法真正中断同步代码
     * 但可以记录执行时间，超过阈值时输出警告，用于性能监控
     * @param {Function} fn - 要调用的函数
     * @param {*} fallback - 失败时的降级值
     * @param {number} [timeoutMs=500] - 超时阈值（毫秒，仅用于警告）
     * @param {Object} [options] - 配置
     * @param {string} [options.label] - 标签，用于日志标识
     * @param {boolean} [options.warn=true] - 是否输出警告日志
     * @returns {*} 函数返回值或降级值
     */
    callWithTimeout: function(fn, fallback, timeoutMs, options) {
      options = options || {};
      timeoutMs = timeoutMs != null ? timeoutMs : 500;

      const startTime = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();

      try {
        const result = fn();
        const endTime = (typeof performance !== 'undefined' && performance.now)
          ? performance.now()
          : Date.now();
        const elapsed = endTime - startTime;

        if (elapsed > timeoutMs) {
          const label = options.label ? ' [' + options.label + ']' : '';
          console.warn(
            '[SafeCall]' + label + ' 执行耗时 ' + elapsed.toFixed(0) +
            'ms，超过阈值 ' + timeoutMs + 'ms'
          );
        }

        return result !== undefined ? result : fallback;
      } catch (e) {
        if (options.warn !== false) {
          const label = options.label ? ' [' + options.label + ']' : '';
          console.warn('[SafeCall]' + label + ' 调用失败，使用降级值:', e.message);
        }
        return fallback;
      }
    },

    /**
     * 安全调用 Promise 函数（带真正的超时保护）
     * 使用 Promise.race 实现，如果 fn() 在超时时间内未 resolve，则返回降级值
     * @param {Function} fn - 返回 Promise 的函数
     * @param {*} fallback - 失败/超时时的降级值
     * @param {number} [timeoutMs=3000] - 超时时间（毫秒）
     * @param {Object} [options] - 配置
     * @param {string} [options.label] - 标签，用于日志标识
     * @returns {Promise<*>}
     */
    callAsync: function(fn, fallback, timeoutMs, options) {
      options = options || {};
      timeoutMs = timeoutMs != null ? timeoutMs : 3000;

      let timeoutId = null;

      const timeoutPromise = new Promise(function(_, reject) {
        timeoutId = setTimeout(function() {
          reject(new Error('操作超时 (' + timeoutMs + 'ms)'));
        }, timeoutMs);
      });

      const mainPromise = (function() {
        try {
          return Promise.resolve(fn());
        } catch (e) {
          return Promise.reject(e);
        }
      })();

      return Promise.race([mainPromise, timeoutPromise])
        .then(function(result) {
          if (timeoutId) clearTimeout(timeoutId);
          return result !== undefined ? result : fallback;
        })
        .catch(function(e) {
          if (timeoutId) clearTimeout(timeoutId);
          const label = options.label ? ' [' + options.label + ']' : '';
          console.warn('[SafeCall]' + label + ' 异步调用失败，使用降级值:', e.message);
          return fallback;
        });
    },

    /**
     * 安全访问嵌套属性
     * 即使中间路径为 null/undefined 也不会抛错
     * @param {Object} obj - 目标对象
     * @param {string} path - 属性路径，如 'player.combo' 或 'data.levelScores.ch1.score'
     * @param {*} [defaultValue=undefined] - 属性不存在时的默认值
     * @returns {*} 属性值或默认值
     */
    get: function(obj, path, defaultValue) {
      if (obj == null || !path) {
        return defaultValue;
      }
      try {
        const parts = path.split('.');
        let current = obj;
        for (let i = 0; i < parts.length; i++) {
          if (current == null) return defaultValue;
          current = current[parts[i]];
        }
        return current !== undefined ? current : defaultValue;
      } catch (e) {
        return defaultValue;
      }
    },

    /**
     * 安全设置嵌套属性
     * 如果中间路径的对象不存在，会自动创建空对象
     * @param {Object} obj - 目标对象
     * @param {string} path - 属性路径
     * @param {*} value - 要设置的值
     * @returns {boolean} 是否成功
     */
    set: function(obj, path, value) {
      if (obj == null || !path) {
        return false;
      }
      try {
        const parts = path.split('.');
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (current[part] == null || typeof current[part] !== 'object') {
            current[part] = {};
          }
          current = current[part];
        }
        current[parts[parts.length - 1]] = value;
        return true;
      } catch (e) {
        console.warn('[SafeCall] 设置属性失败:', path, e.message);
        return false;
      }
    },
  };

  // 导出到全局
  global.SafeCall = SafeCall;

})(typeof window !== 'undefined' ? window : globalThis);
