// ChapterSelect - 章节选择界面 + 进度持久化 + 多周目系统
// 深色学术风，与 Caged Cipher 整体风格一致

;(function(global) {
  'use strict';

  const STORAGE_KEY = 'cagedcipher_progress';
  const BACKUP_KEY_PREFIX = 'cagedcipher_progress_backup_';
  const BACKUP_COUNT = 3;
  const CHECKSUM_SALT = 'caged_cipher_v2_secret';
  const SAVE_DATA_VERSION = 1; // 包装层版本号（外层 { version, data, checksum }）

  // === chapters.json 缓存 ===
  let _cachedChapterData = null;
  let _chapterDataPromise = null;

  function getChapterData() {
    if (_cachedChapterData) {
      return Promise.resolve(_cachedChapterData);
    }
    if (_chapterDataPromise) {
      return _chapterDataPromise;
    }
    _chapterDataPromise = fetch('data/chapters.json')
      .then(res => res.json())
      .then(data => {
        _cachedChapterData = data;
        _chapterDataPromise = null;
        return data;
      })
      .catch(err => {
        _chapterDataPromise = null;
        throw err;
      });
    return _chapterDataPromise;
  }

  // === 印记定义 ===
  const SEAL_DEFS = [
    {
      id: 'flame',
      name: '炎之印记',
      icon: '🔥',
      levelId: 701,
      desc: '零错误 + 不使用提示',
      detail: '在第1隐藏关中，不犯任何错误且不使用提示，以纯粹的意志突破炎之试炼。',
      color: '#ef4444',
      element: 'fire'
    },
    {
      id: 'water',
      name: '水之印记',
      icon: '💧',
      levelId: 702,
      desc: '零错误 + 限时内完成',
      detail: '在第2隐藏关中，零错误且在时限内完成，如流水般流畅地解开谜题。',
      color: '#3b82f6',
      element: 'water'
    },
    {
      id: 'earth',
      name: '岩之印记',
      icon: '⛰️',
      levelId: 703,
      desc: '零错误 + 不使用笔记',
      detail: '在第3隐藏关中，零错误且不借助任何笔记，仅凭记忆与推演征服岩之考验。',
      color: '#a16207',
      element: 'earth'
    },
    {
      id: 'wind',
      name: '风之印记',
      icon: '🌪️',
      levelId: 704,
      desc: '零错误 + 不用提示 + 限时',
      detail: '在第4隐藏关中，零错误、不使用提示且限时完成，如风般迅捷无迹。',
      color: '#22c55e',
      element: 'wind'
    },
    {
      id: 'star',
      name: '星之印记',
      icon: '⭐',
      levelId: 705,
      desc: '全印记 + 真结局 + 零错误',
      detail: '集齐四枚元素印记，达成真结局，且以零错误通关最终隐藏关，获得星辰的认可。',
      color: '#fbbf24',
      element: 'star'
    }
  ];

  // 印记限时阈值（秒），根据关卡 gridSize 调整
  const SEAL_TIME_LIMITS = {
    702: 300,  // 水之印记：5分钟
    704: 240,  // 风之印记：4分钟
  };

  // 成就颜色等级
  const SEAL_COLORS = {
    silver: '#94a3b8',
    gold: '#c9a84c',
    darkgold: '#b8860b',
    red: '#b91c1c',
  };

  const ACHIEVEMENT_DEFS = {
    // === 类别1：技巧成就（7个）===
    first_naked_single: {
      id: 'first_naked_single',
      name: '启蒙',
      description: '首次使用裸单法',
      category: 'skill',
      sealText: '启蒙',
      sealColor: 'silver',
      check: function(stats) { return stats && stats.nakedSingleUsed; }
    },
    first_hidden_single: {
      id: 'first_hidden_single',
      name: '观察力',
      description: '首次使用隐曜',
      category: 'skill',
      sealText: '观察力',
      sealColor: 'silver',
      check: function(stats) { return stats && stats.hiddenSingleUsed; }
    },
    first_naked_pair: {
      id: 'first_naked_pair',
      name: '并蒂',
      description: '首次使用裸数对',
      category: 'skill',
      sealText: '并蒂',
      sealColor: 'gold',
      check: function(stats) { return stats && stats.nakedPairUsed; }
    },
    first_hidden_pair: {
      id: 'first_hidden_pair',
      name: '对影',
      description: '首次使用隐数对',
      category: 'skill',
      sealText: '对影',
      sealColor: 'gold',
      check: function(stats) { return stats && stats.hiddenPairUsed; }
    },
    first_rule45: {
      id: 'first_rule45',
      name: '星衡',
      description: '首次使用45法则',
      category: 'skill',
      sealText: '星衡',
      sealColor: 'gold',
      check: function(stats) { return stats && stats.rule45Used; }
    },
    first_xwing: {
      id: 'first_xwing',
      name: '纵横',
      description: '首次使用X-Wing',
      category: 'skill',
      sealText: '纵横',
      sealColor: 'red',
      check: function(stats) { return stats && stats.xwingUsed; }
    },
    first_swordfish: {
      id: 'first_swordfish',
      name: '游鱼',
      description: '首次使用Swordfish',
      category: 'skill',
      sealText: '游鱼',
      sealColor: 'red',
      check: function(stats) { return stats && stats.swordfishUsed; }
    },

    // === 类别2：进度成就（8个）===
    chapter1_clear: {
      id: 'chapter1_clear',
      name: '初识笼中',
      description: '完成第一章',
      category: 'progress',
      sealText: '已阅',
      sealColor: 'silver',
      check: function(stats) { return stats && stats.chapter1Cleared; }
    },
    chapter2_clear: {
      id: 'chapter2_clear',
      name: '九域初开',
      description: '完成第二章',
      category: 'progress',
      sealText: '已阅',
      sealColor: 'silver',
      check: function(stats) { return stats && stats.chapter2Cleared; }
    },
    chapter3_clear: {
      id: 'chapter3_clear',
      name: '幻影破局',
      description: '完成第三章',
      category: 'progress',
      sealText: '已阅',
      sealColor: 'gold',
      check: function(stats) { return stats && stats.chapter3Cleared; }
    },
    chapter4_clear: {
      id: 'chapter4_clear',
      name: '笔记大成',
      description: '完成第四章',
      category: 'progress',
      sealText: '已阅',
      sealColor: 'gold',
      check: function(stats) { return stats && stats.chapter4Cleared; }
    },
    chapter5_clear: {
      id: 'chapter5_clear',
      name: '嵌套之谜',
      description: '完成第五章',
      category: 'progress',
      sealText: '已阅',
      sealColor: 'gold',
      check: function(stats) { return stats && stats.chapter5Cleared; }
    },
    chapter6_clear: {
      id: 'chapter6_clear',
      name: '双解终局',
      description: '完成第六章',
      category: 'progress',
      sealText: '已阅',
      sealColor: 'darkgold',
      check: function(stats) { return stats && stats.chapter6Cleared; }
    },
    chapter7_clear: {
      id: 'chapter7_clear',
      name: '三幕终章',
      description: '完成第七章',
      category: 'progress',
      sealText: '已阅',
      sealColor: 'darkgold',
      check: function(stats) { return stats && stats.chapter7Cleared; }
    },
    all_chapters_clear: {
      id: 'all_chapters_clear',
      name: '卷宗已结',
      description: '通关全部章节',
      category: 'progress',
      sealText: '结案',
      sealColor: 'red',
      check: function(stats) { return stats && stats.allChaptersCleared; }
    },

    // === 类别3：挑战成就（5个）===
    no_hint_run: {
      id: 'no_hint_run',
      name: '无声推理',
      description: '连续3关不使用提示',
      category: 'challenge',
      sealText: '推理',
      sealColor: 'silver',
      check: function(stats) {
        return stats && typeof stats.noHintStreak === 'number' && stats.noHintStreak >= 3;
      }
    },
    no_hint_chapter: {
      id: 'no_hint_chapter',
      name: '独立侦破',
      description: '一章内全程无提示',
      category: 'challenge',
      sealText: '侦破',
      sealColor: 'gold',
      check: function(stats) { return stats && stats.chapterNoHint; }
    },
    speed_demon: {
      id: 'speed_demon',
      name: '闪电推演',
      description: '120秒内完成任意关卡',
      category: 'challenge',
      sealText: '神速',
      sealColor: 'gold',
      check: function(stats) {
        return stats && typeof stats.timeSeconds === 'number' &&
               stats.timeSeconds > 0 && stats.timeSeconds <= 120;
      }
    },
    flawless_victory: {
      id: 'flawless_victory',
      name: '无懈可击',
      description: '单关零错误通关',
      category: 'challenge',
      sealText: '完美',
      sealColor: 'darkgold',
      check: function(stats) { return stats && stats.errors === 0; }
    },
    true_ending: {
      id: 'true_ending',
      name: '真相大白',
      description: '解锁并通关真结局',
      category: 'challenge',
      sealText: '真相',
      sealColor: 'red',
      check: function(stats) { return stats && stats.trueEndingCleared; }
    },

    // === 类别4：探索成就（3个）===
    first_hidden_level: {
      id: 'first_hidden_level',
      name: '暗格',
      description: '解锁第一个隐藏关',
      category: 'exploration',
      sealText: '暗格',
      sealColor: 'silver',
      check: function(stats) {
        return stats && typeof stats.unlockedHiddenCount === 'number' && stats.unlockedHiddenCount >= 1;
      }
    },
    all_hidden_levels: {
      id: 'all_hidden_levels',
      name: '暗格全破',
      description: '解锁全部隐藏关',
      category: 'exploration',
      sealText: '暗格全破',
      sealColor: 'gold',
      check: function(stats) { return stats && stats.allHiddenUnlocked; }
    },
    seal_collector: {
      id: 'seal_collector',
      name: '印记收集',
      description: '收集全部5枚印记',
      category: 'exploration',
      sealText: '印记',
      sealColor: 'darkgold',
      check: function(stats) {
        return stats && typeof stats.sealCount === 'number' && stats.sealCount >= 5;
      }
    },
  };

  // === 进度管理 ===
  const ProgressManager = {
    _data: null,
    _onAchievementUnlock: null,

    // === DataStore 集成（渐进式，保持向后兼容） ===
    _hasDataStore: function() {
      return global.DataStore && typeof global.DataStore.get === 'function'
        && typeof global.DataStore.set === 'function'
        && global.DataStore.isInitialized();
    },

    _syncToDataStore: function() {
      if (!this._hasDataStore() || !this._data) return;
      try {
        // 将进度数据同步到 DataStore 的 progress 分类
        global.DataStore.set('progress', this._data, { immediate: false, delay: 500 });
      } catch (e) {
        console.warn('[ProgressManager] DataStore sync failed:', e);
      }
    },

    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const result = this._tryParseAndValidate(raw);
          if (result.ok) {
            this._data = result.data;
            this._migrate();
            // 同步到 DataStore（如果可用）
            this._syncToDataStore();
            return this._data;
          }
          // 主存档损坏，先备份再尝试从备份恢复
          console.warn('[ProgressManager] Main save corrupted, reason:', result.reason);
          this._handleCorruptedSave(raw, result.reason || 'unknown');
          console.warn('[ProgressManager] Main save corrupted, trying backups...');
          const backupResult = this._loadFromBackup();
          if (backupResult.ok) {
            this._data = backupResult.data;
            this._migrate();
            this._showToast('存档已从备份恢复', 'info');
            // 恢复后立即保存一次，重建主存档
            this.save();
            return this._data;
          }
          // 全部失败，使用默认数据
          console.warn('[ProgressManager] All backups failed, using default data');
          this._data = this._defaultData();
          this._showToast('存档损坏，已重置为初始状态', 'warning');
        } else {
          this._data = this._defaultData();
        }
      } catch (e) {
        console.warn('[ProgressManager] load() error:', e);
        this._data = this._defaultData();
      }
      return this._data;
    },

    save() {
      try {
        // 保存前先轮转备份
        this._rotateBackups();

        // 包装数据：{ version, data, checksum }
        const wrapped = this._wrapData(this._data);
        const jsonStr = JSON.stringify(wrapped);
        localStorage.setItem(STORAGE_KEY, jsonStr);

        // 同步到 DataStore（如果可用）
        this._syncToDataStore();
      } catch (e) {
        // 专门处理容量超限错误
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          console.warn('[ProgressManager] Storage quota exceeded, attempting cleanup...');
          // 清理非关键数据以释放空间
          this._cleanupNonCriticalData();
          // 清理后重试保存
          try {
            const wrapped = this._wrapData(this._data);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(wrapped));
            console.log('[ProgressManager] Save succeeded after cleanup');
            // 同步到 DataStore
            this._syncToDataStore();
            return;
          } catch (e2) {
            console.warn('[ProgressManager] Save still failed after cleanup:', e2);
          }
          // 仍然失败，显示提示
          this._showStorageWarningToast();
        } else {
          console.warn('[ProgressManager] Save failed:', e);
        }
      }
    },

    /**
     * 清理非关键数据以释放存储空间
     * 优先级：教学系统缓存 > 学习系统数据 > 喜剧成就缓存
     */
    _cleanupNonCriticalData() {
      const nonCriticalKeys = [
        'cagemaster3_teaching_progress',  // 教学系统缓存（可重新触发）
        'cagemaster3_learning',           // 学习系统数据（非关键进度）
        'cagemaster_comedy_achievements', // 喜剧成就缓存（可重新解锁）
      ];
      let freed = 0;
      for (const key of nonCriticalKeys) {
        try {
          const val = localStorage.getItem(key);
          if (val) {
            freed += val.length;
            localStorage.removeItem(key);
            console.log('[ProgressManager] Cleaned up non-critical key:', key,
              '~' + Math.round(val.length / 1024) + 'KB');
          }
        } catch (e) {
          // 忽略单个 key 的清理错误
        }
      }
      if (freed > 0) {
        console.log('[ProgressManager] Total freed ~' + Math.round(freed / 1024) + 'KB');
      }
    },

    /**
     * 显示存储空间不足提示 Toast
     */
    _showStorageWarningToast() {
      try {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;top:20%;left:50%;' +
          'transform:translate(-50%,-50%);' +
          'background:linear-gradient(180deg, #2d1f1f 0%, #1a1212 100%);' +
          'border:1px solid #ef4444;border-radius:8px;padding:14px 24px;' +
          'text-align:center;z-index:25000;opacity:0;transition:opacity 0.3s;' +
          'box-shadow:0 8px 32px rgba(239,68,68,0.3);' +
          'font-family:\'Noto Serif SC\',serif;max-width:80vw;';
        toast.innerHTML =
          '<div style="font-size:14px;font-weight:600;color:#fca5a5;margin-bottom:4px;">⚠️ 存储空间不足</div>' +
          '<div style="font-size:12px;color:#94a3b8;">部分进度可能无法保存，请清理浏览器缓存</div>';
        document.body.appendChild(toast);
        requestAnimationFrame(function() { toast.style.opacity = '1'; });
        setTimeout(function() {
          toast.style.opacity = '0';
          setTimeout(function() { toast.remove(); }, 300);
        }, 3000);
      } catch (e) {
        // 极端情况下 DOM 操作也可能失败，静默处理
      }
    },

    /**
     * 通用 Toast 提示
     * @param {string} message - 提示消息
     * @param {string} [type='info'] - 类型: info | warning | error | success
     */
    _showToast(message, type) {
      try {
        type = type || 'info';
        const colorMap = {
          info: { border: '#c9a96e', text: '#d4c5a9', icon: '📜' },
          warning: { border: '#ef4444', text: '#fca5a5', icon: '⚠️' },
          error: { border: '#dc2626', text: '#fca5a5', icon: '❌' },
          success: { border: '#22c55e', text: '#86efac', icon: '✅' },
        };
        const colors = colorMap[type] || colorMap.info;

        const toast = document.createElement('div');
        toast.style.cssText =
          'position:fixed;top:15%;left:50%;' +
          'transform:translate(-50%,-50%);' +
          'background:linear-gradient(180deg, #2d1f1a 0%, #1a100c 100%);' +
          'border:1px solid ' + colors.border + ';' +
          'border-radius:6px;padding:12px 22px;' +
          'text-align:center;z-index:25000;opacity:0;' +
          'transition:opacity 0.3s, transform 0.3s;' +
          'box-shadow:0 8px 32px rgba(0,0,0,0.5);' +
          'font-family:\'Noto Serif SC\',serif;max-width:80vw;' +
          'font-size:13px;color:' + colors.text + ';';
        toast.innerHTML =
          '<span style="margin-right:6px;">' + colors.icon + '</span>' +
          '<span>' + message + '</span>';
        document.body.appendChild(toast);
        requestAnimationFrame(function() {
          toast.style.opacity = '1';
          toast.style.transform = 'translate(-50%, 0)';
        });
        setTimeout(function() {
          toast.style.opacity = '0';
          toast.style.transform = 'translate(-50%, -10px)';
          setTimeout(function() { if (toast.parentNode) toast.remove(); }, 300);
        }, 2500);
      } catch (e) {
        // 静默处理
      }
    },

    /**
     * DJB2 哈希算法 - 生成简单校验和
     * 防君子不防小人，阻止普通用户直接手动修改 JSON
     * @param {string} str - 输入字符串
     * @returns {string} 十六进制哈希值
     */
    _computeChecksum(str) {
      try {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) + hash) + str.charCodeAt(i);
          hash = hash & hash; // 转成 32 位整数
        }
        // 转成无符号十六进制字符串
        return (hash >>> 0).toString(16);
      } catch (e) {
        console.warn('[ProgressManager] Checksum compute error:', e);
        return '';
      }
    },

    /**
     * 包装数据，添加版本号和校验和
     * @param {Object} data - 原始进度数据
     * @returns {Object} { version, data, checksum }
     */
    _wrapData(data) {
      try {
        const dataStr = JSON.stringify(data);
        const checksum = this._computeChecksum(SAVE_DATA_VERSION + dataStr + CHECKSUM_SALT);
        return {
          version: SAVE_DATA_VERSION,
          data: data,
          checksum: checksum,
        };
      } catch (e) {
        console.warn('[ProgressManager] Wrap data error:', e);
        // 降级：直接返回原始数据（向后兼容）
        return data;
      }
    },

    /**
     * 尝试解析并验证存档数据
     * 支持两种格式：
     *   1. 新版：{ version, data, checksum }
     *   2. 旧版：直接是数据对象（无 checksum，兼容加载）
     * 校验步骤：
     *   1. JSON 解析
     *   2. 格式识别（新版/旧版）
     *   3. 校验和验证（新版）
     *   4. 关键字段存在性检查
     *   5. 关键字段类型检查
     * @param {string} raw - localStorage 原始字符串
     * @returns {Object} { ok: boolean, data: Object, reason?: string }
     */
    _tryParseAndValidate(raw) {
      try {
        const parsed = JSON.parse(raw);

        let data;
        let hasChecksum = false;

        // 判断是否为新版包装格式（有 version 和 data 和 checksum 字段）
        if (parsed && typeof parsed === 'object' &&
            'version' in parsed && 'data' in parsed && 'checksum' in parsed &&
            typeof parsed.data === 'object') {
          // 新版格式：验证 checksum
          hasChecksum = true;
          const dataStr = JSON.stringify(parsed.data);
          const expectedChecksum = this._computeChecksum(
            String(parsed.version) + dataStr + CHECKSUM_SALT
          );
          if (parsed.checksum === expectedChecksum) {
            // 校验通过
            data = parsed.data;
          } else {
            // 校验失败，视为数据损坏
            console.warn('[ProgressManager] Checksum mismatch, data may be tampered');
            return { ok: false, data: null, reason: 'checksum_mismatch' };
          }
        } else {
          // 旧版格式（直接是数据对象），向后兼容
          console.log('[ProgressManager] Legacy save format detected, will add checksum on next save');
          data = parsed;
        }

        // === 关键字段存在性检查 ===
        const requiredFields = [
          'levelScores',
          'unlockedChapters',
          'currentCycle',
          'achievements',
        ];
        const missingFields = requiredFields.filter(f => data[f] === undefined);
        if (missingFields.length > 0) {
          console.warn('[ProgressManager] Save missing required fields:', missingFields);
          return { ok: false, data: null, reason: 'missing_fields:' + missingFields.join(',') };
        }

        // === 关键字段类型检查 ===
        const typeErrors = [];
        if (typeof data.levelScores !== 'object' || data.levelScores === null || Array.isArray(data.levelScores)) {
          typeErrors.push('levelScores should be object');
        }
        if (!Array.isArray(data.unlockedChapters)) {
          typeErrors.push('unlockedChapters should be array');
        }
        if (typeof data.currentCycle !== 'number' || data.currentCycle < 1) {
          typeErrors.push('currentCycle invalid');
        }
        if (!Array.isArray(data.achievements)) {
          typeErrors.push('achievements should be array');
        }
        if (typeErrors.length > 0) {
          console.warn('[ProgressManager] Save field type errors:', typeErrors);
          return { ok: false, data: null, reason: 'invalid_type:' + typeErrors.join(';') };
        }

        // === 可修复字段：补齐缺失的可选字段（不视为损坏，直接迁移） ===
        // 这些字段缺失时由 _migrate() 补齐，这里只标记需要迁移
        let needsMigration = false;
        if (!data.version || typeof data.version !== 'number') {
          needsMigration = true;
        }
        if (!data.unlockedHiddenLevels || !Array.isArray(data.unlockedHiddenLevels)) {
          needsMigration = true;
        }
        if (!data.skillStats || typeof data.skillStats !== 'object') {
          needsMigration = true;
        }

        return { ok: true, data: data, hasChecksum: hasChecksum, needsMigration: needsMigration };
      } catch (e) {
        console.warn('[ProgressManager] Parse failed:', e);
        return { ok: false, data: null, reason: 'parse_error:' + e.message };
      }
    },

    /**
     * 处理损坏的存档：
     * 1. 备份损坏的数据到 localStorage（最多保留 3 份）
     * 2. 返回默认数据
     * 损坏的存档不会被自动删除，而是保留在备份中供调试使用
     * @param {string|Object} rawData - 原始数据（字符串或对象）
     * @param {string} reason - 损坏原因
     * @returns {Object} 默认数据
     */
    _handleCorruptedSave: function(rawData, reason) {
      try {
        const CORRUPTED_BACKUP_KEY = 'cagemaster3_corrupted_save_backups';
        const MAX_CORRUPTED_BACKUPS = 3;

        // 读取已有备份
        let backups = [];
        try {
          const raw = localStorage.getItem(CORRUPTED_BACKUP_KEY);
          if (raw) {
            backups = JSON.parse(raw);
            if (!Array.isArray(backups)) backups = [];
          }
        } catch (e) {
          backups = [];
        }

        // 准备要备份的数据
        let dataStr = '';
        if (typeof rawData === 'string') {
          dataStr = rawData.substring(0, 5000);
        } else if (rawData && typeof rawData === 'object') {
          try {
            dataStr = JSON.stringify(rawData).substring(0, 5000);
          } catch (e) {
            dataStr = String(rawData).substring(0, 5000);
          }
        } else {
          dataStr = String(rawData).substring(0, 5000);
        }

        // 添加新备份（最新的在最前面）
        backups.unshift({
          reason: reason || 'unknown',
          data: dataStr,
          time: new Date().toISOString(),
          timestamp: Date.now(),
        });

        // 只保留最近的 N 份
        backups = backups.slice(0, MAX_CORRUPTED_BACKUPS);

        // 保存备份
        try {
          localStorage.setItem(CORRUPTED_BACKUP_KEY, JSON.stringify(backups));
          console.log('[ProgressManager] Corrupted save backed up (reason:', reason + ')', 'total backups:', backups.length);
        } catch (e) {
          console.warn('[ProgressManager] Failed to save corrupted backup:', e);
        }
      } catch (e) {
        // 备份过程中出错不影响主流程
        console.warn('[ProgressManager] _handleCorruptedSave error:', e);
      }

      // 返回默认数据
      return this._defaultData();
    },

    /**
     * 获取损坏存档备份列表（用于调试）
     * @returns {Array} 损坏存档备份列表
     */
    _getCorruptedBackups: function() {
      try {
        const CORRUPTED_BACKUP_KEY = 'cagemaster3_corrupted_save_backups';
        const raw = localStorage.getItem(CORRUPTED_BACKUP_KEY);
        if (raw) {
          const backups = JSON.parse(raw);
          return Array.isArray(backups) ? backups : [];
        }
      } catch (e) {
        // 静默失败
      }
      return [];
    },

    /**
     * 轮转备份：backup_2 → backup_3, backup_1 → backup_2, 主存档 → backup_1
     * 在主存档写入前调用
     */
    _rotateBackups() {
      try {
        // 从旧到新依次后移
        for (let i = BACKUP_COUNT; i >= 1; i--) {
          const sourceKey = i === 1 ? STORAGE_KEY : (BACKUP_KEY_PREFIX + (i - 1));
          const targetKey = BACKUP_KEY_PREFIX + i;

          if (i === BACKUP_COUNT) {
            // 最旧的备份直接丢弃
            try {
              localStorage.removeItem(targetKey);
            } catch (e) { /* ignore */ }
          }

          try {
            const sourceVal = localStorage.getItem(sourceKey);
            if (sourceVal) {
              localStorage.setItem(targetKey, sourceVal);
            }
          } catch (e) {
            // 单个备份失败不影响整体
            console.warn('[ProgressManager] Backup rotate failed at index', i, e);
          }
        }
      } catch (e) {
        console.warn('[ProgressManager] Backup rotate error:', e);
      }
    },

    /**
     * 从备份中加载数据
     * 按 backup_1 → backup_2 → backup_3 顺序尝试
     * @returns {Object} { ok: boolean, data: Object }
     */
    _loadFromBackup() {
      try {
        for (let i = 1; i <= BACKUP_COUNT; i++) {
          const key = BACKUP_KEY_PREFIX + i;
          const raw = localStorage.getItem(key);
          if (!raw) continue;

          const result = this._tryParseAndValidate(raw);
          if (result.ok) {
            console.log('[ProgressManager] Restored from backup_' + i);
            return { ok: true, data: result.data, backupIndex: i };
          }
          console.warn('[ProgressManager] Backup_' + i + ' also corrupted');
        }
      } catch (e) {
        console.warn('[ProgressManager] Load from backup error:', e);
      }
      return { ok: false, data: null };
    },

    _defaultData() {
      return {
        version: 5,
        currentCycle: 1,
        unlockedChapters: [1],
        levelScores: {},
        lastPlayedLevel: null,
        // 隐藏关解锁状态
        unlockedHiddenLevels: [],
        // 成就
        achievements: [],
        // 总提示次数（当前周目）
        totalHints: 0,
        // 真结局是否已达成
        trueEndingUnlocked: false,
        trueEndingCleared: false,
        // 累计游戏时长（秒）
        totalPlayTime: 0,
        // 技巧使用统计（用于技巧类成就）
        skillStats: {
          rule45Count: 0,
          nakedSingleCount: 0,
          hiddenSingleCount: 0,
          nakedPairCount: 0,
          hiddenPairCount: 0,
          pointingPairCount: 0,
          cageSumCount: 0,
          xWingCount: 0,
          swordfishCount: 0,
          nakedTripletCount: 0,
        },
        // 连续无提示通关数
        noHintStreak: 0,
        // 当前章节是否全程无提示（章节ID -> boolean）
        chapterNoHintMap: {},
        // 成就解锁时间（id -> timestamp）
        achievementTimes: {},
        // 印记系统
        seals: {},
      };
    },

    _migrate() {
      let changed = false;
      // 确保基础字段存在（版本1之前的旧数据）
      if (!this._data.levelScores) {
        this._data.levelScores = {};
        changed = true;
      }
      if (!this._data.unlockedChapters) {
        this._data.unlockedChapters = [1];
        changed = true;
      }
      if (typeof this._data.currentCycle !== 'number' || !this._data.currentCycle) {
        this._data.currentCycle = 1;
        changed = true;
      }
      if (!this._data.version || this._data.version < 2) {
        this._data.version = 2;
        if (!this._data.unlockedHiddenLevels) this._data.unlockedHiddenLevels = [];
        if (!this._data.achievements) this._data.achievements = [];
        if (typeof this._data.totalHints !== 'number') this._data.totalHints = 0;
        if (typeof this._data.trueEndingUnlocked !== 'boolean') this._data.trueEndingUnlocked = false;
        if (typeof this._data.trueEndingCleared !== 'boolean') this._data.trueEndingCleared = false;
        changed = true;
      }
      if (!this._data.version || this._data.version < 3) {
        this._data.version = 3;
        if (typeof this._data.totalPlayTime !== 'number') this._data.totalPlayTime = 0;
        if (!this._data.skillStats) {
          this._data.skillStats = {
            rule45Count: 0,
            nakedPairCount: 0,
            pointingPairCount: 0,
            cageSumCount: 0,
          };
        }
        if (typeof this._data.noHintStreak !== 'number') this._data.noHintStreak = 0;
        changed = true;
      }
      if (!this._data.version || this._data.version < 4) {
        this._data.version = 4;
        if (!this._data.seals || typeof this._data.seals !== 'object') {
          this._data.seals = {};
        }
        if (!this._data.achievementTimes || typeof this._data.achievementTimes !== 'object') {
          this._data.achievementTimes = {};
        }
        changed = true;
      }
      if (!this._data.version || this._data.version < 5) {
        this._data.version = 5;
        // 成就系统重构：清理旧成就ID，保留已有成就的时间映射
        // 旧成就保留在数组中但不会在新面板显示（新定义使用新ID）
        if (!this._data.achievements) this._data.achievements = [];
        if (!this._data.achievementTimes || typeof this._data.achievementTimes !== 'object') {
          this._data.achievementTimes = {};
        }
        changed = true;
      }
      if (!this._data.version || this._data.version < 6) {
        this._data.version = 6;
        // v6: 扩展 skillStats 字段，添加 chapterNoHintMap
        if (!this._data.skillStats) {
          this._data.skillStats = {};
        }
        const defaultStats = {
          rule45Count: 0,
          nakedSingleCount: 0,
          hiddenSingleCount: 0,
          nakedPairCount: 0,
          hiddenPairCount: 0,
          pointingPairCount: 0,
          cageSumCount: 0,
          xWingCount: 0,
          swordfishCount: 0,
          nakedTripletCount: 0,
        };
        for (const key in defaultStats) {
          if (typeof this._data.skillStats[key] !== 'number') {
            this._data.skillStats[key] = defaultStats[key];
          }
        }
        if (!this._data.chapterNoHintMap || typeof this._data.chapterNoHintMap !== 'object') {
          this._data.chapterNoHintMap = {};
        }
        changed = true;
      }
      if (changed) this.save();
    },

    reset() {
      try {
        // 清除所有备份
        for (let i = 1; i <= BACKUP_COUNT; i++) {
          try {
            localStorage.removeItem(BACKUP_KEY_PREFIX + i);
          } catch (e) { /* ignore */ }
        }
      } catch (e) {
        console.warn('[ProgressManager] Clear backups on reset failed:', e);
      }
      this._data = this._defaultData();
      this.save();
      // 同步重置 DataStore 中的进度数据
      if (this._hasDataStore()) {
        try {
          global.DataStore.set('progress', this._defaultData(), { immediate: false, delay: 200 });
        } catch (e) { /* ignore */ }
      }
    },

    // 成就回调设置
    onAchievementUnlock(callback) {
      this._onAchievementUnlock = callback;
    },

    // 成就系统
    unlockAchievement(id) {
      if (!ACHIEVEMENT_DEFS[id]) return false;
      if (this._data.achievements.indexOf(id) !== -1) return false;
      this._data.achievements.push(id);
      // 记录解锁时间
      if (!this._data.achievementTimes) this._data.achievementTimes = {};
      this._data.achievementTimes[id] = Date.now();
      this.save();
      if (this._onAchievementUnlock) {
        try { this._onAchievementUnlock(ACHIEVEMENT_DEFS[id]); } catch (e) {}
      }
      return true;
    },

    hasAchievement(id) {
      return this._data.achievements.indexOf(id) !== -1;
    },

    getAchievements() {
      return this._data.achievements.slice();
    },

    getAchievementDefs() {
      return ACHIEVEMENT_DEFS;
    },

    getAchievementDef(id) {
      return ACHIEVEMENT_DEFS[id] || null;
    },

    getAllAchievements() {
      const result = [];
      for (const id in ACHIEVEMENT_DEFS) {
        const def = ACHIEVEMENT_DEFS[id];
        result.push({
          id: def.id,
          name: def.name,
          description: def.description,
          category: def.category,
          sealText: def.sealText,
          sealColor: def.sealColor,
          unlocked: this.hasAchievement(id),
          unlockedAt: this.getAchievementUnlockTime(id),
        });
      }
      return result;
    },

    getSealColor(colorName) {
      return SEAL_COLORS[colorName] || '#94a3b8';
    },

    getAchievementUnlockTime(id) {
      if (!this._data.achievementTimes) return null;
      return this._data.achievementTimes[id] || null;
    },

    // 总提示次数
    addHintCount(count) {
      this._data.totalHints += count || 1;
      this.save();
    },

    getTotalHints() {
      return this._data.totalHints || 0;
    },

    resetTotalHints() {
      this._data.totalHints = 0;
      this.save();
    },

    // 累计游戏时长
    addPlayTime(seconds) {
      this._data.totalPlayTime = (this._data.totalPlayTime || 0) + (seconds || 0);
      this.save();
    },

    getTotalPlayTime() {
      return this._data.totalPlayTime || 0;
    },

    // 技巧使用统计
    addSkillCount(skillName, count) {
      if (!this._data.skillStats) {
        this._data.skillStats = this._getDefaultSkillStats();
      }
      const key = skillName + 'Count';
      if (typeof this._data.skillStats[key] === 'number') {
        this._data.skillStats[key] += count || 1;
        this.save();
      }
    },

    getSkillCount(skillName) {
      if (!this._data.skillStats) return 0;
      const key = skillName + 'Count';
      return this._data.skillStats[key] || 0;
    },

    _getDefaultSkillStats() {
      return {
        rule45Count: 0,
        nakedSingleCount: 0,
        hiddenSingleCount: 0,
        nakedPairCount: 0,
        hiddenPairCount: 0,
        pointingPairCount: 0,
        cageSumCount: 0,
        xWingCount: 0,
        swordfishCount: 0,
        nakedTripletCount: 0,
      };
    },

    /**
     * 记录一次技巧使用（推荐使用此方法，接受 TechRater 风格的技巧ID）
     * 同时自动检查对应技巧成就
     * @param {string} techniqueId - 技巧ID，如 'nakedSingle', 'hiddenSingle', 'rule45', 'xWing', 'swordfish' 等
     * @returns {boolean} 是否成功记录
     */
    addSkillUsage(techniqueId) {
      if (!techniqueId) return false;
      if (!this._data.skillStats) {
        this._data.skillStats = this._getDefaultSkillStats();
      }

      // 将技术ID映射到统计键名
      const statKey = this._techniqueToStatKey(techniqueId);
      if (!statKey) return false;

      if (typeof this._data.skillStats[statKey] !== 'number') {
        this._data.skillStats[statKey] = 0;
      }
      this._data.skillStats[statKey] += 1;
      this.save();

      // 自动检查技巧成就
      this.checkTechniqueAchievements(techniqueId);

      return true;
    },

    /**
     * 将 TechRater 技巧ID转换为 skillStats 中的键名
     */
    _techniqueToStatKey(techniqueId) {
      const map = {
        'nakedSingle': 'nakedSingleCount',
        'hiddenSingle': 'hiddenSingleCount',
        'rule45': 'rule45Count',
        'nakedPair': 'nakedPairCount',
        'hiddenPair': 'hiddenPairCount',
        'pointingClaiming': 'pointingPairCount',
        'pointingPair': 'pointingPairCount',
        'cageUnique': 'cageSumCount',
        'cageSum': 'cageSumCount',
        'nakedTriplet': 'nakedTripletCount',
        'xWing': 'xWingCount',
        'swordfish': 'swordfishCount',
      };
      return map[techniqueId] || null;
    },

    /**
     * 检查技巧类成就并解锁
     * @param {string} [specificTechnique] - 可选，只检查特定技巧对应的成就
     */
    checkTechniqueAchievements(specificTechnique) {
      if (!this._data.skillStats) return;

      const stats = this._data.skillStats;

      // 技巧成就映射：技巧ID -> 成就ID（首次使用即解锁）
      const firstUseAchievements = {
        'nakedSingle': 'first_naked_single',
        'hiddenSingle': 'first_hidden_single',
        'nakedPair': 'first_naked_pair',
        'hiddenPair': 'first_hidden_pair',
        'rule45': 'first_rule45',
        'xWing': 'first_xwing',
        'swordfish': 'first_swordfish',
      };

      const techniquesToCheck = specificTechnique
        ? [specificTechnique]
        : Object.keys(firstUseAchievements);

      for (const techId of techniquesToCheck) {
        const achId = firstUseAchievements[techId];
        if (!achId) continue;
        if (this.hasAchievement(achId)) continue;

        const statKey = this._techniqueToStatKey(techId);
        const count = statKey ? (stats[statKey] || 0) : 0;
        if (count >= 1) {
          this.unlockAchievement(achId);
        }
      }
    },

    // 连续无提示通关
    getNoHintStreak() {
      return this._data.noHintStreak || 0;
    },

    incrementNoHintStreak() {
      this._data.noHintStreak = (this._data.noHintStreak || 0) + 1;
      this.save();
      return this._data.noHintStreak;
    },

    resetNoHintStreak() {
      this._data.noHintStreak = 0;
      this.save();
    },

    // 章节全程无提示
    isChapterNoHint(chapterId) {
      if (!this._data.chapterNoHintMap) return false;
      return this._data.chapterNoHintMap[chapterId] === true;
    },

    setChapterHintUsed(chapterId) {
      if (!this._data.chapterNoHintMap) this._data.chapterNoHintMap = {};
      // 一旦使用提示，标记为 false（不是全程无提示）
      // 只有 undefined 或 true 才是未使用/全程无提示
      if (this._data.chapterNoHintMap[chapterId] !== false) {
        this._data.chapterNoHintMap[chapterId] = false;
        this.save();
      }
    },

    markChapterNoHint(chapterId) {
      if (!this._data.chapterNoHintMap) this._data.chapterNoHintMap = {};
      // 只有从未使用过提示时才标记为 true
      if (this._data.chapterNoHintMap[chapterId] !== false) {
        this._data.chapterNoHintMap[chapterId] = true;
        this.save();
        return true;
      }
      return false;
    },

    resetChapterNoHint(chapterId) {
      if (!this._data.chapterNoHintMap) this._data.chapterNoHintMap = {};
      delete this._data.chapterNoHintMap[chapterId];
      this.save();
    },

    // 章节解锁
    isChapterUnlocked(chapterId) {
      return this._data.unlockedChapters.indexOf(chapterId) !== -1;
    },

    unlockChapter(chapterId) {
      if (!this.isChapterUnlocked(chapterId)) {
        this._data.unlockedChapters.push(chapterId);
        this._data.unlockedChapters.sort((a, b) => a - b);
        this.save();
      }
    },

    // 关卡成绩
    getLevelScore(levelId, cycle) {
      if (!this._data || !this._data.levelScores) return null;
      const key = cycle ? levelId + '_c' + cycle : levelId;
      return this._data.levelScores[key] || null;
    },

    setLevelScore(levelId, score) {
      if (!this._data) return false;
      if (!this._data.levelScores) this._data.levelScores = {};
      const cycle = this._data.currentCycle || 1;
      const key = levelId + '_c' + cycle;
      const existing = this._data.levelScores[key];
      // 只保存更好的成绩（更高评级或相同评级但更快）
      if (!existing || this._isBetterScore(score, existing)) {
        this._data.levelScores[key] = score;
        this.save();
        return true;
      }
      return false;
    },

    // 设置上次游玩关卡
    setLastPlayedLevel(levelId) {
      this._data.lastPlayedLevel = levelId;
      this.save();
    },

    getLastPlayedLevel() {
      return this._data.lastPlayedLevel;
    },

    _isBetterScore(newScore, oldScore) {
      const gradeOrder = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 };
      const newGrade = gradeOrder[newScore.grade] || 0;
      const oldGrade = gradeOrder[oldScore.grade] || 0;
      if (newGrade !== oldGrade) return newGrade > oldGrade;
      return newScore.time < oldScore.time;
    },

    // 章节通关状态
    getChapterGrade(chapterId, chaptersData) {
      const cycle = this._data.currentCycle;
      const chapter = this._findChapter(chapterId, chaptersData);
      if (!chapter || !chapter.levels) return null;

      let worstGrade = null;
      let allCleared = true;
      for (const lvl of chapter.levels) {
        const score = this.getLevelScore(lvl.levelId, cycle);
        if (!score) {
          allCleared = false;
          break;
        }
        if (!worstGrade || this._gradeRank(score.grade) < this._gradeRank(worstGrade)) {
          worstGrade = score.grade;
        }
      }
      return allCleared ? worstGrade : null;
    },

    _gradeRank(grade) {
      const order = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 };
      return order[grade] || 0;
    },

    _findChapter(chapterId, chaptersData) {
      if (!chaptersData || !chaptersData.chapters) return null;
      for (const ch of chaptersData.chapters) {
        if (ch.chapterId === chapterId) return ch;
      }
      return null;
    },

    // 周目相关
    getCurrentCycle() {
      return this._data.currentCycle;
    },

    setCurrentCycle(cycle) {
      this._data.currentCycle = cycle;
      this.save();
    },

    // 检查是否可以进入下一周目（所有章节至少D级通关）
    canAdvanceCycle(chaptersData) {
      if (!chaptersData || !chaptersData.chapters) return false;
      for (const ch of chaptersData.chapters) {
        const grade = this.getChapterGrade(ch.chapterId, chaptersData);
        if (!grade || this._gradeRank(grade) < this._gradeRank('D')) {
          return false;
        }
      }
      return true;
    },

    // 下一周目
    advanceCycle() {
      this._data.currentCycle++;
      this.save();
      return this._data.currentCycle;
    },

    // === 隐藏关系统 ===
    isHiddenLevelUnlocked(levelId) {
      return this._data.unlockedHiddenLevels.indexOf(levelId) !== -1;
    },

    unlockHiddenLevel(levelId) {
      if (this.isHiddenLevelUnlocked(levelId)) return false;
      this._data.unlockedHiddenLevels.push(levelId);
      this.save();
      // 检查是否所有隐藏关都已解锁
      this._checkAllHiddenUnlocked();
      return true;
    },

    _checkAllHiddenUnlocked() {
      // 此方法需要 chaptersData，在 ChapterSelect 中调用检查
    },

    // 获取某章的普通关卡列表（过滤隐藏关）
    getNormalLevels(chapter) {
      if (!chapter || !chapter.levels) return [];
      return chapter.levels.filter(function(lvl) { return !lvl.isHidden; });
    },

    // 获取某章的隐藏关卡列表
    getHiddenLevels(chapter) {
      if (!chapter || !chapter.levels) return [];
      return chapter.levels.filter(function(lvl) { return lvl.isHidden; });
    },

    // 检查某章普通关卡是否全部S级
    isChapterAllS(chapterId, chaptersData) {
      const cycle = this._data.currentCycle;
      const chapter = this._findChapter(chapterId, chaptersData);
      if (!chapter || !chapter.levels) return false;
      const normalLevels = chapter.levels.filter(function(lvl) { return !lvl.isHidden; });
      if (normalLevels.length === 0) return false;
      for (const lvl of normalLevels) {
        const score = this.getLevelScore(lvl.levelId, cycle);
        if (!score || score.grade !== 'S') return false;
      }
      return true;
    },

    // 检查某章普通关卡是否全部通关
    isChapterCleared(chapterId, chaptersData) {
      const cycle = this._data.currentCycle;
      const chapter = this._findChapter(chapterId, chaptersData);
      if (!chapter || !chapter.levels) return false;
      const normalLevels = chapter.levels.filter(function(lvl) { return !lvl.isHidden; });
      if (normalLevels.length === 0) return false;
      for (const lvl of normalLevels) {
        const score = this.getLevelScore(lvl.levelId, cycle);
        if (!score) return false;
      }
      return true;
    },

    // 检查所有章节普通关卡是否全部通关
    isAllChaptersCleared(chaptersData) {
      if (!chaptersData || !chaptersData.chapters) return false;
      for (const ch of chaptersData.chapters) {
        if (!this.isChapterCleared(ch.chapterId, chaptersData)) return false;
      }
      return true;
    },

    // 检查并解锁某章的隐藏关（满足条件自动解锁）
    checkAndUnlockHiddenLevels(chapterId, chaptersData) {
      const chapter = this._findChapter(chapterId, chaptersData);
      if (!chapter || !chapter.levels) return [];
      const unlocked = [];
      const cycle = this._data.currentCycle;

      for (const lvl of chapter.levels) {
        if (!lvl.isHidden) continue;
        if (this.isHiddenLevelUnlocked(lvl.levelId)) continue;

        // 条件1：本章所有普通关卡S级通关
        const allS = this.isChapterAllS(chapterId, chaptersData);
        // 条件2：二周目以上自动解锁（可选配置，默认关闭）
        const cycleUnlock = lvl.hiddenUnlockType === 'cycle' && cycle >= 2;
        // 条件3：特定关卡不使用提示通关（此处简化为检查本章S级，具体在guide.js中触发）

        if (allS || cycleUnlock) {
          this.unlockHiddenLevel(lvl.levelId);
          unlocked.push(lvl.levelId);
        }
      }
      return unlocked;
    },

    // 获取所有隐藏关总数
    getTotalHiddenCount(chaptersData) {
      if (!chaptersData || !chaptersData.chapters) return 0;
      let count = 0;
      for (const ch of chaptersData.chapters) {
        if (ch.levels) {
          for (const lvl of ch.levels) {
            if (lvl.isHidden) count++;
          }
        }
      }
      return count;
    },

    // 获取已解锁隐藏关数量
    getUnlockedHiddenCount() {
      return this._data.unlockedHiddenLevels.length;
    },

    // 检查是否所有隐藏关都已通关
    areAllHiddenCleared(chaptersData) {
      const cycle = this._data.currentCycle;
      if (!chaptersData || !chaptersData.chapters) return false;
      for (const ch of chaptersData.chapters) {
        if (!ch.levels) continue;
        for (const lvl of ch.levels) {
          if (lvl.isHidden) {
            const score = this.getLevelScore(lvl.levelId, cycle);
            if (!score) return false;
          }
        }
      }
      return true;
    },

    // === 真结局系统 ===
    isTrueEndingUnlocked() {
      return this._data.trueEndingUnlocked === true;
    },

    isTrueEndingCleared() {
      return this._data.trueEndingCleared === true;
    },

    setTrueEndingCleared() {
      this._data.trueEndingCleared = true;
      this.save();
      this.unlockAchievement('true_ending');
    },

    // 真结局解锁条件检查
    checkTrueEndingUnlock(chaptersData) {
      if (this._data.trueEndingUnlocked) return false;
      const cycle = this._data.currentCycle;
      if (cycle < 2) return false; // 二周目以上

      // 条件1：所有章节通关（不含真结局章本身）
      const normalChapters = (chaptersData && chaptersData.chapters)
        ? chaptersData.chapters.filter(function(ch) { return !ch.isTrueEnding; })
        : [];
      for (const ch of normalChapters) {
        const grade = this.getChapterGrade(ch.chapterId, chaptersData);
        if (!grade || this._gradeRank(grade) < this._gradeRank('D')) {
          return false;
        }
      }

      // 条件2：所有隐藏关全部通关
      if (!this.areAllHiddenCleared(chaptersData)) return false;

      // 条件3：总提示次数不超过阈值（20次）
      if (this._data.totalHints > 20) return false;

      // 全部满足，解锁真结局
      this._data.trueEndingUnlocked = true;
      // 解锁第8章
      this.unlockChapter(8);
      this.save();
      return true;
    },

    // 周目难度修正
    getCycleModifiers() {
      const cycle = this._data.currentCycle;
      if (cycle <= 1) {
        return { hintMultiplier: 1.0, errorPenalty: 0.15, timeMultiplier: 1.0, label: '一周目' };
      } else if (cycle === 2) {
        return { hintMultiplier: 0.5, errorPenalty: 0.25, timeMultiplier: 0.75, label: '二周目' };
      } else {
        return { hintMultiplier: 0.5, errorPenalty: 0.30, timeMultiplier: 0.6, label: '第' + cycle + '周目' };
      }
    },

    // === 印记系统 ===

    getSealDefs() {
      return SEAL_DEFS;
    },

    getSealDef(sealId) {
      for (let i = 0; i < SEAL_DEFS.length; i++) {
        if (SEAL_DEFS[i].id === sealId) return SEAL_DEFS[i];
      }
      return null;
    },

    // 根据关卡 ID 查找对应印记定义
    getSealDefByLevel(levelId) {
      for (let i = 0; i < SEAL_DEFS.length; i++) {
        if (SEAL_DEFS[i].levelId === levelId) return SEAL_DEFS[i];
      }
      return null;
    },

    isSealUnlocked(sealId) {
      if (!this._data.seals) return false;
      return this._data.seals[sealId] !== undefined &&
             this._data.seals[sealId] !== null;
    },

    getUnlockedSeals() {
      const result = [];
      if (!this._data.seals) return result;
      for (let i = 0; i < SEAL_DEFS.length; i++) {
        const def = SEAL_DEFS[i];
        if (this.isSealUnlocked(def.id)) {
          result.push({
            id: def.id,
            name: def.name,
            icon: def.icon,
            levelId: def.levelId,
            desc: def.desc,
            unlockedAt: this._data.seals[def.id].unlockedAt,
            levelScore: this._data.seals[def.id].levelScore
          });
        }
      }
      return result;
    },

    getUnlockedSealCount() {
      let count = 0;
      for (let i = 0; i < SEAL_DEFS.length; i++) {
        if (this.isSealUnlocked(SEAL_DEFS[i].id)) count++;
      }
      return count;
    },

    unlockSeal(sealId, levelScore) {
      const def = this.getSealDef(sealId);
      if (!def) return false;
      if (this.isSealUnlocked(sealId)) return false;

      if (!this._data.seals) this._data.seals = {};
      this._data.seals[sealId] = {
        unlockedAt: Date.now(),
        levelScore: levelScore || null
      };
      this.save();

      // 检查印记收集成就
      this._checkSealCollectorAchievement();

      // 触发回调
      if (this._onSealUnlock) {
        try { this._onSealUnlock(def); } catch (e) {}
      }

      return true;
    },

    _checkSealCollectorAchievement() {
      if (this.hasAchievement('seal_collector')) return;
      const count = this.getUnlockedSealCount();
      if (count >= 5) {
        this.unlockAchievement('seal_collector');
      }
    },

    onSealUnlock(callback) {
      this._onSealUnlock = callback;
    },

    /**
     * 检查印记条件
     * @param {number|string} sealId - 印记 ID 或 关卡 ID
     * @param {Object} stats - 本关统计数据 { errors, hints, timeSeconds, usedNotes, levelId }
     * @returns {boolean} 是否满足条件
     */
    checkSealCondition(sealId, stats) {
      // 如果传入的是关卡 ID，先查找对应印记
      let def = this.getSealDef(sealId);
      if (!def) {
        def = this.getSealDefByLevel(parseInt(sealId));
      }
      if (!def) return false;

      const errors = stats.errors || 0;
      const hints = stats.hints || 0;
      const timeSeconds = stats.timeSeconds || 0;
      const usedNotes = stats.usedNotes || false;

      // 所有印记的基础条件：零错误
      if (errors > 0) return false;

      switch (def.id) {
        case 'flame':
          // 炎之印记：零错误 + 不用提示
          return hints === 0;

        case 'water':
          // 水之印记：零错误 + 限时内完成
          {
            const timeLimit = SEAL_TIME_LIMITS[def.levelId] || 300;
            return timeSeconds > 0 && timeSeconds <= timeLimit;
          }

        case 'earth':
          // 岩之印记：零错误 + 不使用笔记
          return !usedNotes;

        case 'wind':
          // 风之印记：零错误 + 不用提示 + 限时
          {
            const timeLimit = SEAL_TIME_LIMITS[def.levelId] || 240;
            return hints === 0 && timeSeconds > 0 && timeSeconds <= timeLimit;
          }

        case 'star':
          // 星之印记：全印记 + 真结局 + 零错误
          {
            // 检查是否已解锁其他四枚元素印记
            const elementSeals = ['flame', 'water', 'earth', 'wind'];
            let allElements = true;
            for (let i = 0; i < elementSeals.length; i++) {
              if (!this.isSealUnlocked(elementSeals[i])) {
                allElements = false;
                break;
              }
            }
            // 真结局已达成
            const trueEnding = this.isTrueEndingCleared();
            return allElements && trueEnding;
          }

        default:
          return false;
      }
    },

    // 获取印记限时（用于 UI 显示）
    getSealTimeLimit(sealId) {
      const def = this.getSealDef(sealId);
      if (!def) return null;
      return SEAL_TIME_LIMITS[def.levelId] || null;
    },
  };

  // === ChapterSelect 类 ===
  class ChapterSelect {
    constructor(options) {
      this.options = options || {};
      this.onSelectLevel = this.options.onSelectLevel || function() {};
      this.chaptersData = null;
      this.container = null;
      this.expandedChapter = null;
      this._isVisible = false;
    }

    // 加载章节数据
    async loadChapters() {
      try {
        this.chaptersData = await getChapterData();
        return this.chaptersData;
      } catch (e) {
        console.error('[ChapterSelect] Failed to load chapters:', e);
        return null;
      }
    }

    // 显示章节选择
    async show() {
      if (this._isVisible) return;
      this._isVisible = true;
      ProgressManager.load();

      if (!this.container) {
        this._buildDOM();
      }

      // P2: 锁定背景滚动
      if (typeof _pushModal === 'function') {
        _pushModal('chapterSelect');
      } else {
        document.body.classList.add('modal-open');
      }

      const overlay = document.getElementById('chapter-select-overlay');
      if (overlay) {
        overlay.style.display = 'flex';
        requestAnimationFrame(() => {
          overlay.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
          overlay.style.opacity = '1';
          overlay.style.transform = 'translateX(0)';
        });
      }

      // P2: 显示骨架屏加载态
      const grid = document.getElementById('cs-chapter-grid');
      if (grid && !this.chaptersData) {
        this._showSkeleton(grid);
      }

      // 异步加载章节数据
      if (!this.chaptersData) {
        try {
          await this.loadChapters();
        } catch (e) {
          console.error('[ChapterSelect] Load failed:', e);
        }
      }

      // 检查隐藏关和真结局解锁
      this._checkAllUnlocks();

      // 隐藏骨架屏，渲染内容
      if (grid) {
        this._hideSkeleton(grid);
      }
      this._render();
    }

    // 隐藏
    hide() {
      if (!this._isVisible) return;
      this._isVisible = false;

      // P2: 解锁背景滚动
      if (typeof _popModal === 'function') {
        _popModal('chapterSelect');
      } else {
        document.body.classList.remove('modal-open');
      }

      const overlay = document.getElementById('chapter-select-overlay');
      if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transform = 'translateX(-30px)';
        setTimeout(() => {
          overlay.style.display = 'none';
        }, 400);
      }
    }

    // P2: 显示骨架屏
    _showSkeleton(container) {
      if (!container) return;
      let html = '<div style="padding:20px 0;">';
      for (let i = 0; i < 5; i++) {
        html += '<div class="chapter-skeleton-item" style="height:80px;margin-bottom:16px;border-radius:10px;' +
          'background:linear-gradient(90deg,rgba(60,50,40,0.4) 25%,rgba(80,68,54,0.6) 50%,rgba(60,50,40,0.4) 75%);' +
          'background-size:200% 100%;animation:skeletonShimmer 1.5s ease-in-out infinite;"></div>';
      }
      html += '</div>';
      // 添加 shimmer keyframes
      if (!document.getElementById('skeleton-style')) {
        const style = document.createElement('style');
        style.id = 'skeleton-style';
        style.textContent = '@keyframes skeletonShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }';
        document.head.appendChild(style);
      }
      container.innerHTML = html;
    }

    // P2: 隐藏骨架屏
    _hideSkeleton(container) {
      if (!container) return;
      container.innerHTML = '';
    }

    // 构建 DOM
    _buildDOM() {
      const overlay = document.createElement('div');
      overlay.id = 'chapter-select-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(26,22,18,0.92);z-index:22000;display:none;' +
        'flex-direction:column;overflow-y:auto;' +
        '-webkit-overflow-scrolling:touch;overscroll-behavior:contain;' +
        'opacity:0;transform:translateX(-30px);backdrop-filter:blur(6px);' +
        'padding:20px 16px;';

      // 主纸张容器 — 泛黄档案纸
      const paper = document.createElement('div');
      paper.id = 'cs-paper';
      paper.style.cssText = 'width:100%;max-width:900px;flex-shrink:0;margin:0 auto;' +
        'background:' +
        /* 纸张纹理：横线 + 噪点 */
        'repeating-linear-gradient(0deg,' +
        '  transparent 0px, transparent 27px,' +
        '  rgba(180,150,100,0.08) 27px, rgba(180,150,100,0.08) 28px),' +
        /* 边缘老化 */
        'radial-gradient(ellipse at 0% 0%, rgba(160,120,80,0.15) 0%, transparent 40%),' +
        'radial-gradient(ellipse at 100% 0%, rgba(160,120,80,0.12) 0%, transparent 35%),' +
        'radial-gradient(ellipse at 0% 100%, rgba(160,120,80,0.12) 0%, transparent 35%),' +
        'radial-gradient(ellipse at 100% 100%, rgba(160,120,80,0.15) 0%, transparent 40%),' +
        /* 底色 */
        'linear-gradient(180deg, #f8f1e6 0%, #f4ede4 30%, #efe6d8 70%, #e8dcc8 100%);' +
        'border-radius:4px;' +
        'box-shadow:' +
        '  0 20px 60px rgba(0,0,0,0.4),' +
        '  0 4px 12px rgba(0,0,0,0.2),' +
        '  inset 0 0 80px rgba(180,140,90,0.08),' +
        '  inset 0 1px 0 rgba(255,255,255,0.5);' +
        'position:relative;overflow:hidden;' +
        'border:1px solid rgba(180,150,100,0.3);';

      // 纸张卷角效果（右下角）
      const pageCurl = document.createElement('div');
      pageCurl.style.cssText = 'position:absolute;bottom:0;right:0;width:60px;height:60px;' +
        'background:linear-gradient(135deg, transparent 50%, rgba(160,130,90,0.2) 50%, rgba(140,110,70,0.15) 100%);' +
        'pointer-events:none;z-index:10;';
      paper.appendChild(pageCurl);

      // 顶部栏
      const header = document.createElement('div');
      header.id = 'cs-header';
      header.style.cssText = 'width:100%;padding:28px 28px 16px;' +
        'display:flex;justify-content:space-between;align-items:center;flex-shrink:0;' +
        'position:relative;z-index:2;';

      const titleWrap = document.createElement('div');
      titleWrap.innerHTML =
        '<div style="font-size:26px;font-weight:900;color:#1a1614;' +
        'letter-spacing:6px;font-family:Georgia,\'Noto Serif SC\',serif;' +
        'text-shadow:0 1px 0 rgba(255,255,255,0.6);">档 案 目 录</div>' +
        '<div id="cs-cycle-label" style="font-size:12px;color:#8a7a6a;' +
        'margin-top:6px;letter-spacing:3px;font-family:\'Courier New\',monospace;">' +
        'CASE FILE · 一周目</div>';

      const closeBtn = document.createElement('button');
      closeBtn.id = 'cs-close-btn';
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'width:38px;height:38px;border:1px solid #c9a84c;' +
        'background:linear-gradient(180deg, #f5ecd8 0%, #e8dcc4 100%);' +
        'color:#8b7355;border-radius:4px;cursor:pointer;' +
        'font-size:16px;transition:all 0.2s;' +
        'box-shadow:0 2px 4px rgba(0,0,0,0.1),inset 0 1px 0 rgba(255,255,255,0.6);';
      closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.background = 'linear-gradient(180deg, #fff5e0 0%, #f0e0c0 100%)';
        closeBtn.style.color = '#c9a84c';
        closeBtn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15),0 0 12px rgba(201,168,76,0.2),inset 0 1px 0 rgba(255,255,255,0.7)';
      });
      closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.background = 'linear-gradient(180deg, #f5ecd8 0%, #e8dcc4 100%)';
        closeBtn.style.color = '#8b7355';
        closeBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1),inset 0 1px 0 rgba(255,255,255,0.6)';
      });
      closeBtn.addEventListener('click', () => this.hide());

      // 成就按钮
      const achBtn = document.createElement('button');
      achBtn.id = 'cs-achievement-btn';
      achBtn.textContent = '🏆';
      achBtn.title = '印章簿';
      achBtn.style.cssText = 'width:38px;height:38px;border:1px solid #c9a84c;' +
        'background:linear-gradient(180deg, #f5ecd8 0%, #e8dcc4 100%);' +
        'color:#b91c1c;border-radius:4px;cursor:pointer;' +
        'font-size:16px;transition:all 0.2s;margin-right:8px;' +
        'box-shadow:0 2px 4px rgba(0,0,0,0.1),inset 0 1px 0 rgba(255,255,255,0.6);';
      achBtn.addEventListener('mouseenter', () => {
        achBtn.style.background = 'linear-gradient(180deg, #fff5e0 0%, #f0e0c0 100%)';
        achBtn.style.borderColor = '#b91c1c';
        achBtn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15),0 0 12px rgba(185,28,28,0.15),inset 0 1px 0 rgba(255,255,255,0.7)';
      });
      achBtn.addEventListener('mouseleave', () => {
        achBtn.style.background = 'linear-gradient(180deg, #f5ecd8 0%, #e8dcc4 100%)';
        achBtn.style.borderColor = '#c9a84c';
        achBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1),inset 0 1px 0 rgba(255,255,255,0.6)';
      });
      achBtn.addEventListener('click', () => this._showAchievementPanel());

      // 印记按钮
      const sealBtn = document.createElement('button');
      sealBtn.id = 'cs-seal-btn';
      sealBtn.textContent = '✦';
      sealBtn.title = '印记';
      sealBtn.style.cssText = 'width:38px;height:38px;border:1px solid #c9a84c;' +
        'background:linear-gradient(180deg, #f5ecd8 0%, #e8dcc4 100%);' +
        'color:#7c3aed;border-radius:4px;cursor:pointer;' +
        'font-size:18px;font-weight:900;transition:all 0.2s;margin-right:8px;' +
        'box-shadow:0 2px 4px rgba(0,0,0,0.1),inset 0 1px 0 rgba(255,255,255,0.6);';
      sealBtn.addEventListener('mouseenter', () => {
        sealBtn.style.background = 'linear-gradient(180deg, #fff5e0 0%, #f0e0c0 100%)';
        sealBtn.style.borderColor = '#7c3aed';
        sealBtn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15),0 0 12px rgba(124,58,237,0.15),inset 0 1px 0 rgba(255,255,255,0.7)';
      });
      sealBtn.addEventListener('mouseleave', () => {
        sealBtn.style.background = 'linear-gradient(180deg, #f5ecd8 0%, #e8dcc4 100%)';
        sealBtn.style.borderColor = '#c9a84c';
        sealBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1),inset 0 1px 0 rgba(255,255,255,0.6)';
      });
      sealBtn.addEventListener('click', () => this._showSealPanel());

      const btnGroup = document.createElement('div');
      btnGroup.style.cssText = 'display:flex;gap:8px;';
      btnGroup.appendChild(sealBtn);
      btnGroup.appendChild(achBtn);
      btnGroup.appendChild(closeBtn);

      header.appendChild(titleWrap);
      header.appendChild(btnGroup);
      paper.appendChild(header);

      // 章节网格
      const grid = document.createElement('div');
      grid.id = 'cs-chapter-grid';
      grid.style.cssText = 'width:100%;padding:0 28px 20px;' +
        'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));' +
        'gap:14px;position:relative;z-index:2;';
      paper.appendChild(grid);

      // 周目切换区
      const cycleBar = document.createElement('div');
      cycleBar.id = 'cs-cycle-bar';
      cycleBar.style.cssText = 'width:100%;padding:0 28px 16px;' +
        'display:flex;justify-content:center;gap:10px;flex-wrap:wrap;' +
        'position:relative;z-index:2;';
      paper.appendChild(cycleBar);

      // 底部信息 + 页码
      const footer = document.createElement('div');
      footer.style.cssText = 'width:100%;padding:16px 28px 28px;' +
        'display:flex;justify-content:space-between;align-items:center;' +
        'font-size:11px;color:#a89880;letter-spacing:2px;' +
        'font-family:\'Courier New\',monospace;' +
        'position:relative;z-index:2;';
      footer.innerHTML =
        '<span>CAGED CIPHER · 侦探档案</span>' +
        '<span style="font-style:italic;color:#8a7a6a;font-family:Georgia,serif;' +
        'font-size:13px;letter-spacing:1px;">— 第 1 页 —</span>';
      paper.appendChild(footer);

      overlay.appendChild(paper);
      document.body.appendChild(overlay);

      this.container = overlay;
    }

    // 渲染
    _render() {
      if (!this.chaptersData || !this.chaptersData.chapters) return;

      const mods = ProgressManager.getCycleModifiers();
      const cycleLabel = document.getElementById('cs-cycle-label');
      if (cycleLabel) {
        cycleLabel.textContent = 'CASE FILE · ' + mods.label +
          (ProgressManager.getCurrentCycle() > 1 ? ' · 提示×' + mods.hintMultiplier + ' · 错误×' + (mods.errorPenalty / 0.15).toFixed(1) : '');
      }

      const grid = document.getElementById('cs-chapter-grid');
      if (!grid) return;
      grid.innerHTML = '';

      for (const ch of this.chaptersData.chapters) {
        // 真结局章只有解锁后才显示
        if (ch.isTrueEnding && !ProgressManager.isTrueEndingUnlocked()) continue;
        const card = this._createChapterCard(ch);
        grid.appendChild(card);
      }

      // 渲染周目切换
      this._renderCycleBar();
    }

    _createChapterCard(chapter) {
      const unlocked = ProgressManager.isChapterUnlocked(chapter.chapterId);
      const grade = ProgressManager.getChapterGrade(chapter.chapterId, this.chaptersData);
      const normalLevels = ProgressManager.getNormalLevels(chapter);
      const levelCount = normalLevels.length;
      const hiddenLevels = ProgressManager.getHiddenLevels(chapter);
      const hiddenUnlocked = hiddenLevels.filter(function(lvl) {
        return ProgressManager.isHiddenLevelUnlocked(lvl.levelId);
      }).length;
      const hasHiddenUnlocked = hiddenUnlocked > 0;
      const color = chapter.color || '#c9a84c';
      const isTrueEnding = chapter.isTrueEnding === true;
      // 判断是否已通关（所有普通关卡都有成绩）
      const isCleared = normalLevels.every(function(lvl) {
        const score = ProgressManager.getLevelScore(lvl.levelId);
        return score && score.grade;
      });

      const card = document.createElement('div');
      card.className = 'cs-chapter-card';
      card.dataset.chapterId = chapter.chapterId;
      // 档案袋标签样式：左侧金色粗边 + 泛黄纸张半透明背景
      card.style.cssText = 'background:' +
        'linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(255,248,235,0.5) 50%, rgba(245,235,220,0.6) 100%);' +
        'border:1px solid rgba(180,150,100,0.25);' +
        'border-left:5px solid ' + (unlocked ? color : '#a89880') + ';' +
        'border-radius:0 6px 6px 0;' +
        'padding:18px 18px 16px 16px;' +
        'cursor:' + (unlocked ? 'pointer' : 'not-allowed') + ';' +
        'transition:all 0.3s cubic-bezier(0.4,0,0.2,1);' +
        'position:relative;overflow:hidden;' +
        (unlocked ? '' : 'opacity:0.55;') +
        'box-shadow:' +
        '  0 2px 6px rgba(0,0,0,0.08),' +
        '  inset 0 1px 0 rgba(255,255,255,0.6);' +
        (isTrueEnding ? 'box-shadow:0 0 20px rgba(201,168,76,0.25),0 2px 6px rgba(0,0,0,0.08);' : '');

      // 顶部档案标签凸起
      const tab = document.createElement('div');
      tab.style.cssText = 'position:absolute;top:-1px;left:12px;' +
        'width:60px;height:6px;' +
        'background:' + (unlocked ? color : '#a89880') + ';' +
        'border-radius:0 0 3px 3px;' +
        'opacity:0.7;';
      card.appendChild(tab);

      // 已通关：红色"已阅"印章
      if (isCleared && unlocked) {
        const stamp = document.createElement('div');
        stamp.style.cssText = 'position:absolute;top:12px;right:12px;' +
          'font-size:14px;font-weight:900;' +
          'color:rgba(185,28,28,0.65);' +
          'border:2px solid rgba(185,28,28,0.55);' +
          'border-radius:4px;' +
          'padding:2px 8px;' +
          'transform:rotate(-8deg);' +
          'font-family:Georgia,\'Noto Serif SC\',serif;' +
          'letter-spacing:2px;' +
          'pointer-events:none;' +
          'text-shadow:0 0 1px rgba(185,28,28,0.3);' +
          'z-index:3;';
        stamp.textContent = '已 阅';
        card.appendChild(stamp);
      }

      // 真结局标记
      if (isTrueEnding && ProgressManager.isTrueEndingCleared()) {
        const teBadge = document.createElement('div');
        teBadge.style.cssText = 'position:absolute;bottom:12px;right:12px;' +
          'font-size:11px;padding:3px 10px;border-radius:3px;' +
          'background:rgba(201,168,76,0.15);color:#a8882f;' +
          'border:1px solid rgba(201,168,76,0.4);letter-spacing:1px;' +
          'font-family:Georgia,serif;z-index:3;';
        teBadge.textContent = '真结局 ✓';
        card.appendChild(teBadge);
      }

      // 章节编号 + 标题
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;' +
        'position:relative;z-index:2;';
      header.innerHTML =
        '<span style="font-size:12px;color:' + (unlocked ? '#8a7355' : '#a89880') +
        ';font-weight:700;letter-spacing:2px;' +
        'font-family:\'Courier New\',monospace;">第' + this._cnNum(chapter.chapterId) + '章</span>' +
        (grade ? '<span class="cs-grade-badge" style="font-size:18px;font-weight:900;color:' +
          this._gradeColor(grade) + ';margin-left:auto;' +
          'text-shadow:0 1px 2px rgba(0,0,0,0.1);">' +
          grade + '</span>' : '') +
        (!unlocked ? '<span style="margin-left:auto;font-size:18px;opacity:0.5;">🔒</span>' : '');
      card.appendChild(header);

      // 标题
      const title = document.createElement('div');
      title.style.cssText = 'font-size:19px;font-weight:700;color:#1a1614;' +
        'margin-bottom:4px;letter-spacing:1px;' +
        'font-family:Georgia,\'Noto Serif SC\',serif;' +
        'position:relative;z-index:2;';
      title.textContent = chapter.title || '未命名章节';
      card.appendChild(title);

      // 副标题
      if (chapter.subtitle) {
        const subtitle = document.createElement('div');
        subtitle.style.cssText = 'font-size:12px;color:#8a7a6a;margin-bottom:10px;letter-spacing:1px;' +
          'font-family:\'Courier New\',monospace;' +
          'position:relative;z-index:2;';
        subtitle.textContent = chapter.subtitle;
        card.appendChild(subtitle);
      }

      // 关卡数量 + 隐藏关标记
      const info = document.createElement('div');
      info.style.cssText = 'font-size:12px;color:#7a6a55;display:flex;gap:14px;flex-wrap:wrap;' +
        'font-family:\'Courier New\',monospace;' +
        'position:relative;z-index:2;';
      info.innerHTML = '<span>📜 ' + levelCount + ' 关</span>' +
        '<span id="cs-progress-' + chapter.chapterId + '">' +
        this._getChapterProgress(chapter) + '</span>' +
        (hasHiddenUnlocked ? '<span style="color:#b8860b;">✨ 隐藏关</span>' : '');
      card.appendChild(info);

      // 描述
      if (chapter.description && unlocked) {
        const desc = document.createElement('div');
        desc.style.cssText = 'font-size:12px;color:#6a5a48;margin-top:10px;' +
          'line-height:1.6;max-height:0;overflow:hidden;transition:max-height 0.3s;' +
          'font-family:Georgia,serif;' +
          'position:relative;z-index:2;';
        desc.className = 'cs-chapter-desc';
        desc.textContent = chapter.description;
        card.appendChild(desc);
      }

      // 关卡列表（展开时显示）
      const levelList = document.createElement('div');
      levelList.className = 'cs-level-list';
      levelList.style.cssText = 'margin-top:0;max-height:0;overflow:hidden;' +
        'transition:max-height 0.4s ease, margin-top 0.3s;display:flex;' +
        'flex-direction:column;gap:5px;' +
        'position:relative;z-index:2;';
      levelList.id = 'cs-levels-' + chapter.chapterId;
      card.appendChild(levelList);

      // 交互
      if (unlocked) {
        card.addEventListener('click', (e) => {
          // 如果点击的是关卡列表内部，不触发展开/收起
          if (e.target.closest('.cs-level-item')) return;
          this._toggleChapter(chapter.chapterId);
        });
        card.addEventListener('mouseenter', () => {
          card.style.borderLeftColor = color;
          card.style.transform = 'translateX(4px) translateY(-2px)';
          card.style.boxShadow =
            '0 6px 18px rgba(0,0,0,0.12),' +
            '0 0 20px rgba(201,168,76,0.15),' +
            'inset 0 1px 0 rgba(255,255,255,0.7)';
        });
        card.addEventListener('mouseleave', () => {
          card.style.borderLeftColor = color;
          card.style.transform = 'translateX(0) translateY(0)';
          card.style.boxShadow =
            '0 2px 6px rgba(0,0,0,0.08),' +
            'inset 0 1px 0 rgba(255,255,255,0.6)';
        });
      }

      return card;
    }

    _toggleChapter(chapterId) {
      const levelList = document.getElementById('cs-levels-' + chapterId);
      const desc = document.querySelector(
        '[data-chapter-id="' + chapterId + '"] .cs-chapter-desc'
      );

      if (this.expandedChapter === chapterId) {
        // 收起
        if (levelList) {
          levelList.style.maxHeight = '0';
          levelList.style.marginTop = '0';
        }
        if (desc) desc.style.maxHeight = '0';
        this.expandedChapter = null;
      } else {
        // 先收起之前展开的
        if (this.expandedChapter !== null) {
          const prevList = document.getElementById('cs-levels-' + this.expandedChapter);
          const prevDesc = document.querySelector(
            '[data-chapter-id="' + this.expandedChapter + '"] .cs-chapter-desc'
          );
          if (prevList) {
            prevList.style.maxHeight = '0';
            prevList.style.marginTop = '0';
          }
          if (prevDesc) prevDesc.style.maxHeight = '0';
        }

        // 展开当前
        this._populateLevelList(chapterId);
        if (levelList) {
          levelList.style.maxHeight = '600px';
          levelList.style.marginTop = '12px';
        }
        if (desc) desc.style.maxHeight = '100px';
        this.expandedChapter = chapterId;
      }
    }

    _populateLevelList(chapterId) {
      const levelList = document.getElementById('cs-levels-' + chapterId);
      if (!levelList) return;
      levelList.innerHTML = '';

      const chapter = this._findChapter(chapterId);
      if (!chapter || !chapter.levels) return;

      const cycle = ProgressManager.getCurrentCycle();
      const normalLevels = ProgressManager.getNormalLevels(chapter);
      const hiddenLevels = ProgressManager.getHiddenLevels(chapter);

      // 普通关卡
      for (let i = 0; i < normalLevels.length; i++) {
        const lvl = normalLevels[i];
        const item = this._createLevelItem(lvl, i + 1, false, cycle);
        levelList.appendChild(item);
      }

      // 隐藏关（已解锁的才显示）
      const unlockedHidden = hiddenLevels.filter(function(lvl) {
        return ProgressManager.isHiddenLevelUnlocked(lvl.levelId);
      });
      if (unlockedHidden.length > 0) {
        const divider = document.createElement('div');
        divider.style.cssText = 'display:flex;align-items:center;gap:8px;' +
          'margin:8px 4px 4px;color:#b8860b;font-size:11px;letter-spacing:2px;' +
          'font-family:Georgia,serif;';
        divider.innerHTML = '<span style="flex:1;height:1px;' +
          'background:linear-gradient(to right,transparent,rgba(201,168,76,0.4));"></span>' +
          '✨ 隐藏关卡' +
          '<span style="flex:1;height:1px;' +
          'background:linear-gradient(to left,transparent,rgba(201,168,76,0.4));"></span>';
        levelList.appendChild(divider);

        for (let i = 0; i < unlockedHidden.length; i++) {
          const lvl = unlockedHidden[i];
          const item = this._createLevelItem(lvl, i + 1, true, cycle);
          levelList.appendChild(item);
        }
      }
    }

    _createLevelItem(lvl, idx, isHidden, cycle) {
      const score = ProgressManager.getLevelScore(lvl.levelId, cycle);
      const grade = score ? score.grade : null;

      const item = document.createElement('div');
      item.className = 'cs-level-item';
      item.dataset.levelId = lvl.levelId;
      item.style.cssText = 'display:flex;align-items:center;gap:10px;' +
        'padding:9px 14px;' +
        'background:' + (isHidden
          ? 'linear-gradient(90deg, rgba(201,168,76,0.12) 0%, rgba(255,248,235,0.6) 100%)'
          : 'linear-gradient(90deg, rgba(255,255,255,0.5) 0%, rgba(245,235,220,0.4) 100%)') + ';' +
        'border:1px solid ' + (isHidden ? 'rgba(201,168,76,0.4)' : 'rgba(180,150,100,0.25)') + ';' +
        'border-left:3px solid ' + (isHidden ? '#c9a84c' : '#c9a84c80') + ';' +
        'border-radius:0 4px 4px 0;' +
        'cursor:pointer;transition:all 0.2s cubic-bezier(0.4,0,0.2,1);';

      const numLabel = (isHidden ? '★' : String(idx).padStart(2, '0'));
      item.innerHTML =
        '<span style="font-size:12px;font-weight:700;color:' +
        (isHidden ? '#b8860b' : '#8a7a6a') + ';min-width:26px;' +
        'font-family:\'Courier New\',monospace;">' +
        numLabel + '</span>' +
        '<span style="flex:1;font-size:13px;color:' +
        (isHidden ? '#5a4a2a' : '#2a2018') + ';' +
        'font-family:Georgia,\'Noto Serif SC\',serif;">' +
        (lvl.title || ('第' + idx + '关')) + '</span>' +
        (grade ? '<span style="font-size:15px;font-weight:900;color:' +
          this._gradeColor(grade) + ';font-family:Georgia,serif;">' + grade + '</span>' :
          '<span style="font-size:11px;color:#a89880;font-family:\'Courier New\',monospace;">未通关</span>');

      const self = this;
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        self._selectLevel(lvl.levelId);
      });
      item.addEventListener('mouseenter', function() {
        item.style.background = isHidden
          ? 'linear-gradient(90deg, rgba(201,168,76,0.2) 0%, rgba(255,248,235,0.8) 100%)'
          : 'linear-gradient(90deg, rgba(255,255,255,0.7) 0%, rgba(245,235,220,0.6) 100%)';
        item.style.borderColor = isHidden
          ? 'rgba(201,168,76,0.6)'
          : 'rgba(201,168,76,0.4)';
        item.style.borderLeftColor = isHidden ? '#c9a84c' : '#c9a84c';
        item.style.transform = 'translateX(3px)';
        item.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)';
      });
      item.addEventListener('mouseleave', function() {
        item.style.background = isHidden
          ? 'linear-gradient(90deg, rgba(201,168,76,0.12) 0%, rgba(255,248,235,0.6) 100%)'
          : 'linear-gradient(90deg, rgba(255,255,255,0.5) 0%, rgba(245,235,220,0.4) 100%)';
        item.style.borderColor = isHidden
          ? 'rgba(201,168,76,0.4)'
          : 'rgba(180,150,100,0.25)';
        item.style.borderLeftColor = isHidden ? '#c9a84c' : '#c9a84c80';
        item.style.transform = 'translateX(0)';
        item.style.boxShadow = 'none';
      });

      return item;
    }

    _selectLevel(levelId) {
      this.hide();
      setTimeout(() => {
        this.onSelectLevel(levelId);
      }, 300);
    }

    _renderCycleBar() {
      const bar = document.getElementById('cs-cycle-bar');
      if (!bar) return;
      bar.innerHTML = '';

      const currentCycle = ProgressManager.getCurrentCycle();
      const canAdvance = ProgressManager.canAdvanceCycle(this.chaptersData);

      // 周目选择按钮
      for (let c = 1; c <= currentCycle; c++) {
        const btn = document.createElement('button');
        btn.style.cssText = 'padding:7px 18px;border:1px solid ' +
          (c === currentCycle ? '#c9a84c' : 'rgba(180,150,100,0.4)') + ';' +
          'background:' + (c === currentCycle
            ? 'linear-gradient(180deg, rgba(201,168,76,0.15) 0%, rgba(201,168,76,0.05) 100%)'
            : 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(245,235,220,0.3) 100%)') + ';' +
          'color:' + (c === currentCycle ? '#8b7355' : '#8a7a6a') + ';' +
          'border-radius:20px;cursor:pointer;font-size:12px;letter-spacing:1px;' +
          'transition:all 0.2s cubic-bezier(0.4,0,0.2,1);' +
          'font-family:Georgia,serif;' +
          'box-shadow:' + (c === currentCycle
            ? '0 2px 6px rgba(201,168,76,0.2),inset 0 1px 0 rgba(255,255,255,0.5)'
            : '0 1px 3px rgba(0,0,0,0.06),inset 0 1px 0 rgba(255,255,255,0.5)') + ';';
        btn.textContent = '第' + this._cnNum(c) + '周目';
        btn.addEventListener('click', () => {
          ProgressManager.setCurrentCycle(c);
          this._render();
        });
        bar.appendChild(btn);
      }

      // 新周目解锁按钮
      if (canAdvance) {
        const newBtn = document.createElement('button');
        newBtn.style.cssText = 'padding:7px 18px;border:1px dashed #b91c1c;' +
          'background:linear-gradient(180deg, rgba(185,28,28,0.08) 0%, rgba(185,28,28,0.02) 100%);' +
          'color:#b91c1c;' +
          'border-radius:20px;cursor:pointer;font-size:12px;letter-spacing:1px;' +
          'transition:all 0.2s cubic-bezier(0.4,0,0.2,1);' +
          'font-family:Georgia,serif;' +
          'box-shadow:0 1px 3px rgba(0,0,0,0.06),inset 0 1px 0 rgba(255,255,255,0.5);';
        newBtn.textContent = '开启第' + this._cnNum(currentCycle + 1) + '周目 ✦';
        newBtn.addEventListener('click', () => {
          const next = ProgressManager.advanceCycle();
          this._render();
          // 显示新周目提示
          this._showCycleStartToast(next);
        });
        bar.appendChild(newBtn);
      }
    }

    _showCycleStartToast(cycle) {
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;top:50%;left:50%;' +
        'transform:translate(-50%,-50%);' +
        'background:' +
        'radial-gradient(ellipse at 50% 30%, rgba(201,168,76,0.15) 0%, transparent 60%),' +
        'linear-gradient(180deg, #f8f1e6 0%, #efe6d8 100%);' +
        'border:2px solid #c9a84c;border-radius:6px;padding:40px 60px;' +
        'text-align:center;z-index:23000;opacity:0;transition:opacity 0.5s;' +
        'box-shadow:0 20px 60px rgba(0,0,0,0.4),0 0 40px rgba(201,168,76,0.2);' +
        'font-family:Georgia,\'Noto Serif SC\',serif;';
      toast.innerHTML =
        '<div style="font-size:12px;color:#8a7a6a;letter-spacing:6px;margin-bottom:16px;' +
        'font-family:\'Courier New\',monospace;">NEW GAME +</div>' +
        '<div style="font-size:32px;font-weight:900;color:#1a1614;' +
        'letter-spacing:6px;margin-bottom:20px;' +
        'text-shadow:0 1px 0 rgba(255,255,255,0.6);">' +
        '第' + this._cnNum(cycle) + '周目</div>' +
        '<div style="height:1px;background:linear-gradient(90deg,transparent,rgba(201,168,76,0.5),transparent);margin-bottom:16px;"></div>' +
        '<div style="font-size:13px;color:#6a5a48;line-height:2;' +
        'font-family:Georgia,serif;">' +
        '提示次数减半<br>错误惩罚加重<br>评级标准更严</div>';
      document.body.appendChild(toast);

      requestAnimationFrame(() => { toast.style.opacity = '1'; });
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
      }, 2500);
    }

    // 工具方法
    _findChapter(chapterId) {
      if (!this.chaptersData || !this.chaptersData.chapters) return null;
      for (const ch of this.chaptersData.chapters) {
        if (ch.chapterId === chapterId) return ch;
      }
      return null;
    }

    _getChapterProgress(chapter) {
      const cycle = ProgressManager.getCurrentCycle();
      const normalLevels = ProgressManager.getNormalLevels(chapter);
      if (normalLevels.length === 0) return '0/0';
      let cleared = 0;
      for (const lvl of normalLevels) {
        if (ProgressManager.getLevelScore(lvl.levelId, cycle)) cleared++;
      }
      return cleared + '/' + normalLevels.length;
    }

    // 检查所有解锁（隐藏关 + 真结局）
    _checkAllUnlocks() {
      if (!this.chaptersData || !this.chaptersData.chapters) return;
      let newHiddenUnlocked = [];
      for (const ch of this.chaptersData.chapters) {
        if (ch.isTrueEnding) continue;
        const unlocked = ProgressManager.checkAndUnlockHiddenLevels(ch.chapterId, this.chaptersData);
        newHiddenUnlocked = newHiddenUnlocked.concat(unlocked);
      }
      // 检查 all_hidden 成就
      if (ProgressManager.getUnlockedHiddenCount() > 0 &&
          ProgressManager.getUnlockedHiddenCount() >= ProgressManager.getTotalHiddenCount(this.chaptersData)) {
        ProgressManager.unlockAchievement('all_hidden');
      }
      // 检查 chapter1_s 成就
      if (ProgressManager.isChapterAllS(1, this.chaptersData)) {
        ProgressManager.unlockAchievement('chapter1_s');
      }
      // 检查真结局解锁
      const teUnlocked = ProgressManager.checkTrueEndingUnlock(this.chaptersData);
      if (teUnlocked) {
        this._showTrueEndingUnlockToast();
      }
      // 显示新解锁隐藏关提示
      if (newHiddenUnlocked.length > 0) {
        this._showHiddenUnlockToast(newHiddenUnlocked.length);
      }
    }

    _showHiddenUnlockToast(count) {
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;top:30%;left:50%;' +
        'transform:translate(-50%,-50%);' +
        'background:' +
        'radial-gradient(ellipse at 50% 30%, rgba(201,168,76,0.2) 0%, transparent 60%),' +
        'linear-gradient(180deg, #f8f1e6 0%, #efe6d8 100%);' +
        'border:2px solid #c9a84c;border-radius:6px;padding:24px 40px;' +
        'text-align:center;z-index:23000;opacity:0;transition:opacity 0.5s;' +
        'box-shadow:0 20px 60px rgba(0,0,0,0.4),0 0 30px rgba(201,168,76,0.2);' +
        'font-family:Georgia,\'Noto Serif SC\',serif;';
      toast.innerHTML =
        '<div style="font-size:11px;color:#8a7355;letter-spacing:4px;margin-bottom:10px;' +
        'font-family:\'Courier New\',monospace;">HIDDEN UNLOCKED</div>' +
        '<div style="font-size:22px;font-weight:900;color:#1a1614;' +
        'letter-spacing:3px;margin-bottom:8px;' +
        'text-shadow:0 1px 0 rgba(255,255,255,0.6);">✨ 隐藏关已解锁 ✨</div>' +
        '<div style="font-size:12px;color:#6a5a48;">发现 ' + count + ' 个新的隐藏关卡</div>';
      document.body.appendChild(toast);
      requestAnimationFrame(function() { toast.style.opacity = '1'; });
      setTimeout(function() {
        toast.style.opacity = '0';
        setTimeout(function() { toast.remove(); }, 500);
      }, 2000);
    }

    _showTrueEndingUnlockToast() {
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;top:30%;left:50%;' +
        'transform:translate(-50%,-50%);' +
        'background:' +
        'radial-gradient(ellipse at 50% 20%, rgba(201,168,76,0.3) 0%, transparent 60%),' +
        'linear-gradient(180deg, #fff5e0 0%, #f4ede4 50%, #efe6d8 100%);' +
        'border:2px solid #c9a84c;border-radius:6px;padding:32px 48px;' +
        'text-align:center;z-index:23000;opacity:0;transition:opacity 0.8s;' +
        'box-shadow:0 20px 60px rgba(0,0,0,0.4),0 0 50px rgba(201,168,76,0.3);' +
        'font-family:Georgia,\'Noto Serif SC\',serif;';
      toast.innerHTML =
        '<div style="font-size:12px;color:#b8860b;letter-spacing:6px;margin-bottom:14px;' +
        'font-family:\'Courier New\',monospace;">TRUE ENDING UNLOCKED</div>' +
        '<div style="font-size:26px;font-weight:900;color:#1a1614;' +
        'letter-spacing:4px;margin-bottom:12px;' +
        'text-shadow:0 1px 0 rgba(255,255,255,0.6),0 0 20px rgba(201,168,76,0.3);">真结局已解锁</div>' +
        '<div style="font-size:12px;color:#6a5a48;line-height:1.8;' +
        'font-family:Georgia,serif;">星辰之门已开启<br>最终的真相在等着你</div>';
      document.body.appendChild(toast);
      requestAnimationFrame(function() { toast.style.opacity = '1'; });
      setTimeout(function() {
        toast.style.opacity = '0';
        setTimeout(function() { toast.remove(); }, 800);
      }, 3000);
    }

    // 成就面板
    _showAchievementPanel() {
      const existing = document.getElementById('cs-achievement-panel');
      if (existing) {
        existing.style.display = 'flex';
        requestAnimationFrame(function() { existing.style.opacity = '1'; });
        return;
      }

      const panel = document.createElement('div');
      panel.id = 'cs-achievement-panel';
      panel.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(26,22,18,0.85);z-index:24000;display:flex;' +
        'flex-direction:column;align-items:center;justify-content:center;' +
        'opacity:0;transition:opacity 0.3s;backdrop-filter:blur(6px);' +
        'padding:20px 16px;';

      const content = document.createElement('div');
      content.style.cssText = 'width:90%;max-width:500px;' +
        'background:' +
        'radial-gradient(ellipse at 30% 20%, rgba(201,168,76,0.08) 0%, transparent 50%),' +
        'linear-gradient(180deg, #f8f1e6 0%, #f4ede4 50%, #efe6d8 100%);' +
        'border:1px solid rgba(180,150,100,0.35);' +
        'border-radius:6px;padding:28px 24px;' +
        'max-height:80vh;overflow-y:auto;' +
        'box-shadow:0 20px 60px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.5);' +
        'position:relative;';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;';
      header.innerHTML =
        '<div style="font-size:22px;font-weight:900;color:#1a1614;letter-spacing:4px;' +
        'font-family:Georgia,\'Noto Serif SC\',serif;' +
        'text-shadow:0 1px 0 rgba(255,255,255,0.6);">🏆 印 章 簿</div>' +
        '<button id="cs-ach-close" style="width:34px;height:34px;border:1px solid #c9a84c;' +
        'background:linear-gradient(180deg, #f5ecd8 0%, #e8dcc4 100%);' +
        'color:#8b7355;border-radius:4px;cursor:pointer;' +
        'font-size:14px;transition:all 0.2s;' +
        'box-shadow:0 1px 3px rgba(0,0,0,0.1),inset 0 1px 0 rgba(255,255,255,0.6);">✕</button>';
      content.appendChild(header);

      const defs = ProgressManager.getAchievementDefs();
      const unlocked = ProgressManager.getAchievements();
      const defKeys = Object.keys(defs);
      const stats = document.createElement('div');
      stats.style.cssText = 'font-size:12px;color:#8a7a6a;margin-bottom:14px;letter-spacing:1px;' +
        'font-family:\'Courier New\',monospace;';
      stats.textContent = '已解锁 ' + unlocked.length + ' / ' + defKeys.length + ' 枚印章';
      content.appendChild(stats);

      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

      for (const key of defKeys) {
        const def = defs[key];
        const isUnlocked = unlocked.indexOf(key) !== -1;
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 14px;' +
          'background:' + (isUnlocked
            ? 'linear-gradient(90deg, rgba(185,28,28,0.08) 0%, rgba(255,248,235,0.5) 100%)'
            : 'linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(245,235,220,0.2) 100%)') + ';' +
          'border:1px solid ' + (isUnlocked ? 'rgba(185,28,28,0.3)' : 'rgba(180,150,100,0.2)') + ';' +
          'border-left:3px solid ' + (isUnlocked ? '#b91c1c' : '#c9a84c60') + ';' +
          'border-radius:0 4px 4px 0;' +
          'transition:all 0.2s;';
        item.innerHTML =
          '<div style="font-size:26px;opacity:' + (isUnlocked ? '1' : '0.25') +
          ';filter:' + (isUnlocked ? 'none' : 'grayscale(100%)') + ';">' + def.icon + '</div>' +
          '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:14px;font-weight:700;color:' +
          (isUnlocked ? '#1a1614' : '#a89880') + ';' +
          'margin-bottom:2px;font-family:Georgia,\'Noto Serif SC\',serif;">' + def.name + '</div>' +
          '<div style="font-size:11px;color:' + (isUnlocked ? '#6a5a48' : '#a89880') + ';' +
          'font-family:\'Courier New\',monospace;">' + def.description + '</div>' +
          '</div>' +
          (isUnlocked
            ? '<div style="color:#b91c1c;font-size:11px;font-weight:700;' +
              'padding:2px 8px;border:1px solid rgba(185,28,28,0.4);border-radius:3px;' +
              'transform:rotate(-5deg);font-family:Georgia,serif;letter-spacing:1px;">已 获</div>'
            : '<div style="color:#a89880;font-size:10px;padding:2px 8px;' +
              'border:1px solid rgba(180,150,100,0.25);border-radius:3px;' +
              'font-family:\'Courier New\',monospace;">未解锁</div>');
        list.appendChild(item);
      }
      content.appendChild(list);
      panel.appendChild(content);
      document.body.appendChild(panel);

      document.getElementById('cs-ach-close').addEventListener('click', function() {
        panel.style.opacity = '0';
        setTimeout(function() { panel.style.display = 'none'; }, 300);
      });

      panel.addEventListener('click', function(e) {
        if (e.target === panel) {
          panel.style.opacity = '0';
          setTimeout(function() { panel.style.display = 'none'; }, 300);
        }
      });

      requestAnimationFrame(function() { panel.style.opacity = '1'; });
    }

    // 印记面板
    _showSealPanel() {
      const existing = document.getElementById('cs-seal-panel');
      if (existing) {
        existing.style.display = 'flex';
        requestAnimationFrame(function() { existing.style.opacity = '1'; });
        return;
      }

      const sealDefs = ProgressManager.getSealDefs();
      const unlockedCount = ProgressManager.getUnlockedSealCount();

      const panel = document.createElement('div');
      panel.id = 'cs-seal-panel';
      panel.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(26,22,18,0.85);z-index:24000;display:flex;' +
        'flex-direction:column;align-items:center;justify-content:center;' +
        'opacity:0;transition:opacity 0.4s ease;backdrop-filter:blur(6px);' +
        'padding:20px 16px;';

      const content = document.createElement('div');
      content.style.cssText = 'width:90%;max-width:560px;' +
        'background:' +
        'radial-gradient(ellipse at 50% 10%, rgba(201,168,76,0.1) 0%, transparent 50%),' +
        'linear-gradient(180deg, #f8f1e6 0%, #f4ede4 50%, #efe6d8 100%);' +
        'border:1px solid rgba(180,150,100,0.35);' +
        'border-radius:6px;padding:32px 24px 24px;' +
        'max-height:85vh;overflow-y:auto;' +
        'box-shadow:0 20px 60px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.5);' +
        'position:relative;';

      // 头部
      const header = document.createElement('div');
      header.style.cssText = 'text-align:center;margin-bottom:20px;';
      header.innerHTML =
        '<div style="font-size:24px;font-weight:900;color:#1a1614;' +
        'letter-spacing:6px;margin-bottom:8px;' +
        'font-family:Georgia,\'Noto Serif SC\',serif;' +
        'text-shadow:0 1px 0 rgba(255,255,255,0.6);">✦ 印记圣坛 ✦</div>' +
        '<div style="font-size:12px;color:#8a7355;letter-spacing:2px;' +
        'font-family:\'Courier New\',monospace;">' +
        'SEAL SHRINE · 已觉醒 ' + unlockedCount + ' / ' + sealDefs.length + '</div>' +
        '<div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,rgba(201,168,76,0.6),transparent);' +
        'margin:14px auto 0;"></div>';
      content.appendChild(header);

      // 印记圆环展示
      const sealRing = document.createElement('div');
      sealRing.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);' +
        'gap:10px;margin-bottom:20px;justify-items:center;';

      for (let i = 0; i < sealDefs.length; i++) {
        const def = sealDefs[i];
        const isUnlocked = ProgressManager.isSealUnlocked(def.id);
        const sealData = isUnlocked ? ProgressManager._data.seals[def.id] : null;

        const sealItem = document.createElement('div');
        sealItem.style.cssText =
          'width:100%;aspect-ratio:1;' +
          'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
          'border-radius:50%;cursor:pointer;transition:all 0.3s ease;position:relative;' +
          'background:' + (isUnlocked
            ? 'radial-gradient(circle,' + def.color + '20 0%,transparent 70%)'
            : 'rgba(180,150,100,0.1)') + ';' +
          'border:2px solid ' + (isUnlocked ? def.color + '80' : 'rgba(180,150,100,0.3)') + ';' +
          'box-shadow:' + (isUnlocked
            ? '0 0 20px ' + def.color + '20,inset 0 1px 0 rgba(255,255,255,0.3)'
            : 'inset 0 1px 0 rgba(255,255,255,0.3)') + ';';

        sealItem.innerHTML =
          '<div style="font-size:28px;' + (isUnlocked ? '' : 'filter:grayscale(100%) opacity(0.25);') +
          'text-shadow:' + (isUnlocked ? '0 0 15px ' + def.color + '60' : 'none') + ';">' +
          (isUnlocked ? def.icon : '❓') + '</div>' +
          '<div style="font-size:9px;margin-top:3px;letter-spacing:1px;' +
          'color:' + (isUnlocked ? def.color : '#a89880') + ';font-weight:700;' +
          'font-family:Georgia,serif;">' +
          (isUnlocked ? def.name : '???') + '</div>';

        sealItem.addEventListener('mouseenter', function() {
          sealItem.style.transform = 'scale(1.1)';
          if (isUnlocked) {
            sealItem.style.boxShadow = '0 0 25px ' + def.color + '50,inset 0 1px 0 rgba(255,255,255,0.4)';
          }
        });
        sealItem.addEventListener('mouseleave', function() {
          sealItem.style.transform = 'scale(1)';
          sealItem.style.boxShadow = isUnlocked
            ? '0 0 20px ' + def.color + '20,inset 0 1px 0 rgba(255,255,255,0.3)'
            : 'inset 0 1px 0 rgba(255,255,255,0.3)';
        });
        sealItem.addEventListener('click', function() {
          showSealDetail(def, isUnlocked, sealData);
        });

        sealRing.appendChild(sealItem);
      }
      content.appendChild(sealRing);

      // 分割线
      const divider = document.createElement('div');
      divider.style.cssText = 'height:1px;background:linear-gradient(90deg,transparent,rgba(180,150,100,0.4),transparent);margin:6px 0 18px;';
      content.appendChild(divider);

      // 印记列表（详细）
      const listTitle = document.createElement('div');
      listTitle.style.cssText = 'font-size:12px;color:#8a7a6a;letter-spacing:2px;margin-bottom:10px;' +
        'font-family:Georgia,serif;';
      listTitle.textContent = '印记图鉴';
      content.appendChild(listTitle);

      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

      for (let i = 0; i < sealDefs.length; i++) {
        const def = sealDefs[i];
        const isUnlocked = ProgressManager.isSealUnlocked(def.id);
        const sealData = isUnlocked ? ProgressManager._data.seals[def.id] : null;

        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 14px;' +
          'background:' + (isUnlocked
            ? 'linear-gradient(135deg,' + def.color + '15,rgba(255,248,235,0.4))'
            : 'linear-gradient(90deg, rgba(255,255,255,0.25) 0%, rgba(245,235,220,0.2) 100%)') + ';' +
          'border:1px solid ' + (isUnlocked ? def.color + '50' : 'rgba(180,150,100,0.2)') + ';' +
          'border-left:3px solid ' + (isUnlocked ? def.color : 'rgba(180,150,100,0.3)') + ';' +
          'border-radius:0 4px 4px 0;transition:all 0.2s;cursor:pointer;';
        item.innerHTML =
          '<div style="font-size:28px;flex-shrink:0;width:40px;text-align:center;' +
          (isUnlocked ? '' : 'filter:grayscale(100%) opacity(0.25);') + '">' +
          (isUnlocked ? def.icon : '🔒') + '</div>' +
          '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:14px;font-weight:700;color:' +
          (isUnlocked ? def.color : '#a89880') + ';margin-bottom:2px;' +
          'font-family:Georgia,\'Noto Serif SC\',serif;">' +
          (isUnlocked ? def.name : '未知印记') + '</div>' +
          '<div style="font-size:11px;color:' + (isUnlocked ? '#6a5a48' : '#a89880') + ';' +
          'font-family:\'Courier New\',monospace;">' +
          (isUnlocked ? def.desc : '完成对应隐藏关的挑战以解锁') + '</div>' +
          (isUnlocked && sealData && sealData.unlockedAt
            ? '<div style="font-size:10px;color:#8a7a6a;margin-top:3px;' +
              'font-family:\'Courier New\',monospace;">' +
              '获得：' + new Date(sealData.unlockedAt).toLocaleDateString('zh-CN') +
              '</div>'
            : '') +
          '</div>' +
          (isUnlocked
            ? '<div style="color:' + def.color + ';font-size:11px;font-weight:700;' +
              'padding:3px 8px;border:1px solid ' + def.color + '50;border-radius:3px;' +
              'font-family:Georgia,serif;letter-spacing:1px;">✦ 已觉醒</div>'
            : '<div style="color:#a89880;font-size:10px;padding:3px 8px;' +
              'border:1px solid rgba(180,150,100,0.25);border-radius:3px;' +
              'font-family:\'Courier New\',monospace;">未解锁</div>');

        item.addEventListener('mouseenter', function() {
          item.style.transform = 'translateX(3px)';
          if (isUnlocked) {
            item.style.borderColor = def.color + '70';
            item.style.borderLeftColor = def.color;
          }
        });
        item.addEventListener('mouseleave', function() {
          item.style.transform = 'translateX(0)';
          item.style.borderColor = isUnlocked ? def.color + '50' : 'rgba(180,150,100,0.2)';
          item.style.borderLeftColor = isUnlocked ? def.color : 'rgba(180,150,100,0.3)';
        });
        item.addEventListener('click', function() {
          showSealDetail(def, isUnlocked, sealData);
        });

        list.appendChild(item);
      }
      content.appendChild(list);

      // 关闭按钮
      const closeWrap = document.createElement('div');
      closeWrap.style.cssText = 'text-align:center;margin-top:22px;';
      closeWrap.innerHTML =
        '<button id="cs-seal-close" style="padding:8px 32px;' +
        'background:linear-gradient(180deg, #f5ecd8 0%, #e8dcc4 100%);' +
        'border:1px solid #c9a84c;' +
        'color:#8b7355;border-radius:20px;cursor:pointer;font-size:12px;' +
        'letter-spacing:2px;transition:all 0.2s;' +
        'font-family:Georgia,serif;' +
        'box-shadow:0 1px 3px rgba(0,0,0,0.1),inset 0 1px 0 rgba(255,255,255,0.6);">关 闭</button>';
      content.appendChild(closeWrap);

      panel.appendChild(content);
      document.body.appendChild(panel);

      document.getElementById('cs-seal-close').addEventListener('click', function() {
        panel.style.opacity = '0';
        setTimeout(function() { panel.style.display = 'none'; }, 400);
      });

      panel.addEventListener('click', function(e) {
        if (e.target === panel) {
          panel.style.opacity = '0';
          setTimeout(function() { panel.style.display = 'none'; }, 400);
        }
      });

      requestAnimationFrame(function() { panel.style.opacity = '1'; });

      // 印记详情弹窗
      function showSealDetail(def, isUnlocked, sealData) {
        const oldDetail = document.getElementById('cs-seal-detail');
        if (oldDetail) oldDetail.remove();

        const detail = document.createElement('div');
        detail.id = 'cs-seal-detail';
        detail.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
          'z-index:25000;display:flex;align-items:center;justify-content:center;' +
          'background:rgba(26,22,18,0.7);backdrop-filter:blur(4px);' +
          'opacity:0;transition:opacity 0.3s ease;';

        const box = document.createElement('div');
        box.style.cssText = 'width:85%;max-width:360px;' +
          'background:' +
          'radial-gradient(ellipse at 50% 20%, ' + (isUnlocked ? def.color + '15' : 'rgba(180,150,100,0.1)') + ' 0%, transparent 50%),' +
          'linear-gradient(180deg, #f8f1e6 0%, #efe6d8 100%);' +
          'border:2px solid ' + (isUnlocked ? def.color + '80' : 'rgba(180,150,100,0.4)') + ';' +
          'border-radius:6px;padding:28px 24px;text-align:center;' +
          'box-shadow:0 20px 60px rgba(0,0,0,0.4),' +
          (isUnlocked ? '0 0 30px ' + def.color + '20,' : '') +
          'inset 0 1px 0 rgba(255,255,255,0.5);' +
          'transform:scale(0.9);transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1);';

        const iconSize = isUnlocked ? '72px' : '56px';
        const iconFilter = isUnlocked ? '' : 'grayscale(100%) opacity(0.25)';

        box.innerHTML =
          '<div style="font-size:' + iconSize + ';margin-bottom:12px;filter:' + iconFilter + ';' +
          (isUnlocked ? 'text-shadow:0 0 25px ' + def.color + '60;' : '') + '">' +
          (isUnlocked ? def.icon : '🔒') + '</div>' +
          '<div style="font-size:20px;font-weight:900;color:' +
          (isUnlocked ? def.color : '#a89880') + ';letter-spacing:4px;margin-bottom:6px;' +
          'font-family:Georgia,\'Noto Serif SC\',serif;' +
          'text-shadow:0 1px 0 rgba(255,255,255,0.5);">' +
          (isUnlocked ? def.name : '???') + '</div>' +
          '<div style="font-size:10px;color:#8a7a6a;letter-spacing:2px;margin-bottom:14px;' +
          'font-family:\'Courier New\',monospace;">' +
          (isUnlocked ? 'SEAL · ' + def.element.toUpperCase() : 'SEAL · UNKNOWN') + '</div>' +
          '<div style="height:1px;background:linear-gradient(90deg,transparent,' +
          (isUnlocked ? def.color + '60' : 'rgba(180,150,100,0.3)') + ',transparent);margin-bottom:14px;"></div>' +
          '<div style="font-size:12px;color:#6a5a48;line-height:1.8;margin-bottom:6px;' +
          'font-family:Georgia,serif;">' +
          (isUnlocked ? def.detail : '神秘的印记，蕴含着未知的力量。<br>完成对应隐藏关的完美挑战以觉醒此印记。') +
          '</div>' +
          (isUnlocked && sealData && sealData.unlockedAt
            ? '<div style="font-size:10px;color:#8a7a6a;margin-top:14px;padding-top:10px;' +
              'border-top:1px dashed rgba(180,150,100,0.3);' +
              'font-family:\'Courier New\',monospace;">' +
              '觉醒于 ' + new Date(sealData.unlockedAt).toLocaleString('zh-CN') +
              '</div>'
            : '') +
          '<button style="margin-top:18px;padding:7px 24px;' +
          'background:' + (isUnlocked
            ? 'linear-gradient(180deg, ' + def.color + '20 0%, ' + def.color + '10 100%)'
            : 'linear-gradient(180deg, #f5ecd8 0%, #e8dcc4 100%)') + ';' +
          'border:1px solid ' + (isUnlocked ? def.color + '60' : 'rgba(180,150,100,0.3)') + ';' +
          'color:' + (isUnlocked ? def.color : '#8b7355') + ';border-radius:20px;' +
          'cursor:pointer;font-size:11px;letter-spacing:2px;transition:all 0.2s;' +
          'font-family:Georgia,serif;' +
          'box-shadow:0 1px 3px rgba(0,0,0,0.08),inset 0 1px 0 rgba(255,255,255,0.5);">知 道 了</button>';

        detail.appendChild(box);
        document.body.appendChild(detail);

        const closeBtn = box.querySelector('button');
        function closeDetail() {
          detail.style.opacity = '0';
          box.style.transform = 'scale(0.9)';
          setTimeout(function() { detail.remove(); }, 300);
        }
        closeBtn.addEventListener('click', closeDetail);
        detail.addEventListener('click', function(e) {
          if (e.target === detail) closeDetail();
        });

        requestAnimationFrame(function() {
          detail.style.opacity = '1';
          box.style.transform = 'scale(1)';
        });
      }
    }

    _gradeColor(grade) {
      const colors = {
        S: '#b8860b',
        A: '#15803d',
        B: '#1d4ed8',
        C: '#7c3aed',
        D: '#b91c1c',
      };
      return colors[grade] || '#8a7a6a';
    }

    _cnNum(n) {
      const map = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
      if (n <= 10) return map[n];
      if (n < 20) return '十' + map[n - 10];
      return String(n);
    }
  }

  // 暴露
  global.ChapterSelect = ChapterSelect;
  global.ProgressManager = ProgressManager;

})(window);
