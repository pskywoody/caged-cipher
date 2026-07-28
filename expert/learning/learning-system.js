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
