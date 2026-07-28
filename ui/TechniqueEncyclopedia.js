// ==========================================
//  TechniqueEncyclopedia - 技巧图鉴面板
// ==========================================
//  从 guide.js 抽离，物理分离，逻辑不变
//  负责技巧百科/图鉴面板的显示、隐藏和交互
// ==========================================

;(function(global) {
  'use strict';

  class TechniqueEncyclopedia {
    /**
     * @param {Object} deps - 依赖注入
     * @param {Function} deps.getTeachingSystem - 获取教学系统实例
     * @param {Function} deps.onVisibilityChange - 可见性变化回调
     */
    constructor(deps = {}) {
      this._getTeachingSystem = deps.getTeachingSystem || (() => null);
      this._onVisibilityChange = deps.onVisibilityChange || (() => {});

      // 面板元素
      this._panelEl = null;
      // 面板是否可见
      this._visible = false;
    }

    /**
     * 获取面板是否可见
     */
    isVisible() {
      return this._visible;
    }

    /**
     * 切换技巧图鉴显示
     */
    toggle() {
      if (this._visible) {
        this.hide();
      } else {
        this.show();
      }
    }

    /**
     * 显示技巧图鉴面板
     */
    show() {
      if (this._visible) return;
      this._visible = true;

      // Get teaching system data
      const teachingSys = this._getTeachingSystem();
      const learned = teachingSys ? teachingSys.getLearnedTechniques() : [];
      const allTechniques = teachingSys ? teachingSys.getAllTechniques() : [];

      // Create panel
      const panel = document.createElement('div');
      panel.id = 'technique-encyclopedia';
      this._panelEl = panel;

      panel.style.cssText =
        'position:fixed;top:0;right:0;width:100%;max-width:420px;height:100%;' +
        'background:rgba(15,23,42,0.98);' +
        'border-left:1px solid rgba(251,191,36,0.3);' +
        'z-index:20000;' +
        'transform:translateX(100%);' +
        'transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);' +
        'display:flex;flex-direction:column;' +
        'backdrop-filter:blur(12px);';

      // Category labels
      const categoryNames = {
        basic: '基础技巧',
        intermediate: '进阶技巧',
        killer: '杀手数独',
      };

      // Mastery labels
      const masteryLabels = ['未学习', '初次见面', '略有印象', '基本掌握', '熟练运用', '融会贯通'];
      const masteryColors = ['#64748b', '#94a3b8', '#3b82f6', '#22c55e', '#f59e0b', '#fbbf24'];

      // Build technique list
      let techniquesHTML = '';
      const categories = { basic: [], intermediate: [], killer: [] };

      if (teachingSys) {
        for (const techId of allTechniques) {
          const info = teachingSys.getTechniqueInfo(techId);
          if (info && categories[info.category]) {
            categories[info.category].push(info);
          }
        }
      }

      for (const [cat, list] of Object.entries(categories)) {
        if (list.length === 0) continue;
        techniquesHTML +=
          '<div style="margin-bottom:20px;">' +
          '<div style="font-size:11px;color:#fbbf24;letter-spacing:3px;margin-bottom:8px;padding-left:4px;">' +
          (categoryNames[cat] || cat) + '</div>';
        for (const tech of list) {
          const level = tech.masteryLevel || 0;
          const pct = Math.min(100, level * 20);
          const isLocked = !tech.learned;
          techniquesHTML +=
            '<div style="' +
              'background:rgba(30,41,59,0.8);' +
              'border:1px solid ' + (isLocked ? 'rgba(100,116,139,0.2)' : 'rgba(251,191,36,0.2)') + ';' +
              'border-radius:10px;' +
              'padding:12px;' +
              'margin-bottom:8px;' +
              'opacity:' + (isLocked ? '0.5' : '1') + ';' +
            '">' +
              '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
                '<span style="font-size:14px;font-weight:700;color:' + (isLocked ? '#64748b' : '#fef3c7') + ';">' +
                  (isLocked ? '🔒 ' + '???' : tech.name) + '</span>' +
                '<span style="font-size:10px;color:' + masteryColors[level] + ';letter-spacing:1px;">' +
                  masteryLabels[level] + '</span>' +
              '</div>' +
              '<div style="font-size:11px;color:#94a3b8;line-height:1.5;margin-bottom:8px;">' +
                (isLocked ? '尚未发现此技巧' : tech.description) +
              '</div>' +
              (isLocked ? '' :
                '<div style="height:4px;background:rgba(100,116,139,0.2);border-radius:2px;overflow:hidden;">' +
                  '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,' + masteryColors[level] + ',' + masteryColors[Math.min(5, level + 1)] + ');border-radius:2px;transition:width 0.3s;"></div>' +
                '</div>' +
                '<div style="font-size:9px;color:#64748b;margin-top:4px;text-align:right;">' +
                  '遇见 ' + tech.encounterCount + ' 次 · 正确 ' + (tech.correctCount || 0) + ' 次' +
                '</div>'
              ) +
            '</div>';
        }
        techniquesHTML += '</div>';
      }

      if (learned.length === 0 && allTechniques.length === 0) {
        techniquesHTML =
          '<div style="text-align:center;color:#64748b;padding:40px 20px;">' +
          '<div style="font-size:48px;margin-bottom:16px;">📖</div>' +
          '<div style="font-size:14px;">教学系统未加载</div>' +
          '</div>';
      } else if (learned.length === 0) {
        techniquesHTML =
          '<div style="text-align:center;color:#64748b;padding:40px 20px;">' +
          '<div style="font-size:48px;margin-bottom:16px;">🔍</div>' +
          '<div style="font-size:14px;margin-bottom:8px;">还没有发现任何技巧</div>' +
          '<div style="font-size:11px;">点击提示按钮，在解谜中学习新技巧吧！</div>' +
          '</div>';
      }

      panel.innerHTML =
        // Header
        '<div style="padding:20px 20px 16px;border-bottom:1px solid rgba(251,191,36,0.2);display:flex;align-items:center;justify-content:space-between;">' +
          '<div>' +
            '<div style="font-size:18px;font-weight:900;color:#fef3c7;letter-spacing:2px;">📖 技巧图鉴</div>' +
            '<div style="font-size:11px;color:#94a3b8;margin-top:4px;">' +
              '已掌握 ' + learned.length + ' / ' + allTechniques.length + ' 种技巧' +
            '</div>' +
          '</div>' +
          '<div id="tech-panel-close" style="font-size:20px;color:#64748b;cursor:pointer;padding:4px 8px;" title="关闭">✕</div>' +
        '</div>' +
        // Content
        '<div style="flex:1;overflow-y:auto;padding:16px 20px;">' +
          techniquesHTML +
        '</div>';

      document.body.appendChild(panel);

      // Animate in
      requestAnimationFrame(() => {
        panel.style.transform = 'translateX(0)';
      });

      // Close button
      const closeBtn = panel.querySelector('#tech-panel-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          this.hide();
        });
      }

      this._onVisibilityChange(true);
    }

    /**
     * 隐藏技巧图鉴面板
     */
    hide() {
      if (!this._visible || !this._panelEl) return;
      this._visible = false;

      const panel = this._panelEl;
      panel.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (panel.parentNode) panel.remove();
      }, 300);
      this._panelEl = null;

      this._onVisibilityChange(false);
    }
  }

  // 暴露到全局
  global.TechniqueEncyclopedia = TechniqueEncyclopedia;

})(window);
