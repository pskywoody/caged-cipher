// AudioService - Unified audio layer
// Single entry point for all audio operations
// ============================================================
//  音效命名规范与用途
// ============================================================
// 核心玩法: click, fill_correct, fill_wrong, erase, note_toggle, select
// 进阶反馈: success, error, eureka, breakthrough, victory_short/full
// 三幕引导: act_open (合成), act_breakthrough (合成), avalanche_start (合成)
// UI过渡:   paper_flip, book_flip, seal_unlock, notification, reveal
// 连击系统: combo_1, combo_2, combo_3, combo_max
// 环境音:   typewriter, ambient_wind, thunder
// ============================================================

;(function(global) {
  'use strict';

  const SFX_DIR = 'assets/audio/sfx/';
  const VOICE_DIR = 'assets/audio/voices/';
  const BGM_DIR = 'assets/audio/bgm/';

  const VOLUME_KEY = 'audio_volume_settings';
  const DEFAULT_VOLUMES = {
    master: 0.7,
    sfx: 0.6,
    voice: 0.85,
    bgm: 0.4,
  };

  // SFX name mapping (friendly name -> actual file)
  const SFX_MAP = {
    // Core gameplay
    'click': 'click.wav',
    'fill_correct': 'fill_correct.wav',
    'fill_wrong': 'fill_wrong.wav',
    'erase': 'erase.wav',
    'note_toggle': 'note_toggle.wav',
    'hint': 'hint.wav',
    'select': 'click.wav',
    'cage_highlight': 'hover.wav',
    'hover': 'hover.wav',

    // Progression & rewards
    'success': 'success.wav',
    'error': 'error.wav',
    'eureka': 'eureka.wav',
    'breakthrough': 'breakthrough.wav',
    'victory': 'victory_short.wav',
    'victory_short': 'victory_short.wav',
    'victory_full': 'victory_full.wav',
    'achievement': 'achievement.wav',
    'notification': 'notification.wav',
    'reveal': 'reveal.wav',

    // UI & transitions
    'paper_flip': 'paper_flip.wav',
    'book_flip': 'book_flip.wav',
    'book_open': 'book_open.mp3',
    'seal_unlock': 'seal_unlock.wav',
    'seal_stamp': 'seal_stamp.wav',
    'key_unlock': 'key_unlock.wav',
    'chain_pop': 'chain_pop.wav',
    'portrait_tap': 'portrait_tap.wav',
    'portrait_slam': 'portrait_slam.wav',
    'dialog_advance': 'dialog_advance.wav',

    // Environment & atmosphere
    'door_open': 'door_open.wav',
    'footstep': 'footstep.wav',
    'footstep_wood': 'footstep_wood.wav',
    'footstep_hall': 'footstep_hall.mp3',
    'footstep_hall_2': 'footstep_hall_2.mp3',
    'typewriter': 'typewriter.wav',
    'ambient_wind': 'ambient_wind.wav',
    'thunder': 'thunder.wav',
    'thinking': 'thinking.wav',
    'sigh': 'sigh.wav',

    // Combo system
    'combo_1': 'combo_1.wav',
    'combo_2': 'combo_2.wav',
    'combo_3': 'combo_3.wav',
    'combo_max': 'combo_max.wav',

    // Rating
    'rating_s': 'rating_s.wav',
    'rating_a': 'rating_a.wav',
    'rating_b': 'rating_b.wav',
    'rating_c': 'rating_c.wav',

    // Emotions
    'emotion_angry': 'emotion_angry.wav',
    'emotion_sad': 'emotion_sad.wav',
    'emotion_smirk': 'emotion_smirk.wav',
    'emotion_surprise': 'emotion_surprise.wav',

    // Legacy aliases (backward compatibility)
    'playDoorOpen': 'door_open.wav',
    'playFootstep': 'footstep_hall.mp3',
    'playTypewriterKey': 'typewriter.wav',
  };

  class AudioService {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.sfxGain = null;
      this.voiceGain = null;
      this.bgmGain = null;
      this.bgmFilter = null;
      this.enabled = true;
      this.sfxEnabled = true;
      this.bgmEnabled = true;
      this.bgmPlaying = false;
      this._currentBgm = null;
      this._currentIntensity = 'Normal';
      this._audioEl = null;
      this._unlocked = false;
      this._pendingBgm = null;
      this._pendingBgmOptions = null;

      // BGM Web Audio state
      this._bgmTrack = null;       // { el, source, gain, path } — current active BGM track
      this._bgmFadingOut = [];     // array of tracks currently fading out

      // Ducking state
      this._duckingActive = false;
      this._sfxGainBeforeDuck = 0;
      this._bgmGainBeforeDuck = 0;

      // SFX state (Web Audio based)
      this._sfxCache = new Map();
      this._sfxSources = new Set();

      // Voice state (Web Audio based)
      this._voiceSource = null;
      this._voiceGainNode = null;
      this._voiceCache = new Map();
      this._voiceOnEnded = null;
      this._voiceStopping = false;

      // Volume settings
      this._volumes = this._loadVolumes();
    }

    init() {
      if (this.ctx) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this._volumes.master;
        this.masterGain.connect(this.ctx.destination);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this._volumes.sfx;
        this.sfxGain.connect(this.masterGain);

        this.voiceGain = this.ctx.createGain();
        this.voiceGain.gain.value = this._volumes.voice;
        this.voiceGain.connect(this.masterGain);

        this.bgmFilter = this.ctx.createBiquadFilter();
        this.bgmFilter.type = 'lowpass';
        this.bgmFilter.frequency.value = 20000;
        this.bgmGain = this.ctx.createGain();
        this.bgmGain.gain.value = this._volumes.bgm;
        this.bgmFilter.connect(this.bgmGain);
        this.bgmGain.connect(this.masterGain);

        console.log('[AudioService] Initialized');

        // Preload commonly used SFX
        this._preloadCommonSfx();
      } catch(e) {
        console.warn('[AudioService] Web Audio not supported:', e);
        this.enabled = false;
      }
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    // === Volume Control ===
    setVolume(type, value) {
      if (!DEFAULT_VOLUMES.hasOwnProperty(type)) return;
      value = Math.max(0, Math.min(1, value));
      this._volumes[type] = value;
      this._saveVolumes();

      if (this.ctx) {
        const now = this.ctx.currentTime;
        if (type === 'master' && this.masterGain) {
          this.masterGain.gain.linearRampToValueAtTime(value, now + 0.05);
        } else if (type === 'sfx' && this.sfxGain) {
          const target = this._duckingActive ? value * 0.5 : value;
          this.sfxGain.gain.cancelScheduledValues(now);
          this.sfxGain.gain.setValueAtTime(this.sfxGain.gain.value, now);
          this.sfxGain.gain.linearRampToValueAtTime(target, now + 0.05);
          // Update duck baseline so restoration returns to the new volume
          if (this._duckingActive) {
            this._sfxGainBeforeDuck = value;
          }
        } else if (type === 'voice' && this.voiceGain) {
          this.voiceGain.gain.linearRampToValueAtTime(value, now + 0.05);
        } else if (type === 'bgm' && this.bgmGain) {
          const target = this._duckingActive ? value * 0.7 : value;
          this.bgmGain.gain.cancelScheduledValues(now);
          this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
          this.bgmGain.gain.linearRampToValueAtTime(target, now + 0.05);
          // Update duck baseline so restoration returns to the new volume
          if (this._duckingActive) {
            this._bgmGainBeforeDuck = value;
          }
        }
      }
    }

    getVolume(type) {
      if (!DEFAULT_VOLUMES.hasOwnProperty(type)) return 1;
      return this._volumes[type];
    }

    _loadVolumes() {
      try {
        const saved = localStorage.getItem(VOLUME_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          return Object.assign({}, DEFAULT_VOLUMES, parsed);
        }
      } catch(e) {}
      return Object.assign({}, DEFAULT_VOLUMES);
    }

    _saveVolumes() {
      try {
        localStorage.setItem(VOLUME_KEY, JSON.stringify(this._volumes));
      } catch(e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          console.warn('[AudioService] Storage quota exceeded on volume save');
        }
      }
    }

    // === SFX ===
    sfx = {
      play: (name, options) => {
        if (!this.enabled || !this.sfxEnabled) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        this.resume();

        options = options || {};
        const volume = (options.volume !== undefined) ? options.volume : 1;

        const file = SFX_MAP[name] || name;
        const path = file.includes('.') ? SFX_DIR + file : SFX_DIR + file + '.wav';

        // Typewriter: play multiple clicks with delay
        if (name === 'playTypewriterKey' || name === 'typewriter') {
          this._playTypewriterBurst(path, volume);
        } else {
          this._playSfxBuffer(name, path, { volume: volume });
        }
      },
      doorOpen: () => this.sfx.play('door_open'),
      footstep: () => this.sfx.play('footstep'),
      typewriter: () => this.sfx.play('typewriter'),
      correct: () => this.sfx.play('fill_correct'),
      wrong: () => this.sfx.play('fill_wrong'),
      click: () => this.sfx.play('click'),
      hover: () => this.sfx.play('hover'),
      success: () => this.sfx.play('success'),
      error: () => this.sfx.play('error'),
      eureka: () => this.sfx.play('eureka'),
      breakthrough: () => this.sfx.play('breakthrough'),
      paperFlip: () => this.sfx.play('paper_flip'),
      bookFlip: () => this.sfx.play('book_flip'),
      sealUnlock: () => this.sfx.play('seal_unlock'),
      setVolume: (v) => this.setVolume('sfx', v),
      preload: (names) => {
        if (!names || !names.length) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        names.forEach((name) => {
          const file = SFX_MAP[name] || name;
          const path = file.includes('.') ? SFX_DIR + file : SFX_DIR + file + '.wav';
          this._loadSfxBuffer(name, path).catch(() => {});
        });
      },

      /**
       * 根据关卡类型预加载关键音效
       * 异步预加载，不阻塞主流程
       * @param {string} levelId - 关卡ID
       * @param {Object} levelData - 关卡数据
       * @returns {Promise<void>}
       */
      preloadLevelSfx: (levelId, levelData) => {
        try {
          if (!this.ctx) this.init();
          if (!this.ctx) return Promise.resolve();

          const sfxToPreload = [
            'fill_correct',
            'fill_wrong',
            'select',
            'click',
            'hint',
            'success',
            'eureka',
            'breakthrough',
            'victory_short',
            'error',
          ];

          // Boss 关额外预加载
          if (levelData && (levelData.isBoss || levelData.battleMode)) {
            sfxToPreload.push('victory_full', 'achievement', 'combo_max');
          }

          // 三幕引导关额外预加载
          if (levelData && levelData.features && levelData.features.threeActGuide) {
            sfxToPreload.push('reveal', 'notification');
          }

          // 异步预加载，不阻塞
          const promises = sfxToPreload.map((name) => {
            const file = SFX_MAP[name] || name;
            const path = file.includes('.') ? SFX_DIR + file : SFX_DIR + file + '.wav';
            return this._loadSfxBuffer(name, path).catch(() => null);
          });

          return Promise.all(promises).then(() => {});
        } catch (e) {
          console.debug('[AudioService] preloadLevelSfx failed:', e.message);
          return Promise.resolve();
        }
      },
    };

    // === Voice ===
    voice = {
      play: (voiceId, options) => {
        if (!this.enabled) return;
        if (!voiceId) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        this.resume();

        options = options || {};
        const onended = options.onended || null;
        const fadeInMs = options.fadeInMs || 0;
        const volume = (options.volume !== undefined) ? options.volume : 1;

        // Stop any currently playing voice first (with quick fade for smoothness)
        if (this._voiceSource) {
          this._stopVoiceNow(50);
        }

        const path = VOICE_DIR + voiceId + '.wav';

        this._loadVoiceBuffer(voiceId, path).then((buffer) => {
          if (!buffer) {
            console.warn('[AudioService] Voice buffer not available:', voiceId);
            if (onended) onended();
            return;
          }
          this._playVoiceBuffer(buffer, { onended: onended, fadeInMs: fadeInMs, volume: volume });
        }).catch((e) => {
          console.warn('[AudioService] Voice play failed:', voiceId, e);
          if (onended) onended();
        });
      },

      stop: (fadeMs) => {
        if (fadeMs === undefined) fadeMs = 100;
        if (!this._voiceSource) {
          // Fallback: also stop legacy HTML Audio element if present
          if (this._audioEl) {
            try { this._audioEl.pause(); } catch(e) {}
            this._audioEl = null;
          }
          return;
        }
        this._stopVoiceNow(fadeMs);
      },

      setVolume: (v) => this.setVolume('voice', v),

      preload: (voiceIds) => {
        if (!voiceIds || !voiceIds.length) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        voiceIds.forEach((voiceId) => {
          const path = VOICE_DIR + voiceId + '.wav';
          this._loadVoiceBuffer(voiceId, path).catch(() => {});
        });
      },
    };

    // === BGM ===
    bgm = {
      play: (chapterId) => {
        if (!this.enabled || !this.bgmEnabled) return;
        this.resume();
        const path = BGM_DIR + 'chapter_' + chapterId + '.mp3';
        this._playBgm(path);
      },
      playFile: (filename) => {
        console.log('[AudioService] bgm.playFile:', filename, 'enabled:', this.enabled, 'bgmEnabled:', this.bgmEnabled);
        if (!this.enabled || !this.bgmEnabled) return;
        this.resume();
        const path = BGM_DIR + filename;
        this._playBgm(path);
      },
      stop: (fadeMs) => {
        if (fadeMs === undefined) fadeMs = 200;
        if (!this._bgmTrack && !this.bgmPlaying) return;

        this.bgmPlaying = false;
        this._pendingBgm = null;

        if (this._bgmTrack) {
          const oldTrack = this._bgmTrack;
          this._bgmTrack = null;
          this._currentBgm = null;
          this._fadeOutAndDisposeTrack(oldTrack, fadeMs);
        }

        // Also stop any fading-out tracks immediately if fadeMs is 0
        if (fadeMs === 0) {
          while (this._bgmFadingOut.length) {
            this._disposeBgmTrack(this._bgmFadingOut.pop());
          }
        }
      },
      pause: () => {
        if (!this._bgmTrack || !this.bgmPlaying) return;
        try { this._bgmTrack.el.pause(); } catch(e) {}
        this.bgmPlaying = false;
      },
      resume: () => {
        if (!this._bgmTrack || this.bgmPlaying) return;
        if (!this.enabled || !this.bgmEnabled) return;
        this._bgmTrack.el.play().then(() => {
          this.bgmPlaying = true;
        }).catch((e) => {
          console.warn('[AudioService] BGM resume failed:', e);
        });
      },
      transition: (intensity, fadeMs = 500) => {
        if (!this.ctx || !this.bgmGain) return;
        this._currentIntensity = intensity;

        const volumeMap = { Muted: 0.03, Normal: 0.15, Intense: 0.3, Eureka: 0.5 };
        const filterMap = { Muted: 300, Normal: 20000, Intense: 20000, Eureka: 20000 };

        let targetVol = (volumeMap[intensity] || 0.15) * this._volumes.bgm;
        const targetFreq = filterMap[intensity] || 20000;

        // Apply ducking factor if ducking is active
        if (this._duckingActive) {
          targetVol *= 0.7;
        }

        const now = this.ctx.currentTime;
        this.bgmGain.gain.cancelScheduledValues(now);
        this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
        this.bgmGain.gain.linearRampToValueAtTime(targetVol, now + fadeMs / 1000);

        this.bgmFilter.frequency.cancelScheduledValues(now);
        this.bgmFilter.frequency.setValueAtTime(this.bgmFilter.frequency.value, now);
        this.bgmFilter.frequency.linearRampToValueAtTime(targetFreq, now + fadeMs / 1000);
      },
      setLowPass: (freq, duration = 500) => {
        if (!this.ctx || !this.bgmFilter) return;
        const now = this.ctx.currentTime;
        this.bgmFilter.frequency.cancelScheduledValues(now);
        this.bgmFilter.frequency.setValueAtTime(this.bgmFilter.frequency.value, now);
        this.bgmFilter.frequency.linearRampToValueAtTime(freq, now + duration / 1000);
      },
      setVolume: (v) => this.setVolume('bgm', v),

      /**
       * 播放 Boss 战专属 BGM
       * @param {string} bossId - Boss ID
       * @param {Object} options - 选项
       * @param {string} options.bgmFile - 自定义 BGM 文件名（可选）
       * @param {boolean} options.fadeIn - 是否淡入（默认 true）
       * @param {number} options.volume - 音量（默认 0.6）
       */
      playBoss: (bossId, options) => {
        try {
          if (!this.enabled || !this.bgmEnabled) return;
          this.resume();

          options = options || {};
          const bgmFile = options.bgmFile || `boss_${bossId}.mp3`;
          const path = BGM_DIR + bgmFile;
          const volume = (options.volume !== undefined) ? options.volume : 0.6;
          const fadeIn = options.fadeIn !== false;

          // Boss BGM uses crossfade like normal BGM, but with custom volume
          this._pendingBgm = path;
          this._pendingBgmOptions = { volume: volume, fadeIn: fadeIn };

          if (this._unlocked) {
            this._playBgmNow(path, { volume: volume, fadeIn: fadeIn });
          }
        } catch (e) {
          console.debug('[AudioService] bgm.playBoss failed:', e.message);
        }
      },

      /**
       * 停止 Boss 战 BGM
       * @param {number} fadeOutMs - 淡出时长（毫秒），默认 500ms
       */
      stopBoss: (fadeOutMs) => {
        try {
          if (fadeOutMs === undefined) fadeOutMs = 500;
          if (!this._bgmTrack || !this.bgmPlaying) {
            this.bgm.stop(fadeOutMs);
            return;
          }

          // Fade out the BGM bus gain to 0, then stop
          if (this.ctx && this.bgmGain && fadeOutMs > 0) {
            const now = this.ctx.currentTime;
            const currentGain = this.bgmGain.gain.value;
            this.bgmGain.gain.cancelScheduledValues(now);
            this.bgmGain.gain.setValueAtTime(currentGain, now);
            this.bgmGain.gain.linearRampToValueAtTime(0, now + fadeOutMs / 1000);

            setTimeout(() => {
              this.bgm.stop(0);
              // Restore bgmGain to user setting for next playback
              if (this.bgmGain && this.ctx) {
                const t = this.ctx.currentTime;
                this.bgmGain.gain.cancelScheduledValues(t);
                this.bgmGain.gain.setValueAtTime(this._volumes.bgm, t);
              }
            }, fadeOutMs);
          } else {
            this.bgm.stop(0);
          }
        } catch (e) {
          console.debug('[AudioService] bgm.stopBoss failed:', e.message);
          // Fallback: stop immediately
          try { this.bgm.stop(0); } catch(e2) {}
        }
      },
    };

    // === SFX: buffer loading ===
    _loadSfxBuffer(name, path) {
      if (this._sfxCache.has(name)) {
        return Promise.resolve(this._sfxCache.get(name));
      }
      return fetch(path)
        .then((response) => {
          if (!response.ok) {
            throw new Error('HTTP ' + response.status);
          }
          return response.arrayBuffer();
        })
        .then((arrayBuffer) => this.ctx.decodeAudioData(arrayBuffer))
        .then((audioBuffer) => {
          this._sfxCache.set(name, audioBuffer);
          return audioBuffer;
        })
        .catch((e) => {
          console.warn('[AudioService] Failed to load SFX:', name, e);
          return null;
        });
    }

    // === SFX: Web Audio playback ===
    _playSfxBuffer(name, path, options) {
      const volume = (options && options.volume !== undefined) ? options.volume : 1;

      this._loadSfxBuffer(name, path).then((buffer) => {
        if (!buffer) return;
        if (!this.ctx) return;

        try {
          const source = this.ctx.createBufferSource();
          source.buffer = buffer;

          const gainNode = this.ctx.createGain();
          const targetGain = Math.max(0, Math.min(1, volume));
          gainNode.gain.value = targetGain;

          source.connect(gainNode);
          gainNode.connect(this.sfxGain);

          source.onended = () => {
            try { source.disconnect(); } catch(e) {}
            try { gainNode.disconnect(); } catch(e) {}
            this._sfxSources.delete(source);
          };

          this._sfxSources.add(source);
          source.start(0);
        } catch(e) {
          console.warn('[AudioService] SFX playback error:', name, e);
        }
      });
    }

    // === Helpers ===
    _playTypewriterBurst(path, volume) {
      // Single click - typewriter sound is now played by StoryEngine per character
      this._playSfxBuffer('typewriter', path, { volume: volume || 0.5 });
    }

    _playSample(path) {
      // Legacy fallback - delegate to Web Audio buffer system
      const name = path.substring(path.lastIndexOf('/') + 1);
      this._playSfxBuffer(name, path, { volume: 1 });
    }

    // === SFX Preloading ===
    _preloadCommonSfx() {
      const commonSfx = [
        'click',
        'fill_correct',
        'fill_wrong',
        'erase',
        'select',
        'hint',
        'victory',
        'error',
        'success',
        'note_toggle',
        'hover',
        'eureka',
        'paper_flip',
        'dialog_advance',
      ];
      // Defer slightly to not block initial render
      setTimeout(() => {
        if (this.sfx && this.sfx.preload) {
          this.sfx.preload(commonSfx);
          console.log('[AudioService] Preloading common SFX:', commonSfx.length, 'sounds');
        }
      }, 500);
    }

    // --- Voice: buffer loading ---
    _loadVoiceBuffer(voiceId, path) {
      // Return from cache if available
      if (this._voiceCache.has(voiceId)) {
        return Promise.resolve(this._voiceCache.get(voiceId));
      }
      // Fetch and decode
      return fetch(path)
        .then((response) => {
          if (!response.ok) {
            throw new Error('HTTP ' + response.status);
          }
          return response.arrayBuffer();
        })
        .then((arrayBuffer) => this.ctx.decodeAudioData(arrayBuffer))
        .then((audioBuffer) => {
          this._voiceCache.set(voiceId, audioBuffer);
          return audioBuffer;
        })
        .catch((e) => {
          console.warn('[AudioService] Failed to load voice:', voiceId, e);
          return null;
        });
    }

    // --- Voice: Web Audio playback ---
    _playVoiceBuffer(buffer, options) {
      const onended = options.onended || null;
      const fadeInMs = options.fadeInMs || 0;
      const volume = (options.volume !== undefined) ? options.volume : 1;

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = this.ctx.createGain();
      gainNode.gain.value = 0;

      source.connect(gainNode);
      gainNode.connect(this.voiceGain);

      const now = this.ctx.currentTime;
      const targetGain = Math.max(0, Math.min(1, volume));

      if (fadeInMs > 0) {
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(targetGain, now + fadeInMs / 1000);
      } else {
        gainNode.gain.setValueAtTime(targetGain, now);
      }

      // Start ducking: lower SFX (-6dB) and BGM (-3dB) while voice plays
      this._startDucking();

      source.onended = () => {
        // Restore ducking first
        this._endDucking();
        // Only fire onended for natural completion (not forced stop)
        if (!this._voiceStopping && onended) {
          try { onended(); } catch(e) { console.warn('[AudioService] voice onended error:', e); }
        }
        // Cleanup
        try { source.disconnect(); } catch(e) {}
        try { gainNode.disconnect(); } catch(e) {}
        if (this._voiceSource === source) {
          this._voiceSource = null;
          this._voiceGainNode = null;
          this._voiceOnEnded = null;
        }
      };

      this._voiceSource = source;
      this._voiceGainNode = gainNode;
      this._voiceOnEnded = onended;
      this._voiceStopping = false;

      source.start(0);
    }

    // --- Voice: stop with fade out ---
    _stopVoiceNow(fadeMs) {
      if (!this._voiceSource || !this._voiceGainNode) return;

      const source = this._voiceSource;
      const gainNode = this._voiceGainNode;

      this._voiceStopping = true;
      this._voiceSource = null;
      this._voiceGainNode = null;
      this._voiceOnEnded = null;

      // Restore ducking immediately (with fade)
      this._endDucking();

      try {
        const now = this.ctx.currentTime;
        const currentGain = gainNode.gain.value;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(currentGain, now);

        if (fadeMs > 0) {
          gainNode.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
          // Stop the source slightly after fade completes
          try { source.stop(now + fadeMs / 1000 + 0.02); } catch(e) {}
        } else {
          gainNode.gain.setValueAtTime(0, now);
          try { source.stop(now); } catch(e) {}
        }
      } catch(e) {
        // Fallback: force stop
        try { source.stop(); } catch(e2) {}
      }
    }

    // --- Ducking: lower SFX and BGM while voice plays ---
    _startDucking() {
      if (!this.ctx || this._duckingActive) return;
      this._duckingActive = true;
      const now = this.ctx.currentTime;

      // Duck SFX: -6dB (multiply by 0.5), 150ms ramp
      if (this.sfxGain) {
        const currentVal = this.sfxGain.gain.value;
        this._sfxGainBeforeDuck = currentVal;
        this.sfxGain.gain.cancelScheduledValues(now);
        this.sfxGain.gain.setValueAtTime(currentVal, now);
        this.sfxGain.gain.linearRampToValueAtTime(currentVal * 0.5, now + 0.15);
      }

      // Duck BGM: -3dB (multiply by 0.7), 150ms ramp
      if (this.bgmGain) {
        const currentVal = this.bgmGain.gain.value;
        this._bgmGainBeforeDuck = currentVal;
        this.bgmGain.gain.cancelScheduledValues(now);
        this.bgmGain.gain.setValueAtTime(currentVal, now);
        this.bgmGain.gain.linearRampToValueAtTime(currentVal * 0.7, now + 0.15);
      }
    }

    _endDucking() {
      if (!this.ctx || !this._duckingActive) return;
      this._duckingActive = false;
      const now = this.ctx.currentTime;

      // Restore SFX, 150ms ramp
      if (this.sfxGain) {
        const currentVal = this.sfxGain.gain.value;
        // _sfxGainBeforeDuck stores the pre-duck gain value.
        // If setVolume was called during ducking, it was updated to the new base volume.
        const restoreTarget = this._sfxGainBeforeDuck || this._volumes.sfx;
        this.sfxGain.gain.cancelScheduledValues(now);
        this.sfxGain.gain.setValueAtTime(currentVal, now);
        this.sfxGain.gain.linearRampToValueAtTime(restoreTarget, now + 0.15);
      }

      // Restore BGM, 150ms ramp
      if (this.bgmGain) {
        const currentVal = this.bgmGain.gain.value;
        const restoreTarget = this._bgmGainBeforeDuck || this._volumes.bgm;
        this.bgmGain.gain.cancelScheduledValues(now);
        this.bgmGain.gain.setValueAtTime(currentVal, now);
        this.bgmGain.gain.linearRampToValueAtTime(restoreTarget, now + 0.15);
      }
    }

    // --- BGM track management ---
    _createBgmTrack(path, options) {
      options = options || {};
      const audio = new Audio(path);
      audio.loop = true;
      // Set element volume to max — all volume control done via Web Audio gain
      audio.volume = 1;

      const source = this.ctx.createMediaElementSource(audio);
      const trackGain = this.ctx.createGain();
      trackGain.gain.value = (options.startAtZero) ? 0 : 1;

      // Signal chain: source → trackGain → bgmFilter → bgmGain → masterGain
      source.connect(trackGain);
      trackGain.connect(this.bgmFilter);

      return { el: audio, source: source, gain: trackGain, path: path };
    }

    _disposeBgmTrack(track) {
      if (!track) return;
      try { track.gain.disconnect(); } catch(e) {}
      try { track.source.disconnect(); } catch(e) {}
      try { track.el.pause(); } catch(e) {}
      try { track.el.src = ''; } catch(e) {}
    }

    _fadeOutAndDisposeTrack(track, fadeMs) {
      if (!track || !this.ctx) {
        this._disposeBgmTrack(track);
        return;
      }
      const now = this.ctx.currentTime;
      const currentGain = track.gain.gain.value;
      try {
        track.gain.gain.cancelScheduledValues(now);
        track.gain.gain.setValueAtTime(currentGain, now);
        track.gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
      } catch(e) {}

      const trackRef = track;
      setTimeout(() => {
        this._disposeBgmTrack(trackRef);
        // Remove from fadingOut array if present
        const idx = this._bgmFadingOut.indexOf(trackRef);
        if (idx >= 0) this._bgmFadingOut.splice(idx, 1);
      }, fadeMs + 20);
    }

    // Legacy HTML Audio voice playback (kept for reference, no longer used)
    _playVoice(path) {
      if (this._audioEl) {
        try { this._audioEl.pause(); } catch(e) {}
      }
      const audio = new Audio(path);
      audio.volume = this._volumes.voice * this._volumes.master;
      this._audioEl = audio;
      audio.play().catch(() => {});
    }

    _playBgm(path) {
      this._pendingBgm = path;
      this._pendingBgmOptions = null;
      // If already interacted, play immediately with crossfade
      if (this._unlocked) {
        this._playBgmNow(path);
      }
      // Otherwise, wait for first click
    }

    _playBgmNow(path, options) {
      try {
        if (!this.ctx) {
          this.init();
          if (!this.ctx) return;
        }
        options = options || {};
        console.log('[AudioService] Playing BGM:', path);

        // If same track is already playing, do nothing
        if (this._bgmTrack && this._bgmTrack.path === path && this.bgmPlaying) {
          console.log('[AudioService] BGM already playing, skipping:', path);
          return;
        }

        const fadeIn = options.fadeIn !== false; // default true
        const hasExisting = !!this._bgmTrack;

        // Create new track (start at 0 if we're crossfading or fadeIn is requested)
        const newTrack = this._createBgmTrack(path, { startAtZero: hasExisting || fadeIn });

        // Move current track to fading-out state
        if (this._bgmTrack) {
          const oldTrack = this._bgmTrack;
          this._bgmFadingOut.push(oldTrack);
          this._fadeOutAndDisposeTrack(oldTrack, 800);
        }

        this._bgmTrack = newTrack;
        this._currentBgm = newTrack.el; // keep for backward compat
        this.bgmPlaying = true;

        // If a custom volume is provided (e.g. Boss BGM), set bgmGain to it
        if (options.volume !== undefined) {
          const now = this.ctx.currentTime;
          const targetVol = this._duckingActive ? options.volume * 0.7 : options.volume;
          this.bgmGain.gain.cancelScheduledValues(now);
          this.bgmGain.gain.setValueAtTime(targetVol, now);
        } else if (this.bgmGain && this.bgmGain.gain.value < 0.001) {
          // Reset bgmGain to user volume if it was faded down by stopBoss
          const now = this.ctx.currentTime;
          const targetVol = this._duckingActive ? this._volumes.bgm * 0.7 : this._volumes.bgm;
          this.bgmGain.gain.cancelScheduledValues(now);
          this.bgmGain.gain.setValueAtTime(targetVol, now);
        }

        newTrack.el.play().then(() => {
          // If track was replaced before playback started, skip fade-in
          if (this._bgmTrack !== newTrack) {
            console.log('[AudioService] BGM track obsolete before play started, skipping fade-in');
            return;
          }
          console.log('[AudioService] BGM playing successfully');
          const now = this.ctx.currentTime;

          if (hasExisting) {
            // Crossfade: new track fades in over 800ms with 30% overlap
            // Old track started fading at t=0, finishes at t=800ms
            // New track starts fading in at t = 800 * (1 - 0.3) = 560ms
            // Overlap period: 560ms to 800ms = 240ms (30% of 800ms)
            const fadeDuration = 0.8; // seconds
            const overlapRatio = 0.3;
            const delay = fadeDuration * (1 - overlapRatio); // 0.56s

            newTrack.gain.gain.cancelScheduledValues(now);
            newTrack.gain.gain.setValueAtTime(0, now);
            newTrack.gain.gain.setValueAtTime(0, now + delay);
            newTrack.gain.gain.linearRampToValueAtTime(1, now + delay + fadeDuration);
          } else if (fadeIn) {
            // Simple fade-in from 0, 800ms
            const fadeDuration = 0.8;
            newTrack.gain.gain.cancelScheduledValues(now);
            newTrack.gain.gain.setValueAtTime(0, now);
            newTrack.gain.gain.linearRampToValueAtTime(1, now + fadeDuration);
          } else {
            // No fade, start at full volume
            newTrack.gain.gain.cancelScheduledValues(now);
            newTrack.gain.gain.setValueAtTime(1, now);
          }
        }).catch((e) => {
          console.warn('[AudioService] BGM play failed:', e.message);
          // Clean up on failure
          if (this._bgmTrack === newTrack) {
            this._disposeBgmTrack(newTrack);
            this._bgmTrack = null;
            this._currentBgm = null;
            this.bgmPlaying = false;
          }
        });
      } catch(e) {
        console.error('[AudioService] BGM error:', e);
      }
    }

    unlock() {
      if (this._unlocked) {
        // Already unlocked, but may have pending BGM
        if (this._pendingBgm && !this.bgmPlaying) {
          this._playBgmNow(this._pendingBgm, this._pendingBgmOptions || {});
          this._pendingBgm = null;
          this._pendingBgmOptions = null;
        }
        return;
      }
      console.log('[AudioService] Audio unlocked');
      this._unlocked = true;
      this.resume();
      // Play pending BGM if any
      if (this._pendingBgm) {
        console.log('[AudioService] Playing pending BGM:', this._pendingBgm);
        this._playBgmNow(this._pendingBgm, this._pendingBgmOptions || {});
        this._pendingBgm = null;
        this._pendingBgmOptions = null;
      }
    }

    // === Synthesizer (Web Audio tone generation) ===
    // Lightweight synth for procedural sound effects (avalanche, etc.)
    // Uses OscillatorNode + GainNode with ADSR envelope
    synth = {
      /**
       * Play a single synthesized tone
       * @param {number} freq - Frequency in Hz
       * @param {number} duration - Duration in seconds
       * @param {string} type - Oscillator type: 'sine', 'square', 'sawtooth', 'triangle'
       * @param {number} volume - Volume (0-1), applied on top of sfx gain
       */
      playTone: (freq, duration, type, volume) => {
        if (!this.enabled || !this.sfxEnabled) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        this.resume();

        type = type || 'sine';
        volume = (volume !== undefined) ? volume : 0.3;

        try {
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = type;
          osc.frequency.value = freq;

          // ADSR envelope: attack 10ms, decay 50ms, sustain 0.3, release 100ms
          const attack = 0.01;
          const decay = 0.05;
          const sustain = 0.3;
          const release = 0.1;

          const peakGain = Math.max(0, Math.min(1, volume));
          const sustainGain = peakGain * sustain;

          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(peakGain, now + attack);
          gain.gain.linearRampToValueAtTime(sustainGain, now + attack + decay);

          // If duration is long enough, hold sustain, then release
          const totalSustain = Math.max(0, duration - attack - decay);
          const releaseStart = now + attack + decay + totalSustain;
          gain.gain.setValueAtTime(sustainGain, releaseStart);
          gain.gain.linearRampToValueAtTime(0, releaseStart + release);

          osc.connect(gain);
          gain.connect(this.sfxGain);

          osc.start(now);
          osc.stop(releaseStart + release + 0.02);

          // Cleanup
          osc.onended = () => {
            try { osc.disconnect(); } catch(e) {}
            try { gain.disconnect(); } catch(e) {}
          };
        } catch(e) {
          // Silent failure - synth is non-critical
          console.debug('[AudioService] synth.playTone failed:', e.message);
        }
      },

      /**
       * Avalanche start sound - single clear bell-like tone
       * Signals the beginning of the avalanche sequence
       */
      playAvalancheStart: () => {
        if (!this.enabled || !this.sfxEnabled) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        this.resume();

        try {
          const now = this.ctx.currentTime;

          // C5 (523Hz) - soft, clear opening tone
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'sine';
          osc.frequency.value = 523.25; // C5

          // Gentle envelope: soft attack, longer decay for bell-like quality
          const peakGain = 0.25;
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(peakGain, now + 0.015);  // attack
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);  // long decay

          osc.connect(gain);
          gain.connect(this.sfxGain);

          osc.start(now);
          osc.stop(now + 0.85);

          osc.onended = () => {
            try { osc.disconnect(); } catch(e) {}
            try { gain.disconnect(); } catch(e) {}
          };
        } catch(e) {
          console.debug('[AudioService] avalancheStart failed:', e.message);
        }
      },

      /**
       * Avalanche tick - individual notes during the avalanche cascade
       * Pitch rises with progress, creating an upward scale effect
       * @param {number} index - Current tick index (0-based)
       * @param {number} total - Total number of expected ticks
       */
      playAvalancheTick: (index, total) => {
        if (!this.enabled || !this.sfxEnabled) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        this.resume();

        total = Math.max(1, total || 1);
        const progress = Math.min(1, Math.max(0, index / total));

        try {
          const now = this.ctx.currentTime;

          // Pitch: C5 (523Hz) -> C7 (2093Hz), exponential rise
          const startFreq = 523.25;  // C5
          const endFreq = 2093.0;    // C7
          // Use exponential mapping for natural musical feel
          const freq = startFreq * Math.pow(endFreq / startFreq, progress);

          // Volume curve: soft at start, peak in middle, slightly fade at end
          // Simulates avalanche approaching then passing
          let vol;
          if (progress < 0.3) {
            // Fade in: 0.1 -> 0.35
            vol = 0.1 + (progress / 0.3) * 0.25;
          } else if (progress < 0.7) {
            // Peak: steady at 0.35
            vol = 0.35;
          } else {
            // Fade out: 0.35 -> 0.15
            vol = 0.35 - ((progress - 0.7) / 0.3) * 0.2;
          }

          // Duration: shorter as progress increases (faster notes)
          const duration = 0.12 - progress * 0.06; // 120ms -> 60ms

          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          // Use triangle wave for a brighter, more "ping-like" quality
          osc.type = 'triangle';
          osc.frequency.value = freq;

          // Snappy envelope
          const attack = 0.005;
          const release = Math.max(0.02, duration * 0.6);
          const peakGain = vol;

          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(peakGain, now + attack);
          gain.gain.exponentialRampToValueAtTime(0.001, now + attack + release);

          osc.connect(gain);
          gain.connect(this.sfxGain);

          osc.start(now);
          osc.stop(now + attack + release + 0.02);

          osc.onended = () => {
            try { osc.disconnect(); } catch(e) {}
            try { gain.disconnect(); } catch(e) {}
          };
        } catch(e) {
          console.debug('[AudioService] avalancheTick failed:', e.message);
        }
      },

      /**
       * Avalanche end sound - major chord with fade-out
       * Signals completion of the avalanche sequence
       */
      playAvalancheEnd: () => {
        if (!this.enabled || !this.sfxEnabled) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        this.resume();

        try {
          const now = this.ctx.currentTime;

          // C major chord: C5 + E5 + G5
          const chordFreqs = [523.25, 659.25, 783.99]; // C5, E5, G5
          const volume = 0.2;

          chordFreqs.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;

            // Slight delay between voices for a spread chord effect
            const startDelay = i * 0.03;
            const startTime = now + startDelay;

            // Gentle envelope: quick attack, long fade
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(volume, startTime + 0.02); // attack
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.2); // fade out

            osc.connect(gain);
            gain.connect(this.sfxGain);

            osc.start(startTime);
            osc.stop(startTime + 1.25);

            osc.onended = () => {
              try { osc.disconnect(); } catch(e) {}
              try { gain.disconnect(); } catch(e) {}
            };
          });
        } catch(e) {
          console.debug('[AudioService] avalancheEnd failed:', e.message);
        }
      },

      /**
       * 播放音符序列（辅助方法）
       * @param {number[]} freqs - 频率数组（Hz）
       * @param {number} interval - 每个音符间隔（毫秒）
       * @param {string} type - 波形类型
       * @param {number} volume - 音量
       */
      playNoteSequence: (freqs, interval, type, volume) => {
        try {
          if (!freqs || !freqs.length) return;
          type = type || 'sine';
          volume = (volume !== undefined) ? volume : 0.3;
          interval = interval || 200;

          freqs.forEach((freq, i) => {
            setTimeout(() => {
              try {
                this.synth.playTone(freq, interval * 0.8 / 1000, type, volume);
              } catch(e) {
                console.debug('[AudioService] playNoteSequence note failed:', e.message);
              }
            }, i * interval);
          });
        } catch(e) {
          console.debug('[AudioService] playNoteSequence failed:', e.message);
        }
      },

      /**
       * 第一幕开幕音效：悠扬的上升音阶
       * C5 → E5 → G5，轻柔
       */
      playActOpen: () => {
        try {
          if (!this.enabled || !this.sfxEnabled) return;
          // C5(523) → E5(659) → G5(784)，每个音 200ms，轻柔
          this.synth.playNoteSequence([523.25, 659.25, 783.99], 200, 'sine', 0.2);
        } catch(e) {
          console.debug('[AudioService] playActOpen failed:', e.message);
        }
      },

      /**
       * 第二幕破局音效：紧张的低音 + 上升音
       * 低频持续音 + 高音点缀
       */
      playActBreakthrough: () => {
        try {
          if (!this.enabled || !this.sfxEnabled) return;
          if (!this.ctx) this.init();
          if (!this.ctx) return;
          this.resume();

          // A3 低音 (220Hz) - 低沉持续音
          this.synth.playTone(220, 0.5, 'triangle', 0.15);
          // 200ms 后 A5 高音 (880Hz) - 明亮的破局提示音
          setTimeout(() => {
            try {
              this.synth.playTone(880, 0.15, 'sine', 0.2);
            } catch(e) {}
          }, 200);
        } catch(e) {
          console.debug('[AudioService] playActBreakthrough failed:', e.message);
        }
      },
    };
  }

  global.AudioService = new AudioService();
})(window);
