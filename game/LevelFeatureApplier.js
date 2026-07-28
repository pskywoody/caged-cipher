// ==========================================
//  LevelFeatureApplier - 关卡特性应用器
// ==========================================
//  从 guide.js 抽离，物理分离，逻辑不变
//  负责应用关卡特性（工具栏按钮显隐、高亮控制、自动填充等）
// ==========================================

;(function(global) {
  'use strict';

  class LevelFeatureApplier {
    /**
     * @param {Object} deps - 依赖注入
     * @param {Function} deps.getCurrentLevelData - 获取当前关卡数据
     * @param {Function} deps.getCurrentLevelId - 获取当前关卡ID
     * @param {Function} deps.getRenderer - 获取渲染器
     * @param {Function} deps.getBoard - 获取棋盘对象
     * @param {Function} deps.getSettingsPanel - 获取设置面板
     * @param {Function} deps.getNoteMode - 获取笔记模式状态
     * @param {Function} deps.setNoteMode - 设置笔记模式状态
     * @param {Function} deps.updateNoteButtonState - 更新笔记按钮状态
     */
    constructor(deps = {}) {
      this._getCurrentLevelData = deps.getCurrentLevelData || (() => null);
      this._getCurrentLevelId = deps.getCurrentLevelId || (() => '');
      this._getRenderer = deps.getRenderer || (() => null);
      this._getBoard = deps.getBoard || (() => null);
      this._getSettingsPanel = deps.getSettingsPanel || (() => null);
      this._getNoteMode = deps.getNoteMode || (() => false);
      this._setNoteMode = deps.setNoteMode || (() => {});
      this._updateNoteButtonState = deps.updateNoteButtonState || (() => {});
    }

    /**
     * 应用关卡特性（渐进式功能解锁）
     * 包括：工具栏按钮显隐、高亮控制、自动填充候选数等
     */
    apply() {
      const currentLevelData = this._getCurrentLevelData();
      if (!currentLevelData || !currentLevelData.features) return;
      const f = currentLevelData.features;

      // 1. 控制工具栏按钮显隐
      // 笔记按钮
      const btnNote = document.getElementById('btn-note');
      if (btnNote) {
        if (f.allowDraft === false) {
          btnNote.style.display = 'none';
          // 隐藏时退出笔记模式
          if (this._getNoteMode()) {
            this._setNoteMode(false);
            this._updateNoteButtonState();
          }
        } else {
          btnNote.style.display = '';
        }
      }

      // 提示按钮
      const btnHint = document.getElementById('btn-hint');
      if (btnHint) {
        btnHint.style.display = (f.showHints === false) ? 'none' : '';
      }

      // 45法则按钮（201关起解锁）
      const btnRule45 = document.getElementById('btn-rule45');
      if (btnRule45) {
        const levelIdNum = parseInt(this._getCurrentLevelId());
        const rule45Unlocked = levelIdNum >= 201;
        if (f.assistant45 === false || !rule45Unlocked) {
          btnRule45.style.display = 'none';
        } else {
          btnRule45.style.display = '';
        }
      }

      // 2. 控制高亮（调用 renderer.setHighlightOptions）
      const renderer = this._getRenderer();
      if (renderer && typeof renderer.setHighlightOptions === 'function') {
        renderer.setHighlightOptions({
          highlightRow: f.highlightRow !== false,
          highlightCol: f.highlightCol !== false,
          highlightBox: f.highlightBox !== false,
          highlightNumber: f.highlightNumber !== false,
          highlightCage: f.highlightCage !== false,
        });
      }

      // 3. 控制自动填充候选数（受全局设置控制，默认关闭）
      // 忽略关卡级 autoFillCandidates 特性，统一由玩家在设置中手动开启
      const settingsPanel = this._getSettingsPanel();
      const shouldAutoFill = settingsPanel && settingsPanel.get
        ? settingsPanel.get('game.autoFillCandidates')
        : false;

      if (shouldAutoFill === true) {
        const noteSys = window.gameNoteSystem || global.guideNoteSystem;
        if (noteSys) {
          if (typeof noteSys._autoFillTheoreticalCandidates === 'function') {
            noteSys._autoFillTheoreticalCandidates();
          } else if (typeof noteSys.autoFill === 'function') {
            noteSys.autoFill();
          }
        } else {
          const board = this._getBoard();
          if (board && typeof board.autoFillCandidates === 'function') {
            board.autoFillCandidates();
          } else if (typeof autoFillCandidates === 'function') {
            autoFillCandidates();
          }
        }
        // 触发重绘
        if (renderer) {
          renderer.forceRender = true;
          renderer.render(this._getBoard());
        }
      }
    }
  }

  // 暴露到全局
  global.LevelFeatureApplier = LevelFeatureApplier;

})(window);
