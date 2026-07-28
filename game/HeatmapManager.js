// ==========================================
//  HeatmapManager - 热力图管理器
// ==========================================
//  从 guide.js 抽离，物理分离，逻辑不变
//  负责热力图的预加载、显示切换和调试功能
// ==========================================

;(function(global) {
  'use strict';

  class HeatmapManager {
    /**
     * @param {Object} deps - 依赖注入
     * @param {Function} deps.getBoard - 获取棋盘对象
     * @param {Function} deps.getRenderer - 获取渲染器
     * @param {Function} deps.getCurrentLevelData - 获取当前关卡数据
     * @param {Function} deps.getCurrentLevelId - 获取当前关卡ID
     * @param {Function} deps.isLastLevelOfChapter - 判断是否章节最后一关（Boss战）
     * @param {Function} deps.showToast - 显示提示消息
     * @param {Object} deps.log - 日志对象
     */
    constructor(deps = {}) {
      this._getBoard = deps.getBoard || (() => null);
      this._getRenderer = deps.getRenderer || (() => null);
      this._getCurrentLevelData = deps.getCurrentLevelData || (() => null);
      this._getCurrentLevelId = deps.getCurrentLevelId || (() => null);
      this._isLastLevelOfChapter = deps.isLastLevelOfChapter || (() => false);
      this._showToast = deps.showToast || (() => {});
      this._log = deps.log || { info: () => {}, warn: () => {} };

      // 热力图是否显示（仅调试用）
      this._visible = false;
    }

    /**
     * 获取热力图是否可见
     */
    getVisible() {
      return this._visible;
    }

    /**
     * 预加载初始热力图到 WinConditionManager 缓存
     * 使用 TechRaterAdapter 生成，延迟一帧执行避免阻塞 UI 渲染
     */
    preloadPristineHeatmap() {
      const board = this._getBoard();
      const currentLevelData = this._getCurrentLevelData();
      if (!board || !currentLevelData) return;
      if (typeof WinConditionManager === 'undefined') return;
      if (typeof TechRaterAdapter === 'undefined') return;

      // 延迟到下一帧执行，避免阻塞初始渲染
      requestAnimationFrame(() => {
        // 再延迟一帧，确保 UI 完全渲染
        requestAnimationFrame(() => {
          try {
            // 用 WinConditionManager 的 getPristineHeatmap 生成并缓存
            // 它内部有缓存机制，同一关卡只会生成一次
            const isBoss = this._isLastLevelOfChapter();
            const heatmap = WinConditionManager.getPristineHeatmap(board, currentLevelData, isBoss);
            if (heatmap) {
              this._log.info('[Heatmap] 初始热力图预加载完成:', this._getCurrentLevelId());
              // 设置到 renderer 并启用三色显示
              const renderer = this._getRenderer();
              if (renderer && typeof renderer.setHeatmapData === 'function') {
                renderer.setHeatmapData(heatmap);
                // 启用热力图
                // 如果启用了三幕引导，默认第一幕（simple）模式；否则全显
                const threeActEnabled = currentLevelData.features &&
                  currentLevelData.features.threeActGuide === true;
                renderer.setHeatmapEnabled(true, 0.15);
                renderer.setThreeActMode(threeActEnabled ? 'simple' : 'all');
                renderer.render(board);
              }
            }
          } catch (e) {
            this._log.warn('[Heatmap] 预加载初始热力图失败:', e);
          }
        });
      });
    }

    /**
     * 切换热力图显示（调试用）
     * 仅在 debug 模式下可用，通过 Shift+H 触发
     */
    toggleDisplay() {
      const renderer = this._getRenderer();
      if (!renderer) return;
      if (typeof renderer.setHeatmapEnabled !== 'function') return;

      this._visible = !this._visible;

      if (this._visible) {
        // 如果还没有热力图数据，尝试获取
        if (!renderer._heatmapData) {
          try {
            const board = this._getBoard();
            const currentLevelData = this._getCurrentLevelData();
            const isBoss = this._isLastLevelOfChapter();
            const heatmap = WinConditionManager.getPristineHeatmap(board, currentLevelData, isBoss);
            if (heatmap) {
              renderer.setHeatmapData(heatmap);
            }
          } catch (e) {
            this._log.warn('[Heatmap] 获取热力图数据失败:', e);
          }
        }
        renderer.setHeatmapEnabled(true, 0.4);
        this._showToast('热力图：开');
      } else {
        renderer.setHeatmapEnabled(false);
        this._showToast('热力图：关');
      }

      // 触发重绘
      const board = this._getBoard();
      if (renderer && board) {
        renderer.render(board);
      }
    }
  }

  // 暴露到全局
  global.HeatmapManager = HeatmapManager;

})(window);
