// ============================================================
//  LessonUICoordinator - 教学引导 UI 协调器
// ============================================================
//  从 guide.js 抽离，物理分离，逻辑不变
//  负责教学引导的 UI 层：气泡、跳过按钮、点击提示、按钮高亮
//  教学核心逻辑在 game/lesson-player.js (LessonPlayer) 中
// ============================================================

;(function(global) {
  'use strict';

  const log = new Logger('LessonUI');

  class LessonUICoordinator {
    /**
     * @param {Object} deps - 依赖注入
     * @param {Function} deps.getBoard - 获取棋盘对象
     * @param {Function} deps.getRenderer - 获取渲染器
     * @param {Function} deps.getCurrentLevelData - 获取当前关卡数据
     * @param {Function} deps.getNoteMode - 获取笔记模式状态
     * @param {Function} deps.toggleNoteMode - 切换笔记模式
     * @param {Function} deps.recordTechniqueUsage - 记录技巧使用
     * @param {Function} deps.renderBoard - 重绘棋盘
     */
    constructor(deps = {}) {
      // 依赖
      this._getBoard = deps.getBoard || (() => null);
      this._getRenderer = deps.getRenderer || (() => null);
      this._getCurrentLevelData = deps.getCurrentLevelData || (() => null);
      this._getNoteMode = deps.getNoteMode || (() => false);
      this._toggleNoteMode = deps.toggleNoteMode || (() => {});
      this._recordTechniqueUsage = deps.recordTechniqueUsage || (() => {});
      this._renderBoard = deps.renderBoard || (() => {});

      // 状态
      this.lessonPlayer = null;       // 教学引导播放器
      this._lessonBubble = null;      // 教学气泡元素
      this._lessonSkipBtn = null;     // 跳过教学按钮
      this._lessonTapHint = null;     // "点击继续"闪烁提示
      this._lessonTapBlinkTimer = null;
      this._highlightedButtons = new Set(); // 当前高亮的按钮
      this._buttonPulseTimer = null;

      // 事件处理器（用于 removeEventListener）
      this._onLessonBubbleBound = null;
      this._onLessonHighlightButtonBound = null;
      this._bubbleClickHandler = null;
      this._skipBtnClickHandler = null;
    }

    // ============================================================
    //  公共 API
    // ============================================================

    /**
     * 启动教学引导
     */
    start() {
      if (typeof LessonPlayer === 'undefined') return false;
      const currentLevelData = this._getCurrentLevelData();
      if (!currentLevelData?.lessonPlan) return false;

      const board = this._getBoard();
      const renderer = this._getRenderer();

      // 创建 LessonPlayer 实例
      this.lessonPlayer = new LessonPlayer({
        board: board,
        renderer: renderer,
        levelData: currentLevelData,
      });

      // 注册回调
      this.lessonPlayer
        .onComplete(() => {
          log.info('[LessonPlayer] 教学完成');
          this._hideLessonSkipBtn();
          this._hideLessonBubble();
          this._hideLessonTapHint();
          this._clearAllButtonHighlights();
          // 教学完成：记录该技巧的首次使用（教学判定）
          if (global.ProgressManager && currentLevelData?.lessonPlan?.newSkill) {
            this._recordTechniqueUsage(currentLevelData.lessonPlan.newSkill);
          }
        })
        .onSkip(() => {
          log.info('[LessonPlayer] 玩家跳过教学');
          this._hideLessonSkipBtn();
          this._hideLessonBubble();
          this._hideLessonTapHint();
          this._clearAllButtonHighlights();
        })
        .onNeedInput((phase, data) => {
          log.info('[LessonPlayer] 等待输入:', phase, data);
          // NOTE_ONLY 模式：自动切换到笔记模式，并选中目标格
          if (data?.interactionType === 'NOTE_ONLY') {
            if (!this._getNoteMode()) {
              this._toggleNoteMode(true); // 强制开启笔记模式
            }
            // 自动选中目标格
            if (data.cell && board) {
              board.selectCell(data.cell[0], data.cell[1]);
              if (renderer) this._renderBoard();
            }
          }
        })
        .onPhaseChange((phase, prev) => {
          // 根据阶段更新跳过按钮显示
          if (phase === 'free' || phase === 'done') {
            this._hideLessonSkipBtn();
          } else {
            this._showLessonSkipBtn();
          }
          // guided 及之后阶段隐藏"点击继续"提示
          if (phase === 'guided' || phase === 'semiAuto' || phase === 'free' || phase === 'done') {
            this._hideLessonTapHint();
          }
        });

      // 监听气泡事件
      this._onLessonBubbleBound = (e) => this._onLessonBubble(e);
      document.addEventListener('lesson-bubble', this._onLessonBubbleBound);

      // 监听按钮高亮事件
      this._onLessonHighlightButtonBound = (e) => this._onLessonHighlightButton(e);
      document.addEventListener('lesson-highlight-button', this._onLessonHighlightButtonBound);

      // 启动
      const started = this.lessonPlayer.start();
      if (started) {
        this._showLessonSkipBtn();
        log.info('[LessonPlayer] 已启动:', currentLevelData.lessonPlan.newSkill);
      }
      return started;
    }

    /**
     * 清理教学引导系统
     */
    cleanup() {
      if (this.lessonPlayer) {
        this.lessonPlayer.destroy();
        this.lessonPlayer = null;
      }
      this._hideLessonBubble();
      this._hideLessonSkipBtn();
      this._hideLessonTapHint();
      this._clearAllButtonHighlights();

      // 移除事件监听
      if (this._onLessonBubbleBound) {
        document.removeEventListener('lesson-bubble', this._onLessonBubbleBound);
        this._onLessonBubbleBound = null;
      }
      if (this._onLessonHighlightButtonBound) {
        document.removeEventListener('lesson-highlight-button', this._onLessonHighlightButtonBound);
        this._onLessonHighlightButtonBound = null;
      }
    }

    /**
     * 教学阶段的填数处理（guided 阶段输入反馈）
     * @returns {Object|null} 处理结果，未处理则返回 null
     */
    handleCellFill(r, c, num) {
      if (!this.lessonPlayer || !this.lessonPlayer.isActive) return null;
      if (!this.lessonPlayer.isWaitingInput) return null;

      const result = this.lessonPlayer.handleCellFill(r, c, num);
      if (!result.handled) return null;

      if (result.correct === true) {
        // 正确：额外播正确音效（填数本身由后面的通用逻辑处理）
        AudioService.sfx.play('fill_correct');
        const renderer = this._getRenderer();
        if (renderer && typeof renderer.triggerFillAnimation === 'function') {
          renderer.triggerFillAnimation(r, c, 300);
        }
        // 不在这里 checkCompletion，等通用逻辑处理
      } else if (result.correct === false) {
        // 错误：额外播错误音效 + 教学提示（填数本身由后面的通用逻辑处理）
        AudioService.sfx.play('fill_wrong');
      }

      return result;
    }

    /**
     * What If 模式下填数统计（semiAuto 阶段）
     */
    handleWhatIfCellFill(r, c, num) {
      if (this.lessonPlayer && this.lessonPlayer.isActive
          && typeof this.lessonPlayer.handleWhatIfCellFill === 'function') {
        this.lessonPlayer.handleWhatIfCellFill(r, c, num);
      }
    }

    /** 教学是否激活中 */
    get isActive() {
      return this.lessonPlayer && this.lessonPlayer.isActive;
    }

    /** 是否等待输入 */
    get isWaitingInput() {
      return this.lessonPlayer && this.lessonPlayer.isWaitingInput;
    }

    /** 获取当前交互类型 */
    getInteractionType() {
      return this.lessonPlayer ? this.lessonPlayer.getInteractionType() : null;
    }

    // ============================================================
    //  教学气泡
    // ============================================================

    _onLessonBubble(e) {
      const { text, speaker, voiceId } = e.detail;
      // intro/demo 阶段显示"点击继续"提示
      const phase = this.lessonPlayer ? this.lessonPlayer.currentPhase : null;
      const showTapHint = (phase === 'intro' || phase === 'demo');
      this._showLessonBubble(text, speaker, voiceId, showTapHint);
    }

    _showLessonBubble(text, speaker, voiceId, showTapHint) {
      if (!this._lessonBubble) {
        this._lessonBubble = document.createElement('div');
        this._lessonBubble.id = 'lesson-bubble';
        this._lessonBubble.style.cssText = `
          position: absolute;
          bottom: 160px;
          left: 50%;
          transform: translateX(-50%);
          background:
            repeating-linear-gradient(
              45deg,
              transparent 0px,
              transparent 3px,
              rgba(0, 0, 0, 0.04) 3px,
              rgba(0, 0, 0, 0.04) 4px
            ),
            linear-gradient(180deg, rgba(60, 48, 38, 0.95) 0%, rgba(45, 36, 28, 0.98) 100%);
          color: #f0d890;
          padding: 14px 22px;
          border-radius: 10px;
          border: 1.5px solid #c9a84c;
          box-shadow:
            inset 0 1px 0 rgba(201, 168, 76, 0.3),
            0 4px 16px rgba(0, 0, 0, 0.5);
          font-size: 14px;
          line-height: 1.6;
          max-width: 85%;
          z-index: 500;
          text-align: center;
          opacity: 0;
          transition: opacity 0.3s;
          cursor: pointer;
          white-space: pre-wrap;
          letter-spacing: 0.3px;
        `;
        // 气泡小三角（指向下方工具栏）
        const arrow = document.createElement('div');
        arrow.style.cssText = `
          position: absolute;
          bottom: -9px;
          left: 50%;
          transform: translateX(-50%) rotate(45deg);
          width: 16px;
          height: 16px;
          background: linear-gradient(135deg, transparent 50%, rgba(45, 36, 28, 0.98) 50%);
          border-right: 1.5px solid #c9a84c;
          border-bottom: 1.5px solid #c9a84c;
        `;
        this._lessonBubble.appendChild(arrow);

        // 点击气泡快进教学
        this._bubbleClickHandler = () => {
          if (this.lessonPlayer && this.lessonPlayer.isActive) {
            const phase = this.lessonPlayer.currentPhase;
            if (phase === 'intro' || phase === 'demo') {
              this.lessonPlayer.advance();
            }
          }
        };
        this._lessonBubble.addEventListener('click', this._bubbleClickHandler);

        const gameContainer = document.getElementById('game-container') || document.body;
        gameContainer.appendChild(this._lessonBubble);
      }

      // 保留三角箭头元素，只更新文本内容
      const arrow = this._lessonBubble.querySelector('div');
      this._lessonBubble.textContent = text;
      if (arrow) this._lessonBubble.appendChild(arrow);

      this._lessonBubble.style.opacity = '1';

      // 显示/隐藏"点击继续"提示
      if (showTapHint) {
        this._showLessonTapHint();
      } else {
        this._hideLessonTapHint();
      }

      // 自动消失（根据文字长度计算时间）
      if (this._lessonBubble._hideTimer) clearTimeout(this._lessonBubble._hideTimer);
      const duration = Math.max(2000, text.length * 180); // 每字180ms，最少2秒
      this._lessonBubble._hideTimer = setTimeout(() => {
        if (this._lessonBubble) this._lessonBubble.style.opacity = '0';
        this._hideLessonTapHint();
      }, duration);
    }

    _hideLessonBubble() {
      if (this._lessonBubble) {
        this._lessonBubble.style.opacity = '0';
      }
    }

    // ============================================================
    //  "点击屏幕继续"闪烁提示
    // ============================================================

    _showLessonTapHint() {
      if (!this._lessonTapHint) {
        this._lessonTapHint = document.createElement('div');
        this._lessonTapHint.style.cssText = `
          position: absolute;
          bottom: 60px;
          left: 50%;
          transform: translateX(-50%);
          color: rgba(255, 255, 255, 0.8);
          font-size: 12px;
          padding: 6px 14px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 20px;
          z-index: 499;
          pointer-events: none;
          animation: lesson-tap-blink 1.5s ease-in-out infinite;
        `;
        this._lessonTapHint.textContent = '👆 点击屏幕继续';
        // 添加动画样式
        if (!document.getElementById('lesson-tap-animation')) {
          const style = document.createElement('style');
          style.id = 'lesson-tap-animation';
          style.textContent = `
            @keyframes lesson-tap-blink {
              0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1); }
              50% { opacity: 1; transform: translateX(-50%) scale(1.05); }
            }
          `;
          document.head.appendChild(style);
        }
        const gameContainer = document.getElementById('game-container') || document.body;
        gameContainer.appendChild(this._lessonTapHint);
      }
      this._lessonTapHint.style.opacity = '1';
    }

    _hideLessonTapHint() {
      if (this._lessonTapHint) {
        this._lessonTapHint.style.opacity = '0';
      }
    }

    // ============================================================
    //  跳过教学按钮
    // ============================================================

    _showLessonSkipBtn() {
      if (!this._lessonSkipBtn) {
        this._lessonSkipBtn = document.createElement('button');
        this._lessonSkipBtn.id = 'lesson-skip-btn';
        this._lessonSkipBtn.textContent = '跳过教学 →';
        this._lessonSkipBtn.style.cssText = `
          position: absolute;
          top: 56px;
          right: 12px;
          background: linear-gradient(180deg, rgba(60, 48, 38, 0.9) 0%, rgba(45, 36, 28, 0.95) 100%);
          color: #c4b5a0;
          border: 1px solid rgba(201, 168, 76, 0.5);
          padding: 5px 14px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          z-index: 501;
          box-shadow:
            inset 0 1px 0 rgba(201, 168, 76, 0.2),
            0 2px 8px rgba(0, 0, 0, 0.3);
          transition: all 0.2s;
          letter-spacing: 0.5px;
        `;
        this._lessonSkipBtn.addEventListener('mouseenter', () => {
          this._lessonSkipBtn.style.background = 'linear-gradient(180deg, rgba(75, 60, 48, 0.95) 0%, rgba(55, 44, 34, 0.98) 100%)';
          this._lessonSkipBtn.style.color = '#f0d890';
          this._lessonSkipBtn.style.borderColor = 'rgba(201, 168, 76, 0.7)';
        });
        this._lessonSkipBtn.addEventListener('mouseleave', () => {
          this._lessonSkipBtn.style.background = 'linear-gradient(180deg, rgba(60, 48, 38, 0.9) 0%, rgba(45, 36, 28, 0.95) 100%)';
          this._lessonSkipBtn.style.color = '#c4b5a0';
          this._lessonSkipBtn.style.borderColor = 'rgba(201, 168, 76, 0.5)';
        });
        this._skipBtnClickHandler = () => {
          if (this.lessonPlayer) {
            this.lessonPlayer.skip();
          }
        };
        this._lessonSkipBtn.addEventListener('click', this._skipBtnClickHandler);
        const gameContainer = document.getElementById('game-container') || document.body;
        gameContainer.appendChild(this._lessonSkipBtn);
      }
      this._lessonSkipBtn.style.display = 'block';
    }

    _hideLessonSkipBtn() {
      if (this._lessonSkipBtn) {
        this._lessonSkipBtn.style.display = 'none';
      }
    }

    // ============================================================
    //  教学按钮高亮
    // ============================================================

    _onLessonHighlightButton(e) {
      const { button, highlight } = e.detail;
      const btnId = 'btn-' + button; // 如 btn-note
      const btn = document.getElementById(btnId);
      // PC 端按钮同步
      const pcBtnId = 'pc-btn-' + button;
      const pcBtn = document.getElementById(pcBtnId);

      if (highlight) {
        this._highlightedButtons.add(btnId);
        // 添加脉冲高亮样式
        if (btn) {
          btn.style.transition = 'box-shadow 0.3s, transform 0.3s';
          btn.style.boxShadow = '0 0 0 3px rgba(251, 191, 36, 0.6), 0 0 20px rgba(251, 191, 36, 0.4)';
          btn.style.transform = 'scale(1.1)';
          // 脉冲动画
          this._startButtonPulse(btn);
        }
        // PC 端同步高亮
        if (pcBtn) {
          pcBtn.style.transition = 'box-shadow 0.3s, transform 0.3s';
          pcBtn.style.boxShadow = '0 0 0 3px rgba(251, 191, 36, 0.6), 0 0 20px rgba(251, 191, 36, 0.4)';
          pcBtn.style.transform = 'scale(1.1)';
          this._startButtonPulse(pcBtn);
        }
      } else {
        this._highlightedButtons.delete(btnId);
        if (btn) {
          btn.style.boxShadow = '';
          btn.style.transform = '';
          this._stopButtonPulse(btn);
        }
        // PC 端同步取消高亮
        if (pcBtn) {
          pcBtn.style.boxShadow = '';
          pcBtn.style.transform = '';
          this._stopButtonPulse(pcBtn);
        }
      }
    }

    _startButtonPulse(btn) {
      if (btn._pulseInterval) return;
      let scaleUp = true;
      btn._pulseInterval = setInterval(() => {
        scaleUp = !scaleUp;
        btn.style.transform = scaleUp ? 'scale(1.1)' : 'scale(1.05)';
      }, 600);
    }

    _stopButtonPulse(btn) {
      if (btn._pulseInterval) {
        clearInterval(btn._pulseInterval);
        btn._pulseInterval = null;
      }
    }

    _clearAllButtonHighlights() {
      this._highlightedButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
          btn.style.boxShadow = '';
          btn.style.transform = '';
          this._stopButtonPulse(btn);
        }
        // 同步清理 PC 端按钮
        const pcBtnId = 'pc-' + btnId;
        const pcBtn = document.getElementById(pcBtnId);
        if (pcBtn) {
          pcBtn.style.boxShadow = '';
          pcBtn.style.transform = '';
          this._stopButtonPulse(pcBtn);
        }
      });
      this._highlightedButtons.clear();
    }
  }

  // 暴露到全局
  global.LessonUICoordinator = LessonUICoordinator;

})(window);
