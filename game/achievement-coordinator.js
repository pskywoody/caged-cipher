// ============================================================
//  AchievementCoordinator - 成就/印章系统协调器
// ============================================================
//  从 guide.js 抽离，物理分离，逻辑不变
//  负责成就面板、图鉴面板、印章动画、高潮动画、成就Toast的协调
//  核心组件已独立：
//    - game/achievement-panel.js (AchievementPanel)
//    - game/gallery-panel.js (GalleryPanel)
//    - game/seal-animation.js (SealAnimation)
// ============================================================

;(function(global) {
  'use strict';

  const log = new Logger('Achievement');

  // 技巧名映射表（用于 recordTechniqueUsage）
  // 将提示系统中的 techniqueName（中文名）映射到进度统计中的键名
  // 与 TechRater / HintSystem 的 10 种技巧对齐
  // 同时兼容教学系统中的 newSkill 命名
  const TECHNIQUE_NAME_TO_ID = {
    // 基础技巧
    '裸单法': 'nakedSingle',
    '隐单法': 'hiddenSingle',
    '笼子唯一组合': 'cageUnique',
    // 杀手数独技巧
    '45法则': 'rule45',
    '笼和推导': 'cageUnique',
    '笼和数对': 'cageUnique',
    // 进阶技巧
    '裸数对': 'nakedPair',
    '隐数对': 'hiddenPair',
    '区块排除': 'pointingClaiming',
    '裸三数组': 'nakedTriplet',
    // 高阶技巧
    '二连纵横阵': 'xWing',
    '三才游鱼阵': 'swordfish',
    // 教学系统 newSkill 命名兼容
    'row_rule': 'nakedSingle',
    'col_rule': 'nakedSingle',
    'palace_rule': 'nakedSingle',
    'box_rule': 'nakedSingle',
    'rule_of_45': 'rule45',
    'naked_single': 'nakedSingle',
    'hidden_single': 'hiddenSingle',
    'naked_pair': 'nakedPair',
    'hidden_pair': 'hiddenPair',
    'x_wing': 'xWing',
  };

  class AchievementCoordinator {
    /**
     * @param {Object} deps - 依赖注入
     * @param {Function} deps.getNameToChar - 获取角色名到ID映射表
     * @param {Function} deps.getBoard - 获取棋盘对象
     * @param {Function} deps.getChapterData - 获取当前章节数据
     * @param {Function} deps.getLevelData - 获取当前关卡数据
     * @param {Function} deps.getChapterSelect - 获取章节选择对象
     * @param {Function} deps.getUsedNotes - 获取本关是否使用了笔记
     * @param {Function} deps.setUIVisible - 设置UI可见性
     * @param {Function} deps.setInteractionLocked - 设置交互锁定
     * @param {Function} deps.vibrate - 震动反馈
     */
    constructor(deps = {}) {
      // 依赖
      this._getNameToChar = deps.getNameToChar || (() => ({}));
      this._getBoard = deps.getBoard || (() => null);
      this._getChapterData = deps.getChapterData || (() => null);
      this._getLevelData = deps.getLevelData || (() => null);
      this._getChapterSelect = deps.getChapterSelect || (() => null);
      this._getUsedNotes = deps.getUsedNotes || (() => false);
      this._setUIVisible = deps.setUIVisible || (() => {});
      this._setInteractionLocked = deps.setInteractionLocked || (() => {});
      this._vibrate = deps.vibrate || (() => {});

      // 面板实例
      this.achievementPanel = null;
      this.galleryPanel = null;

      // 状态
      this._lastHintTechnique = null; // 最近一次提示使用的技巧名（用于技巧类成就判定）
      this._noHintStreak = 0; // 连续不使用提示的关卡数（用于 no_hint_run 成就）

      // PC 布局标记
      this._isPcLayout = false;
    }

    // ============================================================
    //  初始化
    // ============================================================

    /**
     * 设置成就解锁回调（在 setupChapterSelect 中调用）
     */
    setupAchievementCallback() {
      if (!global.ProgressManager) return;

      ProgressManager.onAchievementUnlock((achievement) => {
        // 印章盖印动画（优先显示，如果 SealAnimation 可用）
        if (global.SealAnimationInstance && typeof SealAnimationInstance.show === 'function') {
          SealAnimationInstance.show(achievement);
        }
        // Toast 通知（备用，如果没有印章动画或作为补充）
        this.showAchievementToast(achievement);
        // 刷新成就面板
        if (this.achievementPanel) {
          try { this.achievementPanel.refresh(); } catch (e) {}
        }
      });
    }

    /**
     * 初始化成就面板
     */
    initAchievementPanel() {
      if (!global.AchievementPanel) return null;
      this.achievementPanel = new AchievementPanel();
      return this.achievementPanel;
    }

    /**
     * 初始化图鉴面板
     */
    initGalleryPanel() {
      if (!global.GalleryPanel) return null;
      this.galleryPanel = new GalleryPanel();
      // 暴露 UI 控制函数到全局，供图鉴剧情回放使用
      global.setUIVisible = this._setUIVisible;
      global.setInteractionLocked = this._setInteractionLocked;
      return this.galleryPanel;
    }

    // ============================================================
    //  成就解锁 Toast
    // ============================================================

    showAchievementToast(achievement) {
      const existing = document.querySelector('.achievement-toast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.className = 'achievement-toast';
      toast.style.cssText = 'position:fixed;top:80px;right:20px;' +
        'background:linear-gradient(135deg,rgba(251,191,36,0.15),rgba(30,41,59,0.95));' +
        'border:1px solid rgba(251,191,36,0.5);border-radius:12px;' +
        'padding:16px 20px;z-index:25000;min-width:240px;' +
        'box-shadow:0 4px 20px rgba(251,191,36,0.2);' +
        'transform:translateX(400px);transition:transform 0.5s cubic-bezier(0.4,0,0.2,1);';
      toast.innerHTML =
        '<div style="display:flex;align-items:center;gap:12px;">' +
        '<div style="font-size:32px;">' + achievement.icon + '</div>' +
        '<div style="flex:1;">' +
        '<div style="font-size:11px;color:#fbbf24;letter-spacing:2px;margin-bottom:2px;">成就解锁</div>' +
        '<div style="font-size:15px;font-weight:700;color:#fef3c7;">' + achievement.name + '</div>' +
        '<div style="font-size:12px;color:#94a3b8;margin-top:2px;">' + achievement.desc + '</div>' +
        '</div>' +
        '</div>';
      document.body.appendChild(toast);

      requestAnimationFrame(function() {
        toast.style.transform = 'translateX(0)';
      });
      setTimeout(function() {
        toast.style.transform = 'translateX(400px)';
        setTimeout(function() { toast.remove(); }, 500);
      }, 3500);
    }

    // ============================================================
    //  通关高潮动画（破案印章四步序列）
    //  步骤1：毛玻璃从中心扩散（0.8s）+ 落锁声
    //  步骤2：大印章砸下（0.6s）+ 印章重击声 + 震动
    //  步骤3：毛玻璃碎裂消散（0.5s）+ 玻璃碎裂声
    //  步骤4：结算面板滑入（0.5s）
    // ============================================================

    playClimaxAnimation(callback) {
      const overlay = document.getElementById('climax-overlay');
      const frosted = document.getElementById('climax-frosted');
      const stamp = document.getElementById('climax-stamp');
      const shardsContainer = document.getElementById('climax-shards');

      if (!overlay || !frosted || !stamp) {
        if (callback) callback();
        return;
      }

      // PC 双栏模式：将动画容器移入左侧棋盘区域
      const pcBoardContainer = document.getElementById('pc-board-container');
      const isPcLayout = this._isPcLayout && pcBoardContainer;
      let originalParent = null;
      let originalNextSibling = null;
      let originalPosition = null;
      let originalTop = null;
      let originalLeft = null;
      let originalWidth = null;
      let originalHeight = null;
      let originalZIndex = null;

      if (isPcLayout) {
        // 保存原始位置和样式
        originalParent = overlay.parentElement;
        originalNextSibling = overlay.nextSibling;
        originalPosition = overlay.style.position;
        originalTop = overlay.style.top;
        originalLeft = overlay.style.left;
        originalWidth = overlay.style.width;
        originalHeight = overlay.style.height;
        originalZIndex = overlay.style.zIndex;

        // 将 overlay 移入左侧棋盘容器
        pcBoardContainer.style.position = 'relative';
        pcBoardContainer.appendChild(overlay);

        // 修改样式以适应棋盘容器
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.zIndex = '20';
        overlay.classList.add('climax-pc-mode');
      }

      // 重置状态
      overlay.style.display = 'block';
      overlay.classList.remove('climax-shake');
      frosted.className = 'climax-frosted';
      stamp.className = 'climax-stamp';
      // 清空碎片
      if (shardsContainer) shardsContainer.innerHTML = '';

      // 步骤1：毛玻璃从中心扩散（0.8s）
      // 播放落锁声（使用 key_unlock 或 seal_stamp 作为替代，缺失则静默）
      try {
        if (typeof AudioService !== 'undefined' && AudioService.sfx) {
          AudioService.sfx.play('key_unlock');
        }
      } catch(e) {}

      requestAnimationFrame(() => {
        frosted.classList.add('climax-step1');
      });

      // 步骤2：0.8s 后印章砸下
      setTimeout(() => {
        stamp.classList.add('climax-step2');
        // 印章重击声 + 震动
        try {
          if (typeof AudioService !== 'undefined' && AudioService.sfx) {
            AudioService.sfx.play('seal_stamp');
          }
        } catch(e) {}
        // 震动效果（如果设备支持）
        try {
          this._vibrate('CLIMAX');
        } catch(e) {}
        // overlay 震动
        setTimeout(() => {
          overlay.classList.add('climax-shake');
          setTimeout(() => {
            overlay.classList.remove('climax-shake');
          }, 300);
        }, 300); // 印章"砸下"瞬间（动画约 60% 位置）
      }, 800);

      // 步骤3：1.4s 后（0.8 + 0.6）毛玻璃碎裂消散
      setTimeout(() => {
        frosted.classList.remove('climax-step1');
        frosted.classList.add('climax-step3');

        // 生成玻璃碎片
        if (shardsContainer) {
          this._spawnClimaxShards(shardsContainer, 18);
        }

        // 玻璃碎裂声（用 paper_flip 或其他替代，缺失则静默）
        try {
          if (typeof AudioService !== 'undefined' && AudioService.sfx) {
            // 优先使用 chain_pop 模拟碎裂感，没有就用 paper_flip
            AudioService.sfx.play('chain_pop');
          }
        } catch(e) {}
      }, 1400);

      // 步骤4：1.9s 后（1.4 + 0.5）印章淡出，显示结算面板
      setTimeout(() => {
        stamp.classList.add('climax-step4');

        // 再给一点时间让印章淡出，然后显示结算
        setTimeout(() => {
          // 隐藏 overlay
          overlay.style.display = 'none';
          // 清理碎片
          if (shardsContainer) shardsContainer.innerHTML = '';

          // PC 双栏模式：将动画容器移回原位置
          if (isPcLayout && originalParent) {
            overlay.classList.remove('climax-pc-mode');
            overlay.style.position = originalPosition;
            overlay.style.top = originalTop;
            overlay.style.left = originalLeft;
            overlay.style.width = originalWidth;
            overlay.style.height = originalHeight;
            overlay.style.zIndex = originalZIndex;
            if (originalNextSibling) {
              originalParent.insertBefore(overlay, originalNextSibling);
            } else {
              originalParent.appendChild(overlay);
            }
          }

          if (callback) callback();
        }, 300);
      }, 1900);
    }

    /**
     * 生成玻璃碎片
     */
    _spawnClimaxShards(container, count) {
      if (!container) return;
      // 使用容器尺寸而不是窗口尺寸，适配 PC 双栏模式
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      // 根据容器大小调整碎片数量和距离
      const isSmallContainer = w < window.innerWidth * 0.7;
      const adjustedCount = isSmallContainer ? Math.max(8, Math.floor(count * 0.6)) : count;
      const maxDistance = isSmallContainer ? Math.min(w, h) * 0.5 : 300;
      const minDistance = isSmallContainer ? Math.min(w, h) * 0.2 : 150;

      for (let i = 0; i < adjustedCount; i++) {
        const shard = document.createElement('div');
        shard.className = 'climax-shard';

        // 随机大小和形状（小容器中缩小碎片）
        const sizeScale = isSmallContainer ? 0.6 : 1;
        const size = (8 + Math.random() * 20) * sizeScale;
        const width = size * (0.5 + Math.random() * 1.5);
        const height = size * (0.5 + Math.random() * 1.5);

        // 从中心出发的随机方向
        const angle = Math.random() * Math.PI * 2;
        const distance = minDistance + Math.random() * (maxDistance - minDistance);
        const sx = Math.cos(angle) * distance;
        const sy = Math.sin(angle) * distance;
        const sr = (Math.random() - 0.5) * 720; // 旋转角度

        shard.style.cssText = `
          left: ${w / 2 + (Math.random() - 0.5) * 100 * sizeScale}px;
          top: ${h / 2 + (Math.random() - 0.5) * 100 * sizeScale}px;
          width: ${width}px;
          height: ${height}px;
          --sx: ${sx}px;
          --sy: ${sy}px;
          --sr: ${sr}deg;
          clip-path: polygon(${Math.random() * 30}% 0%, 100% ${Math.random() * 30}%, ${70 + Math.random() * 30}% 100%, 0% ${70 + Math.random() * 30}%);
        `;

        container.appendChild(shard);

        // 触发动画
        requestAnimationFrame(() => {
          shard.classList.add('animate');
        });

        // 动画结束后移除
        setTimeout(() => {
          if (shard.parentNode) shard.parentNode.removeChild(shard);
        }, 700);
      }
    }

    /**
     * 设置 PC 布局状态（供布局切换时调用）
     */
    setPcLayout(isPc) {
      this._isPcLayout = isPc;
    }

    // ============================================================
    //  图鉴解锁辅助函数
    // ============================================================

    unlockCharactersFromDialog(dialogLines) {
      if (!this.galleryPanel || !dialogLines || !Array.isArray(dialogLines)) return;

      const NAME_TO_CHAR = this._getNameToChar();
      dialogLines.forEach(line => {
        if (!line.speaker) return;
        const charId = NAME_TO_CHAR[line.speaker];
        if (charId) {
          this.galleryPanel.unlockCharacter(charId);
        }
      });
    }

    unlockBackgroundsFromDialog(dialogLines) {
      if (!this.galleryPanel || !dialogLines || !Array.isArray(dialogLines)) return;

      dialogLines.forEach(line => {
        if (line.bg) {
          // 提取背景文件名（去掉路径和扩展名）
          let bgName = line.bg;
          if (bgName.startsWith('assets/')) {
            bgName = bgName.substring(bgName.lastIndexOf('/') + 1);
          }
          this.galleryPanel.unlockBackground(bgName);
        }
      });
    }

    unlockBackground(bgPath) {
      if (!this.galleryPanel || !bgPath) return;
      let bgName = bgPath;
      if (bgName.startsWith('assets/')) {
        bgName = bgName.substring(bgName.lastIndexOf('/') + 1);
      }
      this.galleryPanel.unlockBackground(bgName);
    }

    markSceneRead(chapterId, levelId, sceneType) {
      if (!this.galleryPanel) return;
      this.galleryPanel.markSceneRead(chapterId, levelId, sceneType);
    }

    // ============================================================
    //  技巧使用记录（用于技巧类成就）
    // ============================================================

    /**
     * 记录技巧使用（接受中文名或 TechRater 风格ID）
     * 自动累计次数并检查技巧类成就
     * @param {string} techniqueName - 技巧名（中文名或TechRater ID）
     */
    recordTechniqueUsage(techniqueName) {
      if (!global.ProgressManager) return;
      if (!techniqueName) return;

      // 映射到标准ID
      let techId = TECHNIQUE_NAME_TO_ID[techniqueName] || techniqueName;

      // 记录使用
      ProgressManager.recordTechniqueUsage(techId);

      log.info('[Technique] 使用技巧:', techId);
    }

    /**
     * 设置最近一次提示使用的技巧名
     */
    setLastHintTechnique(name) {
      this._lastHintTechnique = name;
    }

    /**
     * 获取并清除最近一次提示使用的技巧名
     */
    consumeLastHintTechnique() {
      const t = this._lastHintTechnique;
      this._lastHintTechnique = null;
      return t;
    }

    get lastHintTechnique() { return this._lastHintTechnique; }
    set lastHintTechnique(v) { this._lastHintTechnique = v; }

    // ============================================================
    //  成就检查（通关时调用）
    //  注意：核心逻辑已迁移到 GameController，此处保留向后兼容
    // ============================================================

    /**
     * 检查 note_master 成就
     */
    checkNoteMasterAchievement() {
      if (!global.ProgressManager) return;
      const board = this._getBoard();
      if (!board) return;
      if (ProgressManager.hasAchievement('note_master')) return;

      let noteCount = 0;
      for (let r = 0; r < board.size; r++) {
        for (let c = 0; c < board.size; c++) {
          noteCount += board.cells[r][c].candidates.size;
        }
      }
      if (noteCount >= 50) {
        ProgressManager.unlockAchievement('note_master');
      }
    }

    /**
     * 印记系统：通关检查
     */
    checkSealsOnComplete(timeSeconds, errors, hints) {
      if (!global.ProgressManager) return;
      const currentLevelData = this._getLevelData();
      if (!currentLevelData || !currentLevelData.isHidden) return;

      const levelId = currentLevelData.levelId;
      const sealDef = ProgressManager.getSealDefByLevel(levelId);
      if (!sealDef) return;
      if (ProgressManager.isSealUnlocked(sealDef.id)) return;

      const stats = {
        errors: errors || 0,
        hints: hints || 0,
        timeSeconds: timeSeconds || 0,
        usedNotes: this._getUsedNotes(),
        levelId: levelId
      };

      if (ProgressManager.checkSealCondition(sealDef.id, stats)) {
        const levelScore = {
          time: timeSeconds,
          errors: errors,
          hints: hints,
          grade: 'S'
        };
        ProgressManager.unlockSeal(sealDef.id, levelScore);
        this.showSealUnlockAnimation(sealDef);
        log.info('Seal unlocked:', sealDef.id, sealDef.name);
        // 检查 seal_collector 成就（收集全部5枚印记）
        if (ProgressManager.getUnlockedSealCount && ProgressManager.getUnlockedSealCount() >= 5) {
          ProgressManager.unlockAchievement('seal_collector');
        }
      }
    }

    /**
     * 显示印章解锁动画
     */
    showSealUnlockAnimation(sealDef) {
      if (global.SealAnimationInstance && typeof SealAnimationInstance.show === 'function') {
        SealAnimationInstance.show(sealDef);
      } else {
        // 降级：用成就 Toast 替代
        this.showAchievementToast({
          id: sealDef.id,
          icon: sealDef.icon || '🔖',
          name: sealDef.name || '印章解锁',
          desc: sealDef.description || '恭喜获得新印章！'
        });
      }
    }

    // ============================================================
    //  面板快捷操作
    // ============================================================

    toggleAchievementPanel() {
      if (this.achievementPanel) this.achievementPanel.toggle();
    }

    toggleGalleryPanel() {
      if (this.galleryPanel) this.galleryPanel.toggle();
    }

    showGalleryPanel() {
      if (this.galleryPanel) this.galleryPanel.show();
    }

    refreshAchievementPanel() {
      if (this.achievementPanel) {
        try { this.achievementPanel.refresh(); } catch (e) {}
      }
    }
  }

  // 暴露到全局
  global.AchievementCoordinator = AchievementCoordinator;
  global.TECHNIQUE_NAME_TO_ID = TECHNIQUE_NAME_TO_ID;

})(window);
