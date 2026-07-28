// LearningSystem - Learning Layer
// Persistent player style and technique proficiency tracking

;(function(global) {
  'use strict';

  const STORAGE_KEY = 'cagemaster3_learning';
  const CURRENT_VERSION = 1;

  class LearningSystem {
    constructor() {
      this._data = this._load();
    }

    recordTechnique(name, success) {
      if (!name) return;
      if (!this._data.techniques[name]) {
        this._data.techniques[name] = { attempts: 0, successes: 0 };
      }
      this._data.techniques[name].attempts++;
      if (success) this._data.techniques[name].successes++;
      this._save();
    }

    recordFill(row, col, num, isCorrect) {
      this._data.totalFills++;
      if (isCorrect) this._data.correctFills++;
      this._updateStyle();
      this._save();
    }

    recordHint() {
      this._data.hintsUsed++;
      this._save();
    }

    recordReset() {
      this._data.resets++;
      this._save();
    }

    /**
     * Record a replay session for later review.
     * Stores the most recent replay per level (keeps last 5).
     */
    recordReplay(replayData) {
      if (!replayData) return;
      if (!this._data.replays) {
        this._data.replays = [];
      }
      this._data.replays.push({
        savedAt: Date.now(),
        data: replayData,
      });
      // Keep only last 5 replays
      if (this._data.replays.length > 5) {
        this._data.replays.shift();
      }
      this._save();
    }

    getReplays() {
      return this._data.replays || [];
    }

    getStyle() {
      return this._data.style || { value: 'balanced', confidence: 0.5 };
    }

    /**
     * 从 GameContext 读取准确率和提示率，计算并更新玩家风格
     * 在每关结束时调用，更新 GameContext.learning.style
     * @returns {Object} 更新后的风格 { value, confidence }
     */
    updateStyleFromContext() {
      try {
        const ctx = global.GameContext;
        if (!ctx || !ctx.player) {
          return this.getStyle();
        }

        const player = ctx.player;
        const totalFills = player.totalCorrect + player.totalWrong;

        if (totalFills === 0) {
          return this.getStyle();
        }

        const accuracy = player.totalCorrect / totalFills;
        const hintRate = player.hintUsageCount / Math.max(totalFills, 1);

        let value = 'balanced';
        let confidence = 0.5;

        if (accuracy > 0.9 && hintRate < 0.05) {
          value = 'precise';
          confidence = Math.min(0.9, accuracy);
        } else if (accuracy < 0.6) {
          value = 'experimental';
          confidence = Math.min(0.8, 1 - accuracy);
        } else if (hintRate > 0.3) {
          value = 'cautious';
          confidence = Math.min(0.8, hintRate);
        }

        // 更新内部数据
        this._data.style = { value, confidence };
        this._data.totalFills = (this._data.totalFills || 0) + totalFills;
        this._data.correctFills = (this._data.correctFills || 0) + player.totalCorrect;
        this._data.hintsUsed = (this._data.hintsUsed || 0) + player.hintUsageCount;
        this._save();

        // 同步到 GameContext
        if (ctx.learning) {
          ctx.learning.style = value;
          ctx.learning.accuracyRate = accuracy;
          ctx.learning.hintUsageRate = hintRate;
        }

        return { value, confidence };
      } catch (e) {
        console.warn('[LearningSystem] updateStyleFromContext error:', e);
        return this.getStyle();
      }
    }

    getTechniqueProficiency(name) {
      const t = this._data.techniques[name];
      if (!t || t.attempts === 0) return 0;
      return Math.round((t.successes / t.attempts) * 100);
    }

    getTopTechniques(limit = 5) {
      return Object.entries(this._data.techniques)
        .map(([name, t]) => ({
          name,
          proficiency: t.attempts > 0 ? Math.round((t.successes / t.attempts) * 100) : 0,
          attempts: t.attempts,
        }))
        .sort((a, b) => b.proficiency - a.proficiency)
        .slice(0, limit);
    }

    generateComment(rating) {
      const { nonTrivialRatio = 0, maxTechLevel = 0, score = 0 } = rating || {};

      if (nonTrivialRatio < 0.15 && score < 300) {
        return '单凭直觉便能冲破这档案室的死角...你到底是在解局，还是在凭本能撕裂这牢笼？';
      }
      if (maxTechLevel >= 8 && nonTrivialRatio > 0.3) {
        return '星衡法则，三才游鱼...你对这数理铁律的运筹，像极了当年在那枯坐通宵的那个人。';
      }
      if (this._data.style.value === 'experimental') {
        return '你的试错精神令人印象深刻。每一次失败都让你离答案更近。';
      }
      if (this._data.style.value === 'cautious') {
        return '谨慎是解谜者的美德。你每一步都经过深思熟虑。';
      }
      return '不错的表现。继续保持这种节奏。';
    }

    // ============================================================
    //  P3-2: 玩家画像统一输出
    // ============================================================

    /**
     * 生成完整玩家画像
     * 聚合学习层、进度系统、设置系统等多源数据
     * 惰性计算：调用时才从各数据源读取
     * @returns {Object} 完整玩家画像
     */
    getPlayerProfile() {
      const now = Date.now();
      const styleInfo = this.getStyle();
      const techniqueMastery = this._buildTechniqueMastery();
      const stats = this._buildStats();
      const preferences = this._buildPreferences();
      const achievements = this._buildAchievements();

      return {
        profileVersion: '1.0',
        generatedAt: now,

        // 玩家风格
        style: styleInfo.value || 'balanced',
        styleConfidence: styleInfo.confidence || 0.5,

        // 技巧掌握度
        techniqueMastery: techniqueMastery,

        // 行为统计
        stats: stats,

        // 偏好设置
        preferences: preferences,

        // 成就进度
        achievements: achievements,
      };
    }

    /**
     * 获取精简版玩家画像（用于调试/快速查看）
     * @returns {Object} 精简画像
     */
    getProfileSummary() {
      const profile = this.getPlayerProfile();
      const masteryCount = Object.keys(profile.techniqueMastery).length;
      const topTech = this.getMasteryRanking()[0];

      return {
        style: profile.style,
        styleConfidence: Math.round(profile.styleConfidence * 100) + '%',
        accuracyRate: Math.round(profile.stats.accuracyRate * 100) + '%',
        totalLevelsCompleted: profile.stats.totalLevelsCompleted,
        totalPlayTime: this._formatTime(profile.stats.totalPlayTime),
        masteredTechniques: masteryCount,
        topTechnique: topTech ? topTech.name : 'none',
        achievementsUnlocked: profile.achievements.totalUnlocked,
        seals: profile.achievements.totalSeals,
      };
    }

    /**
     * 导出玩家画像为 JSON 字符串
     * @returns {string} JSON 格式的玩家画像
     */
    exportProfile() {
      try {
        const profile = this.getPlayerProfile();
        return JSON.stringify(profile, null, 2);
      } catch (e) {
        console.warn('[LearningSystem] exportProfile failed:', e);
        return JSON.stringify({ error: 'export failed', message: e.message });
      }
    }

    /**
     * 获取技巧掌握度排名（从高到低）
     * @returns {Array} 排序后的技巧列表，每项包含 name, level, usageCount, proficiency
     */
    getMasteryRanking() {
      const mastery = this._buildTechniqueMastery();
      return Object.entries(mastery)
        .map(([name, info]) => ({
          name: name,
          level: info.level,
          usageCount: info.usageCount,
          proficiency: info.usageCount > 0 ?
            Math.round((info.level / 5) * 100) : 0,
          lastUsed: info.lastUsed,
        }))
        .sort((a, b) => {
          // 先按等级排序，再按使用次数排序
          if (b.level !== a.level) return b.level - a.level;
          return b.usageCount - a.usageCount;
        });
    }

    // --- 内部方法：构建画像各部分 ---

    /**
     * 构建技巧掌握度数据
     * 将原始 technique 数据（attempts/successes）转换为掌握度等级
     * @returns {Object} 技巧掌握度映射
     */
    _buildTechniqueMastery() {
      const techniques = this._data.techniques || {};
      const result = {};

      // 已知技巧列表（如果有数据则自动包含）
      const knownTechniques = Object.keys(techniques);

      // 如果没有任何技巧数据，返回空对象
      if (knownTechniques.length === 0) {
        return {};
      }

      for (const name of knownTechniques) {
        const t = techniques[name];
        const attempts = t.attempts || 0;
        const successes = t.successes || 0;
        const accuracy = attempts > 0 ? successes / attempts : 0;

        // 掌握度等级计算：基于使用次数和准确率
        // Level 1: 1-4 次使用
        // Level 2: 5-14 次，准确率 > 40%
        // Level 3: 15-29 次，准确率 > 55%
        // Level 4: 30-49 次，准确率 > 70%
        // Level 5: 50+ 次，准确率 > 85%
        let level = 0;
        if (attempts >= 1) level = 1;
        if (attempts >= 5 && accuracy > 0.4) level = 2;
        if (attempts >= 15 && accuracy > 0.55) level = 3;
        if (attempts >= 30 && accuracy > 0.7) level = 4;
        if (attempts >= 50 && accuracy > 0.85) level = 5;

        result[name] = {
          level: level,
          usageCount: attempts,
          accuracy: Math.round(accuracy * 100) / 100,
          lastUsed: t.lastUsed || null,
        };
      }

      return result;
    }

    /**
     * 构建行为统计数据
     * 聚合学习层数据 + 进度系统数据
     * @returns {Object} 统计数据
     */
    _buildStats() {
      const data = this._data;
      const totalFills = data.totalFills || 0;
      const correctFills = data.correctFills || 0;
      const wrongFills = totalFills - correctFills;
      const hintsUsed = data.hintsUsed || 0;

      // 从 ProgressManager 获取关卡进度数据（如果可用）
      let totalLevelsPlayed = 0;
      let totalLevelsCompleted = 0;
      let totalPlayTime = 0;
      let bestStreak = 0;
      let avgSolveTime = 0;

      try {
        const pm = global.ProgressManager;
        if (pm && pm._data) {
          const levelScores = pm._data.levelScores || {};
          const scoreKeys = Object.keys(levelScores);
          totalLevelsCompleted = scoreKeys.length;
          totalLevelsPlayed = totalLevelsCompleted + (data.resets || 0);

          // 计算总游戏时间和平均通关时间
          let totalTime = 0;
          let completedWithTime = 0;
          for (const key of scoreKeys) {
            const score = levelScores[key];
            if (score && score.time) {
              totalTime += score.time;
              completedWithTime++;
            }
          }
          totalPlayTime = totalTime;
          avgSolveTime = completedWithTime > 0 ?
            Math.round(totalTime / completedWithTime) : 0;
        }
      } catch (e) {
        // 静默降级
      }

      // 准确率
      const accuracyRate = totalFills > 0 ? correctFills / totalFills : 0;

      return {
        totalLevelsPlayed: totalLevelsPlayed,
        totalLevelsCompleted: totalLevelsCompleted,
        totalPlayTime: totalPlayTime,
        totalCorrectFills: correctFills,
        totalWrongFills: Math.max(0, wrongFills),
        totalHintsUsed: hintsUsed,
        accuracyRate: Math.round(accuracyRate * 100) / 100,
        avgSolveTime: avgSolveTime,
        bestStreak: bestStreak,
      };
    }

    /**
     * 构建偏好设置数据
     * 从设置系统/本地存储读取
     * @returns {Object} 偏好设置
     */
    _buildPreferences() {
      const defaults = {
        vibrationEnabled: true,
        bgmVolume: 0.5,
        sfxVolume: 0.7,
        voiceVolume: 0.8,
        difficulty: 'normal',
        qualitySetting: 'auto',
      };

      try {
        // 尝试从 SettingsPanel 读取（如果有全局实例）
        const settingsPanel = global.settingsPanel;
        if (settingsPanel && settingsPanel.settings) {
          const s = settingsPanel.settings;
          return {
            vibrationEnabled: s.game ? !!s.game.vibration : defaults.vibrationEnabled,
            bgmVolume: s.volume && s.volume.bgm != null ? s.volume.bgm / 100 : defaults.bgmVolume,
            sfxVolume: s.volume && s.volume.sfx != null ? s.volume.sfx / 100 : defaults.sfxVolume,
            voiceVolume: s.volume && s.volume.voice != null ? s.volume.voice / 100 : defaults.voiceVolume,
            difficulty: defaults.difficulty,
            qualitySetting: s.display && s.display.quality ? s.display.quality : defaults.qualitySetting,
          };
        }

        // 尝试从 localStorage 读取设置
        try {
          const raw = localStorage.getItem('cagedcipher_settings');
          if (raw) {
            const s = JSON.parse(raw);
            return {
              vibrationEnabled: s.game ? !!s.game.vibration : defaults.vibrationEnabled,
              bgmVolume: s.volume && s.volume.bgm != null ? s.volume.bgm / 100 : defaults.bgmVolume,
              sfxVolume: s.volume && s.volume.sfx != null ? s.volume.sfx / 100 : defaults.sfxVolume,
              voiceVolume: s.volume && s.volume.voice != null ? s.volume.voice / 100 : defaults.voiceVolume,
              difficulty: defaults.difficulty,
              qualitySetting: s.display && s.display.quality ? s.display.quality : defaults.qualitySetting,
            };
          }
        } catch (e) {
          // 静默降级
        }
      } catch (e) {
        // 静默降级
      }

      return defaults;
    }

    /**
     * 构建成就进度数据
     * 从 ProgressManager 读取（如果可用）
     * @returns {Object} 成就进度
     */
    _buildAchievements() {
      const result = {
        totalUnlocked: 0,
        totalSeals: 0,
        totalAchievements: 0,
        totalSealTypes: 5, // 游戏中共有 5 种印章
      };

      try {
        const pm = global.ProgressManager;
        if (pm) {
          // 已解锁成就数
          if (pm._data && pm._data.achievements) {
            result.totalUnlocked = pm._data.achievements.length;
          } else if (typeof pm.getUnlockedAchievements === 'function') {
            result.totalUnlocked = pm.getUnlockedAchievements().length;
          }

          // 已解锁印章数
          if (typeof pm.getUnlockedSealCount === 'function') {
            result.totalSeals = pm.getUnlockedSealCount();
          } else if (pm._data && pm._data.unlockedSeals) {
            result.totalSeals = pm._data.unlockedSeals.length;
          }

          // 总成就数（估算，从成就定义读取）
          if (typeof pm.getTotalAchievementCount === 'function') {
            result.totalAchievements = pm.getTotalAchievementCount();
          }
        }
      } catch (e) {
        // 静默降级
      }

      return result;
    }

    /**
     * 格式化时间（秒 -> 可读字符串）
     * @param {number} seconds - 秒数
     * @returns {string} 格式化的时间字符串
     */
    _formatTime(seconds) {
      if (!seconds || seconds <= 0) return '0m';
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      if (hrs > 0) {
        return hrs + 'h ' + mins + 'm';
      }
      if (mins > 0) {
        return mins + 'm ' + secs + 's';
      }
      return secs + 's';
    }

    _updateStyle() {
      const t = this._data;
      if (t.totalFills === 0) return;

      const accuracy = t.correctFills / t.totalFills;
      const hintRate = t.hintsUsed / Math.max(t.totalFills, 1);

      let value = 'balanced';
      let confidence = 0.5;

      if (accuracy > 0.9 && hintRate < 0.05) {
        value = 'precise';
        confidence = Math.min(0.9, accuracy);
      } else if (accuracy < 0.6) {
        value = 'experimental';
        confidence = Math.min(0.8, 1 - accuracy);
      } else if (hintRate > 0.3) {
        value = 'cautious';
        confidence = Math.min(0.8, hintRate);
      }

      this._data.style = { value, confidence };
    }

    _load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          let data = JSON.parse(raw);
          // 版本检测与迁移
          data = this._migrate(data);
          return data;
        }
      } catch(e) {
        console.warn('[LearningSystem] Load failed:', e);
      }
      return this._defaultData();
    }

    _save() {
      try {
        const data = Object.assign({}, this._data, { version: CURRENT_VERSION });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch(e) {
        // 专门处理容量超限错误
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          console.warn('[LearningSystem] Storage quota exceeded on save');
        } else {
          console.warn('[LearningSystem] Save failed:', e);
        }
      }
    }

    /**
     * 版本迁移框架
     * @param {Object} data - 从 localStorage 读取的原始数据
     * @returns {Object} 迁移后的数据
     */
    _migrate(data) {
      // 无 version 字段说明是旧版（v0），用默认数据补齐并设置版本
      if (!data || typeof data.version !== 'number') {
        const defaultData = this._defaultData();
        return Object.assign(defaultData, data || {}, { version: CURRENT_VERSION });
      }

      let version = data.version;

      // v0 → v1: 暂无实际迁移内容，建立框架
      if (version < 1) {
        version = 1;
        // 预留 v1 迁移逻辑
      }

      // 未来版本迁移在此添加
      // if (version < 2) { version = 2; /* v2 迁移 */ }
      // if (version < 3) { version = 3; /* v3 迁移 */ }

      data.version = version;
      return data;
    }

    _defaultData() {
      return {
        version: CURRENT_VERSION,
        totalFills: 0,
        correctFills: 0,
        hintsUsed: 0,
        resets: 0,
        techniques: {},
        style: { value: 'balanced', confidence: 0.5 },
      };
    }
  }

  global.LearningSystem = LearningSystem;
})(window);
