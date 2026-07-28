// CharBubble.js - 角色气泡模块
// 负责角色对话气泡的显示、隐藏和格式化
const CharBubble = (function() {
  'use strict';

  // === 依赖 - 从全局获取 ===
  function _isPcLayout() { return window._isPcLayout || false; }

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

  // === 状态变量 ===
  let _characterBubbleEl = null;
  let _characterBubbleTimer = null;
  let _characterBubbleVisible = false;

  /**
   * Show a lightweight character speech bubble.
   * Used for hints, encouragement, eureka moments, error feedback.
   * Position: top-right area near the board, with character avatar + text.
   *
   * @param {string} characterId - character ID (ayan, cagekeeper, ying, etc.)
   * @param {Object} options - { text, speakerName, duration, type, onClick }
   */
  function showCharacterBubble(characterId, options) {
    options = options || {};
    const text = options.text || '';
    const speakerName = options.speakerName || '';
    const duration = options.duration || 3000;
    const type = options.type || 'info'; // info, hint, eureka, encourage, error
    const onClick = options.onClick || null;

    // Remove existing bubble
    if (_characterBubbleEl) {
      _characterBubbleEl.remove();
      _characterBubbleEl = null;
    }
    if (_characterBubbleTimer) {
      clearTimeout(_characterBubbleTimer);
      _characterBubbleTimer = null;
    }

    _characterBubbleVisible = true;

    // Create bubble element
    const bubble = document.createElement('div');
    bubble.className = 'char-bubble char-bubble-' + type;
    _characterBubbleEl = bubble;

    const emoji = CHAR_EMOJI[characterId] || '💬';

    // Build inner HTML with avatar + text (using CSS classes instead of inline styles)
    bubble.innerHTML =
      '<div class="char-bubble-avatar">' + emoji + '</div>' +
      '<div class="char-bubble-content">' +
        (speakerName ? '<div class="char-bubble-name">' + speakerName + '</div>' : '') +
        '<div class="char-bubble-text">' +
          formatBubbleText(text, type) +
        '</div>' +
      '</div>' +
      '<div class="char-bubble-close" title="点击关闭">✕</div>';

    // Append to correct container based on layout
    // PC mode: place inside pc-board-container near top-right of board
    // Mobile mode: append to body (fixed position)
    if (_isPcLayout()) {
      const boardContainer = document.getElementById('pc-board-container');
      if (boardContainer) {
        boardContainer.appendChild(bubble);
      } else {
        document.body.appendChild(bubble);
      }
    } else {
      document.body.appendChild(bubble);
    }

    // Animate in using classList
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bubble.classList.add('show');
      });
    });

    // Click to dismiss — only on close button, text area is selectable
    const closeBtn = bubble.querySelector('.char-bubble-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideCharacterBubble();
      });
    }

    // Optional click handler for the whole bubble
    if (onClick) {
      bubble.addEventListener('click', (e) => {
        // Don't trigger if clicking the close button
        if (e.target.closest('.char-bubble-close')) return;
        onClick(e);
      });
    }

    // Auto-dismiss
    _characterBubbleTimer = setTimeout(() => {
      hideCharacterBubble();
    }, duration);
  }

  /**
   * Format bubble text with technique name highlighting.
   */
  function formatBubbleText(text, type) {
    // Highlight technique name in 【brackets】
    return text.replace(/【([^】]+)】/g,
      '<span class="tech-highlight">【$1】</span>');
  }

  /**
   * Hide the current character bubble.
   */
  function hideCharacterBubble() {
    if (!_characterBubbleEl) return;
    const bubble = _characterBubbleEl;
    _characterBubbleEl = null;
    _characterBubbleVisible = false;

    if (_characterBubbleTimer) {
      clearTimeout(_characterBubbleTimer);
      _characterBubbleTimer = null;
    }

    bubble.classList.remove('show');
    setTimeout(() => {
      if (bubble.parentNode) bubble.remove();
    }, 300);
  }

  /**
   * Check if bubble is currently visible.
   */
  function isVisible() {
    return _characterBubbleVisible;
  }

  /**
   * Get the current bubble DOM element (for reparenting etc.)
   */
  function getElement() {
    return _characterBubbleEl;
  }

  // ============================================================
  // 公开 API
  // ============================================================
  return {
    show: showCharacterBubble,
    hide: hideCharacterBubble,
    format: formatBubbleText,
    isVisible: isVisible,
    getElement: getElement,
  };
})();

if (typeof window !== 'undefined') {
  window.CharBubble = CharBubble;
}
