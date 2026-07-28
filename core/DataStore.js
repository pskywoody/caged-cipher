/**
 * ============================================================
 *  DataStore - 统一数据 Schema + 全局版本管理
 * ============================================================
 *
 *  将分散的 localStorage key 整合为结构化的统一存储，
 *  提供全局版本管理、数据迁移、备份恢复、导入导出能力。
 *
 *  设计原则：
 *    - 向后兼容是第一优先级：现有模块存储方式不变
 *    - DataStore 是"统一入口"而非"强制替换"
 *    - 数据迁移是可选的、渐进的
 *    - 新模块使用 DataStore，旧模块逐步迁移
 *
 *  统一存储结构：
 *    {
 *      schemaVersion: 1,
 *      progress: { ... },        // 玩家进度
 *      settings: { ... },        // 玩家设置
 *      achievements: { ... },    // 成就与收集
 *      learning: { ... },        // 学习数据
 *      audio: { ... },           // 音频设置
 *      story: { ... },           // 剧情相关
 *      battle: { ... },          // 战斗/对战数据
 *      ui: { ... },              // UI 状态
 *      errorLogs: [ ... ],       // 错误日志
 *      // 预留扩展空间
 *    }
 *
 *  用法：
 *    DataStore.init();
 *    DataStore.get('settings.vibration');
 *    DataStore.set('settings.bgmVolume', 0.5);
 *    DataStore.save();
 *    DataStore.exportData();
 *    DataStore.importData(data);
 *    DataStore.migrateLegacyData(); // 一次性迁移所有旧数据
 *
 * ============================================================
 */

;(function(global) {
  'use strict';

  // ============================================================
  //  常量定义
  // ============================================================

  const STORAGE_KEY = 'cagedcipher_datastore';
  const BACKUP_KEY_PREFIX = 'cagedcipher_datastore_backup_';
  const BACKUP_COUNT = 3;

  // 全局 Schema 版本号
  const SCHEMA_VERSION = 1;

  // 旧 localStorage key 映射（用于迁移）
  const LEGACY_KEYS = {
    PROGRESS: 'cagedcipher_progress',
    PROGRESS_BACKUP_PREFIX: 'cagedcipher_progress_backup_',
    ERROR_LOGS: 'caged_cipher_error_logs',
    GAME_SETTINGS: 'game_settings',
    AUDIO_VOLUME: 'audio_volume_settings',
    STORY_SKIP: 'cagedcipher_story_skip',
    STORY_READ: 'cagedcipher_story_read',
    STORY_HISTORY: 'cagedcipher_story_history',
    TEACHING_PROGRESS: 'cagemaster3_teaching_progress',
    LEARNING: 'cagemaster3_learning',
    BATTLE_STATS: 'cagemaster_battle_stats',
    BOSS_DIFFICULTY: 'boss_difficulty',
    THREE_ACT_SHOWN: 'cagedcipher_threeact_shown',
    COMEDY_ACHIEVEMENTS: 'cagemaster_comedy_achievements',
    ACHIEVEMENT_TIMES: 'cagedcipher_progress_times',
  };

  // ============================================================
  //  默认数据结构
  // ============================================================

  function _defaultData() {
    return {
      schemaVersion: SCHEMA_VERSION,

      // 玩家进度（来自 chapter-select.js ProgressManager）
      progress: {
        version: 5,
        currentCycle: 1,
        unlockedChapters: [1],
        levelScores: {},
        lastPlayedLevel: null,
        unlockedHiddenLevels: [],
        achievements: [],
        achievementTimes: {},
        totalHints: 0,
        trueEndingUnlocked: false,
        trueEndingCleared: false,
        totalPlayTime: 0,
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
        noHintStreak: 0,
        chapterNoHintMap: {},
        seals: {},
      },

      // 玩家设置（来自 settings-panel.js）
      settings: {
        volume: {
          master: 70,
          sfx: 60,
          voice: 85,
          bgm: 40,
        },
        game: {
          conflictRed: true,
          instantErrorCheck: true,
          autoClearCandidates: false,
          autoFillCandidates: false,
          vibration: true,
          keepWrongNumber: false,
        },
        display: {
          showCageSum: true,
          highlightSameNumber: true,
          showCandidates: true,
          quality: 'auto',
        },
        difficulty: 'normal',
      },

      // 成就与收集
      achievements: {
        unlocked: {},          // { achievementId: { unlockedAt, ... } }
        seals: {},             // { sealId: { unlockedAt, ... } }
        gallery: {
          characters: {},      // 角色图鉴解锁状态
          backgrounds: {},     // 背景图鉴解锁状态
        },
      },

      // 学习数据（来自 learning-system.js）
      learning: {
        version: 1,
        style: 'balanced',
        styleConfidence: 0.5,
        totalFills: 0,
        correctFills: 0,
        hintsUsed: 0,
        resets: 0,
        techniques: {},        // 技巧掌握度
        mastery: {},           // 技巧掌握度（详细）
        totalPlayTime: 0,
        totalLevelsPlayed: 0,
      },

      // 音频设置（来自 audio-service.js，与 settings.volume 冗余但保留独立路径）
      audio: {
        master: 0.7,
        sfx: 0.6,
        voice: 0.85,
        bgm: 0.4,
      },

      // 剧情相关（来自 story-engine.js）
      story: {
        readHistory: {},       // 已读剧情记录
        skipPreferences: {},   // 跳过偏好设置
        history: {},           // 剧情历史
      },

      // 战斗/对战数据（来自 guide-battle.js）
      battle: {
        version: 1,
        bosses: {},            // { bossId: { wins, losses, draws, ... } }
        total: {
          battles: 0,
          wins: 0,
          losses: 0,
          bestCombo: 0,
        },
        recent: [],            // 最近战斗记录
        bossDifficulty: 'normal',
      },

      // UI 状态（持久化的 UI 偏好）
      ui: {
        threeActShown: {},     // { levelId: { act1: true, ... } }
        comedyAchievements: {}, // 喜剧成就
      },

      // 错误日志
      errorLogs: [],

      // 元数据
      _meta: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        migratedFrom: null,    // 迁移来源版本
        legacyKeysCleared: false, // 是否已清除旧 key
      },
    };
  }

  // ============================================================
  //  内部状态
  // ============================================================

  let _data = null;
  let _initialized = false;
  let _saveTimeout = null;
  let _savePending = false;

  // ============================================================
  //  工具函数
  // ============================================================

  /**
   * 深拷贝（简单实现，避免循环引用）
   */
  function _deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(_deepClone);
    const result = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = _deepClone(obj[key]);
      }
    }
    return result;
  }

  /**
   * 深度合并（target 被 source 覆盖）
   */
  function _deepMerge(target, source) {
    if (source === null || typeof source !== 'object') return source;
    if (target === null || typeof target !== 'object') return _deepClone(source);
    if (Array.isArray(source)) {
      return Array.isArray(target)
        ? source // 数组直接替换，不做数组合并
        : _deepClone(source);
    }
    const result = {};
    // 先复制 target 的所有键
    for (const key in target) {
      if (target.hasOwnProperty(key)) {
        result[key] = _deepClone(target[key]);
      }
    }
    // 用 source 覆盖/补充
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])
            && target[key] !== null && typeof target[key] === 'object' && !Array.isArray(target[key])) {
          result[key] = _deepMerge(target[key], source[key]);
        } else {
          result[key] = _deepClone(source[key]);
        }
      }
    }
    return result;
  }

  /**
   * 按路径获取值，如 'settings.bgmVolume'
   */
  function _getByPath(obj, path) {
    if (!path || !obj) return undefined;
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length; i++) {
      if (current === null || current === undefined) return undefined;
      current = current[parts[i]];
    }
    return current;
  }

  /**
   * 按路径设置值，如 'settings.bgmVolume'
   * 自动创建中间不存在的对象
   */
  function _setByPath(obj, path, value) {
    if (!path || !obj) return false;
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (current[key] === null || current[key] === undefined
          || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    current[parts[parts.length - 1]] = value;
    return true;
  }

  /**
   * 安全解析 JSON
   */
  function _safeParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback !== undefined ? fallback : null;
    }
  }

  /**
   * 安全读取 localStorage
   */
  function _safeGetItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  /**
   * 安全写入 localStorage
   */
  function _safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.warn('[DataStore] Storage quota exceeded for key:', key);
      } else {
        console.warn('[DataStore] Failed to save key:', key, e);
      }
      return false;
    }
  }

  /**
   * 安全删除 localStorage key
   */
  function _safeRemoveItem(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  }

  // ============================================================
  //  数据校验（简单完整性检查）
  // ============================================================

  function _validateData(data) {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.schemaVersion !== 'number') return false;
    // 至少包含顶层分类
    const requiredKeys = ['progress', 'settings', 'achievements', 'learning', 'errorLogs'];
    for (let i = 0; i < requiredKeys.length; i++) {
      if (!(requiredKeys[i] in data)) return false;
    }
    return true;
  }

  // ============================================================
  //  备份管理
  // ============================================================

  /**
   * 轮转备份：backup_2 -> backup_3, backup_1 -> backup_2, 当前 -> backup_1
   */
  function _rotateBackups() {
    try {
      // 从旧到新依次后移
      for (let i = BACKUP_COUNT; i >= 1; i--) {
        const sourceKey = i === 1 ? STORAGE_KEY : (BACKUP_KEY_PREFIX + (i - 1));
        const targetKey = BACKUP_KEY_PREFIX + i;

        if (i === BACKUP_COUNT) {
          // 最旧的备份直接丢弃
          _safeRemoveItem(targetKey);
        }

        const sourceVal = _safeGetItem(sourceKey);
        if (sourceVal) {
          _safeSetItem(targetKey, sourceVal);
        }
      }
    } catch (e) {
      console.warn('[DataStore] Backup rotate error:', e);
    }
  }

  /**
   * 从备份中加载数据
   * @returns {Object|null} 成功返回数据，失败返回 null
   */
  function _loadFromBackup() {
    try {
      for (let i = 1; i <= BACKUP_COUNT; i++) {
        const key = BACKUP_KEY_PREFIX + i;
        const raw = _safeGetItem(key);
        if (!raw) continue;

        const parsed = _safeParse(raw, null);
        if (parsed && _validateData(parsed)) {
          console.log('[DataStore] Restored from backup_' + i);
          return parsed;
        }
        console.warn('[DataStore] Backup_' + i + ' corrupted or invalid');
      }
    } catch (e) {
      console.warn('[DataStore] Load from backup error:', e);
    }
    return null;
  }

  // ============================================================
  //  迁移系统
  // ============================================================

  /**
   * 迁移函数链
   * 每个函数接收旧版本数据，返回迁移后的新版本数据
   */
  const _migrations = {
    // v0 -> v1: 初始版本，建立 schema
    v0_to_v1: function(data) {
      // 确保基础结构完整
      const defaults = _defaultData();
      defaults.schemaVersion = 1;
      return _deepMerge(defaults, data || {});
    },
    // 未来版本迁移在此添加：
    // v1_to_v2: function(data) { ... },
    // v2_to_v3: function(data) { ... },
  };

  /**
   * 执行版本迁移链
   * @param {Object} data - 当前数据
   * @returns {Object} 迁移后的数据
   */
  function _runMigrations(data) {
    let currentVersion = data && typeof data.schemaVersion === 'number'
      ? data.schemaVersion
      : 0;

    if (currentVersion >= SCHEMA_VERSION) {
      return data;
    }

    let migrated = _deepClone(data || {});
    let migratedAny = false;

    // 按版本顺序依次迁移
    while (currentVersion < SCHEMA_VERSION) {
      const nextVersion = currentVersion + 1;
      const fnName = 'v' + currentVersion + '_to_v' + nextVersion;
      const fn = _migrations[fnName];
      if (typeof fn === 'function') {
        try {
          migrated = fn(migrated);
          migrated.schemaVersion = nextVersion;
          migratedAny = true;
          console.log('[DataStore] Migrated v' + currentVersion + ' -> v' + nextVersion);
        } catch (e) {
          console.error('[DataStore] Migration failed at v' + currentVersion + ' -> v' + nextVersion, e);
          // 迁移失败，备份原始数据并中断
          _backupFailedMigration(data, currentVersion);
          return data; // 返回原始数据
        }
      } else {
        console.warn('[DataStore] No migration function for v' + currentVersion + ' -> v' + nextVersion);
        // 没有迁移函数，直接跳到目标版本（设置版本号）
        migrated.schemaVersion = nextVersion;
      }
      currentVersion = nextVersion;
    }

    if (migratedAny && migrated._meta) {
      migrated._meta.migratedFrom = data && data.schemaVersion ? data.schemaVersion : 0;
    }

    return migrated;
  }

  /**
   * 备份迁移失败的原始数据
   */
  function _backupFailedMigration(data, fromVersion) {
    try {
      const backupKey = 'cagedcipher_datastore_migration_backup_v' + fromVersion;
      _safeSetItem(backupKey, JSON.stringify(data));
      console.warn('[DataStore] Failed migration data backed up to:', backupKey);
    } catch (e) {
      // ignore
    }
  }

  // ============================================================
  //  旧数据迁移（从各个独立 localStorage key 整合）
  // ============================================================

  /**
   * 从所有旧的 localStorage key 中读取数据并整合到统一结构
   * 这是一次性迁移，迁移后旧 key 不删除（保持向后兼容）
   */
  function _migrateFromLegacyKeys(targetData) {
    const data = targetData || _defaultData();
    let migratedAnything = false;

    // 1. 进度数据（cagedcipher_progress）
    try {
      const raw = _safeGetItem(LEGACY_KEYS.PROGRESS);
      if (raw) {
        let progressData = _safeParse(raw, null);
        if (progressData) {
          // 兼容包装格式 { version, data, checksum }
          if (progressData.data && typeof progressData.data === 'object'
              && 'version' in progressData && 'checksum' in progressData) {
            progressData = progressData.data;
          }
          // 合并到 progress 分类
          if (progressData && typeof progressData === 'object') {
            data.progress = _deepMerge(data.progress, progressData);
            migratedAnything = true;
            console.log('[DataStore] Migrated legacy progress data');
          }
        }
      }
    } catch (e) {
      console.warn('[DataStore] Legacy progress migration failed:', e);
    }

    // 2. 错误日志（caged_cipher_error_logs）
    try {
      const raw = _safeGetItem(LEGACY_KEYS.ERROR_LOGS);
      if (raw) {
        const logs = _safeParse(raw, []);
        if (Array.isArray(logs) && logs.length > 0) {
          data.errorLogs = logs;
          migratedAnything = true;
          console.log('[DataStore] Migrated legacy error logs:', logs.length, 'entries');
        }
      }
    } catch (e) {
      console.warn('[DataStore] Legacy error logs migration failed:', e);
    }

    // 3. 设置（game_settings）
    try {
      const raw = _safeGetItem(LEGACY_KEYS.GAME_SETTINGS);
      if (raw) {
        const settings = _safeParse(raw, null);
        if (settings && typeof settings === 'object') {
          // 可能是 { version, settings } 格式或直接是设置对象
          const settingsData = settings.settings || settings;
          if (settingsData && typeof settingsData === 'object') {
            data.settings = _deepMerge(data.settings, settingsData);
            migratedAnything = true;
            console.log('[DataStore] Migrated legacy game settings');
          }
        }
      }
    } catch (e) {
      console.warn('[DataStore] Legacy settings migration failed:', e);
    }

    // 4. 音频音量（audio_volume_settings）
    try {
      const raw = _safeGetItem(LEGACY_KEYS.AUDIO_VOLUME);
      if (raw) {
        const volumes = _safeParse(raw, null);
        if (volumes && typeof volumes === 'object') {
          data.audio = _deepMerge(data.audio, volumes);
          // 同步到 settings.volume（百分比换算）
          if (data.settings && data.settings.volume) {
            for (const key in volumes) {
              if (typeof volumes[key] === 'number') {
                // audio 用 0-1，settings.volume 用 0-100
                if (volumes[key] <= 1) {
                  data.settings.volume[key] = Math.round(volumes[key] * 100);
                } else {
                  data.settings.volume[key] = volumes[key];
                }
              }
            }
          }
          migratedAnything = true;
          console.log('[DataStore] Migrated legacy audio volumes');
        }
      }
    } catch (e) {
      console.warn('[DataStore] Legacy audio migration failed:', e);
    }

    // 5. 剧情已读（cagedcipher_story_read）
    try {
      const raw = _safeGetItem(LEGACY_KEYS.STORY_READ);
      if (raw) {
        const readHistory = _safeParse(raw, null);
        if (readHistory && typeof readHistory === 'object') {
          data.story.readHistory = readHistory;
          migratedAnything = true;
          console.log('[DataStore] Migrated legacy story read history');
        }
      }
    } catch (e) { /* ignore */ }

    // 6. 剧情跳过偏好（cagedcipher_story_skip）
    try {
      const raw = _safeGetItem(LEGACY_KEYS.STORY_SKIP);
      if (raw) {
        const skipPrefs = _safeParse(raw, null);
        if (skipPrefs && typeof skipPrefs === 'object') {
          data.story.skipPreferences = skipPrefs;
          migratedAnything = true;
          console.log('[DataStore] Migrated legacy story skip preferences');
        }
      }
    } catch (e) { /* ignore */ }

    // 7. 学习数据（cagemaster3_learning）
    try {
      const raw = _safeGetItem(LEGACY_KEYS.LEARNING);
      if (raw) {
        const learning = _safeParse(raw, null);
        if (learning && typeof learning === 'object') {
          data.learning = _deepMerge(data.learning, learning);
          if (learning.style && learning.style.value) {
            data.learning.style = learning.style.value;
            data.learning.styleConfidence = learning.style.confidence || 0.5;
          }
          migratedAnything = true;
          console.log('[DataStore] Migrated legacy learning data');
        }
      }
    } catch (e) { /* ignore */ }

    // 8. 战斗统计（cagemaster_battle_stats）
    try {
      const raw = _safeGetItem(LEGACY_KEYS.BATTLE_STATS);
      if (raw) {
        const battle = _safeParse(raw, null);
        if (battle && typeof battle === 'object') {
          data.battle = _deepMerge(data.battle, battle);
          migratedAnything = true;
          console.log('[DataStore] Migrated legacy battle stats');
        }
      }
    } catch (e) { /* ignore */ }

    // 9. Boss 难度（boss_difficulty）
    try {
      const diff = _safeGetItem(LEGACY_KEYS.BOSS_DIFFICULTY);
      if (diff) {
        data.battle.bossDifficulty = diff;
        migratedAnything = true;
        console.log('[DataStore] Migrated legacy boss difficulty:', diff);
      }
    } catch (e) { /* ignore */ }

    // 10. 三幕结构显示状态
    try {
      const raw = _safeGetItem(LEGACY_KEYS.THREE_ACT_SHOWN);
      if (raw) {
        const shown = _safeParse(raw, null);
        if (shown && typeof shown === 'object') {
          data.ui.threeActShown = shown;
          migratedAnything = true;
          console.log('[DataStore] Migrated legacy three-act shown map');
        }
      }
    } catch (e) { /* ignore */ }

    // 11. 喜剧成就
    try {
      const raw = _safeGetItem(LEGACY_KEYS.COMEDY_ACHIEVEMENTS);
      if (raw) {
        const comedy = _safeParse(raw, null);
        if (comedy && typeof comedy === 'object') {
          data.ui.comedyAchievements = comedy;
          migratedAnything = true;
          console.log('[DataStore] Migrated legacy comedy achievements');
        }
      }
    } catch (e) { /* ignore */ }

    if (migratedAnything) {
      data._meta.migratedFrom = 'legacy';
      data._meta.updatedAt = Date.now();
    }

    return data;
  }

  // ============================================================
  //  加载与保存
  // ============================================================

  function _load() {
    // 1. 尝试读取主存储
    const raw = _safeGetItem(STORAGE_KEY);
    if (raw) {
      const parsed = _safeParse(raw, null);
      if (parsed && _validateData(parsed)) {
        // 数据有效，执行版本迁移
        const migrated = _runMigrations(parsed);
        if (migrated && migrated.schemaVersion !== parsed.schemaVersion) {
          // 版本变了，立即保存迁移后的数据
          _data = migrated;
          _saveImmediate();
        } else {
          _data = migrated;
        }
        return true;
      }
      // 主存档损坏，尝试从备份恢复
      console.warn('[DataStore] Main data corrupted, trying backups...');
      const backup = _loadFromBackup();
      if (backup) {
        _data = _runMigrations(backup);
        _saveImmediate(); // 恢复后立即保存
        return true;
      }
    }

    // 2. 没有统一存储，尝试从旧 key 迁移
    console.log('[DataStore] No unified storage found, migrating from legacy keys...');
    const migratedData = _migrateFromLegacyKeys(null);
    if (migratedData && migratedData._meta && migratedData._meta.migratedFrom === 'legacy') {
      _data = migratedData;
      _saveImmediate();
      return true;
    }

    // 3. 全部失败，使用默认数据
    _data = _defaultData();
    return true;
  }

  function _saveImmediate() {
    if (!_data) return false;

    try {
      // 更新时间戳
      if (_data._meta) {
        _data._meta.updatedAt = Date.now();
      }

      // 轮转备份
      _rotateBackups();

      // 写入主存储
      const jsonStr = JSON.stringify(_data);
      const success = _safeSetItem(STORAGE_KEY, jsonStr);

      if (success) {
        return true;
      }

      // 保存失败，尝试清理非关键数据后重试
      console.warn('[DataStore] Save failed, trying cleanup...');
      const cleaned = _cleanupNonCriticalData();
      if (cleaned) {
        const jsonStr2 = JSON.stringify(_data);
        return _safeSetItem(STORAGE_KEY, jsonStr2);
      }

      return false;
    } catch (e) {
      console.warn('[DataStore] Save error:', e);
      return false;
    }
  }

  /**
   * 防抖保存：频繁写入时合并为一次
   */
  function _saveDebounced(delay) {
    if (_saveTimeout) {
      clearTimeout(_saveTimeout);
    }
    _savePending = true;
    _saveTimeout = setTimeout(function() {
      _saveTimeout = null;
      _savePending = false;
      _saveImmediate();
    }, delay || 300);
  }

  /**
   * 清理非关键数据以释放存储空间
   */
  function _cleanupNonCriticalData() {
    let cleaned = false;

    // 清理错误日志（保留最近 5 条）
    if (_data.errorLogs && _data.errorLogs.length > 5) {
      _data.errorLogs = _data.errorLogs.slice(-5);
      cleaned = true;
    }

    // 清理战斗记录（保留最近 5 条）
    if (_data.battle && _data.battle.recent && _data.battle.recent.length > 5) {
      _data.battle.recent = _data.battle.recent.slice(0, 5);
      cleaned = true;
    }

    // 清理学习数据中的详细技术统计
    if (_data.learning && _data.learning.techniques) {
      // 保留键但删除过细的数据
      // （这里不做激进清理，只清理确定可恢复的数据）
    }

    return cleaned;
  }

  // ============================================================
  //  公共 API
  // ============================================================

  const DataStore = {
    /**
     * 全局 Schema 版本号（只读）
     */
    SCHEMA_VERSION: SCHEMA_VERSION,

    /**
     * 存储 key 常量
     */
    STORAGE_KEY: STORAGE_KEY,
    LEGACY_KEYS: LEGACY_KEYS,

    /**
     * 初始化：读取数据 + 执行迁移
     * @returns {boolean} 是否成功初始化
     */
    init: function() {
      if (_initialized) return true;

      try {
        const success = _load();
        if (success) {
          _initialized = true;
          console.log('[DataStore] Initialized (v' + _data.schemaVersion + ')');
          return true;
        }
      } catch (e) {
        console.error('[DataStore] Init failed:', e);
        // 终极兜底：使用默认数据
        _data = _defaultData();
        _initialized = true;
      }

      return _initialized;
    },

    /**
     * 是否已初始化
     */
    isInitialized: function() {
      return _initialized;
    },

    /**
     * 按路径读取数据
     * @param {string} path - 如 'settings.bgmVolume'，不传则返回全部数据的深拷贝
     * @param {*} [defaultValue] - 路径不存在时的默认值
     * @returns {*}
     */
    get: function(path, defaultValue) {
      if (!_initialized) {
        console.warn('[DataStore] Not initialized, call init() first');
        return defaultValue !== undefined ? defaultValue : undefined;
      }

      if (!path) {
        return _deepClone(_data);
      }

      const value = _getByPath(_data, path);
      if (value === undefined) {
        return defaultValue !== undefined ? defaultValue : undefined;
      }
      // 深拷贝对象和数组，避免外部修改内部状态
      if (value !== null && typeof value === 'object') {
        return _deepClone(value);
      }
      return value;
    },

    /**
     * 按路径写入数据
     * @param {string} path - 如 'settings.bgmVolume'
     * @param {*} value - 要写入的值
     * @param {Object} [options] - 选项
     * @param {boolean} [options.immediate=false] - 是否立即保存（默认防抖）
     * @param {number} [options.delay=300] - 防抖延迟（毫秒）
     * @returns {boolean}
     */
    set: function(path, value, options) {
      if (!_initialized) {
        console.warn('[DataStore] Not initialized, call init() first');
        return false;
      }

      if (!path || typeof path !== 'string') {
        console.warn('[DataStore] Invalid path:', path);
        return false;
      }

      // 深拷贝 value，避免外部引用
      const clonedValue = (value !== null && typeof value === 'object')
        ? _deepClone(value)
        : value;

      const success = _setByPath(_data, path, clonedValue);
      if (!success) return false;

      // 更新时间戳
      if (_data._meta) {
        _data._meta.updatedAt = Date.now();
      }

      // 保存
      options = options || {};
      if (options.immediate) {
        return _saveImmediate();
      } else {
        _saveDebounced(options.delay);
        return true; // 异步保存，返回 true
      }
    },

    /**
     * 批量更新多个路径
     * @param {Object} updates - { path: value } 键值对
     * @param {Object} [options] - 同 set 的 options
     * @returns {boolean}
     */
    update: function(updates, options) {
      if (!_initialized || !updates || typeof updates !== 'object') return false;

      let anySet = false;
      for (const path in updates) {
        if (updates.hasOwnProperty(path)) {
          const clonedValue = (updates[path] !== null && typeof updates[path] === 'object')
            ? _deepClone(updates[path])
            : updates[path];
          if (_setByPath(_data, path, clonedValue)) {
            anySet = true;
          }
        }
      }

      if (!anySet) return false;

      if (_data._meta) {
        _data._meta.updatedAt = Date.now();
      }

      options = options || {};
      if (options.immediate) {
        return _saveImmediate();
      } else {
        _saveDebounced(options.delay);
        return true;
      }
    },

    /**
     * 立即保存到 localStorage
     * @returns {boolean}
     */
    save: function() {
      if (!_initialized) return false;
      // 清除待处理的防抖
      if (_saveTimeout) {
        clearTimeout(_saveTimeout);
        _saveTimeout = null;
        _savePending = false;
      }
      return _saveImmediate();
    },

    /**
     * 手动触发数据迁移
     * 执行从旧 key 到统一存储的迁移
     * @param {Object} [options]
     * @param {boolean} [options.clearLegacy=false] - 迁移后是否清除旧 key
     * @returns {boolean}
     */
    migrateLegacyData: function(options) {
      if (!_initialized) {
        this.init();
      }

      try {
        const migrated = _migrateFromLegacyKeys(_data);
        if (migrated) {
          _data = migrated;
          _saveImmediate();

          if (options && options.clearLegacy) {
            this.clearLegacyKeys();
          }

          console.log('[DataStore] Legacy migration completed');
          return true;
        }
      } catch (e) {
        console.error('[DataStore] Legacy migration failed:', e);
      }

      return false;
    },

    /**
     * 清除所有旧的 localStorage key
     * 谨慎使用！只有确认所有模块都迁移后才调用
     */
    clearLegacyKeys: function() {
      let cleared = 0;
      for (const name in LEGACY_KEYS) {
        if (LEGACY_KEYS.hasOwnProperty(name)) {
          const key = LEGACY_KEYS[name];
          if (_safeRemoveItem(key)) {
            cleared++;
          }
        }
      }
      // 同时清除旧的进度备份
      for (let i = 1; i <= BACKUP_COUNT; i++) {
        _safeRemoveItem('cagedcipher_progress_backup_' + i);
      }
      if (_data && _data._meta) {
        _data._meta.legacyKeysCleared = true;
      }
      console.log('[DataStore] Cleared', cleared, 'legacy keys');
      return cleared;
    },

    /**
     * 重置所有数据为默认值
     * @param {boolean} [keepBackup=true] - 是否保留备份
     */
    reset: function(keepBackup) {
      if (keepBackup === undefined) keepBackup = true;

      if (!keepBackup) {
        // 清除所有备份
        for (let i = 1; i <= BACKUP_COUNT; i++) {
          _safeRemoveItem(BACKUP_KEY_PREFIX + i);
        }
      }

      _data = _defaultData();
      _saveImmediate();
      console.log('[DataStore] Data reset to defaults');
    },

    /**
     * 导出所有数据
     * @returns {Object} 完整数据的深拷贝
     */
    exportData: function() {
      if (!_initialized) {
        return _deepClone(_defaultData());
      }
      return _deepClone(_data);
    },

    /**
     * 导出为 JSON 字符串
     * @returns {string}
     */
    exportJSON: function() {
      if (!_initialized) {
        return JSON.stringify(_defaultData());
      }
      return JSON.stringify(_data, null, 2);
    },

    /**
     * 导入数据
     * @param {Object|string} data - 数据对象或 JSON 字符串
     * @param {Object} [options]
     * @param {boolean} [options.merge=false] - 是否合并到现有数据（否则替换）
     * @param {boolean} [options.validate=true] - 是否验证导入数据
     * @returns {boolean}
     */
    importData: function(data, options) {
      options = options || {};
      const validate = options.validate !== false;

      // 解析 JSON 字符串
      let imported = data;
      if (typeof data === 'string') {
        imported = _safeParse(data, null);
        if (!imported) {
          console.error('[DataStore] Import failed: invalid JSON');
          return false;
        }
      }

      // 验证
      if (validate && !_validateData(imported)) {
        console.error('[DataStore] Import failed: invalid data structure');
        return false;
      }

      try {
        // 先备份当前数据
        _rotateBackups();

        if (options.merge) {
          // 合并模式
          _data = _deepMerge(_data || _defaultData(), imported);
        } else {
          // 替换模式
          _data = _deepClone(imported);
        }

        // 执行版本迁移
        _data = _runMigrations(_data);

        _saveImmediate();
        console.log('[DataStore] Data imported successfully');
        return true;
      } catch (e) {
        console.error('[DataStore] Import failed:', e);
        return false;
      }
    },

    /**
     * 获取当前 schema 版本
     * @returns {number}
     */
    getSchemaVersion: function() {
      if (!_initialized || !_data) return 0;
      return _data.schemaVersion;
    },

    /**
     * 获取数据大小（字节）
     * @returns {number}
     */
    getDataSize: function() {
      if (!_initialized || !_data) return 0;
      try {
        return JSON.stringify(_data).length;
      } catch (e) {
        return 0;
      }
    },

    /**
     * 强制从备份恢复
     * @param {number} [backupIndex=1] - 备份编号（1-3）
     * @returns {boolean}
     */
    restoreFromBackup: function(backupIndex) {
      const idx = backupIndex || 1;
      const key = BACKUP_KEY_PREFIX + idx;
      const raw = _safeGetItem(key);
      if (!raw) {
        console.warn('[DataStore] No backup found at index', idx);
        return false;
      }

      const parsed = _safeParse(raw, null);
      if (!parsed || !_validateData(parsed)) {
        console.warn('[DataStore] Backup', idx, 'is corrupted');
        return false;
      }

      // 先备份当前数据
      _rotateBackups();

      _data = _runMigrations(parsed);
      _saveImmediate();
      console.log('[DataStore] Restored from backup', idx);
      return true;
    },

    /**
     * 检查是否有待保存的更改
     * @returns {boolean}
     */
    hasPendingSave: function() {
      return _savePending;
    },

    /**
     * 刷新数据（从 localStorage 重新读取）
     * 一般不需要调用，除非知道外部修改了存储
     * @returns {boolean}
     */
    refresh: function() {
      // 等待未完成的保存
      if (_saveTimeout) {
        clearTimeout(_saveTimeout);
        _saveTimeout = null;
        _savePending = false;
      }
      return _load();
    },
  };

  // ============================================================
  //  导出到全局
  // ============================================================

  global.DataStore = DataStore;

  // 自动初始化（如果在浏览器环境中）
  if (typeof document !== 'undefined' && typeof localStorage !== 'undefined') {
    // 延迟到 DOMContentLoaded 之后，确保错误捕获系统先加载
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        // 稍微延迟，让其他核心模块先初始化
        setTimeout(function() {
          DataStore.init();
        }, 0);
      });
    } else {
      // DOM 已就绪
      setTimeout(function() {
        DataStore.init();
      }, 0);
    }
  }

})(window);
