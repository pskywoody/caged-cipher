// ============================================================
//  constants.js - 全局常量定义
//  所有跨模块共享的常量集中在此管理
//  与 guide.html :root CSS 变量保持一致
// ============================================================

(function(global) {
  'use strict';

  /* ============================================================
     Z-INDEX 层级宪章
     背景(0) < 棋盘(10) < 覆盖层/高亮(20) < 浮条/HUD(100)
     < 提示气泡(500) < 角色气泡(800) < Toast(2000)
     < 遮罩/弹窗(10000+) < 对话(15000) < 高潮(20000)
     < 成就(25000) < 暂停(28000) < 转场(30000) < 结局(35000)
     ============================================================ */
  const Z_INDEX = {
    BG: 0,
    BOARD: 10,
    BOARD_OVERLAY: 20,
    HUD: 100,
    FLOATING_BAR: 100,
    HINT_BUBBLE: 500,
    CHAR_BUBBLE: 800,
    TOAST: 2000,
    OVERLAY: 10000,
    DIALOG: 15000,
    CLIMAX: 20000,
    ACHIEVEMENT: 25000,
    PAUSE: 28000,
    TRANSITION: 30000,
    ENDING: 35000
  };

  // ============================================================
  // 统一震动反馈预设 (Unified Vibration / Haptic Feedback Presets)
  // 所有震动都经过 vibrate() 函数，遵循 board.settings.vibration 开关
  // 震动强度分级：
  //   - 微反馈（微震动）: 5-10ms —— 选格、普通按钮
  //   - 正常反馈: 10-15ms —— 填数、擦除、笔记切换
  //   - 强反馈: 30-50ms 或三段式 —— 错误、连击里程碑
  //   - 超强反馈: 80ms+ 或长脉冲 —— EUREKA、通关、高潮
  // ============================================================
  const VIBRATE_PRESETS = {
    // 微反馈
    MICRO: 5,           // 普通按钮点击
    TAP: 10,            // 格子选中

    // 正常反馈
    FILL: 15,           // 正确填数
    ERASE: 10,          // 擦除
    NOTE_TOGGLE: [10, 20, 10],  // 笔记模式切换
    LONG_PRESS: 15,     // 长按激活

    // 强反馈
    ERROR: [50, 30, 50],       // 错误填数
    ERROR_SOFT: [10, 20, 10],  // 轻度错误（清除所有笔记等）
    COMBO_5: 20,               // 5连击
    COMBO_10: 30,              // 10连击
    COMBO_MAX: 50,             // MAX连击
    COMBO_MILESTONE: [20, 30, 50], // 连击里程碑（递增）

    // 超强反馈
    EUREKA: 80,                // EUREKA时刻
    CLIMAX: [50, 20, 30],      // 高潮/印章
    VICTORY: [80, 40, 80],     // 通关胜利
  };

  // Character portrait emoji mapping (fallback if image not available)
  const CHAR_EMOJI = {
    ayan: '🌸',
    cagekeeper: '🔒',
    ying: '✨',
    shenmo: '📖',
    plotter: '🎭',
    plotterShadow: '👤',
    setterSecret: '🔮',
    weaver: '⭐',
    remnant: '🛡️',
  };

  // Character name to ID mapping
  const NAME_TO_CHAR = {
    '阿妍': 'ayan',
    '守笼人': 'cagekeeper',
    '莹莹': 'ying',
    '沈墨': 'shenmo',
    '设局人': 'plotter',
    '设局人残影': 'plotterShadow',
    '设局人（残影）': 'plotterShadow',
    '设局人（秘术）': 'setterSecret',
    '星辰梭': 'weaver',
    '残局守护者': 'remnant',
  };

  // UI elements to hide during story
  const UI_SELECTORS = ['#game-container', '#num-pad', '#toolbar'];

  // 导出到全局
  global.Z_INDEX = Z_INDEX;
  global.VIBRATE_PRESETS = VIBRATE_PRESETS;
  global.CHAR_EMOJI = CHAR_EMOJI;
  global.NAME_TO_CHAR = NAME_TO_CHAR;
  global.UI_SELECTORS = UI_SELECTORS;

})(window);
