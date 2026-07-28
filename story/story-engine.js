// StoryEngine - Clean story playback with typewriter effect
// Handles prologue, dialogue, portraits, backgrounds, SFX, VO
// Supports skip button, long-press skip, read-dialogue fast-forward, skip confirmation
// Enhanced with Ace Attorney style presentation quality

;(function(global) {
  'use strict';

  const BG_DIR = 'assets/images/backgrounds/';
  const PORTRAIT_DIR = 'assets/images/portraits/';
  const SKIP_STORAGE_KEY = 'cagedcipher_story_skip';
  const READ_STORAGE_KEY = 'cagedcipher_story_read';
  const HISTORY_STORAGE_KEY = 'cagedcipher_story_history';

  // Character side mapping
  const CHAR_SIDE = { shenmo: 'left', cagekeeper: 'left', yingying: 'right', ayan: 'right' };

  // Typewriter speed presets (ms per character)
  const TYPING_SPEEDS = {
    serene: 120,
    normal: 70,
    fast: 30,
    instant: 0,
    heavy: 160,
    thinking: 90,
  };

  // Emotion -> typing speed
  function emotionSpeed(emotion) {
    const map = {
      serious: 'serene', calm: 'normal', confident: 'fast',
      surprised: 'fast', energetic: 'fast', default: 'normal',
      smile: 'normal', think: 'thinking',
    };
    return TYPING_SPEEDS[map[emotion] || 'normal'];
  }

  // Portrait file mapping
  const PORTRAIT_MAP = {
    shenmo: { default: 'SM_01_沉静', confident: 'SM_01_沉静', calm: 'SM_01_沉静', smile: 'SM_02_坚定', think: 'SM_03_犹豫' },
    ayan: { default: 'R_01_冷静', calm: 'R_01_冷静', serious: 'R_02_审视', smile: 'R_03_轻笑' },
    ying: { default: 'J_01_发光', energetic: 'J_01_发光', confident: 'J_02_低头', surprised: 'J_03_认真' },
    cagekeeper: { default: 'CK_01_庄重', serious: 'CK_01_庄重', smile: 'CK_02_欣慰', surprised: 'CK_03_复杂' },
    plotter: { default: 'P_01_常态', smirk: 'P_02_残影态', serious: 'P_03_真身' },
  };

  // Speaker alias mapping (supports nicknames and partial matching)
  const SPEAKER_ALIASES = {
    'shenmo': 'shenmo', '沈墨': 'shenmo', '沈墨君': 'shenmo', '小沈': 'shenmo',
    'ayan': 'ayan', '阿妍': 'ayan', '妍': 'ayan',
    'ying': 'ying', '莹莹': 'ying', '小莹': 'ying',
    'cagekeeper': 'cagekeeper', '守笼人': 'cagekeeper', '笼守': 'cagekeeper',
    'plotter': 'plotter', '设局人': 'plotter', '局中人': 'plotter',
  };

  class StoryEngine {
    constructor() {
      this._queue = [];
      this._currentDialogue = null;
      this._isPlaying = false;
      this._onComplete = null;
      this._currentBg = null;
      this._typewriterTimer = null;
      this._isTyping = false;

      // === Unified timer management ===
      // All setTimeout/setInterval IDs are tracked here for clean cleanup
      this._timers = new Set();
      this._intervals = new Set();

      // === Preload cache ===
      this._imageCache = {}; // url -> HTMLImageElement or Promise

      // VO sync state
      this._voicePlaying = false;
      this._voiceFinished = false;
      this._typewriterFinished = false;

      // === Animation race condition guards ===
      // Track pending hide/show timers to prevent stale callbacks from overriding current state
      this._portraitHideTimer = null;
      this._bubbleHideTimer = null;
      this._narratorHideTimer = null;
      this._skipBtnHideTimer = null;
      this._portraitTransitioning = false;
      this._itemVisible = false;
      this._itemTimer = null;

      // DOM elements
      this._portraitEl = null;
      this._bubbleEl = null;
      this._narratorEl = null;
      this._titleCardEl = null;
      this._overlayEl = null;
      this._itemEl = null;
      this._continueArrowEl = null;

      // Skip-related state
      this._skipBtnEl = null;
      this._longPressProgressEl = null;
      this._longPressTimer = null;
      this._longPressStart = 0;
      this._longPressDuration = 1000; // 1 second to trigger skip
      this._isLongPressing = false;
      this._skipConfirmationShown = false;
      this._sceneKey = null; // current scene identifier for read tracking
      this._autoSkipEnabled = true; // auto fast-forward for read dialogue
      this._isCurrentSceneRead = false;
      this._readHistory = {}; // cached read history, loaded from localStorage

      // === Dialogue history (for backlog / review) ===
      this._dialogueHistory = [];
      this._historyPanelEl = null;
      this._maxHistoryItems = 200;

      // Load skip preferences and read history
      this._loadSkipPrefs();
      this._loadReadHistory();
    }

    // ============================================================
    // === Timer Management (统一定时器管理) ===
    // ============================================================

    /**
     * Wrapped setTimeout that automatically tracks the timer ID.
     * All timers created through this method can be cleaned up via _clearAllTimers().
     * @param {Function} fn - Callback function
     * @param {number} ms - Delay in milliseconds
     * @returns {number} Timer ID
     */
    _setTimeout(fn, ms) {
      const id = setTimeout(() => {
        this._timers.delete(id);
        fn();
      }, ms);
      this._timers.add(id);
      return id;
    }

    /**
     * Clear a tracked timeout and remove it from the set.
     * @param {number} id - Timer ID
     */
    _clearTimeout(id) {
      if (id != null) {
        clearTimeout(id);
        this._timers.delete(id);
      }
    }

    /**
     * Wrapped setInterval that automatically tracks the interval ID.
     * @param {Function} fn - Callback function
     * @param {number} ms - Interval in milliseconds
     * @returns {number} Interval ID
     */
    _setInterval(fn, ms) {
      const id = setInterval(fn, ms);
      this._intervals.add(id);
      return id;
    }

    /**
     * Clear a tracked interval and remove it from the set.
     * @param {number} id - Interval ID
     */
    _clearInterval(id) {
      if (id != null) {
        clearInterval(id);
        this._intervals.delete(id);
      }
    }

    /**
     * Clear all tracked timers and intervals.
     * Called during interrupt(), _doSkip(), _endScene(), and destruction.
     */
    _clearAllTimers() {
      // Clear all tracked timeouts
      this._timers.forEach(id => clearTimeout(id));
      this._timers.clear();

      // Clear all tracked intervals
      this._intervals.forEach(id => clearInterval(id));
      this._intervals.clear();

      // Reset specific timer references
      this._typewriterTimer = null;
      this._longPressTimer = null;
      this._portraitHideTimer = null;
      this._bubbleHideTimer = null;
      this._narratorHideTimer = null;
      this._skipBtnHideTimer = null;
      this._itemTimer = null;

      // Reset animation states
      this._portraitTransitioning = false;
    }

    // ============================================================
    // === Image Preloading (图片预加载) ===
    // ============================================================

    /**
     * Preload a single image and cache it.
     * Returns a Promise that resolves when the image is loaded (or fails).
     * @param {string} url - Image URL
     * @returns {Promise<HTMLImageElement>} Loaded image element
     */
    _preloadImage(url) {
      if (this._imageCache[url]) {
        return this._imageCache[url];
      }
      const promise = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          resolve(img);
        };
        img.onerror = () => {
          console.warn('[StoryEngine] Image failed to load:', url);
          resolve(null); // Resolve with null on failure for graceful degradation
        };
        img.src = url;
      });
      this._imageCache[url] = promise;
      return promise;
    }

    /**
     * Preload all portrait expressions for a character.
     * Called at the start of sayLines when we know who will be speaking.
     * @param {string} charId - Character ID
     */
    _preloadPortraits(charId) {
      const map = PORTRAIT_MAP[charId];
      if (!map) return;
      Object.values(map).forEach(file => {
        const url = `${PORTRAIT_DIR}${file}.png`;
        this._preloadImage(url);
      });
    }

    /**
     * Get the portrait URL for a character + emotion.
     * @param {string} charId - Character ID
     * @param {string} emotion - Emotion key
     * @returns {string|null} Portrait URL or null
     */
    _getPortraitUrl(charId, emotion) {
      const file = this._getPortraitFile(charId, emotion);
      if (!file) return null;
      return `${PORTRAIT_DIR}${file}.png`;
    }

    // ============================================================
    // === Core API ===
    // ============================================================

    sayLines(lines, callback) {
      if (!lines || lines.length === 0) {
        if (callback) callback();
        return;
      }

      // Filter empty lines and convert all
      const validLines = lines
        .map(line => this._convertLine(line))
        .filter(line => {
          // Keep title cards, items, bg changes even with no text
          if (line.type === 'title' || line.item || line.bg) return true;
          // Filter out lines with empty/whitespace-only text
          return line.text && line.text.trim().length > 0;
        });

      if (validLines.length === 0) {
        if (callback) callback();
        return;
      }

      this._queue = validLines;
      this._onComplete = callback;
      this._isPlaying = true;

      // Preload portraits for all speakers in this batch
      const speakers = new Set();
      validLines.forEach(line => {
        if (line.charId) speakers.add(line.charId);
      });
      speakers.forEach(charId => this._preloadPortraits(charId));

      // Reset dialogue history for this scene
      this._dialogueHistory = [];

      // Check if this scene has been read (for auto fast-forward)
      this._checkSceneRead();

      // Show skip button
      this._showSkipButton();

      this._playNext();
    }

    nextDialogue() {
      if (!this._isPlaying) return;

      // If item is visible, hide it first and don't advance dialogue
      if (this._itemVisible) {
        this._hideItem();
        return;
      }

      // If typewriter is running, complete it instantly
      if (this._isTyping) {
        this._completeTypewriter();
        // If voice is still playing, don't advance yet - wait for voice
        if (this._voicePlaying) return;
        this._playNext();
        return;
      }
      // If voice is still playing, skip voice and advance
      if (this._voicePlaying) {
        if (typeof AudioService !== 'undefined') {
          AudioService.voice.stop(50);
        }
        this._voicePlaying = false;
        this._voiceFinished = true;
      }
      this._playNext();
    }

    interrupt() {
      this._clearAllTimers();
      this._stopTypewriter();
      // Stop any playing voice
      if (this._voicePlaying && typeof AudioService !== 'undefined') {
        AudioService.voice.stop(50);
      }
      this._voicePlaying = false;
      this._voiceFinished = false;
      this._typewriterFinished = false;
      this._queue = [];
      this._isPlaying = false;
      this._currentDialogue = null;
      this._itemVisible = false;

      // Clean up skip UI
      this._hideSkipButton();
      this._cancelLongPress();

      // Close history panel if open
      this._hideHistoryPanel();

      this._hideAll();
      if (this._onComplete) {
        const cb = this._onComplete;
        this._onComplete = null;
        cb();
      }
    }

    // ============================================================
    // === Skip API ===
    // ============================================================

    // Set the current scene key for read-history tracking
    // key format: {chapterId}_{levelId}_{dialogType}  e.g. "1_101_pre"
    setSceneKey(key) {
      this._sceneKey = key;
      if (this._isPlaying) {
        this._checkSceneRead();
      }
    }

    // Enable/disable auto fast-forward for read dialogue
    setAutoSkipEnabled(enabled) {
      this._autoSkipEnabled = enabled;
      this._saveSkipPrefs();
    }

    isAutoSkipEnabled() {
      return this._autoSkipEnabled;
    }

    // Skip all remaining dialogue (used by skip button and long-press)
    skipAll() {
      if (!this._isPlaying) return;

      // Check if we need to show confirmation
      if (!this._skipConfirmationShown && !this._getSkipPrefs().skipConfirmed) {
        this._showSkipConfirmation();
        return;
      }

      this._doSkip();
    }

    _doSkip() {
      // Mark scene as read
      if (this._sceneKey) {
        this._markSceneRead(this._sceneKey);
      }

      // Clear all timers first
      this._clearAllTimers();

      // Stop everything and jump to end
      this._stopTypewriter();
      if (this._voicePlaying && typeof AudioService !== 'undefined') {
        AudioService.voice.stop(30);
      }
      this._voicePlaying = false;
      this._voiceFinished = false;
      this._typewriterFinished = false;
      this._queue = [];
      this._isPlaying = false;
      this._currentDialogue = null;
      this._itemVisible = false;

      this._hideSkipButton();
      this._cancelLongPress();
      this._hideHistoryPanel();
      this._hideAll();

      if (this._onComplete) {
        const cb = this._onComplete;
        this._onComplete = null;
        cb();
      }
    }

    // ============================================================
    // === Typewriter (打字机效果) ===
    // ============================================================

    _stopTypewriter() {
      if (this._typewriterTimer) {
        this._clearTimeout(this._typewriterTimer);
        this._typewriterTimer = null;
      }
      this._isTyping = false;
    }

    _completeTypewriter() {
      this._stopTypewriter();
      // Show full text immediately
      const textEl = document.getElementById('dlg-text') || document.getElementById('narrator-text');
      if (textEl && this._currentText) {
        textEl.textContent = this._currentText;
      }
      this._isTyping = false;
      // Show continue arrow when typing completes
      this._showContinueArrow();
    }

    /**
     * Typewriter effect with multiple optimizations:
     * - instant speed: show full text immediately (no per-char setTimeout)
     * - Long text: uses batch textContent update pattern
     * - Sound only plays on non-space characters for more uniform rhythm
     * - Random delay is guaranteed non-negative via Math.max(0, delay)
     * - Supports emotion-based speed for both dialogue and narration
     *
     * @param {HTMLElement} element - Target text element
     * @param {string} text - Text to type out
     * @param {number} speed - Base speed in ms per character
     * @param {Function} callback - Completion callback
     * @param {Object} options - { voiceDuration: number } for VO sync
     */
    _typewrite(element, text, speed, callback, options) {
      // Apply auto fast-forward if scene is read
      let actualSpeed = speed;
      if (this._autoSkipEnabled && this._isCurrentSceneRead && speed > 0) {
        actualSpeed = Math.max(2, Math.floor(speed / 2)); // 2x speed
      }

      // If voice duration is provided, calculate speed to match voice length
      if (options && options.voiceDuration && options.voiceDuration > 0) {
        const charCount = text.replace(/\s/g, '').length;
        if (charCount > 0) {
          const voiceBasedSpeed = (options.voiceDuration * 0.85) / charCount; // finish slightly before voice
          // Use the slower of the two speeds to avoid finishing way too early
          actualSpeed = Math.min(actualSpeed, Math.max(5, voiceBasedSpeed));
        }
      }

      this._stopTypewriter();
      this._currentText = text;
      this._isTyping = true;

      // Hide continue arrow while typing
      this._hideContinueArrow();

      // Instant mode: show everything at once
      if (actualSpeed <= 0 || actualSpeed === TYPING_SPEEDS.instant) {
        element.textContent = text;
        this._isTyping = false;
        this._typewriterTimer = null;
        this._showContinueArrow();
        if (callback) callback();
        return;
      }

      element.textContent = '';
      let idx = 0;
      let soundCounter = 0;

      const type = () => {
        if (idx >= text.length) {
          this._isTyping = false;
          this._typewriterTimer = null;
          this._showContinueArrow();
          if (callback) callback();
          return;
        }

        // Batch append for long texts (still per-char but using direct textContent +=)
        // For very long texts (>200 chars), append 2 chars at a time for performance
        const batchSize = text.length > 200 ? 2 : 1;
        const endIdx = Math.min(idx + batchSize, text.length);
        const chunk = text.substring(idx, endIdx);
        element.textContent += chunk;

        // Play typewriter sound only on non-space characters (better rhythm)
        for (let i = 0; i < chunk.length; i++) {
          const ch = chunk[i];
          if (ch !== ' ' && ch !== '\u3000' && ch !== '\n') {
            soundCounter++;
            if (soundCounter % 3 === 0) {
              if (typeof AudioService !== 'undefined') {
                AudioService.sfx.play('playTypewriterKey');
              }
            }
          }
        }

        idx = endIdx;

        // Random variation for natural feel, guaranteed non-negative
        const delay = Math.max(0, actualSpeed + (Math.random() * 15 - 7));
        this._typewriterTimer = this._setTimeout(type, delay);
      };
      type();
    }

    // ============================================================
    // === Continue Arrow (继续箭头 - 逆转裁判风格) ===
    // ============================================================

    /**
     * Show the blinking "continue" arrow in the dialogue bubble.
     * Ace Attorney style indicator that text is complete and waiting for input.
     */
    _showContinueArrow() {
      if (!this._continueArrowEl) return;
      this._continueArrowEl.style.opacity = '1';
      this._continueArrowEl.style.animationPlayState = 'running';
    }

    /**
     * Hide the continue arrow (e.g. while typing is in progress).
     */
    _hideContinueArrow() {
      if (!this._continueArrowEl) return;
      this._continueArrowEl.style.opacity = '0';
      this._continueArrowEl.style.animationPlayState = 'paused';
    }

    // ============================================================
    // === Internal Playback ===
    // ============================================================

    _playNext() {
      this._stopTypewriter();
      // Reset sync state for new line
      this._voicePlaying = false;
      this._voiceFinished = false;
      this._typewriterFinished = false;

      // Hide item from previous line if still visible
      if (this._itemVisible) {
        this._hideItem();
      }

      if (this._queue.length === 0) {
        this._endScene();
        return;
      }

      const line = this._queue.shift();
      this._currentDialogue = line;

      // Add to dialogue history
      this._addToHistory(line);

      // Handle background change
      if (line.bg) {
        this._changeBg(line.bg);
      }

      // Handle title card
      if (line.type === 'title') {
        this._showTitleCard(line.text, line.subtitle);
        return;
      }

      // Handle item display
      if (line.item) {
        this._showItem(line.item);
      }

      // Handle explicit SFX (non-typewriter)
      if (line.sfx && line.sfx !== 'playTypewriterKey') {
        if (typeof AudioService !== 'undefined') {
          AudioService.sfx.play(line.sfx);
        }
      }

      // Handle narration
      if (line.isNarration || !line.speaker) {
        this._showNarrator(line.text, line);
        return;
      }

      // Handle character dialogue
      this._showDialogue(line);
    }

    _endScene() {
      this._clearAllTimers();
      this._stopTypewriter();
      // Stop any playing voice
      if (this._voicePlaying && typeof AudioService !== 'undefined') {
        AudioService.voice.stop(100);
      }
      this._voicePlaying = false;
      this._voiceFinished = false;
      this._typewriterFinished = false;
      this._isPlaying = false;
      this._currentDialogue = null;
      this._itemVisible = false;

      // Mark scene as read
      if (this._sceneKey) {
        this._markSceneRead(this._sceneKey);
      }

      this._hideSkipButton();
      this._cancelLongPress();
      this._hideHistoryPanel();
      this._hideAll();
      if (this._onComplete) {
        const cb = this._onComplete;
        this._onComplete = null;
        cb();
      }
    }

    // ============================================================
    // === Line Conversion & Data Compatibility ===
    // ============================================================

    _convertLine(line) {
      if (typeof line === 'string') {
        return { text: line, isNarration: true };
      }
      const speaker = line.speaker || '';
      const charId = this._speakerToCharId(speaker);
      return {
        speaker, charId,
        text: line.text || '',
        emotion: line.emotion || 'default',
        side: line.side || (charId && CHAR_SIDE[charId]) || 'right',
        effect: line.effect || 0,
        bg: line.bg || null,
        sfx: line.sfx || null,
        item: line.item || null,
        voiceId: line.voiceId || null,
        isNarration: line.isNarration || !charId,
        type: line.type || null,
        subtitle: line.subtitle || null,
      };
    }

    /**
     * Convert speaker name to character ID with alias/partial matching support.
     * Supports nicknames, shortened names, and case-insensitive matching.
     * @param {string} speaker - Speaker name
     * @returns {string|null} Character ID
     */
    _speakerToCharId(speaker) {
      if (!speaker) return null;

      // Direct exact match first
      if (SPEAKER_ALIASES[speaker]) {
        return SPEAKER_ALIASES[speaker];
      }

      // Try startsWith / includes matching (for nicknames like "沈墨君" -> "shenmo")
      const lowerSpeaker = speaker.toLowerCase();
      for (const [alias, charId] of Object.entries(SPEAKER_ALIASES)) {
        if (alias.length > 1 && (
          lowerSpeaker.includes(alias.toLowerCase()) ||
          alias.toLowerCase().includes(lowerSpeaker)
        )) {
          return charId;
        }
      }

      return null;
    }

    // ============================================================
    // === Display Methods ===
    // ============================================================

    _showTitleCard(title, subtitle) {
      this._initTitleCard();
      this._titleCardEl.style.display = 'flex';
      this._titleCardEl.style.opacity = '1';
      document.getElementById('tc-title').textContent = title || '';
      document.getElementById('tc-subtitle').textContent = subtitle || '';

      // Use tracked timeout for auto-advance
      this._setTimeout(() => {
        if (this._titleCardEl) {
          this._titleCardEl.style.opacity = '0';
        }
        this._setTimeout(() => {
          if (this._titleCardEl) {
            this._titleCardEl.style.display = 'none';
          }
          this._playNext();
        }, 500);
      }, 2500);
    }

    /**
     * Show narrator text with emotion-based typing speed and optional VO.
     * @param {string} text - Narration text
     * @param {Object} line - Full line object (for emotion/voiceId)
     */
    _showNarrator(text, line) {
      this._hidePortrait();
      this._hideBubble();
      this._initNarrator();
      this._narratorEl.style.display = 'flex';
      this._narratorEl.style.opacity = '1';
      this._narratorEl.textContent = ''; // Clear previous text

      // Cancel any pending narrator hide timer (race condition fix)
      if (this._narratorHideTimer) {
        this._clearTimeout(this._narratorHideTimer);
        this._narratorHideTimer = null;
      }

      // Use emotion-based speed for narration too (not fixed normal)
      const emotion = line && line.emotion ? line.emotion : 'default';
      const speed = emotionSpeed(emotion);

      // Check for voice ID in narration
      const hasVoice = line && line.voiceId && typeof AudioService !== 'undefined';

      if (hasVoice) {
        this._voicePlaying = true;
        this._voiceFinished = false;

        AudioService.voice.play(line.voiceId, {
          onended: () => {
            this._voicePlaying = false;
            this._voiceFinished = true;
            if (this._isTyping) {
              this._completeTypewriter();
            }
          },
          onerror: () => {
            // Voice playback failed - degrade gracefully
            console.warn('[StoryEngine] Voice playback failed for:', line.voiceId);
            this._voicePlaying = false;
            this._voiceFinished = true;
          },
          fadeInMs: 50,
        });

        this._typewrite(this._narratorEl, text, speed, () => {
          this._typewriterFinished = true;
        });
      } else {
        // No voice: just type at emotion-based speed
        this._typewrite(this._narratorEl, text, speed, () => {
          this._typewriterFinished = true;
        });
      }
    }

    _showDialogue(line) {
      this._hideNarrator();
      this._initBubble();
      this._initPortrait();

      // Cancel pending bubble hide timer (race condition fix)
      if (this._bubbleHideTimer) {
        this._clearTimeout(this._bubbleHideTimer);
        this._bubbleHideTimer = null;
      }

      // Show portrait with fade transition and preload
      if (line.charId) {
        const portraitFile = this._getPortraitFile(line.charId, line.emotion);
        if (portraitFile) {
          this._showPortraitWithFade(portraitFile, line.side, line.effect);
        }
      } else {
        this._hidePortrait();
      }

      // Show bubble with name
      this._bubbleEl.style.display = 'block';
      this._bubbleEl.style.opacity = '1';
      const nameEl = document.getElementById('dlg-name');
      const textEl = document.getElementById('dlg-text');
      if (nameEl) nameEl.textContent = line.speaker || '';
      if (textEl) textEl.textContent = '';

      // Apply text effect class for important lines (shaking, highlight)
      if (line.effect && textEl) {
        textEl.classList.add('dlg-effect-' + line.effect);
        // Add shake animation for strong emphasis (effect >= 2)
        if (line.effect >= 2) {
          textEl.style.animation = 'textShake 0.3s ease-in-out 2';
          this._setTimeout(() => {
            if (textEl) textEl.style.animation = '';
          }, 600);
        }
      } else if (textEl) {
        textEl.className = '';
      }

      // Calculate typing speed
      const baseSpeed = emotionSpeed(line.emotion);

      // Play VO and sync with typewriter
      const hasVoice = line.voiceId && typeof AudioService !== 'undefined';

      if (hasVoice) {
        this._voicePlaying = true;
        this._voiceFinished = false;

        // Try to get voice duration for speed sync (if AudioService provides it)
        let voiceDuration = 0;
        if (AudioService.voice && AudioService.voice.getDuration) {
          voiceDuration = AudioService.voice.getDuration(line.voiceId) || 0;
        }

        AudioService.voice.play(line.voiceId, {
          onended: () => {
            this._voicePlaying = false;
            this._voiceFinished = true;
            // If typewriter is still running when voice ends, complete it instantly
            if (this._isTyping) {
              this._completeTypewriter();
            }
          },
          onerror: () => {
            // Voice playback failed - degrade gracefully
            console.warn('[StoryEngine] Voice playback failed for:', line.voiceId);
            this._voicePlaying = false;
            this._voiceFinished = true;
          },
          fadeInMs: 50,
        });

        // Start typewriter with voice-synced speed if duration available
        this._typewrite(textEl, line.text, baseSpeed, () => {
          this._typewriterFinished = true;
        }, { voiceDuration: voiceDuration });
      } else {
        // No voice: just type at normal speed
        this._typewrite(textEl, line.text, baseSpeed, () => {
          this._typewriterFinished = true;
        });
      }
    }

    /**
     * Show item display. Item visibility blocks dialogue advance until hidden.
     * @param {string} itemId - Item identifier
     */
    _showItem(itemId) {
      this._initItem();
      const itemMap = {
        'file-k734': 'item_letter_k734.jpg',
        'letter_k734': 'item_letter_k734.jpg',
      };
      const file = itemMap[itemId] || itemId;
      const itemUrl = `assets/images/items/${file}`;

      // Preload item image before showing
      this._preloadImage(itemUrl).then(() => {
        if (!this._itemEl) return;
        this._itemEl.style.backgroundImage = `url('${itemUrl}')`;
        this._itemEl.style.display = 'flex';
        this._itemEl.style.opacity = '0';
        this._itemEl.style.transform = 'translate(-50%, -50%) scale(0.8)';
        this._itemEl.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

        // Force reflow then fade in with scale
        void this._itemEl.offsetWidth;
        this._itemEl.style.opacity = '1';
        this._itemEl.style.transform = 'translate(-50%, -50%) scale(1)';

        this._itemVisible = true;

        // Auto-hide after a delay, but item remains clickable
        if (this._itemTimer) {
          this._clearTimeout(this._itemTimer);
        }
        this._itemTimer = this._setTimeout(() => {
          // Don't auto-hide; wait for user click instead
          // Item will be hidden when user clicks to advance dialogue
          this._itemTimer = null;
        }, 2500);
      });
    }

    /**
     * Hide the currently displayed item with fade-out animation.
     */
    _hideItem() {
      if (!this._itemEl) {
        this._itemVisible = false;
        return;
      }
      if (this._itemTimer) {
        this._clearTimeout(this._itemTimer);
        this._itemTimer = null;
      }
      this._itemEl.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      this._itemEl.style.opacity = '0';
      this._itemEl.style.transform = 'translate(-50%, -50%) scale(0.9)';

      const timer = this._setTimeout(() => {
        if (this._itemEl) {
          this._itemEl.style.display = 'none';
          this._itemEl.style.transform = '';
        }
        this._itemVisible = false;
      }, 250);
      this._itemTimer = timer;
    }

    /**
     * Change background with fade transition.
     * Supports multiple path formats: relative paths, data URIs, full URLs.
     * @param {string} bgValue - Background image path or URL
     */
    _changeBg(bgValue) {
      if (bgValue === this._currentBg) return;
      this._currentBg = bgValue;
      const body = document.body;
      const app = document.getElementById('app');
      let url = bgValue;

      // Support various bg formats:
      // - Already a URL (http/https/data:): use as-is
      // - Already starts with assets/ or url(: use as-is
      // - Plain filename: prepend BG_DIR
      if (!bgValue.startsWith('http') &&
          !bgValue.startsWith('url(') &&
          !bgValue.startsWith('assets/') &&
          !bgValue.startsWith('data:') &&
          !bgValue.startsWith('/')) {
        url = BG_DIR + bgValue;
      }
      const cssUrl = `url('${url}')`;

      // Preload background image before transition
      this._preloadImage(url).then(() => {
        // Fade transition: briefly darken, swap bg, fade back
        const fadeDuration = 400;
        if (body) {
          body.style.transition = `filter ${fadeDuration}ms ease`;
          body.style.filter = 'brightness(0)';
          this._setTimeout(() => {
            body.style.backgroundImage = cssUrl;
            body.style.backgroundSize = 'cover';
            body.style.backgroundPosition = 'center';
            // Force reflow
            void body.offsetWidth;
            body.style.filter = 'brightness(1)';
            // Clean up transition after animation
            this._setTimeout(() => {
              body.style.transition = '';
              body.style.filter = '';
            }, fadeDuration);
          }, fadeDuration);
        }

        // FIX: Set background properties on app element individually
        // Do NOT use background shorthand which would override image/size/position
        if (app) {
          app.style.backgroundImage = cssUrl;
          app.style.backgroundSize = 'cover';
          app.style.backgroundPosition = 'center';
          app.style.backgroundColor = 'transparent';
          app.style.backgroundRepeat = 'no-repeat';
        }
      });
    }

    _getPortraitFile(charId, emotion) {
      const map = PORTRAIT_MAP[charId];
      if (!map) return null;
      return map[emotion] || map.default || null;
    }

    /**
     * Show portrait with cross-fade transition.
     * FIX: Preloads the new image first before starting the fade.
     * Also adds bounce animation for emphasis effect.
     *
     * @param {string} portraitFile - Portrait filename (without extension)
     * @param {string} side - 'left' or 'right'
     * @param {number} effect - Effect level (0=normal, 1+=bounce emphasis)
     */
    _showPortraitWithFade(portraitFile, side, effect) {
      if (!this._portraitEl) return;

      // If already transitioning, queue the change (prevent race condition)
      if (this._portraitTransitioning) {
        // Store the pending change
        this._pendingPortrait = { file: portraitFile, side, effect };
        return;
      }

      const isLeft = side === 'left';
      const portraitUrl = `${PORTRAIT_DIR}${portraitFile}.png`;
      const newBg = `url('${portraitUrl}')`;

      // Preload the new image first
      this._preloadImage(portraitUrl).then((img) => {
        if (!this._portraitEl) return;

        // If a newer portrait was requested during preload, use that instead
        if (this._pendingPortrait) {
          const pending = this._pendingPortrait;
          this._pendingPortrait = null;
          this._showPortraitWithFade(pending.file, pending.side, pending.effect);
          return;
        }

        this._portraitTransitioning = true;

        // If image failed to load, show a fallback (emoji placeholder)
        if (!img) {
          this._portraitEl.style.backgroundImage = 'none';
          this._portraitEl.innerHTML = '<div style="font-size:80px;position:absolute;bottom:20px;left:50%;transform:translateX(-50%);">🖼️</div>';
        } else {
          this._portraitEl.innerHTML = '';
        }

        // If portrait is already visible, cross-fade
        if (this._portraitEl.style.display === 'block' && this._portraitEl.style.opacity !== '0') {
          // Fade out, swap image, fade in
          this._portraitEl.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
          this._portraitEl.style.opacity = '0';

          this._setTimeout(() => {
            if (!this._portraitEl) return;
            if (img) {
              this._portraitEl.style.backgroundImage = newBg;
            }
            this._portraitEl.style.left = isLeft ? '10px' : '';
            this._portraitEl.style.right = isLeft ? '' : '10px';
            this._portraitEl.style.setProperty('--flip-x', isLeft ? '-1' : '1');

            // Apply bounce effect for emphasis lines (Ace Attorney style)
            if (effect && effect >= 1) {
              this._portraitEl.style.animation = 'portraitBounce 0.4s ease-out';
            } else {
              this._portraitEl.style.animation = '';
            }

            // Force reflow then fade in
            void this._portraitEl.offsetWidth;
            this._portraitEl.style.opacity = '1';

            // Clear transition state after animation
            this._setTimeout(() => {
              this._portraitTransitioning = false;
              this._portraitEl.style.animation = '';
              // Check if there's a pending change
              if (this._pendingPortrait) {
                const pending = this._pendingPortrait;
                this._pendingPortrait = null;
                this._showPortraitWithFade(pending.file, pending.side, pending.effect);
              }
            }, 300);
          }, 250);
        } else {
          // Fresh display: set image then fade in
          if (img) {
            this._portraitEl.style.backgroundImage = newBg;
          }
          this._portraitEl.style.left = isLeft ? '10px' : '';
          this._portraitEl.style.right = isLeft ? '' : '10px';
          this._portraitEl.style.setProperty('--flip-x', isLeft ? '-1' : '1');
          this._portraitEl.style.opacity = '0';
          this._portraitEl.style.display = 'block';
          this._portraitEl.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

          // Bounce effect for emphasis
          if (effect && effect >= 1) {
            this._portraitEl.style.animation = 'portraitBounce 0.4s ease-out';
          }

          // Force reflow
          void this._portraitEl.offsetWidth;
          this._portraitEl.style.opacity = '1';

          this._setTimeout(() => {
            this._portraitTransitioning = false;
            this._portraitEl.style.animation = '';
            // Check if there's a pending change
            if (this._pendingPortrait) {
              const pending = this._pendingPortrait;
              this._pendingPortrait = null;
              this._showPortraitWithFade(pending.file, pending.side, pending.effect);
            }
          }, 300);
        }
      });
    }

    _hidePortrait() {
      if (!this._portraitEl) return;

      // Cancel any pending portrait hide (race condition fix)
      if (this._portraitHideTimer) {
        this._clearTimeout(this._portraitHideTimer);
        this._portraitHideTimer = null;
      }

      if (this._portraitEl.style.display === 'none' || this._portraitEl.style.opacity === '0') {
        this._portraitEl.style.display = 'none';
        this._portraitTransitioning = false;
        return;
      }
      this._portraitEl.style.transition = 'opacity 0.25s ease';
      this._portraitEl.style.opacity = '0';
      this._portraitTransitioning = true;

      this._portraitHideTimer = this._setTimeout(() => {
        if (this._portraitEl) {
          this._portraitEl.style.display = 'none';
        }
        this._portraitTransitioning = false;
        this._portraitHideTimer = null;
      }, 250);
    }

    _hideBubble() {
      if (!this._bubbleEl) return;

      // Cancel pending hide timer (race condition fix)
      if (this._bubbleHideTimer) {
        this._clearTimeout(this._bubbleHideTimer);
        this._bubbleHideTimer = null;
      }

      if (this._bubbleEl.style.display === 'none') return;
      this._bubbleEl.style.transition = 'opacity 0.2s ease';
      this._bubbleEl.style.opacity = '0';

      this._bubbleHideTimer = this._setTimeout(() => {
        if (this._bubbleEl) {
          this._bubbleEl.style.display = 'none';
          this._bubbleEl.style.opacity = '';
          this._bubbleEl.style.transition = '';
        }
        this._bubbleHideTimer = null;
      }, 200);
    }

    _hideNarrator() {
      if (!this._narratorEl) return;

      // Cancel pending hide timer (race condition fix)
      if (this._narratorHideTimer) {
        this._clearTimeout(this._narratorHideTimer);
        this._narratorHideTimer = null;
      }

      if (this._narratorEl.style.display === 'none') return;
      this._narratorEl.style.transition = 'opacity 0.25s ease';
      this._narratorEl.style.opacity = '0';

      this._narratorHideTimer = this._setTimeout(() => {
        if (this._narratorEl) {
          this._narratorEl.style.display = 'none';
          this._narratorEl.style.opacity = '';
          this._narratorEl.style.transition = '';
        }
        this._narratorHideTimer = null;
      }, 250);
    }

    _hideAll() {
      this._hidePortrait();
      this._hideBubble();
      this._hideNarrator();
      this._hideItem();
      if (this._titleCardEl) this._titleCardEl.style.display = 'none';
      if (this._itemEl) this._itemEl.style.display = 'none';
    }

    // ============================================================
    // === Dialogue History (对话历史记录 - 逆转裁判风格回看法庭记录) ===
    // ============================================================

    /**
     * Add a line to the dialogue history (backlog).
     * @param {Object} line - Converted line object
     */
    _addToHistory(line) {
      if (!line || (!line.text && line.type !== 'title')) return;

      const entry = {
        speaker: line.speaker || (line.isNarration ? '旁白' : ''),
        text: line.text || '',
        emotion: line.emotion || 'default',
        timestamp: Date.now(),
      };

      this._dialogueHistory.push(entry);

      // Keep history within max size
      if (this._dialogueHistory.length > this._maxHistoryItems) {
        this._dialogueHistory.shift();
      }
    }

    /**
     * Toggle the dialogue history panel (backlog review).
     * Ace Attorney style "court record" review for dialogue.
     */
    toggleHistory() {
      if (this._historyPanelEl && this._historyPanelEl.style.display === 'flex') {
        this._hideHistoryPanel();
      } else {
        this._showHistoryPanel();
      }
    }

    /**
     * Show the dialogue history panel.
     */
    _showHistoryPanel() {
      this._initHistoryPanel();
      if (!this._historyPanelEl) return;

      // Populate history
      const listEl = this._historyPanelEl.querySelector('#history-list');
      if (listEl) {
        listEl.innerHTML = '';
        this._dialogueHistory.forEach(entry => {
          const item = document.createElement('div');
          item.style.cssText = 'padding:10px 0;border-bottom:1px solid rgba(251,191,36,0.1);';
          if (entry.speaker) {
            const nameSpan = document.createElement('div');
            nameSpan.style.cssText = 'color:#fbbf24;font-size:13px;font-weight:bold;margin-bottom:4px;';
            nameSpan.textContent = entry.speaker;
            item.appendChild(nameSpan);
          }
          const textSpan = document.createElement('div');
          textSpan.style.cssText = 'color:#e2e8f0;font-size:14px;line-height:1.6;';
          textSpan.textContent = entry.text;
          item.appendChild(textSpan);
          listEl.appendChild(item);
        });
        // Scroll to bottom
        listEl.scrollTop = listEl.scrollHeight;
      }

      this._historyPanelEl.style.display = 'flex';
      requestAnimationFrame(() => {
        if (this._historyPanelEl) {
          this._historyPanelEl.style.opacity = '1';
        }
      });
    }

    /**
     * Hide the dialogue history panel.
     */
    _hideHistoryPanel() {
      if (!this._historyPanelEl) return;
      if (this._historyPanelEl.style.display === 'none') return;
      this._historyPanelEl.style.opacity = '0';
      this._setTimeout(() => {
        if (this._historyPanelEl) {
          this._historyPanelEl.style.display = 'none';
        }
      }, 200);
    }

    /**
     * Initialize the history panel DOM element.
     */
    _initHistoryPanel() {
      if (this._historyPanelEl) return;

      const panel = document.createElement('div');
      panel.id = 'story-history-panel';
      panel.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(0,0,0,0.85);z-index:20000;' +
        'display:none;flex-direction:column;align-items:center;justify-content:center;' +
        'opacity:0;transition:opacity 0.2s ease;backdrop-filter:blur(8px);';

      panel.innerHTML =
        '<div style="width:90%;max-width:500px;max-height:75vh;' +
        'background:linear-gradient(180deg,#1e293b,#0f172a);' +
        'border:1px solid rgba(251,191,36,0.3);border-radius:12px;' +
        'padding:20px;display:flex;flex-direction:column;">' +
        '<div style="color:#fbbf24;font-size:18px;font-weight:bold;' +
        'margin-bottom:12px;letter-spacing:2px;text-align:center;">对话记录</div>' +
        '<div id="history-list" style="flex:1;overflow-y:auto;padding:4px;' +
        'max-height:60vh;"></div>' +
        '<div style="text-align:center;margin-top:12px;">' +
        '<button id="history-close-btn" style="padding:8px 24px;' +
        'background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.4);' +
        'border-radius:8px;color:#fbbf24;cursor:pointer;font-size:14px;">关闭</button>' +
        '</div></div>';

      panel.addEventListener('click', (e) => {
        if (e.target === panel) {
          this._hideHistoryPanel();
        }
      });

      document.body.appendChild(panel);
      this._historyPanelEl = panel;

      // Close button
      const closeBtn = panel.querySelector('#history-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._hideHistoryPanel();
        });
      }
    }

    // ============================================================
    // === Skip Button ===
    // ============================================================

    _showSkipButton() {
      this._initSkipButton();
      if (!this._skipBtnEl) return;

      // Cancel pending hide timer (race condition fix)
      if (this._skipBtnHideTimer) {
        this._clearTimeout(this._skipBtnHideTimer);
        this._skipBtnHideTimer = null;
      }

      this._skipBtnEl.style.display = 'flex';
      // Fade in
      requestAnimationFrame(() => {
        if (this._skipBtnEl) {
          this._skipBtnEl.style.opacity = '1';
        }
      });
    }

    _hideSkipButton() {
      if (!this._skipBtnEl) return;

      // Cancel pending hide timer (race condition fix)
      if (this._skipBtnHideTimer) {
        this._clearTimeout(this._skipBtnHideTimer);
        this._skipBtnHideTimer = null;
      }

      this._skipBtnEl.style.opacity = '0';
      this._skipBtnHideTimer = this._setTimeout(() => {
        if (this._skipBtnEl) {
          this._skipBtnEl.style.display = 'none';
        }
        this._skipBtnHideTimer = null;
      }, 200);
    }

    _initSkipButton() {
      if (this._skipBtnEl) return;

      const btn = document.createElement('div');
      btn.id = 'story-skip-btn';
      // MOBILE FIX: positioned in bottom-right thumb-reachable area with safe-area support
      btn.style.cssText = 'position:fixed;' +
        'bottom:calc(16px + env(safe-area-inset-bottom));' +
        'right:16px;' +
        'padding:6px 14px;background:rgba(251,191,36,0.15);' +
        'border:1px solid rgba(251,191,36,0.4);border-radius:16px;' +
        'color:#fbbf24;font-size:12px;cursor:pointer;' +
        'z-index:10002;display:none;opacity:0;' +
        'transition:opacity 0.3s ease, background 0.2s, border-color 0.2s;' +
        'letter-spacing:1px;user-select:none;-webkit-user-select:none;' +
        'backdrop-filter:blur(4px);';
      btn.innerHTML = '跳过 ▶▶';

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.skipAll();
      });

      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(251,191,36,0.3)';
        btn.style.borderColor = 'rgba(251,191,36,0.6)';
      });

      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(251,191,36,0.15)';
        btn.style.borderColor = 'rgba(251,191,36,0.4)';
      });

      document.body.appendChild(btn);
      this._skipBtnEl = btn;

      // Also set up long-press detection on the document
      this._setupLongPress();

      // Inject CSS animations for Ace Attorney style effects
      this._injectAnimations();
    }

    /**
     * Inject CSS keyframe animations for visual effects.
     * Ace Attorney style: portrait bounce, text shake, blinking arrow.
     */
    _injectAnimations() {
      if (document.getElementById('story-engine-animations')) return;

      const style = document.createElement('style');
      style.id = 'story-engine-animations';
      style.textContent = `
        /* Portrait bounce animation (Ace Attorney objection style) */
        @keyframes portraitBounce {
          0% { transform: scaleX(var(--flip-x, 1)) translateY(0); }
          30% { transform: scaleX(var(--flip-x, 1)) translateY(-12px) scale(1.03); }
          60% { transform: scaleX(var(--flip-x, 1)) translateY(4px) scale(0.99); }
          100% { transform: scaleX(var(--flip-x, 1)) translateY(0); }
        }

        /* Text shake animation for important lines */
        @keyframes textShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          75% { transform: translateX(3px); }
        }

        /* Blinking continue arrow (▼) */
        @keyframes blinkArrow {
          0%, 100% { opacity: 1; transform: translateY(0); }
          50% { opacity: 0.3; transform: translateY(3px); }
        }

        .continue-arrow-blink {
          animation: blinkArrow 1s ease-in-out infinite;
        }

        /* Highlight effect for important text */
        .dlg-effect-1 {
          color: #fbbf24;
          text-shadow: 0 0 10px rgba(251,191,36,0.5);
        }

        .dlg-effect-2 {
          color: #f87171;
          text-shadow: 0 0 10px rgba(248,113,113,0.5);
          font-weight: 600;
        }
      `;
      document.head.appendChild(style);
    }

    // ============================================================
    // === Long Press Skip ===
    // ============================================================

    _setupLongPress() {
      // Long press on dialogue bubble or narrator to skip
      const self = this;

      function onPointerDown(e) {
        if (!self._isPlaying) return;
        // Don't trigger on skip button itself or other interactive elements
        if (e.target.closest('#story-skip-btn, button, .num-btn, #num-pad, #chapter-select-overlay, #story-history-panel, #skip-confirmation')) return;
        // Only trigger on dialogue/narrator area
        if (!e.target.closest('#dialogue-bubble, #narrator-text, #story-portrait, #story-item')) return;

        // If item is visible, don't start long press (item click hides item)
        if (self._itemVisible) return;

        self._startLongPress(e);
      }

      function onPointerUp(e) {
        self._cancelLongPress();
      }

      function onPointerMove(e) {
        if (self._isLongPressing) {
          // If moved too much, cancel
          const dx = e.clientX - self._longPressStartX;
          const dy = e.clientY - self._longPressStartY;
          if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
            self._cancelLongPress();
          }
        }
      }

      document.addEventListener('pointerdown', onPointerDown);
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
      document.addEventListener('pointerleave', onPointerUp);
      document.addEventListener('pointermove', onPointerMove);
    }

    _startLongPress(e) {
      if (this._isLongPressing) return;
      this._isLongPressing = true;
      this._longPressStart = Date.now();
      this._longPressStartX = e.clientX;
      this._longPressStartY = e.clientY;

      this._showLongPressProgress(e.clientX, e.clientY);

      const self = this;
      this._longPressTimer = this._setInterval(() => {
        const elapsed = Date.now() - self._longPressStart;
        const pct = Math.min(100, (elapsed / self._longPressDuration) * 100);
        self._updateLongPressProgress(pct);

        if (elapsed >= self._longPressDuration) {
          self._completeLongPress();
        }
      }, 16);
    }

    _cancelLongPress() {
      if (!this._isLongPressing) return;
      this._isLongPressing = false;
      if (this._longPressTimer) {
        this._clearInterval(this._longPressTimer);
        this._longPressTimer = null;
      }
      this._hideLongPressProgress();
    }

    _completeLongPress() {
      if (this._longPressTimer) {
        this._clearInterval(this._longPressTimer);
        this._longPressTimer = null;
      }
      this._isLongPressing = false;
      this._hideLongPressProgress();
      this.skipAll();
    }

    _showLongPressProgress(x, y) {
      let el = document.getElementById('long-press-progress');
      if (!el) {
        el = document.createElement('div');
        el.id = 'long-press-progress';
        el.style.cssText = 'position:fixed;width:80px;height:80px;' +
          'border-radius:50%;pointer-events:none;z-index:10003;' +
          'display:none;transform:translate(-50%,-50%);';
        el.innerHTML =
          '<svg width="80" height="80" viewBox="0 0 80 80">' +
          '<circle cx="40" cy="40" r="36" fill="none" stroke="rgba(251,191,36,0.2)" stroke-width="4"/>' +
          '<circle id="lp-progress-ring" cx="40" cy="40" r="36" fill="none" stroke="#fbbf24" stroke-width="4"' +
          ' stroke-dasharray="226" stroke-dashoffset="226" stroke-linecap="round"' +
          ' transform="rotate(-90 40 40)"/>' +
          '</svg>' +
          '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
          'font-size:10px;color:#fbbf24;letter-spacing:1px;">跳过</div>';
        document.body.appendChild(el);
      }
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.display = 'block';
      this._longPressProgressEl = el;
    }

    _updateLongPressProgress(pct) {
      if (!this._longPressProgressEl) return;
      const ring = this._longPressProgressEl.querySelector('#lp-progress-ring');
      if (ring) {
        const circumference = 2 * Math.PI * 36; // ~226
        const offset = circumference * (1 - pct / 100);
        ring.style.strokeDashoffset = offset;
      }
    }

    _hideLongPressProgress() {
      if (this._longPressProgressEl) {
        this._longPressProgressEl.style.display = 'none';
      }
    }

    // ============================================================
    // === Skip Confirmation ===
    // ============================================================

    _showSkipConfirmation() {
      const existing = document.getElementById('skip-confirmation');
      if (existing) return;

      const overlay = document.createElement('div');
      overlay.id = 'skip-confirmation';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(0,0,0,0.7);z-index:25000;' +
        'display:flex;align-items:center;justify-content:center;' +
        'backdrop-filter:blur(4px);';

      const dialog = document.createElement('div');
      dialog.style.cssText = 'background:linear-gradient(180deg,#1e293b,#0f172a);' +
        'border:1px solid rgba(251,191,36,0.3);border-radius:16px;' +
        'padding:32px;max-width:380px;width:90%;text-align:center;' +
        'box-shadow:0 20px 60px rgba(0,0,0,0.5);';

      dialog.innerHTML =
        '<div style="font-size:32px;margin-bottom:16px;">⏭️</div>' +
        '<div style="font-size:18px;font-weight:700;color:#f1f5f9;' +
        'margin-bottom:12px;letter-spacing:1px;">确定要跳过这段剧情吗？</div>' +
        '<div style="font-size:13px;color:#94a3b8;margin-bottom:24px;line-height:1.6;">' +
        '跳过之后将无法回看这段剧情内容。<br>建议首次游玩时完整观看。</div>' +
        '<label style="display:flex;align-items:center;justify-content:center;' +
        'gap:8px;margin-bottom:24px;cursor:pointer;font-size:13px;color:#64748b;">' +
        '<input type="checkbox" id="skip-dont-show-again" style="accent-color:#fbbf24;">' +
        '不再提示</label>' +
        '<div style="display:flex;gap:12px;justify-content:center;">' +
        '<button id="skip-cancel-btn" style="padding:10px 24px;border:1px solid #334155;' +
        'background:#1e293b;color:#94a3b8;border-radius:8px;cursor:pointer;' +
        'font-size:14px;transition:all 0.2s;">取消</button>' +
        '<button id="skip-confirm-btn" style="padding:10px 24px;border:1px solid #fbbf24;' +
        'background:rgba(251,191,36,0.15);color:#fbbf24;border-radius:8px;' +
        'cursor:pointer;font-size:14px;font-weight:600;transition:all 0.2s;">确认跳过</button>' +
        '</div>';

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      const self = this;

      document.getElementById('skip-cancel-btn').addEventListener('click', () => {
        overlay.remove();
      });

      document.getElementById('skip-confirm-btn').addEventListener('click', () => {
        const dontShow = document.getElementById('skip-dont-show-again').checked;
        if (dontShow) {
          self._setSkipConfirmed();
        }
        overlay.remove();
        self._doSkip();
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove();
        }
      });
    }

    // ============================================================
    // === Read History / Auto Skip ===
    // ============================================================

    _loadReadHistory() {
      try {
        const raw = localStorage.getItem(READ_STORAGE_KEY);
        if (raw) {
          this._readHistory = JSON.parse(raw);
        } else {
          this._readHistory = {};
        }
      } catch (e) {
        this._readHistory = {};
      }
    }

    _saveReadHistory() {
      try {
        localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(this._readHistory));
      } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          console.warn('[StoryEngine] Storage quota exceeded on read history save');
        }
      }
    }

    _checkSceneRead() {
      if (!this._sceneKey) {
        this._isCurrentSceneRead = false;
        return;
      }
      this._isCurrentSceneRead = this._readHistory[this._sceneKey] === true;
    }

    _markSceneRead(key) {
      if (!key) return;
      if (this._readHistory[key]) return; // already marked
      this._readHistory[key] = true;
      this._saveReadHistory();
    }

    _getReadHistory() {
      return this._readHistory;
    }

    // ============================================================
    // === Skip Preferences ===
    // ============================================================

    _loadSkipPrefs() {
      try {
        const raw = localStorage.getItem(SKIP_STORAGE_KEY);
        if (raw) {
          const prefs = JSON.parse(raw);
          this._skipConfirmationShown = prefs.skipConfirmed === true;
          if (typeof prefs.autoSkipEnabled === 'boolean') {
            this._autoSkipEnabled = prefs.autoSkipEnabled;
          }
        }
      } catch (e) {}
    }

    _saveSkipPrefs() {
      try {
        const prefs = this._getSkipPrefs();
        localStorage.setItem(SKIP_STORAGE_KEY, JSON.stringify(prefs));
      } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          console.warn('[StoryEngine] Storage quota exceeded on skip prefs save');
        }
      }
    }

    _getSkipPrefs() {
      try {
        const raw = localStorage.getItem(SKIP_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return { skipConfirmed: false, autoSkipEnabled: true };
    }

    _setSkipConfirmed() {
      const prefs = this._getSkipPrefs();
      prefs.skipConfirmed = true;
      prefs.autoSkipEnabled = this._autoSkipEnabled;
      try {
        localStorage.setItem(SKIP_STORAGE_KEY, JSON.stringify(prefs));
        this._skipConfirmationShown = true;
      } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          console.warn('[StoryEngine] Storage quota exceeded on skip confirm save');
        }
      }
    }

    // ============================================================
    // === DOM Initialization ===
    // ============================================================

    _initPortrait() {
      if (this._portraitEl) return;
      this._portraitEl = document.createElement('div');
      this._portraitEl.id = 'story-portrait';
      // MOBILE FIX: responsive sizing with vh and max constraints, safe-area bottom support
      this._portraitEl.style.cssText = 'position:fixed;' +
        'right:10px;' +
        'bottom:calc(80px + env(safe-area-inset-bottom));' +
        'width:clamp(180px, 28vw, 280px);' +
        'height:clamp(270px, 42vh, 420px);' +
        'max-height:calc(100vh - 120px - env(safe-area-inset-bottom));' +
        'background-size:contain;' +
        'background-repeat:no-repeat;' +
        'background-position:bottom right;' +
        'z-index:9999;' +
        'display:none;' +
        'transition:opacity 0.3s, transform 0.3s;' +
        '--flip-x:1;' +
        'transform:scaleX(var(--flip-x));' +
        'pointer-events:none;';
      document.body.appendChild(this._portraitEl);
    }

    _initBubble() {
      if (this._bubbleEl) return;
      this._bubbleEl = document.createElement('div');
      this._bubbleEl.id = 'dialogue-bubble';
      // MOBILE FIX: safe-area bottom support
      this._bubbleEl.style.cssText = 'position:fixed;' +
        'bottom:calc(20px + env(safe-area-inset-bottom));' +
        'left:50%;transform:translateX(-50%);' +
        'width:92%;max-width:650px;' +
        'background:rgba(15,23,42,0.95);' +
        'border:1px solid rgba(251,191,36,0.3);' +
        'border-radius:12px;' +
        'padding:18px 22px;' +
        'padding-bottom:calc(18px + env(safe-area-inset-bottom) * 0.3);' +
        'z-index:10000;' +
        'display:none;' +
        'color:#f1f5f9;font-size:17px;line-height:1.7;' +
        'min-height:60px;' +
        'backdrop-filter:blur(8px);' +
        '-webkit-backdrop-filter:blur(8px);' +
        'box-shadow:0 8px 32px rgba(0,0,0,0.4);';

      this._bubbleEl.innerHTML =
        '<div id="dlg-name" style="color:#fbbf24;font-weight:bold;margin-bottom:10px;font-size:15px;padding-right:70px;"></div>' +
        '<div id="dlg-text" style="min-height:26px;"></div>' +
        '<div class="continue-arrow-blink" id="continue-arrow" style="text-align:right;font-size:14px;color:#fbbf24;margin-top:8px;opacity:0;transition:opacity 0.2s;">▼ 点击继续</div>';

      this._bubbleEl.addEventListener('click', () => this.nextDialogue());
      document.body.appendChild(this._bubbleEl);

      // Cache continue arrow element
      this._continueArrowEl = document.getElementById('continue-arrow');
    }

    _initNarrator() {
      if (this._narratorEl) return;
      this._narratorEl = document.createElement('div');
      this._narratorEl.id = 'narrator-text';
      // MOBILE FIX: safe-area bottom support
      this._narratorEl.style.cssText = 'position:fixed;' +
        'bottom:calc(120px + env(safe-area-inset-bottom));' +
        'left:50%;transform:translateX(-50%);' +
        'width:90%;max-width:600px;' +
        'text-align:center;color:#e2e8f0;' +
        'font-size:18px;font-style:italic;' +
        'z-index:10000;display:none;' +
        'line-height:1.8;min-height:40px;' +
        'padding:18px 28px;' +
        'background:linear-gradient(135deg,rgba(15,23,42,0.92) 0%,rgba(30,41,59,0.88) 100%);' +
        'backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);' +
        'border:1px solid rgba(251,191,36,0.25);' +
        'border-radius:16px;' +
        'box-shadow:0 8px 32px rgba(0,0,0,0.5),' +
        '0 0 0 1px rgba(251,191,36,0.1) inset,' +
        '0 2px 8px rgba(251,191,36,0.08);';
      this._narratorEl.addEventListener('click', () => this.nextDialogue());
      document.body.appendChild(this._narratorEl);
    }

    _initTitleCard() {
      if (this._titleCardEl) return;
      this._titleCardEl = document.createElement('div');
      this._titleCardEl.id = 'story-title-card';
      this._titleCardEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:none;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(15,23,42,0.95) 0%,rgba(0,0,0,0.98) 100%);z-index:10001;pointer-events:none;opacity:1;transition:opacity 0.5s;';
      this._titleCardEl.innerHTML = '<div id="tc-title" style="font-size:48px;font-weight:900;color:#fbbf24;text-shadow:0 0 30px rgba(251,191,36,0.5);font-family:Impact,sans-serif;letter-spacing:12px;"></div><div id="tc-subtitle" style="font-size:18px;color:#94a3b8;margin-top:16px;letter-spacing:4px;opacity:0.7;"></div>';
      document.body.appendChild(this._titleCardEl);
    }

    _initItem() {
      if (this._itemEl) return;
      this._itemEl = document.createElement('div');
      this._itemEl.id = 'story-item';
      // MOBILE FIX: responsive item size
      this._itemEl.style.cssText = 'position:fixed;' +
        'top:50%;left:50%;' +
        'transform:translate(-50%,-50%);' +
        'width:clamp(200px, 40vw, 300px);' +
        'height:clamp(200px, 40vw, 300px);' +
        'background-size:contain;' +
        'background-repeat:no-repeat;' +
        'background-position:center;' +
        'z-index:10001;display:none;' +
        'filter:drop-shadow(0 0 40px rgba(255,215,0,0.3));' +
        'cursor:pointer;' +
        'transition:opacity 0.3s, transform 0.3s;';
      // Click on item hides it
      this._itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this._hideItem();
      });
      document.body.appendChild(this._itemEl);
    }
  }

  global.StoryEngine = new StoryEngine();
})(window);
