// PcLayoutManager.js - PC 双栏布局切换管理器
// 从 pages/guide.js 抽离，物理分离，逻辑不变

;(function(global) {
  'use strict';

  /**
   * PC 布局管理器
   * 负责在 PC 宽屏时将棋盘等元素切换到双栏布局
   */
  class PcLayoutManager {
    constructor(deps) {
      this._isPcLayout = false;
      this._layoutResizeTimer = null;
      this._deps = deps || {};
      // 暴露到全局供 UIManager / CharBubble 使用
      Object.defineProperty(global, '_isPcLayout', {
        get: () => this._isPcLayout,
        configurable: true,
      });
    }

    /**
     * 检测当前是否应该使用 PC 双栏布局
     * 规则：宽度 >= 900px 且横屏
     */
    isPcLayoutActive() {
      return window.innerWidth >= 900 && window.innerWidth > window.innerHeight;
    }

    /**
     * 切换到 PC 双栏布局
     * 将 canvas 从移动端容器移动到 PC 左侧战区
     */
    switchToPcLayout() {
      if (this._isPcLayout) return;

      const canvas = document.getElementById('gameCanvas');
      const longPressHalo = document.getElementById('long-press-halo');
      const hintBubble = document.getElementById('hint-narration-bubble');
      const comboUIContainer = document.getElementById('combo-ui-container');
      const threeActIndicator = document.getElementById('three-act-indicator');
      const climaxOverlay = document.getElementById('climax-overlay');
      const pcBoardContainer = document.getElementById('pc-board-container');
      const mobileBoardArea = document.getElementById('board-area');

      if (!canvas || !pcBoardContainer) return;

      // 移动 canvas 到 PC 左侧战区
      pcBoardContainer.appendChild(canvas);
      // 移动提示气泡到 PC 棋盘容器内
      if (hintBubble) {
        pcBoardContainer.appendChild(hintBubble);
      }
      // 移动连击UI到 PC 棋盘容器内
      if (comboUIContainer) {
        pcBoardContainer.appendChild(comboUIContainer);
      }
      // 移动三幕指示灯到 PC 棋盘容器内
      if (threeActIndicator) {
        pcBoardContainer.appendChild(threeActIndicator);
      }
      // 移动通关高潮动画到 PC 棋盘容器内（限制在棋盘区域）
      if (climaxOverlay) {
        pcBoardContainer.appendChild(climaxOverlay);
      }
      // 移动角色气泡到 PC 棋盘容器内（如果正在显示）
      const CharBubble = this._deps.CharBubble || global.CharBubble;
      const bubbleEl = CharBubble ? CharBubble.getElement() : null;
      if (bubbleEl && bubbleEl.parentNode) {
        pcBoardContainer.appendChild(bubbleEl);
      }
      if (longPressHalo) {
        longPressHalo.style.display = 'none';
      }

      // 标记 PC 布局已激活
      this._isPcLayout = true;
      document.body.classList.add('pc-layout-active');

      // 触发 renderer 重新计算尺寸
      const renderer = this._deps.renderer || global.renderer;
      const board = this._deps.board || global.board;
      if (renderer && board) {
        renderer.recalcCellSize(board);
        renderer.render(board);
      }

      const log = this._deps.log || global.log;
      if (log && log.info) {
        log.info('[Layout] 切换到 PC 双栏布局');
      }
    }

    /**
     * 切换到移动端布局
     * 将 canvas 从 PC 容器移回移动端原位置
     */
    switchToMobileLayout() {
      if (!this._isPcLayout) return;

      const canvas = document.getElementById('gameCanvas');
      const longPressHalo = document.getElementById('long-press-halo');
      const hintBubble = document.getElementById('hint-narration-bubble');
      const comboUIContainer = document.getElementById('combo-ui-container');
      const threeActIndicator = document.getElementById('three-act-indicator');
      const climaxOverlay = document.getElementById('climax-overlay');
      const pcBoardContainer = document.getElementById('pc-board-container');
      const mobileBoardArea = document.getElementById('board-area');

      if (!canvas || !mobileBoardArea) return;

      // 移动 canvas 回移动端原位置（插入到 halo 之前）
      if (longPressHalo) {
        mobileBoardArea.insertBefore(canvas, longPressHalo);
        longPressHalo.style.display = '';
      } else {
        mobileBoardArea.appendChild(canvas);
      }
      // 移动提示气泡回移动端棋盘区域
      if (hintBubble) {
        mobileBoardArea.appendChild(hintBubble);
      }
      // 移动连击UI回移动端棋盘区域
      if (comboUIContainer) {
        mobileBoardArea.appendChild(comboUIContainer);
      }
      // 移动三幕指示灯回移动端棋盘区域
      if (threeActIndicator) {
        mobileBoardArea.appendChild(threeActIndicator);
      }
      // 移动通关高潮动画回 body（全屏）
      if (climaxOverlay) {
        document.body.appendChild(climaxOverlay);
      }
      // 移动角色气泡回 body（如果正在显示）
      const CharBubble = this._deps.CharBubble || global.CharBubble;
      const bubbleElMobile = CharBubble ? CharBubble.getElement() : null;
      if (bubbleElMobile && bubbleElMobile.parentNode) {
        document.body.appendChild(bubbleElMobile);
      }

      // 清除标记
      this._isPcLayout = false;
      document.body.classList.remove('pc-layout-active');

      // 触发 renderer 重新计算尺寸
      const renderer = this._deps.renderer || global.renderer;
      const board = this._deps.board || global.board;
      if (renderer && board) {
        renderer.recalcCellSize(board);
        renderer.render(board);
      }

      const log = this._deps.log || global.log;
      if (log && log.info) {
        log.info('[Layout] 切换到移动端布局');
      }
    }

    /**
     * 根据当前视口尺寸自动切换布局
     */
    updateLayout() {
      const shouldBePc = this.isPcLayoutActive();
      if (shouldBePc && !this._isPcLayout) {
        this.switchToPcLayout();
      } else if (!shouldBePc && this._isPcLayout) {
        this.switchToMobileLayout();
      }
    }

    /**
     * 同步 45法则 数据到 PC 端面板（转发到 UIManager）
     */
    syncRule45ToPc() {
      const UIManager = this._deps.UIManager || global.UIManager;
      return UIManager._syncRule45ToPc();
    }

    /**
     * 同步 What If 快照数据到 PC 端面板
     */
    syncWhatIfToPc() {
      if (!this._isPcLayout) return;

      // 同步快照计数
      const badge = document.getElementById('float-bar-tab-badge');
      const pcCount = document.getElementById('pc-whatif-count');
      if (pcCount) {
        const count = badge && badge.style.display !== 'none' ? parseInt(badge.textContent) || 0 : 0;
        pcCount.textContent = '分支 ' + count + '/3';
      }

      // 同步快照卡片（克隆移动端卡片）
      const mobileCards = document.getElementById('snapshot-cards');
      const pcCards = document.getElementById('pc-snapshot-cards');
      if (mobileCards && pcCards) {
        // 简单同步：克隆 DOM 结构
        // （实际复杂同步在后续迭代中完善）
      }
    }

    /**
     * 同步计时器到 PC 面板
     */
    syncTimerToPc() {
      if (!this._isPcLayout) return;

      const mobileTimer = document.getElementById('game-timer-display');
      const pcTimer = document.getElementById('pc-timer-display');
      if (mobileTimer && pcTimer) {
        pcTimer.textContent = mobileTimer.textContent;
      }
    }

    /**
     * 同步提示次数到 PC 面板
     */
    syncHintsToPc(count) {
      if (!this._isPcLayout) return;

      const pcHints = document.getElementById('pc-hints-left');
      if (pcHints) {
        pcHints.textContent = count !== undefined ? count : '—';
      }
    }

    /**
     * 初始化 PC 端按钮事件（复用现有移动端处理函数）
     */
    initPcButtons() {
      // PC 端工具栏按钮 —— 点击时触发对应移动端按钮的点击事件
      const buttonMappings = [
        ['pc-btn-undo', 'btn-undo'],
        ['pc-btn-erase', 'btn-erase'],
        ['pc-btn-note', 'btn-note'],
        ['pc-btn-whatif', 'btn-whatif'],
        ['pc-btn-hint', 'btn-hint'],
        ['pc-btn-dict', 'btn-tech-matrix'], // 字典按钮映射到技术矩阵
      ];

      buttonMappings.forEach(function(mapping) {
        const pcBtn = document.getElementById(mapping[0]);
        const mobileBtn = document.getElementById(mapping[1]);
        if (pcBtn && mobileBtn) {
          pcBtn.addEventListener('click', function(e) {
            e.preventDefault();
            mobileBtn.click();
          });
        }
      });

      // PC 端 What If 操作按钮
      const whatIfMappings = [
        ['pc-btn-whatif-accept', 'btn-whatif-accept'],
        ['pc-btn-whatif-undo', 'btn-whatif-undo'],
        ['pc-btn-whatif-reset', 'btn-whatif-reset'],
      ];

      whatIfMappings.forEach(function(mapping) {
        const pcBtn = document.getElementById(mapping[0]);
        const mobileBtn = document.getElementById(mapping[1]);
        if (pcBtn && mobileBtn) {
          pcBtn.addEventListener('click', function(e) {
            e.preventDefault();
            mobileBtn.click();
          });
        }
      });

      // PC 端数字键盘 —— 点击时触发对应移动端数字按钮
      const pcNumButtons = document.querySelectorAll('#pc-num-pad .num-btn');
      pcNumButtons.forEach(function(pcBtn) {
        const num = pcBtn.getAttribute('data-num');
        pcBtn.addEventListener('click', function(e) {
          e.preventDefault();
          const mobileBtn = document.querySelector('#num-pad .num-btn[data-num="' + num + '"]');
          if (mobileBtn) mobileBtn.click();
        });
      });
    }

    /**
     * 同步工具栏按钮激活状态到 PC 端
     */
    syncToolbarState() {
      if (!this._isPcLayout) return;

      const stateMappings = [
        ['btn-note', 'pc-btn-note'],
        ['btn-whatif', 'pc-btn-whatif'],
      ];

      stateMappings.forEach(function(mapping) {
        const mobileBtn = document.getElementById(mapping[0]);
        const pcBtn = document.getElementById(mapping[1]);
        if (mobileBtn && pcBtn) {
          if (mobileBtn.classList.contains('active')) {
            pcBtn.classList.add('active');
          } else {
            pcBtn.classList.remove('active');
          }
        }
      });
    }

    /**
     * 同步数字键盘状态到 PC 端
     */
    syncNumPadState() {
      if (!this._isPcLayout) return;

      const mobileBtns = document.querySelectorAll('#num-pad .num-btn');
      mobileBtns.forEach(function(mobileBtn) {
        const num = mobileBtn.getAttribute('data-num');
        const pcBtn = document.querySelector('#pc-num-pad .num-btn[data-num="' + num + '"]');
        if (pcBtn) {
          // 同步 active/completed 状态
          pcBtn.classList.toggle('active', mobileBtn.classList.contains('active'));
          pcBtn.classList.toggle('completed', mobileBtn.classList.contains('completed'));
          pcBtn.classList.toggle('quick-fill-num', mobileBtn.classList.contains('quick-fill-num'));
          pcBtn.classList.toggle('long-pressing', mobileBtn.classList.contains('long-pressing'));
          // 同步数字计数
          const mobileCount = mobileBtn.querySelector('.num-count');
          const pcCount = pcBtn.querySelector('.num-count');
          if (mobileCount && pcCount) {
            pcCount.textContent = mobileCount.textContent;
          }
        }
      });
    }

    /**
     * 初始化事件监听（resize / orientationchange / DOMContentLoaded）
     */
    initEventListeners() {
      const self = this;
      const renderer = this._deps.renderer || global.renderer;
      const board = this._deps.board || global.board;

      // 监听 resize 事件，防抖处理布局切换
      window.addEventListener('resize', function() {
        if (self._layoutResizeTimer) {
          clearTimeout(self._layoutResizeTimer);
        }
        self._layoutResizeTimer = setTimeout(function() {
          self.updateLayout();
          // 布局切换后重新计算 canvas 尺寸
          const r = self._deps.renderer || global.renderer;
          const b = self._deps.board || global.board;
          if (r && b) {
            r.recalcCellSize(b);
            r.render(b);
          }
        }, 150);
      });

      // 监听 orientationchange
      window.addEventListener('orientationchange', function() {
        setTimeout(function() {
          self.updateLayout();
          const r = self._deps.renderer || global.renderer;
          const b = self._deps.board || global.board;
          if (r && b) {
            r.recalcCellSize(b);
            r.render(b);
          }
        }, 200);
      });

      // 页面加载后初始化布局检测
      document.addEventListener('DOMContentLoaded', function() {
        // 初始化 PC 端按钮事件
        self.initPcButtons();
        // 检测初始布局
        self.updateLayout();
      });
    }

    /** 返回当前是否为 PC 布局 */
    isPcLayout() {
      return this._isPcLayout;
    }
  }

  // 暴露到全局
  global.PcLayoutManager = PcLayoutManager;

})(window);
