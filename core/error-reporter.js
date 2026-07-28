// ErrorReporter - 全局错误捕获与兜底 UI
// 防止未捕获异常导致游戏白屏崩溃
// 侦探案卷夹主题：深色半透明 + 金色边框

;(function(global) {
  'use strict';

  const STORAGE_KEY = 'cagedcipher_error_logs';
  const MAX_LOGS = 20;
  const MAX_RECENT_ACTIONS = 10;

  // 错误严重程度
  const SEVERITY = {
    FATAL: 'fatal',       // 致命错误：白屏/渲染崩溃
    ERROR: 'error',      // 普通错误：功能异常但不影响主流程
    WARNING: 'warning',  // 警告：资源加载失败等
  };

  let _logs = [];
  let _fatalErrorShown = false;
  let _errorOverlay = null;

  // === 从 localStorage 加载历史错误日志
  function _loadLogs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          _logs = parsed;
        }
      }
    } catch (e) {
      // 加载失败静默处理，不抛出
      _logs = [];
    }
  }

  // === 保存错误日志到 localStorage
  function _saveLogs() {
    try {
      if (_logs.length > MAX_LOGS) {
        _logs = _logs.slice(-MAX_LOGS);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_logs));
    } catch (e) {
      // 存储失败静默处理
      console.warn('[ErrorReporter] Failed to save error logs:', e);
    }
  }

  // === 获取当前上下文信息
  function _getContext() {
    const ctx = {
      url: location.href,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
    };

    // 当前关卡ID（尝试从全局变量获取
    try {
      if (global.GuideBattle && global.GuideBattle.currentLevelId) {
        ctx.levelId = global.GuideBattle.currentLevelId;
      } else if (global.currentLevelId) {
        ctx.levelId = global.currentLevelId;
      }
    } catch (e) { /* ignore */ }

    // 当前幕次（三幕结构）
    try {
      if (global.GuideBattle && global.GuideBattle.currentAct) {
        ctx.act = global.GuideBattle.currentAct;
      } else if (global.currentAct) {
        ctx.act = global.currentAct;
      }
    } catch (e) { /* ignore */ }

    // 最近操作（从 EventLogger 获取）
    try {
      if (global.EventLogger && typeof global.EventLogger.getRecent === 'function') {
        ctx.recentActions = global.EventLogger.getRecent(MAX_RECENT_ACTIONS);
      }
    } catch (e) {
      ctx.recentActions = [];
    }

    return ctx;
  }

  // === 记录错误
  function _recordError(severity, type, errorInfo) {
    try {
      const entry = {
        severity: severity,
        type: type,
        message: errorInfo.message || '',
        stack: errorInfo.stack || '',
        filename: errorInfo.filename || '',
        lineno: errorInfo.lineno || 0,
        colno: errorInfo.colno || 0,
        context: _getContext(),
        timestamp: Date.now(),
      };

      _logs.push(entry);
      if (_logs.length > MAX_LOGS) {
        _logs = _logs.slice(-MAX_LOGS);
      }
      _saveLogs();

      // 控制台输出
      console.error('[ErrorReporter][' + severity + '][' + type + ']', errorInfo.message || errorInfo);
      if (errorInfo.stack) {
        console.error(errorInfo.stack);
      }
    } catch (e) {
      // 极端情况下，错误收集本身不能抛出
      console.error('[ErrorReporter] Internal error:', e);
    }
  }

  // === 判断是否为致命错误
  function _isFatalError(message, stack) {
    const fatalPatterns = [
      'Rendering context lost',
      'Maximum call stack size exceeded',
      'out of memory',
      'Script error',
    ];
    const combined = (message + ' ' + (stack || '')).toLowerCase();
    return fatalPatterns.some(p => combined.indexOf(p.toLowerCase()) !== -1);
  }

  // === 创建错误兜底 UI
  function _showErrorOverlay(severity, message) {
    try {
      // 避免重复显示
      if (_fatalErrorShown) return;
      _fatalErrorShown = true;

      // 尝试触发 renderer fallback 模式
      try {
        if (global.renderer && typeof global.renderer._renderFallback === 'function') {
          if (global.renderer._currentBoard) {
            global.renderer._renderFallback(global.renderer._currentBoard);
          }
        }
      } catch (e) { /* ignore */ }

      // 创建遮罩层
      const overlay = document.createElement('div');
      overlay.id = 'error-reporter-overlay';
      overlay.style.cssText = [
        'position: fixed',
        'top: 0',
        'left: 0',
        'width: 100%',
        'height: 100%',
        'background: rgba(15, 10, 10, 0.85)',
        'z-index: 99999',
        'display: flex',
        'align-items: center',
        'justify-content: center',
        'font-family: "Noto Serif SC", "Source Han Serif SC", serif',
        'backdrop-filter: blur(4px)',
        'opacity: 0',
        'transition: opacity 0.3s ease',
      ].join(';');

      // 案卷夹风格的错误卡片
      const card = document.createElement('div');
      card.style.cssText = [
        'position: relative',
        'max-width: 420px',
        'width: 85%',
        'background: linear-gradient(145deg, #2d1f1a 0%, #1a100c 100%)',
        'border: 2px solid #c9a96e',
        'border-radius: 6px',
        'padding: 32px 28px 24px',
        'box-shadow: 0 20px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(201, 169, 110, 0.2)',
        'text-align: center',
        'transform: translateY(20px)',
        'transition: transform 0.3s ease',
      ].join(';');

      // 顶部金色装饰条
      const topBar = document.createElement('div');
      topBar.style.cssText = [
        'position: absolute',
        'top: 0',
        'left: 50%',
        'transform: translateX(-50%)',
        'width: 60px',
        'height: 4px',
        'background: linear-gradient(90deg, transparent, #c9a96e, transparent)',
        'border-radius: 0 0 2px 2px',
      ].join(';');
      card.appendChild(topBar);

      // 图标
      const icon = document.createElement('div');
      icon.style.cssText = [
        'font-size: 42px',
        'margin-bottom: 16px',
        'filter: drop-shadow(0 2px 8px rgba(201, 169, 110, 0.4))',
      ].join(';');
      icon.textContent = '📜';
      card.appendChild(icon);

      // 标题
      const title = document.createElement('div');
      title.style.cssText = [
        'font-size: 18px',
        'font-weight: 600',
        'color: #c9a96e',
        'margin-bottom: 10px',
        'letter-spacing: 2px',
      ].join(';');
      title.textContent = '密文档案 · 异常记录';
      card.appendChild(title);

      // 提示文案
      const desc = document.createElement('div');
      desc.style.cssText = [
        'font-size: 14px',
        'color: #d4c5a9',
        'line-height: 1.7',
        'margin-bottom: 24px',
        'opacity: 0.9',
      ].join(';');
      desc.textContent = '发生了一个小错误，游戏已尝试自动恢复';
      card.appendChild(desc);

      // 错误信息（折叠显示，点击展开）
      const errorDetail = document.createElement('div');
      errorDetail.style.cssText = [
        'font-size: 11px',
        'color: #8b7355',
        'background: rgba(0,0,0,0.3)',
        'border: 1px solid rgba(201, 169, 110, 0.2)',
        'border-radius: 4px',
        'padding: 8px 12px',
        'margin-bottom: 20px',
        'text-align: left',
        'max-height: 60px',
        'overflow: hidden',
        'cursor: pointer',
        'font-family: monospace',
        'word-break: break-all',
        'transition: max-height 0.3s ease',
      ].join(';');
      errorDetail.textContent = (message || '未知错误') + '\n(点击展开详情)';
      let detailExpanded = false;
      errorDetail.addEventListener('click', function() {
        detailExpanded = !detailExpanded;
        if (detailExpanded) {
          errorDetail.style.maxHeight = '200px';
          errorDetail.style.overflowY = 'auto';
          errorDetail.textContent = (message || '未知错误') +
            '\n\n--- 详情 ---\n' +
            (_logs.length > 0 ? JSON.stringify(_logs[_logs.length - 1], null, 2) : '');
        } else {
          errorDetail.style.maxHeight = '60px';
          errorDetail.style.overflow = 'hidden';
          errorDetail.textContent = (message || '未知错误') + '\n(点击展开详情)';
        }
      });
      card.appendChild(errorDetail);

      // 按钮容器
      const btnContainer = document.createElement('div');
      btnContainer.style.cssText = [
        'display: flex',
        'gap: 12px',
        'justify-content: center',
      ].join(';');

      // 刷新重试按钮
      const refreshBtn = document.createElement('button');
      refreshBtn.style.cssText = [
        'padding: 10px 24px',
        'font-size: 14px',
        'font-family: inherit',
        'background: linear-gradient(180deg, #c9a96e 0%, #a8894f 100%)',
        'color: #1a100c',
        'border: none',
        'border-radius: 4px',
        'cursor: pointer',
        'font-weight: 600',
        'letter-spacing: 1px',
        'box-shadow: 0 2px 8px rgba(201, 169, 110, 0.3)',
        'transition: all 0.2s ease',
      ].join(';');
      refreshBtn.textContent = '刷新重试';
      refreshBtn.addEventListener('mouseenter', function() {
        refreshBtn.style.transform = 'translateY(-1px)';
        refreshBtn.style.boxShadow = '0 4px 12px rgba(201, 169, 110, 0.4)';
      });
      refreshBtn.addEventListener('mouseleave', function() {
        refreshBtn.style.transform = '';
        refreshBtn.style.boxShadow = '0 2px 8px rgba(201, 169, 110, 0.3)';
      });
      refreshBtn.addEventListener('click', function() {
        window.location.reload();
      });
      btnContainer.appendChild(refreshBtn);

      // 继续游戏按钮
      const continueBtn = document.createElement('button');
      continueBtn.style.cssText = [
        'padding: 10px 24px',
        'font-size: 14px',
        'font-family: inherit',
        'background: transparent',
        'color: #c9a96e',
        'border: 1px solid #c9a96e',
        'border-radius: 4px',
        'cursor: pointer',
        'font-weight: 500',
        'letter-spacing: 1px',
        'transition: all 0.2s ease',
      ].join(';');
      continueBtn.textContent = '继续游戏';
      continueBtn.addEventListener('mouseenter', function() {
        continueBtn.style.background = 'rgba(201, 169, 110, 0.1)';
      });
      continueBtn.addEventListener('mouseleave', function() {
        continueBtn.style.background = 'transparent';
      });
      continueBtn.addEventListener('click', function() {
        _hideErrorOverlay();
      });
      btnContainer.appendChild(continueBtn);

      card.appendChild(btnContainer);
      overlay.appendChild(card);

      // 追加到 body
      if (document.body) {
        document.body.appendChild(overlay);
      } else {
        // body 还没加载完，等待 DOMContentLoaded
        document.addEventListener('DOMContentLoaded', function() {
          if (!document.getElementById('error-reporter-overlay')) {
            document.body.appendChild(overlay);
          }
        });
      }

      _errorOverlay = overlay;

      // 入场动画
      requestAnimationFrame(function() {
        overlay.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      });
    } catch (e) {
      console.error('[ErrorReporter] Failed to show error overlay:', e);
      // 终极兜底：alert
      try {
        alert('游戏发生错误，请刷新页面重试。\n' + (message || ''));
      } catch (e2) { /* ignore */ }
    }
  }

  // === 隐藏错误兜底 UI
  function _hideErrorOverlay() {
    try {
      _fatalErrorShown = false;
      if (_errorOverlay && _errorOverlay.parentNode) {
        _errorOverlay.style.opacity = '0';
        setTimeout(function() {
          if (_errorOverlay && _errorOverlay.parentNode) {
            _errorOverlay.parentNode.removeChild(_errorOverlay);
          }
          _errorOverlay = null;
        }, 300);
      }
    } catch (e) {
      console.warn('[ErrorReporter] Failed to hide overlay:', e);
    }
  }

  // === 安装全局错误监听
  function _installGlobalHandlers() {
    // 1. JS 运行时错误
    const originalOnError = global.onerror;
    global.onerror = function(message, filename, lineno, colno, error) {
      try {
        const severity = _isFatalError(message, error && error.stack)
          ? SEVERITY.FATAL
          : SEVERITY.ERROR;

        _recordError(severity, 'js_error', {
          message: String(message),
          stack: error && error.stack ? error.stack : '',
          filename: filename || '',
          lineno: lineno || 0,
          colno: colno || 0,
        });

        // 致命错误显示兜底 UI
        if (severity === SEVERITY.FATAL) {
          _showErrorOverlay(severity, String(message));
        }
      } catch (e) {
        // 不能让错误处理本身抛出
      }

      // 调用原始 onerror
      if (typeof originalOnError === 'function') {
        try {
          return originalOnError.apply(global, arguments);
        } catch (e) { /* ignore */ }
      }
      return false;
    };

    // 2. Promise 未处理的拒绝
    global.addEventListener('unhandledrejection', function(event) {
      try {
        let reason = event.reason;
        let message = '';
        let stack = '';

        if (reason instanceof Error) {
          message = reason.message;
          stack = reason.stack;
        } else if (typeof reason === 'string') {
          message = reason;
        } else {
          try {
            message = JSON.stringify(reason);
          } catch (e) {
            message = String(reason);
          }
        }

        const severity = _isFatalError(message, stack)
          ? SEVERITY.FATAL
          : SEVERITY.ERROR;

        _recordError(severity, 'unhandled_promise', {
          message: message,
          stack: stack,
          filename: '',
          lineno: 0,
          colno: 0,
        });

        // 防止控制台默认输出
        if (event.preventDefault) {
          event.preventDefault();
        }
      } catch (e) {
        console.error('[ErrorReporter] unhandledrejection handler error:', e);
      }
    });

    // 3. 资源加载错误（图片/脚本/CSS）
    global.addEventListener('error', function(event) {
      try {
        // 过滤掉 JS 运行时错误（已由 onerror 处理）
        if (event.error) return;

        const target = event.target;
        if (!target) return;

        // 判断资源类型
        let resourceType = 'unknown';
        let resourceUrl = '';

        if (target.tagName === 'IMG') {
          resourceType = 'image';
          resourceUrl = target.src || '';
        } else if (target.tagName === 'SCRIPT') {
          resourceType = 'script';
          resourceUrl = target.src || '';
        } else if (target.tagName === 'LINK') {
          resourceType = 'css';
          resourceUrl = target.href || '';
        } else if (target.tagName === 'AUDIO') {
          resourceType = 'audio';
          resourceUrl = target.src || '';
        }

        // 只记录已知资源错误
        if (resourceType !== 'unknown') {
          _recordError(SEVERITY.WARNING, 'resource_load', {
            message: '资源加载失败: ' + resourceType,
            stack: resourceUrl,
            filename: resourceUrl,
            lineno: 0,
            colno: 0,
          });
        }
      } catch (e) {
        console.warn('[ErrorReporter] resource error handler error:', e);
      }
    }, true); // 使用捕获阶段，确保能捕获到资源加载错误
  }

  // === 公共 API
  const ErrorReporter = {
    /**
     * 手动报告一个错误
     * @param {string} severity - 错误级别: 'fatal' | 'error' | 'warning'
     * @param {string} type - 错误类型
     * @param {Object|Error|string} errorInfo - 错误信息
     */
    report: function(severity, type, errorInfo) {
      let info = {};
      if (errorInfo instanceof Error) {
        info = {
          message: errorInfo.message,
          stack: errorInfo.stack,
          filename: errorInfo.fileName || '',
          lineno: errorInfo.lineNumber || 0,
          colno: errorInfo.columnNumber || 0,
        };
      } else if (typeof errorInfo === 'string') {
        info = { message: errorInfo };
      } else if (errorInfo && typeof errorInfo === 'object') {
        info = errorInfo;
      }
      _recordError(severity || SEVERITY.ERROR, type || 'manual', info);

      // 如果是致命错误，显示兜底 UI
      if (severity === SEVERITY.FATAL) {
        _showErrorOverlay(severity, info.message);
      }
    },

    /**
     * 获取所有错误日志
     * @returns {Array}
     */
    getLogs: function() {
      return [..._logs];
    },

    /**
     * 清空错误日志
     */
    clearLogs: function() {
      try {
        _logs = [];
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) { /* ignore */ }
    },

    /**
     * 手动触发兜底 UI 显示（用于测试或特殊场景）
     * @param {string} message
     */
    showFatalError: function(message) {
      _showErrorOverlay(SEVERITY.FATAL, message || '未知错误');
    },

    /**
     * 隐藏兜底 UI
     */
    hideOverlay: function() {
      _hideErrorOverlay();
    },

    /**
     * 错误严重级别常量
     */
    SEVERITY: SEVERITY,
  };

  // 初始化
  try {
    _loadLogs();
    _installGlobalHandlers();
    console.log('[ErrorReporter] Initialized');
  } catch (e) {
    console.error('[ErrorReporter] Init failed:', e);
  }

  global.ErrorReporter = ErrorReporter;
})(window);
