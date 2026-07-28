// LevelLoader.js - 关卡数据加载模块
// 从 guide.js 抽离，负责所有关卡/章节数据的加载和缓存

const LevelLoader = (function() {
  'use strict';

  const log = new Logger('LevelLoader');

  // === chapters.json 缓存 ===
  let _cachedChapterData = null;
  let _chapterDataPromise = null;
  let _chapterIndex = null; // 章节索引
  let _loadedChapters = {}; // 已加载的章节缓存 {chapterId: chapterData}

  function getChapterData() {
    if (_cachedChapterData) {
      return Promise.resolve(_cachedChapterData);
    }
    if (_chapterDataPromise) {
      return _chapterDataPromise;
    }
    // 优先尝试加载章节索引（拆分模式）
    _chapterDataPromise = _loadChapterIndex()
      .then(index => {
        if (index) {
          // 拆分模式：返回延迟加载的包装对象
          _chapterIndex = index;
          const wrapper = {
            chapters: [],
            _lazy: true,
            _index: index
          };
          // 提供 getChapter 方法
          wrapper.getChapter = function(chapterId) {
            return _loadChapter(chapterId);
          };
          // 获取所有章节（按需加载）
          wrapper.getAllChapters = function() {
            return _loadAllChapters();
          };
          _cachedChapterData = wrapper;
          _chapterDataPromise = null;
          return wrapper;
        } else {
          // 回退到旧格式
          return _loadLegacyChapters();
        }
      })
      .catch(err => {
        console.warn('[Guide] 章节索引加载失败，回退到旧格式:', err);
        return _loadLegacyChapters();
      });
    return _chapterDataPromise;
  }

  // 加载章节索引
  function _loadChapterIndex() {
    return fetch('data/chapters/chapters-index.json')
      .then(res => {
        if (!res.ok) return null;
        return res.json();
      })
      .catch(() => null);
  }

  // 加载单个章节
  function _loadChapter(chapterId) {
    if (_loadedChapters[chapterId]) {
      return Promise.resolve(_loadedChapters[chapterId]);
    }
    // 从索引中查找文件名
    const info = _chapterIndex?.chapters?.find(c => c.chapterId === chapterId);
    if (!info) {
      return Promise.reject(new Error('章节不存在: ' + chapterId));
    }
    return fetch('data/chapters/' + info.file)
      .then(res => res.json())
      .then(data => {
        _loadedChapters[chapterId] = data;
        return data;
      });
  }

  // 加载所有章节（用于需要遍历所有章节的场景）
  function _loadAllChapters() {
    if (!_chapterIndex || !_chapterIndex.chapters) {
      return Promise.resolve([]);
    }
    const promises = _chapterIndex.chapters.map(ch => _loadChapter(ch.chapterId));
    return Promise.all(promises);
  }

  // 旧格式加载（向后兼容）
  function _loadLegacyChapters() {
    return fetch('data/chapters.json')
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
  }

  // === 优化版关卡数据（v2）===
  // 开关：是否使用优化后的关卡数据（可手动切换）
  const USE_OPTIMIZED_LEVELS = true;

  // v2 关卡数据缓存（按 levelId 索引）
  let _v2LevelsCache = null;
  let _v2LevelsPromise = null;
  let _v2LevelsAvailable = false;

  /**
   * 加载优化版关卡数据（all_levels_v2.json）
   * 带缓存，只加载一次
   * @returns {Promise<Map<number, Object>|null>} levelId -> levelData 映射，失败返回 null
   */
  function _loadV2Levels() {
    if (!USE_OPTIMIZED_LEVELS) {
      return Promise.resolve(null);
    }
    if (_v2LevelsCache) {
      return Promise.resolve(_v2LevelsCache);
    }
    if (_v2LevelsPromise) {
      return _v2LevelsPromise;
    }
    _v2LevelsPromise = fetch('data/all_levels_v2.json')
      .then(res => {
        if (!res.ok) {
          log.warn('[V2Levels] v2 关卡数据文件不存在，回退到原始关卡数据');
          _v2LevelsAvailable = false;
          _v2LevelsCache = null;
          _v2LevelsPromise = null;
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (!data || !Array.isArray(data)) {
          log.warn('[V2Levels] v2 关卡数据格式无效，回退到原始关卡数据');
          _v2LevelsAvailable = false;
          _v2LevelsCache = null;
          _v2LevelsPromise = null;
          return null;
        }
        // 转成 Map 方便按 levelId 查找
        const map = new Map();
        for (const lvl of data) {
          if (lvl.levelId != null) {
            map.set(parseInt(lvl.levelId), lvl);
          }
        }
        _v2LevelsCache = map;
        _v2LevelsAvailable = true;
        _v2LevelsPromise = null;
        log.info('[V2Levels] 优化版关卡数据加载完成，共 ' + map.size + ' 关');
        return map;
      })
      .catch(err => {
        log.warn('[V2Levels] 加载 v2 关卡数据失败，回退到原始关卡数据:', err);
        _v2LevelsAvailable = false;
        _v2LevelsCache = null;
        _v2LevelsPromise = null;
        return null;
      });
    return _v2LevelsPromise;
  }

  /**
   * 将 v2 格式的关卡数据转换为游戏内部格式
   * v2 格式差异：
   *   - cells 字段 → boardData
   *   - cage.cells 是字符串数组（"r c"）→ 二维数组（[[r,c], ...]）
   * @param {Object} v2Level - v2 格式的关卡数据
   * @returns {Object} 转换后的关卡数据
   */
  function _convertV2Level(v2Level) {
    if (!v2Level) return null;

    const converted = { ...v2Level };

    // cells -> boardData
    if (converted.cells && !converted.boardData) {
      converted.boardData = converted.cells;
    }

    // cage cells: 字符串 "r c" -> 数组 [r, c]
    if (converted.cages && Array.isArray(converted.cages)) {
      converted.cages = converted.cages.map(cage => {
        const newCage = { ...cage };
        if (newCage.cells && Array.isArray(newCage.cells)) {
          newCage.cells = newCage.cells.map(cell => {
            if (typeof cell === 'string') {
              const parts = cell.trim().split(/\s+/);
              return [parseInt(parts[0]), parseInt(parts[1])];
            }
            return cell;
          });
        }
        return newCage;
      });
    }

    return converted;
  }

  /**
   * 用 v2 数据覆盖/增强章节中的关卡数据
   * 保留章节中的剧情/教学数据，用 v2 中的棋盘/笼子数据替换
   * @param {Object} chapterLevel - 章节中的原始关卡数据
   * @param {Object} v2Level - v2 格式的关卡数据
   * @returns {Object} 合并后的关卡数据
   */
  function _mergeV2Level(chapterLevel, v2Level) {
    if (!chapterLevel) return v2Level ? _convertV2Level(v2Level) : null;
    if (!v2Level) return chapterLevel;

    const convertedV2 = _convertV2Level(v2Level);
    const merged = { ...chapterLevel };

    // v2 优先覆盖的字段（棋盘核心数据）
    const v2OverrideFields = [
      'boardData', 'cages', 'solution', 'gridSize',
      'difficulty', 'difficultyLevel',
      'threeAct',  // 三幕结构元数据
    ];
    for (const field of v2OverrideFields) {
      if (convertedV2[field] !== undefined) {
        merged[field] = convertedV2[field];
      }
    }

    // 如果 v2 有 lessonPlan 且章节没有，使用 v2 的
    if (convertedV2.lessonPlan && !merged.lessonPlan) {
      merged.lessonPlan = convertedV2.lessonPlan;
    }

    // 如果 v2 有 features 且章节没有，使用 v2 的
    if (convertedV2.features && !merged.features) {
      merged.features = convertedV2.features;
    }

    // 如果 v2 有 threeActDialog 且章节没有，使用 v2 的
    if (convertedV2.threeActDialog && !merged.threeActDialog) {
      merged.threeActDialog = convertedV2.threeActDialog;
    }

    return merged;
  }

  /**
   * 根据levelId查找关卡数据（不改变当前状态）
   * @param {number|string} levelId - 关卡ID
   * @returns {object|null} 关卡数据
   */
  function _findLevelData(levelId) {
    if (!window.CHAPTER_DATA) return null;
    const numId = parseInt(levelId);
    for (const ch of window.CHAPTER_DATA.chapters) {
      for (const lvl of ch.levels) {
        if (parseInt(lvl.levelId) === numId) {
          return lvl;
        }
      }
    }
    return null;
  }

  return {
    getChapterData,
    loadV2Levels: _loadV2Levels,
    mergeV2Level: _mergeV2Level,
    findLevelData: _findLevelData,
    USE_OPTIMIZED_LEVELS,
  };
})();

// 同时挂到 window 上保持兼容
if (typeof window !== 'undefined') {
  window.LevelLoader = LevelLoader;
}
