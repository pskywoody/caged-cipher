// ============================================================
//  StoryOrchestrator - 剧情编排器
// ============================================================
//  负责关卡/章节层面的剧情播放编排
//  - 前置对话 (preDialog)
//  - 章节序章 (prologue)
//  - 通关对话 (clearDialog)
//  - 章节尾声 (epilogue)
//  - 首次技巧教学对话 (first-encounter teaching)
//  - 图鉴解锁（角色、背景）
// ============================================================
//  物理分离，逻辑不变：从 guide.js 抽离，仅做搬移，不改逻辑
//  依赖注入：所有外部依赖通过 init() 注入
// ============================================================

;(function(global) {
  'use strict';

  const log = new Logger('StoryOrchestrator');

  // 角色名 -> 角色ID 映射（与 guide.js 保持一致）
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

  // 各章节默认背景图（用于 preDialog 没有设置 bg 时的兜底）
  const CHAPTER_DEFAULT_BG = {
    1: 'assets/images/backgrounds/bg_scene1_single_door_v2.jpg',
    2: 'assets/images/backgrounds/bg_scene13.jpg',
    3: 'assets/images/backgrounds/bg_scene23.jpg',
    4: 'assets/images/backgrounds/bg_scene32.jpg',
    5: 'assets/images/backgrounds/bg_scene40.jpg',
    6: 'assets/images/backgrounds/bg_scene48.jpg',
    7: 'assets/images/backgrounds/bg_scene56.jpg',
    8: 'assets/images/backgrounds/bg_scene63.jpg',
  };

  class StoryOrchestrator {
    constructor() {
      this.storyEngine = null;
      this.galleryPanel = null;
      this.renderer = null;
      this.board = null;
      this.AudioService = null;

      // 状态 getter（由外部注入）
      this._getCurrentLevelData = null;
      this._getCurrentChapterData = null;
      this._getCurrentLevelId = null;

      // 回调（由外部注入）
      this._setUIVisible = null;
      this._setInteractionLocked = null;
    }

    /**
     * 初始化剧情编排器，注入所有依赖
     * @param {Object} options
     */
    init(options) {
      this.storyEngine = options.storyEngine || null;
      this.galleryPanel = options.galleryPanel || null;
      this.renderer = options.renderer || null;
      this.board = options.board || null;
      this.AudioService = options.AudioService || null;

      this._getCurrentLevelData = options.getCurrentLevelData || (() => null);
      this._getCurrentChapterData = options.getCurrentChapterData || (() => null);
      this._getCurrentLevelId = options.getCurrentLevelId || (() => 0);

      this._setUIVisible = options.setUIVisible || (() => {});
      this._setInteractionLocked = options.setInteractionLocked || (() => {});

      log.info('StoryOrchestrator initialized');
    }

    // === 外部状态更新接口 ===
    setStoryEngine(eng) { this.storyEngine = eng; }
    setGalleryPanel(panel) { this.galleryPanel = panel; }
    setRenderer(r) { this.renderer = r; }
    setBoard(b) { this.board = b; }

    // ============================================================
    //  图鉴解锁辅助
    // ============================================================

    /**
     * 从对话行中解锁出现的角色
     */
    unlockCharactersFromDialog(dialogLines) {
      if (!this.galleryPanel || !dialogLines || !Array.isArray(dialogLines)) return;

      dialogLines.forEach(line => {
        if (!line.speaker) return;
        const charId = NAME_TO_CHAR[line.speaker];
        if (charId) {
          this.galleryPanel.unlockCharacter(charId);
        }
      });
    }

    /**
     * 从对话行中解锁出现的背景
     */
    unlockBackgroundsFromDialog(dialogLines) {
      if (!this.galleryPanel || !dialogLines || !Array.isArray(dialogLines)) return;

      dialogLines.forEach(line => {
        if (line.bg) {
          this._unlockBackgroundPath(line.bg);
        }
      });
    }

    /**
     * 解锁单个背景（内部方法）
     */
    _unlockBackgroundPath(bgPath) {
      if (!this.galleryPanel || !bgPath) return;
      let bgName = bgPath;
      if (bgName.startsWith('assets/')) {
        bgName = bgName.substring(bgName.lastIndexOf('/') + 1);
      }
      this.galleryPanel.unlockBackground(bgName);
    }

    /**
     * 解锁单个背景（公开方法，向后兼容）
     */
    unlockBackground(bgPath) {
      this._unlockBackgroundPath(bgPath);
    }

    // ============================================================
    //  剧情播放编排
    // ============================================================

    /**
     * 播放关卡前置对话
     */
    playPreDialog() {
      return new Promise((resolve) => {
        const currentLevelData = this._getCurrentLevelData();
        const currentChapterData = this._getCurrentChapterData();
        const currentLevelId = this._getCurrentLevelId();

        if (!this.storyEngine || !currentLevelData) {
          resolve();
          return;
        }

        const preDialog = currentLevelData.preDialog || [];
        if (preDialog.length === 0) {
          resolve();
          return;
        }

        // 解锁出现的角色
        this.unlockCharactersFromDialog(preDialog);

        // 解锁对话中出现的背景
        this.unlockBackgroundsFromDialog(preDialog);

        // 设置场景键，用于已读剧情记录
        const chapterId = currentChapterData ? currentChapterData.chapterId : 0;
        this.storyEngine.setSceneKey(chapterId + '_' + currentLevelId + '_pre');

        // 如果对话中没有设置背景，且当前没有背景，则设置章节默认背景
        const hasBgInDialog = preDialog.some(line => line.bg);
        const hasCurrentBg = this.storyEngine._currentBg;
        if (!hasBgInDialog && !hasCurrentBg && CHAPTER_DEFAULT_BG[chapterId]) {
          this.storyEngine._changeBg(CHAPTER_DEFAULT_BG[chapterId]);
          // 解锁章节默认背景
          this._unlockBackgroundPath(CHAPTER_DEFAULT_BG[chapterId]);
        }

        // Hide game UI during story
        this._setUIVisible(false);

        log.info('Playing pre-dialog (%d lines)', preDialog.length);
        this.storyEngine.sayLines(preDialog, () => {
          this._setUIVisible(true);
          this._setInteractionLocked(false);
          // 标记剧情已读（图鉴用）
          if (this.galleryPanel) {
            this.galleryPanel.markSceneRead(chapterId, currentLevelId, 'pre');
          }
          resolve();
        });
      });
    }

    /**
     * 播放章节序章
     */
    playPrologue() {
      return new Promise((resolve) => {
        const currentChapterData = this._getCurrentChapterData();

        if (!this.storyEngine || !currentChapterData) {
          resolve();
          return;
        }

        const prologue = currentChapterData.prologue || currentChapterData.introStory || [];
        if (prologue.length === 0) {
          resolve();
          return;
        }

        // 解锁出现的角色
        this.unlockCharactersFromDialog(prologue);

        // 解锁对话中出现的背景
        this.unlockBackgroundsFromDialog(prologue);

        // 设置场景键，用于已读剧情记录
        const chapterId = currentChapterData.chapterId;
        this.storyEngine.setSceneKey(chapterId + '_prologue');

        // Hide game UI during story
        this._setUIVisible(false);

        // Start BGM - intro.mp3 for prologue
        if (this.AudioService) {
          this.AudioService.bgm.playFile('intro.mp3');
        }

        log.info('Playing prologue (%d lines)', prologue.length);
        this.storyEngine.sayLines(prologue, () => {
          // Show game UI after story
          this._setUIVisible(true);
          this._setInteractionLocked(false);
          // 标记剧情已读（图鉴用）
          if (this.galleryPanel) {
            this.galleryPanel.markSceneRead(chapterId, 0, 'prologue');
          }
          resolve();
        });
      });
    }

    /**
     * 播放关卡通关对话
     */
    playClearDialog(callback) {
      const currentLevelData = this._getCurrentLevelData();
      const currentChapterData = this._getCurrentChapterData();
      const currentLevelId = this._getCurrentLevelId();

      if (!this.storyEngine || !currentLevelData) {
        if (callback) callback();
        return;
      }

      const clearDialog = currentLevelData.clearDialog || [];
      if (clearDialog.length === 0) {
        if (callback) callback();
        return;
      }

      // 解锁出现的角色
      this.unlockCharactersFromDialog(clearDialog);

      // 解锁对话中出现的背景
      this.unlockBackgroundsFromDialog(clearDialog);

      // 设置场景键，用于已读剧情记录
      const chapterId = currentChapterData ? currentChapterData.chapterId : 0;
      this.storyEngine.setSceneKey(chapterId + '_' + currentLevelId + '_clear');

      this._setUIVisible(false);
      log.info('Playing clear dialog (%d lines)', clearDialog.length);
      this.storyEngine.sayLines(clearDialog, () => {
        this._setUIVisible(true);
        // 标记剧情已读（图鉴用）
        if (this.galleryPanel) {
          this.galleryPanel.markSceneRead(chapterId, currentLevelId, 'clear');
        }
        if (callback) callback();
      });
    }

    /**
     * 播放章节尾声
     */
    playChapterEpilogue(callback) {
      const currentChapterData = this._getCurrentChapterData();

      if (!this.storyEngine || !currentChapterData) {
        if (callback) callback();
        return;
      }

      const epilogue = currentChapterData.epilogue || currentChapterData.endingStory || [];
      if (epilogue.length === 0) {
        if (callback) callback();
        return;
      }

      // 解锁对话中出现的角色和背景
      this.unlockCharactersFromDialog(epilogue);
      this.unlockBackgroundsFromDialog(epilogue);

      // 设置场景键，用于已读剧情记录
      const chapterId = currentChapterData.chapterId;
      this.storyEngine.setSceneKey(chapterId + '_epilogue');

      // Hide completion overlay and game UI
      const overlay = document.getElementById('complete-overlay');
      if (overlay) overlay.style.display = 'none';
      this._setUIVisible(false);

      log.info('Playing chapter epilogue (%d lines)', epilogue.length);
      this.storyEngine.sayLines(epilogue, () => {
        // 标记剧情已读（图鉴用）
        if (this.galleryPanel) {
          this.galleryPanel.markSceneRead(chapterId, 0, 'epilogue');
        }
        if (callback) callback();
      });
    }

    // ============================================================
    //  首次技巧教学对话
    // ============================================================

    /**
     * 播放首次遇到技巧的教学对话（完整 StoryEngine 展示）
     * 显示角色立绘 + 打字机对话，然后重新高亮目标
     */
    playFirstEncounterTeaching(dialogLines, characterId, techniqueName, targetCells) {
      if (!this.storyEngine || !dialogLines || dialogLines.length === 0) return;

      log.info('Playing first encounter teaching:', techniqueName, characterId);

      // Disable interaction during teaching
      this._setInteractionLocked(true);

      // Show teaching badge/title briefly
      this._showTeachingBadge(techniqueName);

      // Use StoryEngine for full dialogue experience
      // Shorten to 2-3 lines for first encounter (keep it snappy)
      const shortLines = dialogLines.slice(0, Math.min(3, dialogLines.length));

      setTimeout(() => {
        // 设置场景键，用于已读剧情记录
        const currentChapterData = this._getCurrentChapterData();
        const currentLevelId = this._getCurrentLevelId();
        const chapterId = currentChapterData ? currentChapterData.chapterId : 0;
        const techKey = (techniqueName || 'unknown').replace(/\s+/g, '_');
        this.storyEngine.setSceneKey(chapterId + '_' + currentLevelId + '_tech_' + techKey);

        this.storyEngine.sayLines(shortLines, () => {
          // Re-highlight hint target after teaching ends
          if (this.renderer && typeof this.renderer.clearHintHighlights === 'function') {
            this.renderer.clearHintHighlights('hint');
            if (targetCells && targetCells.length > 0 && typeof this.renderer.highlightHintCells === 'function') {
              this.renderer.highlightHintCells(targetCells, 'hint', 'hint');
            }
            this.renderer.render(this.board);
          }
          this._setInteractionLocked(false);
          log.info('First encounter teaching complete:', techniqueName);
        });
      }, 800);
    }

    /**
     * 显示"新技巧发现"徽章
     */
    _showTeachingBadge(techniqueName) {
      const badge = document.createElement('div');
      badge.style.cssText = 'position:fixed;top:30%;left:50%;transform:translate(-50%,-50%) scale(0.8);' +
        'background:linear-gradient(135deg,rgba(251,191,36,0.2),rgba(15,23,42,0.95));' +
        'border:2px solid rgba(251,191,36,0.6);border-radius:16px;' +
        'padding:20px 40px;z-index:9998;text-align:center;' +
        'opacity:0;transition:all 0.5s cubic-bezier(0.4,0,0.2,1);' +
        'pointer-events:none;backdrop-filter:blur(4px);';
      badge.innerHTML =
        '<div style="font-size:12px;color:#fbbf24;letter-spacing:4px;margin-bottom:8px;">✦ 新技巧发现 ✦</div>' +
        '<div style="font-size:24px;font-weight:900;color:#fef3c7;text-shadow:0 0 20px rgba(251,191,36,0.5);">' +
        (techniqueName || '新技巧') + '</div>';
      document.body.appendChild(badge);

      requestAnimationFrame(() => {
        badge.style.opacity = '1';
        badge.style.transform = 'translate(-50%,-50%) scale(1)';
      });
      setTimeout(() => {
        badge.style.opacity = '0';
        badge.style.transform = 'translate(-50%,-50%) scale(0.9)';
        setTimeout(() => badge.remove(), 500);
      }, 700);
    }
  }

  // 导出到全局
  global.StoryOrchestrator = new StoryOrchestrator();

})(window);
