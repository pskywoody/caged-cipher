// ==========================================
//  ComboUIController - 连击 UI 控制器
// ==========================================
//  从 guide.js 抽离，物理分离，逻辑不变
//  管理 #combo-ui-container DOM 结构：
//    - 心流状态指示器 (flow-state-indicator)
//    - 连击数字 (combo-ui-number)
//    - 连击标签 (combo-ui-label)
//    - 连击时间条 (combo-gauge-container)
//    - 里程碑覆盖层 (milestone-overlay)
//    - 断连覆盖层 (combo-break-overlay)
//
//  与 ComboSystem (game/combo-system.js) 配合使用：
//  ComboSystem 负责连击逻辑 + 内部简陋UI
//  ComboUIController 负责精致版 DOM UI 渲染
// ==========================================

;(function(global) {
  'use strict';

  // 心流状态文本映射
  const FLOW_STATE_TEXT = {
    cold: '冷场',
    stale: '预热',
    flow: '心流',
    eureka: 'EUREKA!',
  };

  // 连击等级配置（对应 tier 类名）
  const COMBO_TIERS = [
    { threshold: 1,  tier: 'tier-1' },
    { threshold: 3,  tier: 'tier-2' },
    { threshold: 5,  tier: 'tier-3' },
    { threshold: 8,  tier: 'tier-4' },
    { threshold: 10, tier: 'tier-eureka' },
  ];

  class ComboUIController {
    /**
     * @param {Object} options
     * @param {Object} options.comboSystem - ComboSystem 实例（可选，可后续绑定）
     * @param {number} options.comboWindowMs - 连击窗口时间（默认 10000ms）
     */
    constructor(options = {}) {
      this._comboSystem = options.comboSystem || null;
      this._comboWindowMs = options.comboWindowMs || 10000;

      // DOM 元素缓存
      this._container = null;
      this._flowIndicator = null;
      this._flowText = null;
      this._numberEl = null;
      this._labelEl = null;
      this._gaugeContainer = null;
      this._gaugeFill = null;
      this._milestoneOverlay = null;
      this._breakOverlay = null;

      // 状态
      this._currentCombo = 0;
      this._currentFlowState = 'cold';
      this._gaugeInterval = null;
      this._gaugeStartTime = 0;

      // 自动初始化（如果 DOM 已就绪）
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this._initDOM());
      } else {
        this._initDOM();
      }
    }

    // ============================================================
    // DOM 初始化
    // ============================================================

    _initDOM() {
      this._container = document.getElementById('combo-ui-container');
      this._flowIndicator = document.getElementById('flow-state-indicator');
      this._flowText = document.getElementById('flow-state-text');
      this._numberEl = document.getElementById('combo-ui-number');
      this._labelEl = document.getElementById('combo-ui-label');
      this._gaugeContainer = document.getElementById('combo-gauge-container');
      this._gaugeFill = document.getElementById('combo-gauge-fill');
      this._milestoneOverlay = document.getElementById('milestone-overlay');
      this._breakOverlay = document.getElementById('combo-break-overlay');
    }

    // ============================================================
    // ComboSystem 绑定
    // ============================================================

    /**
     * 绑定到 ComboSystem 实例，监听其变化
     * @param {Object} comboSystem - ComboSystem 实例
     */
    bindComboSystem(comboSystem) {
      if (!comboSystem) return;
      this._comboSystem = comboSystem;

      // 保存原始回调
      const origOnComboChange = comboSystem.onComboChange;
      const origOnMilestone = comboSystem.onMilestone;
      const origOnBreak = comboSystem.onBreak;
      const origOnFlowStateChange = comboSystem.onFlowStateChange;

      // 包装 onComboChange
      comboSystem.onComboChange = (count) => {
        this._onComboChange(count);
        if (typeof origOnComboChange === 'function') {
          origOnComboChange.call(comboSystem, count);
        }
      };

      // 包装 onMilestone
      comboSystem.onMilestone = (level, milestone) => {
        this.showMilestone(level, milestone);
        if (typeof origOnMilestone === 'function') {
          origOnMilestone.call(comboSystem, level, milestone);
        }
      };

      // 包装 onBreak
      comboSystem.onBreak = () => {
        this._onComboBreak();
        if (typeof origOnBreak === 'function') {
          origOnBreak.call(comboSystem);
        }
      };

      // 包装 onFlowStateChange
      comboSystem.onFlowStateChange = (state, depth) => {
        this._onFlowStateChange(state, depth);
        if (typeof origOnFlowStateChange === 'function') {
          origOnFlowStateChange.call(comboSystem, state, depth);
        }
      };

      // 同步 comboWindowMs
      if (comboSystem.comboWindowMs) {
        this._comboWindowMs = comboSystem.comboWindowMs;
      }
    }

    // ============================================================
    // 事件处理
    // ============================================================

    _onComboChange(count) {
      this._currentCombo = count;
      this._updateNumber(count);
      this._updateTier(count);
      this._updateVisibility(count > 1);

      if (count > 1) {
        this._startGauge();
      } else {
        this._stopGauge();
      }
    }

    _onComboBreak() {
      this._showBreakOverlay();
      this._stopGauge();
    }

    _onFlowStateChange(state, depth) {
      this._currentFlowState = state;
      this._updateFlowIndicator(state);
    }

    // ============================================================
    // UI 更新方法
    // ============================================================

    _updateVisibility(show) {
      if (!this._container) return;
      if (show) {
        this._container.classList.add('show');
      } else {
        this._container.classList.remove('show');
      }
    }

    _updateNumber(count) {
      if (!this._numberEl) return;
      this._numberEl.textContent = count;

      // 弹跳动画
      this._numberEl.classList.remove('pop');
      // 强制重排
      void this._numberEl.offsetWidth;
      this._numberEl.classList.add('pop');
    }

    _updateTier(count) {
      if (!this._numberEl) return;

      // 移除所有 tier 类
      COMBO_TIERS.forEach(t => this._numberEl.classList.remove(t.tier));

      // 找到当前等级
      let currentTier = COMBO_TIERS[0].tier;
      for (let i = COMBO_TIERS.length - 1; i >= 0; i--) {
        if (count >= COMBO_TIERS[i].threshold) {
          currentTier = COMBO_TIERS[i].tier;
          break;
        }
      }
      this._numberEl.classList.add(currentTier);
    }

    _updateFlowIndicator(state) {
      if (!this._flowIndicator) return;

      // 移除所有状态类
      this._flowIndicator.classList.remove('state-cold', 'state-stale', 'state-flow', 'state-eureka');
      this._flowIndicator.classList.add('state-' + state);

      if (this._flowText) {
        this._flowText.textContent = FLOW_STATE_TEXT[state] || state;
      }
    }

    // ============================================================
    // Gauge 进度条（连击窗口倒计时）
    // ============================================================

    _startGauge() {
      if (!this._gaugeFill) return;

      this._stopGauge();
      this._gaugeStartTime = Date.now();

      // 立即设置为满格
      this._gaugeFill.style.width = '100%';
      this._gaugeFill.classList.remove('warning');
      if (this._gaugeContainer) {
        this._gaugeContainer.classList.remove('break');
      }

      // 启动更新
      this._gaugeInterval = setInterval(() => {
        const elapsed = Date.now() - this._gaugeStartTime;
        const remaining = Math.max(0, this._comboWindowMs - elapsed);
        const pct = (remaining / this._comboWindowMs) * 100;

        this._gaugeFill.style.width = pct + '%';

        // 低于 30% 时警告色
        if (pct < 30) {
          this._gaugeFill.classList.add('warning');
        } else {
          this._gaugeFill.classList.remove('warning');
        }

        if (remaining <= 0) {
          this._stopGauge();
        }
      }, 50);
    }

    _stopGauge() {
      if (this._gaugeInterval) {
        clearInterval(this._gaugeInterval);
        this._gaugeInterval = null;
      }
    }

    /**
     * 手动刷新 gauge（每次正确填数后调用）
     */
    refreshGauge() {
      if (this._currentCombo > 1) {
        this._startGauge();
      }
    }

    // ============================================================
    // 里程碑显示
    // ============================================================

    /**
     * 显示里程碑效果
     * @param {number} level - 里程碑等级
     * @param {Object} milestone - 里程碑配置 { key, label, sfx, vibrate }
     */
    showMilestone(level, milestone) {
      if (!this._milestoneOverlay) return;
      if (!milestone) return;

      // 更新里程碑标签
      const labelEl = this._milestoneOverlay.querySelector('.milestone-label');
      if (labelEl) {
        labelEl.textContent = milestone.label || (level + '连击');
      }

      // 添加 eureka 特殊样式
      if (milestone.key === 'eureka') {
        this._milestoneOverlay.classList.add('eureka');
      } else {
        this._milestoneOverlay.classList.remove('eureka');
      }

      // 显示
      this._milestoneOverlay.classList.add('show');

      // 自动隐藏
      clearTimeout(this._milestoneTimeout);
      this._milestoneTimeout = setTimeout(() => {
        this._milestoneOverlay.classList.remove('show');
        this._milestoneOverlay.classList.remove('eureka');
      }, 1500);
    }

    // ============================================================
    // 断连效果
    // ============================================================

    _showBreakOverlay() {
      if (!this._breakOverlay) return;

      this._breakOverlay.classList.add('show');

      // gauge 断连样式
      if (this._gaugeContainer) {
        this._gaugeContainer.classList.add('break');
      }

      clearTimeout(this._breakTimeout);
      this._breakTimeout = setTimeout(() => {
        this._breakOverlay.classList.remove('show');
        if (this._gaugeContainer) {
          this._gaugeContainer.classList.remove('break');
        }
      }, 800);
    }

    // ============================================================
    // 公开 API
    // ============================================================

    /**
     * 设置连击数（外部手动设置，用于初始化或同步）
     */
    setCombo(count) {
      this._onComboChange(count);
    }

    /**
     * 设置心流状态
     */
    setFlowState(state) {
      this._onFlowStateChange(state);
    }

    /**
     * 清理
     */
    cleanup() {
      this._stopGauge();

      // 隐藏容器
      if (this._container) {
        this._container.classList.remove('show');
      }

      // 重置心流指示器
      if (this._flowIndicator) {
        this._flowIndicator.classList.remove('state-stale', 'state-flow', 'state-eureka');
        this._flowIndicator.classList.add('state-cold');
      }
      if (this._flowText) {
        this._flowText.textContent = '冷场';
      }

      // 重置 gauge
      if (this._gaugeFill) {
        this._gaugeFill.style.width = '100%';
        this._gaugeFill.classList.remove('warning');
      }
      if (this._gaugeContainer) {
        this._gaugeContainer.classList.remove('break');
      }

      // 隐藏里程碑覆盖层
      if (this._milestoneOverlay) {
        this._milestoneOverlay.classList.remove('show', 'eureka');
      }

      // 隐藏断连覆盖层
      if (this._breakOverlay) {
        this._breakOverlay.classList.remove('show');
      }

      // 重置数字
      if (this._numberEl) {
        this._numberEl.textContent = '0';
        COMBO_TIERS.forEach(t => this._numberEl.classList.remove(t.tier));
        this._numberEl.classList.add('tier-1');
      }

      this._currentCombo = 0;
      this._currentFlowState = 'cold';

      // 清除定时器
      clearTimeout(this._milestoneTimeout);
      clearTimeout(this._breakTimeout);
    }

    /**
     * 获取容器元素（用于响应式布局中移动位置）
     */
    get container() {
      return this._container;
    }
  }

  // 暴露到全局
  global.ComboUIController = ComboUIController;

})(typeof window !== 'undefined' ? window : this);
