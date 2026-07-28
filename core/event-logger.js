// EventLogger - Automatic event logging for debugging and testing
// Intercepts all GlobalBus events and logs them to console
// P3-2 Enhancement: Adds context (level/chapter/flow/combo/etc.) to every event

;(function(global) {
  'use strict';

  const _log = [];
  const MAX_LOG = 500;
  let _enabled = true;
  let _contextSource = null;
  let _eventIdCounter = 0;

  /**
   * 从上下文来源读取当前上下文快照
   * 惰性读取：只在记录事件时调用
   * 如果没有设置上下文来源或读取失败，返回 null
   * @returns {Object|null} 上下文对象
   */
  function _readContext() {
    if (!_contextSource) return null;

    try {
      const ctx = _contextSource;
      const player = ctx.player || {};
      const level = ctx.level || {};

      return {
        levelId: level.levelId != null ? level.levelId : null,
        chapterId: level.chapterId != null ? level.chapterId : null,
        act: level.act != null ? level.act : null,
        flow: player.flow || 'cold',
        combo: player.combo || 0,
        stuck: !!player.stuck,
        anxious: !!player.anxious,
        elapsedTime: level.elapsedTime || 0,
        isBossBattle: !!level.isBossBattle,
        difficulty: level.difficulty || 'normal',
      };
    } catch (e) {
      // 静默降级：读取上下文失败时返回 null
      return null;
    }
  }

  /**
   * 创建一条事件记录
   * @param {string} type - 事件类型
   * @param {*} data - 事件数据
   * @returns {Object} 事件对象
   */
  function _createEvent(type, data) {
    _eventIdCounter++;
    return {
      id: 'evt_' + _eventIdCounter + '_' + Date.now(),
      type: type,
      timestamp: Date.now(),
      data: data,
      context: _readContext(),
    };
  }

  // Intercept GlobalBus.emit
  if (global.GlobalBus) {
    const originalEmit = global.GlobalBus.emit.bind(global.GlobalBus);
    global.GlobalBus.emit = function(event, ...args) {
      if (_enabled) {
        const entry = _createEvent(event, args.length > 0 ? args : undefined);
        _log.push(entry);
        if (_log.length > MAX_LOG) _log.shift();
        console.log('[EVENT]', event, ...args);
      }
      return originalEmit(event, ...args);
    };
  }

  // Public API
  global.EventLogger = {
    /**
     * 记录一条事件
     * @param {string} eventName - 事件名称/类型
     * @param {*} data - 事件数据
     */
    log: (eventName, data) => {
      if (!_enabled) return;
      const entry = _createEvent(eventName, data);
      _log.push(entry);
      if (_log.length > MAX_LOG) _log.shift();
      console.log('[EVENT]', eventName, data);
    },

    /**
     * 设置上下文来源（GameContext 或兼容对象）
     * 设置后，每条记录的事件都会自动携带上下文
     * @param {Object} source - 上下文来源对象，需包含 player 和 level 属性
     */
    setContextSource: (source) => {
      _contextSource = source || null;
    },

    /**
     * 获取当前上下文快照（用于调试）
     * @returns {Object|null} 当前上下文对象
     */
    getContextSummary: () => {
      return _readContext();
    },

    /**
     * 获取所有事件日志（副本）
     * @returns {Array} 事件数组
     */
    getLog: () => [..._log],

    /**
     * 获取最近 N 条事件
     * @param {number} count - 条数，默认 20
     * @returns {Array} 事件数组
     */
    getRecent: (count = 20) => _log.slice(-count),

    /**
     * 按事件类型筛选
     * @param {string} eventName - 事件类型名
     * @returns {Array} 匹配的事件数组
     */
    filterByEvent: (eventName) => _log.filter(e => e.type === eventName),

    /**
     * 按事件类型筛选（P3-2 新增 API，与 filterByEvent 语义相同，命名更规范）
     * @param {string} type - 事件类型
     * @returns {Array} 匹配的事件数组
     */
    getEventsByType: (type) => _log.filter(e => e.type === type),

    /**
     * 按时间范围筛选事件
     * @param {number} start - 起始时间戳（毫秒）
     * @param {number} end - 结束时间戳（毫秒）
     * @returns {Array} 时间范围内的事件数组
     */
    getEventsInTimeRange: (start, end) => {
      const startTime = start || 0;
      const endTime = end || Date.now();
      return _log.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
    },

    /**
     * 导出所有事件为 JSON 字符串
     * @returns {string} JSON 格式的事件日志
     */
    exportEvents: () => {
      try {
        return JSON.stringify({
          exportedAt: Date.now(),
          totalCount: _log.length,
          events: _log,
        }, null, 2);
      } catch (e) {
        console.warn('[EventLogger] exportEvents failed:', e);
        return JSON.stringify({ error: 'export failed', message: e.message });
      }
    },

    /**
     * 清空日志
     */
    clear: () => { _log.length = 0; _eventIdCounter = 0; },

    /**
     * 启用日志
     */
    enable: () => { _enabled = true; },

    /**
     * 禁用日志
     */
    disable: () => { _enabled = false; },

    /**
     * 获取事件统计摘要（按类型计数）
     * @returns {Object} 类型->计数 的映射
     */
    summary: () => {
      const counts = {};
      _log.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1; });
      return counts;
    },
  };

  console.log('[EventLogger] Initialized');
})(typeof window !== 'undefined' ? window : this);
