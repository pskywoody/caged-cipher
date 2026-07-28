// ============================================================
//  PerformanceMonitor.js - 性能监控与画质自动降级
//  P2-3：低端设备性能降级（FPS检测 + 自动降画质）
//
//  功能：
//    - 实时 FPS 检测（基于 requestAnimationFrame）
//    - 三级画质：high / medium / low
//    - 自动降级与回升（带防抖动 hysteresis）
//    - 首次启动快速检测（3秒）
//    - 手动覆盖（用户选择优先于自动检测）
//    - 画质变化回调（供 renderer / UI 订阅）
// ============================================================

(function(global) {
  'use strict';

  const PerformanceMonitor = {
    // ===== 状态 =====
    fps: 60,
    fpsHistory: [],           // 最近 N 帧的 FPS 值
    avgFps: 60,
    qualityLevel: 'high',     // high | medium | low
    isLowEndDevice: false,
    manualOverride: null,     // null=自动, 'high'|'medium'|'low'=手动

    // ===== 内部状态 =====
    _running: false,
    _rafId: null,
    _lastFrameTime: 0,
    _frameCount: 0,
    _lastFpsUpdateTime: 0,
    _consecutiveLowFrames: 0, // 连续低帧数（用于降级判定）
    _consecutiveHighFrames: 0,// 连续高帧数（用于回升判定）
    _initialDetectionDone: false,
    _initialDetectionStartTime: 0,
    _initialFpsSamples: [],
    _qualityChangeCallbacks: [],
    _fpsUpdateCallbacks: [],

    // ===== 配置 =====
    config: {
      sampleSize: 30,              // 采样帧数（用于计算平均 FPS）
      lowFpsThreshold: 30,         // 低于此 FPS 判定为卡顿（降为 low）
      mediumFpsThreshold: 45,      // 低于此 FPS 降为 medium
      highFpsThreshold: 55,        // 高于此 FPS 可升回 high
      mediumRecoverThreshold: 50,  // 从 low 升回 medium 的阈值
      checkInterval: 5000,         // 常规检测间隔（ms）
      consecutiveLowFrames: 10,    // 连续多少帧低 FPS 才降级
      hysteresisFrames: 20,        // 回升需要多少帧才升级（防抖动）
      initialDetectionDuration: 3000, // 首次快速检测时长（ms）
      initialLowThreshold: 30,     // 首次检测 low 阈值
      initialMediumThreshold: 50,  // 首次检测 medium 阈值
      minQualityChangeInterval: 10000, // 两次画质切换最小间隔（ms），防频繁抖动
    },

    _lastQualityChangeTime: 0,

    // ===== 公共 API =====

    /**
     * 开始性能监控
     * @param {Object} [options] - 可选配置覆盖
     */
    start(options) {
      if (this._running) return;

      if (options && options.config) {
        Object.assign(this.config, options.config);
      }

      this._running = true;
      this._lastFrameTime = performance.now();
      this._lastFpsUpdateTime = performance.now();
      this._frameCount = 0;
      this.fpsHistory = [];
      this.avgFps = 60;
      this.fps = 60;
      this._consecutiveLowFrames = 0;
      this._consecutiveHighFrames = 0;
      this._initialDetectionDone = false;
      this._initialDetectionStartTime = performance.now();
      this._initialFpsSamples = [];
      this._lastQualityChangeTime = 0;

      this._tickLoop();
    },

    /**
     * 停止性能监控
     */
    stop() {
      this._running = false;
      if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
    },

    /**
     * 每帧调用（在 rAF 循环中）
     * 外部也可以手动调用此方法来注入帧时间
     */
    tick() {
      const now = performance.now();
      const delta = now - this._lastFrameTime;
      this._lastFrameTime = now;

      // 计算当前帧 FPS（防止除零和异常值）
      const instantFps = delta > 0 ? Math.min(120, 1000 / delta) : 60;
      this.fps = instantFps;

      // 加入历史队列
      this.fpsHistory.push(instantFps);
      if (this.fpsHistory.length > this.config.sampleSize) {
        this.fpsHistory.shift();
      }

      // 计算平均 FPS
      this._frameCount++;

      // 定期更新平均 FPS 和检测画质
      const elapsedSinceUpdate = now - this._lastFpsUpdateTime;
      if (elapsedSinceUpdate >= 500) { // 每 500ms 计算一次平均
        this._updateAvgFps();
        this._lastFpsUpdateTime = now;

        // 首次快速检测
        if (!this._initialDetectionDone) {
          this._initialFpsSamples.push(this.avgFps);
          const initialElapsed = now - this._initialDetectionStartTime;
          if (initialElapsed >= this.config.initialDetectionDuration) {
            this._doInitialDetection();
            this._initialDetectionDone = true;
          }
        }

        // 首次检测完成后，才进行常规自动检测（且非手动覆盖）
        if (this._initialDetectionDone && !this.manualOverride) {
          this._detectQuality();
        }

        // 通知 FPS 更新回调
        this._notifyFpsUpdate();
      }
    },

    /**
     * 获取当前平均 FPS
     * @returns {number}
     */
    getAvgFps() {
      return this.avgFps;
    },

    /**
     * 获取当前画质等级
     * @returns {string} 'high' | 'medium' | 'low'
     */
    getQualityLevel() {
      return this.qualityLevel;
    },

    /**
     * 是否为低端设备判定
     * @returns {boolean}
     */
    getIsLowEndDevice() {
      return this.isLowEndDevice;
    },

    /**
     * 注册画质变化回调
     * @param {Function} callback - (newLevel, oldLevel) => void
     */
    onQualityChange(callback) {
      if (typeof callback === 'function') {
        this._qualityChangeCallbacks.push(callback);
      }
    },

    /**
     * 移除画质变化回调
     * @param {Function} callback
     */
    offQualityChange(callback) {
      const idx = this._qualityChangeCallbacks.indexOf(callback);
      if (idx >= 0) {
        this._qualityChangeCallbacks.splice(idx, 1);
      }
    },

    /**
     * 注册 FPS 更新回调（每 500ms 触发一次）
     * @param {Function} callback - (avgFps, currentFps) => void
     */
    onFpsUpdate(callback) {
      if (typeof callback === 'function') {
        this._fpsUpdateCallbacks.push(callback);
      }
    },

    /**
     * 手动设置画质等级（覆盖自动检测）
     * @param {string|null} level - 'high'|'medium'|'low'|null（null=恢复自动）
     */
    setQualityLevel(level) {
      if (level === null || level === 'auto') {
        this.manualOverride = null;
        // 恢复自动后，重置连续计数，避免立即又触发切换
        this._consecutiveLowFrames = 0;
        this._consecutiveHighFrames = 0;
        this._lastQualityChangeTime = performance.now();
        return;
      }

      if (['high', 'medium', 'low'].indexOf(level) === -1) return;

      this.manualOverride = level;
      this._setQuality(level, 'manual');
    },

    /**
     * 获取当前模式：auto / manual
     * @returns {string}
     */
    getMode() {
      return this.manualOverride ? 'manual' : 'auto';
    },

    /**
     * 重置为自动模式
     */
    resetToAuto() {
      this.setQualityLevel(null);
    },

    // ===== 内部方法 =====

    /**
     * rAF 主循环
     */
    _tickLoop() {
      if (!this._running) return;

      this.tick();

      this._rafId = requestAnimationFrame(() => {
        this._tickLoop();
      });
    },

    /**
     * 更新平均 FPS
     */
    _updateAvgFps() {
      if (this.fpsHistory.length === 0) {
        this.avgFps = 60;
        return;
      }
      const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
      this.avgFps = Math.round((sum / this.fpsHistory.length) * 10) / 10;
    },

    /**
     * 首次快速检测
     * 根据前 3 秒的平均 FPS 直接判定初始画质
     */
    _doInitialDetection() {
      if (this._initialFpsSamples.length === 0) return;

      const avg = this._initialFpsSamples.reduce((a, b) => a + b, 0)
        / this._initialFpsSamples.length;

      let initialLevel = 'high';
      if (avg < this.config.initialLowThreshold) {
        initialLevel = 'low';
        this.isLowEndDevice = true;
      } else if (avg < this.config.initialMediumThreshold) {
        initialLevel = 'medium';
      }

      if (initialLevel !== this.qualityLevel) {
        this._setQuality(initialLevel, 'initial-detection');
      }
    },

    /**
     * 检测画质等级（自动模式）
     * 带防抖动：降级需要连续低帧，升级需要连续高帧
     */
    _detectQuality() {
      const now = performance.now();
      const avg = this.avgFps;
      const current = this.qualityLevel;

      // 限制切换频率，防抖动
      if (now - this._lastQualityChangeTime < this.config.minQualityChangeInterval) {
        return;
      }

      // ---- 降级判定 ----
      if (current === 'high' && avg < this.config.mediumFpsThreshold) {
        this._consecutiveLowFrames++;
        this._consecutiveHighFrames = 0;
        if (this._consecutiveLowFrames >= this.config.consecutiveLowFrames) {
          this._setQuality('medium', 'auto-downgrade');
          this._consecutiveLowFrames = 0;
        }
        return;
      }

      if (current === 'medium' && avg < this.config.lowFpsThreshold) {
        this._consecutiveLowFrames++;
        this._consecutiveHighFrames = 0;
        if (this._consecutiveLowFrames >= this.config.consecutiveLowFrames) {
          this._setQuality('low', 'auto-downgrade');
          this._consecutiveLowFrames = 0;
          this.isLowEndDevice = true;
        }
        return;
      }

      // ---- 回升判定 ----
      if (current === 'low' && avg > this.config.mediumRecoverThreshold) {
        this._consecutiveHighFrames++;
        this._consecutiveLowFrames = 0;
        if (this._consecutiveHighFrames >= this.config.hysteresisFrames) {
          this._setQuality('medium', 'auto-upgrade');
          this._consecutiveHighFrames = 0;
        }
        return;
      }

      if (current === 'medium' && avg > this.config.highFpsThreshold) {
        this._consecutiveHighFrames++;
        this._consecutiveLowFrames = 0;
        if (this._consecutiveHighFrames >= this.config.hysteresisFrames) {
          this._setQuality('high', 'auto-upgrade');
          this._consecutiveHighFrames = 0;
        }
        return;
      }

      // 帧率在正常区间，重置计数器
      if (avg >= this.config.mediumFpsThreshold && avg <= this.config.highFpsThreshold) {
        this._consecutiveLowFrames = 0;
        this._consecutiveHighFrames = 0;
      }
    },

    /**
     * 设置画质等级并触发回调
     * @param {string} newLevel - 新等级
     * @param {string} reason - 切换原因
     */
    _setQuality(newLevel, reason) {
      const oldLevel = this.qualityLevel;
      if (newLevel === oldLevel) return;

      this.qualityLevel = newLevel;
      this._lastQualityChangeTime = performance.now();

      // 通知回调
      for (let i = 0; i < this._qualityChangeCallbacks.length; i++) {
        try {
          this._qualityChangeCallbacks[i](newLevel, oldLevel, reason);
        } catch (e) {
          console.error('[PerformanceMonitor] quality change callback error:', e);
        }
      }

      if (typeof console !== 'undefined' && console.info) {
        console.info(
          '[PerformanceMonitor] Quality change: ' + oldLevel + ' -> ' + newLevel +
          ' (reason: ' + reason + ', avgFps: ' + this.avgFps + ')'
        );
      }
    },

    /**
     * 通知 FPS 更新
     */
    _notifyFpsUpdate() {
      for (let i = 0; i < this._fpsUpdateCallbacks.length; i++) {
        try {
          this._fpsUpdateCallbacks[i](this.avgFps, this.fps);
        } catch (e) {
          // 静默失败
        }
      }
    },
  };

  // 暴露到全局
  global.PerformanceMonitor = PerformanceMonitor;

})(typeof window !== 'undefined' ? window : this);
