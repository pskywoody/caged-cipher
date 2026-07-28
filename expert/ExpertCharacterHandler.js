// ExpertCharacterHandler.js - 专家系统角色对话处理
// 从 guide.js 抽离，物理分离，逻辑不变
// 包含：专家系统角色反馈 handler 注册、对话文本获取

;(function(global) {
  'use strict';

  // === 依赖引用（由 guide.js 在初始化时注入）===
  let _deps = {
    getExpertSystem: () => null,
    showCharacterBubble: (charId, options) => {},
    showToast: (msg, duration) => {},
    showAutoHint: (params) => {},
    getLessonUICoordinator: () => null,
    getHintPlayerState: () => null,
    log: { info: console.log, warn: console.warn, error: console.error },
    Effects: null,
    AudioManager: null,
  };

  // ============================================================
  //  初始化 / 依赖注入
  // ============================================================
  function init(deps) {
    if (deps) {
      Object.assign(_deps, deps);
    }
  }

  // ============================================================
  //  注册专家系统角色反馈 handler
  // ============================================================
  function registerExpertCharacterHandlers() {
    const expertSystem = _deps.getExpertSystem();
    if (!expertSystem || !expertSystem.expression) return;

    // Override EUREKA with character bubble + effects
    expertSystem.expression.registerActionHandler('EUREKA', (params) => {
      const msg = params.message || '漂亮！连击爆发！';
      _deps.showCharacterBubble('ayan', {
        text: msg,
        speakerName: '阿妍',
        duration: 2500,
        type: 'eureka',
      });
      const Effects = _deps.Effects || global.Effects;
      if (typeof Effects !== 'undefined' && typeof Effects.triggerLevel === 'function') {
        Effects.triggerLevel(params.level || 3);
      }
      const AudioManager = _deps.AudioManager || global.AudioManager;
      if (typeof AudioManager !== 'undefined' && typeof AudioManager.playEureka === 'function') {
        AudioManager.playEureka();
      }
    });

    // Override SHOW_DIALOG with character bubble
    expertSystem.expression.registerActionHandler('SHOW_DIALOG', (params) => {
      const dialogId = params.dialogId || 'default';
      const text = params.text || _getExpertDialogText(dialogId);
      const charId = params.character || 'cagekeeper';
      const charName = params.speakerName || (charId === 'cagekeeper' ? '守笼人' : '阿妍');
      _deps.showCharacterBubble(charId, {
        text: text,
        speakerName: charName,
        duration: 3500,
        type: 'encourage',
      });
    });

    // Override SHOW_TOAST - keep for ambient/info, use character bubble for feedback
    expertSystem.expression.registerActionHandler('SHOW_TOAST', (params) => {
      const msg = params.message || '';
      const level = params.level || 'info';
      // Use character bubble for game-relevant feedback
      if (level === 'encourage' || params.character) {
        const charId = params.character || 'cagekeeper';
        const charName = params.speakerName || (charId === 'cagekeeper' ? '守笼人' : '阿妍');
        _deps.showCharacterBubble(charId, {
          text: msg,
          speakerName: charName,
          duration: 3000,
          type: 'encourage',
        });
      } else {
        // Fallback to regular toast for system messages
        _deps.showToast(msg, params.duration || 2500);
      }
    });

    // Register ENCOURAGE action (new)
    expertSystem.expression.registerActionHandler('ENCOURAGE', (params) => {
      const msg = params.message || '别急，慢慢来。';
      const charId = params.character || 'ying';
      const charName = params.speakerName || '莹莹';
      _deps.showCharacterBubble(charId, {
        text: msg,
        speakerName: charName,
        duration: 3000,
        type: 'encourage',
      });
    });

    // Register ERROR_FEEDBACK action (new)
    let _lastErrorFeedbackTime = 0;
    expertSystem.expression.registerActionHandler('ERROR_FEEDBACK', (params) => {
      const now = Date.now();
      // Cooldown: don't repeat error feedback within 5 seconds
      if (now - _lastErrorFeedbackTime < 5000) return;
      _lastErrorFeedbackTime = now;

      const msg = params.message || '小心，这格不对哦。';
      const charId = params.character || 'cagekeeper';
      const charName = params.speakerName || '守笼人';
      _deps.showCharacterBubble(charId, {
        text: msg,
        speakerName: charName,
        duration: 2000,
        type: 'error',
      });
    });

    // === TRIGGER_HINT: 自动提示（决策层触发）===
    // 优先级高于 SHOW_TOAST，低于 EUREKA 和 TEACHING
    expertSystem.expression.registerActionHandler('TRIGGER_HINT', (params) => {
      // 如果正在播放教学引导，不自动提示
      const lessonUICoordinator = _deps.getLessonUICoordinator();
      if (lessonUICoordinator && lessonUICoordinator.isActive) return;

      // 如果已有提示动画在播放，排队或替换
      const HintPlayerState = _deps.getHintPlayerState();
      if (typeof HintPlayerState !== 'undefined' && HintPlayerState.playing) {
        // 已有提示在播放，不打断
        _deps.log.info('[AutoHint] 已有提示在播放，跳过本次自动提示');
        return;
      }

      // 执行自动提示
      _deps.showAutoHint(params);
    });

    _deps.log.info('Expert character handlers registered');
  }

  // ============================================================
  //  专家对话文本
  // ============================================================
  function _getExpertDialogText(id) {
    const dialogs = {
      stuck_guide: '试试换个角度看盘面，或者用笔记标记候选数。',
      ambient_encouragement: '继续保持，你做得很好。',
    };
    return dialogs[id] || '';
  }

  // ============================================================
  //  公开 API
  // ============================================================
  const ExpertCharacterHandler = {
    init,
    registerExpertCharacterHandlers,
    _getExpertDialogText,
  };

  global.ExpertCharacterHandler = ExpertCharacterHandler;

})(typeof window !== 'undefined' ? window : this);
