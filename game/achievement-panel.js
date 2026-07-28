// AchievementPanel - 印章簿面板
// 深色主题，底部弹出（Bottom Sheet），印章风格展示所有成就及统计信息

;(function(global) {
  'use strict';

  // 成就分类定义（按新的4大类）
  const ACHIEVEMENT_CATEGORIES = {
    skill: { name: '技巧成长', icon: '🎯', order: 1 },
    progress: { name: '案卷推进', icon: '📜', order: 2 },
    challenge: { name: '侦探荣耀', icon: '🏆', order: 3 },
    exploration: { name: '案卷秘密', icon: '🔮', order: 4 },
  };

  // 印章颜色映射
  const SEAL_COLORS = {
    silver: '#94a3b8',
    gold: '#c9a84c',
    darkgold: '#b8860b',
    red: '#b91c1c',
  };

  const STORAGE_KEY = 'cagedcipher_progress';

  class AchievementPanel {
    constructor(options) {
      this.options = options || {};
      this._isVisible = false;
      this._container = null;
      this._panel = null;
      this._onClose = this.options.onClose || null;
    }

    // === 公共 API ===

    show() {
      if (this._isVisible) return;
      this._isVisible = true;

      if (!this._container) {
        this._buildDOM();
      }

      // P2: 锁定背景滚动
      if (typeof _pushModal === 'function') {
        _pushModal('achievement');
      } else {
        document.body.classList.add('modal-open');
      }

      this.refresh();
      this._container.style.display = 'flex';
      requestAnimationFrame(() => {
        this._container.style.opacity = '1';
        this._panel.style.transform = 'translateX(-50%) translateY(0)';
      });
    }

    hide() {
      if (!this._isVisible) return;
      this._isVisible = false;

      // P2: 解锁背景滚动
      if (typeof _popModal === 'function') {
        _popModal('achievement');
      } else {
        document.body.classList.remove('modal-open');
      }

      if (this._container) {
        this._container.style.opacity = '0';
        this._panel.style.transform = 'translateX(-50%) translateY(100%)';
        setTimeout(() => {
          if (this._container) {
            this._container.style.display = 'none';
          }
        }, 350);
      }

      if (this._onClose) {
        try { this._onClose(); } catch (e) {}
      }
    }

    toggle() {
      if (this._isVisible) {
        this.hide();
      } else {
        this.show();
      }
    }

    refresh() {
      if (!this._panel) return;
      this._renderStats();
      this._renderAchievements();
    }

    // === DOM 构建 ===

    _buildDOM() {
      // 遮罩层
      const overlay = document.createElement('div');
      overlay.id = 'achievement-panel-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(15,23,42,0.7);z-index:24000;display:none;' +
        'opacity:0;transition:opacity 0.3s ease;backdrop-filter:blur(4px);';
      overlay.addEventListener('click', () => this.hide());

      // 主面板（底部弹出 Bottom Sheet）
      const panel = document.createElement('div');
      panel.id = 'achievement-panel';
      panel.style.cssText = 'position:fixed;bottom:0;left:50%;width:100%;max-width:480px;' +
        'max-height:85vh;background:linear-gradient(180deg,#0f172a 0%,#1e293b 100%);' +
        'border-radius:20px 20px 0 0;' +
        'z-index:24001;transform:translateX(-50%) translateY(100%);' +
        'transition:transform 0.35s cubic-bezier(0.4,0,0.2,1);' +
        'display:flex;flex-direction:column;overflow:hidden;' +
        'box-shadow:0 -4px 24px rgba(0,0,0,0.4);';
      panel.addEventListener('click', (e) => e.stopPropagation());

      // 拖拽手柄
      const dragHandle = document.createElement('div');
      dragHandle.style.cssText = 'flex-shrink:0;display:flex;justify-content:center;padding:10px 0 6px;cursor:grab;' +
        'user-select:none;-webkit-user-select:none;';
      dragHandle.innerHTML = '<div style="width:36px;height:4px;' +
        'background:#334155;border-radius:2px;"></div>';
      panel.appendChild(dragHandle);

      // 头部 - 印章簿标题
      const header = document.createElement('div');
      header.style.cssText = 'padding:24px 20px 16px;flex-shrink:0;' +
        'border-bottom:1px solid rgba(201,168,76,0.15);';
      header.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<div>' +
        '<div style="font-size:22px;font-weight:900;color:#f1f5f9;letter-spacing:4px;">📜 印章簿</div>' +
        '<div id="ap-progress-text" style="font-size:13px;color:#64748b;margin-top:4px;letter-spacing:1px;">加载中...</div>' +
        '</div>' +
        '<button id="ap-close-btn" style="width:40px;height:40px;border:1px solid #334155;' +
        'background:#1e293b;color:#94a3b8;border-radius:10px;cursor:pointer;' +
        'font-size:16px;transition:all 0.2s;display:flex;align-items:center;justify-content:center;">✕</button>' +
        '</div>' +
        '<div id="ap-progress-bar" style="margin-top:14px;height:6px;background:#1e293b;' +
        'border-radius:3px;overflow:hidden;">' +
        '<div id="ap-progress-fill" style="height:100%;width:0%;' +
        'background:linear-gradient(90deg,#c9a84c,#b8860b);border-radius:3px;' +
        'transition:width 0.6s ease;"></div>' +
        '</div>';

      // 统计信息区 - 印章数/游戏时长/通关章节数
      const stats = document.createElement('div');
      stats.id = 'ap-stats';
      stats.style.cssText = 'padding:16px 20px;flex-shrink:0;' +
        'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;' +
        'border-bottom:1px solid rgba(201,168,76,0.08);';

      // 成就列表区（可滚动）
      const listContainer = document.createElement('div');
      listContainer.id = 'ap-list-container';
      listContainer.style.cssText = 'flex:1;overflow-y:auto;padding:16px 20px 24px;';
      listContainer.innerHTML = '<div id="ap-achievement-list"></div>';

      panel.appendChild(header);
      panel.appendChild(stats);
      panel.appendChild(listContainer);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      this._container = overlay;
      this._panel = panel;

      // 绑定关闭按钮
      const closeBtn = document.getElementById('ap-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.hide());
        closeBtn.addEventListener('mouseenter', () => {
          closeBtn.style.background = '#334155';
          closeBtn.style.color = '#f1f5f9';
        });
        closeBtn.addEventListener('mouseleave', () => {
          closeBtn.style.background = '#1e293b';
          closeBtn.style.color = '#94a3b8';
        });
      }

      // ESC 键关闭
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._isVisible) {
          this.hide();
        }
      });
    }

    // === 渲染统计 ===

    _renderStats() {
      const statsEl = document.getElementById('ap-stats');
      if (!statsEl) return;

      const defs = this._getAchievementDefs();
      const unlocked = this._getUnlockedIds();
      const totalDefs = Object.keys(defs).length;

      // 总游戏时长
      const totalPlayTime = this._estimateTotalPlayTime();
      const playHours = Math.floor(totalPlayTime / 60);
      const playMins = totalPlayTime % 60;

      // 通关章节数
      const clearedChapters = this._getClearedChapterCount();

      const stats = [
        { label: '印章收集', value: unlocked.length + '/' + totalDefs, icon: '🔖', color: '#c9a84c' },
        { label: '游戏时长', value: playHours > 0 ? playHours + 'h ' + playMins + 'm' : playMins + 'min', icon: '⏱️', color: '#60a5fa' },
        { label: '通关章节', value: clearedChapters, icon: '📚', color: '#22c55e' },
      ];

      statsEl.innerHTML = stats.map(s =>
        '<div style="background:rgba(30,41,59,0.8);border:1px solid ' + s.color + '20;' +
        'border-radius:10px;padding:12px 8px;text-align:center;">' +
        '<div style="font-size:20px;margin-bottom:4px;">' + s.icon + '</div>' +
        '<div style="font-size:16px;font-weight:700;color:' + s.color + ';margin-bottom:2px;">' + s.value + '</div>' +
        '<div style="font-size:11px;color:#64748b;letter-spacing:1px;">' + s.label + '</div>' +
        '</div>'
      ).join('');

      // 更新进度条和文本
      const progressText = document.getElementById('ap-progress-text');
      const progressFill = document.getElementById('ap-progress-fill');
      const pct = totalDefs > 0 ? Math.round((unlocked.length / totalDefs) * 100) : 0;
      if (progressText) {
        progressText.textContent = '已收集 ' + unlocked.length + ' / ' + totalDefs + ' 枚印章 · ' + pct + '%';
      }
      if (progressFill) {
        progressFill.style.width = pct + '%';
      }
    }

    // === 渲染成就列表 ===

    _renderAchievements() {
      const listEl = document.getElementById('ap-achievement-list');
      if (!listEl) return;

      const defs = this._getAchievementDefs();
      const unlockedIds = this._getUnlockedIds();

      // 按分类组织
      const categories = {};
      for (const id in defs) {
        const def = defs[id];
        const cat = def.category || 'challenge';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(id);
      }

      let html = '';

      // 按分类顺序渲染
      const catOrder = Object.keys(ACHIEVEMENT_CATEGORIES).sort(
        (a, b) => ACHIEVEMENT_CATEGORIES[a].order - ACHIEVEMENT_CATEGORIES[b].order
      );

      for (const catKey of catOrder) {
        const catIds = categories[catKey];
        if (!catIds || catIds.length === 0) continue;

        const catInfo = ACHIEVEMENT_CATEGORIES[catKey];
        const unlockedInCat = catIds.filter(id => unlockedIds.indexOf(id) !== -1).length;

        html +=
          '<div style="margin-bottom:20px;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
          '<span style="font-size:14px;">' + catInfo.icon + '</span>' +
          '<span style="font-size:13px;font-weight:700;color:#94a3b8;letter-spacing:2px;">' +
          catInfo.name + '</span>' +
          '<span style="font-size:11px;color:#475569;margin-left:auto;">' +
          unlockedInCat + '/' + catIds.length + '</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr;gap:10px;">';

        for (const id of catIds) {
          const def = defs[id];
          if (!def) continue;
          const isUnlocked = unlockedIds.indexOf(id) !== -1;
          const unlockTime = this._getAchievementUnlockTime(id);

          html += this._renderSealCard(def, isUnlocked, unlockTime);
        }

        html += '</div></div>';
      }

      listEl.innerHTML = html;
    }

    // 渲染印章风格的成就卡片
    _renderSealCard(def, isUnlocked, unlockTime) {
      const colorName = def.sealColor || 'silver';
      const sealColor = SEAL_COLORS[colorName] || '#94a3b8';
      const sealText = def.sealText || '印';
      const name = def.name || def.id;
      const description = isUnlocked ? (def.description || def.desc || '') : '???';

      const borderColor = isUnlocked ? sealColor + '60' : '#1e293b';
      const bgColor = isUnlocked
        ? 'linear-gradient(135deg,' + sealColor + '10,rgba(30,41,59,0.6))'
        : 'rgba(15,23,42,0.6)';
      const nameColor = isUnlocked ? '#fef3c7' : '#475569';
      const descColor = isUnlocked ? '#94a3b8' : '#334155';

      // 印章样式
      const sealOpacity = isUnlocked ? '0.9' : '0.15';
      const sealTransform = isUnlocked ? 'rotate(-3deg)' : 'rotate(-3deg)';

      const timeText = (isUnlocked && unlockTime)
        ? '<div style="font-size:10px;color:#475569;margin-top:4px;">' + this._formatDate(unlockTime) + '</div>'
        : '';

      const statusBadge = isUnlocked
        ? '<div style="font-size:10px;color:' + sealColor + ';font-weight:700;padding:2px 6px;' +
          'background:' + sealColor + '15;border:1px solid ' + sealColor + '40;' +
          'border-radius:4px;letter-spacing:1px;">已收集</div>'
        : '<div style="font-size:10px;color:#475569;padding:2px 6px;' +
          'background:rgba(71,85,105,0.1);border:1px solid rgba(71,85,105,0.3);border-radius:4px;letter-spacing:1px;">未解锁</div>';

      return (
        '<div style="display:flex;align-items:center;gap:14px;padding:12px 14px;' +
        'background:' + bgColor + ';' +
        'border:1px solid ' + borderColor + ';' +
        'border-radius:12px;transition:all 0.2s;">' +
        // 左侧印章图标
        '<div style="flex-shrink:0;display:flex;align-items:center;justify-content:center;">' +
        '<div style="width:56px;height:56px;border-radius:50%;' +
        'border:3px solid ' + sealColor + ';' +
        'background:' + (isUnlocked ? sealColor + '15' : 'transparent') + ';' +
        'opacity:' + sealOpacity + ';' +
        'transform:' + sealTransform + ';' +
        'display:flex;align-items:center;justify-content:center;' +
        'box-shadow:' + (isUnlocked ? '0 2px 8px ' + sealColor + '30, inset 0 0 12px ' + sealColor + '15' : 'none') + ';' +
        'transition:all 0.3s;">' +
        '<span style="font-size:13px;font-weight:900;color:' + sealColor + ';' +
        'letter-spacing:1px;writing-mode:horizontal-tb;text-align:center;line-height:1.2;">' +
        sealText + '</span>' +
        '</div>' +
        '</div>' +
        // 右侧名称描述
        '<div style="flex:1;min-width:0;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
        '<div style="font-size:15px;font-weight:700;color:' + nameColor + ';' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:1px;">' + name + '</div>' +
        statusBadge +
        '</div>' +
        '<div style="font-size:12px;color:' + descColor + ';line-height:1.5;">' + description + '</div>' +
        timeText +
        '</div>' +
        '</div>'
      );
    }

    // === 数据获取 ===

    _getProgressData() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return { achievements: [], levelScores: {} };
    }

    _getAchievementDefs() {
      if (global.ProgressManager && typeof ProgressManager.getAchievementDefs === 'function') {
        return ProgressManager.getAchievementDefs();
      }
      // 备用定义（当 ProgressManager 不可用时使用）
      return this._getFallbackDefs();
    }

    _getFallbackDefs() {
      return {
        first_naked_single: { id: 'first_naked_single', name: '启蒙', description: '首次使用裸单法', category: 'skill', sealText: '启蒙', sealColor: 'silver' },
        first_hidden_single: { id: 'first_hidden_single', name: '观察力', description: '首次使用隐曜', category: 'skill', sealText: '观察力', sealColor: 'silver' },
        first_naked_pair: { id: 'first_naked_pair', name: '并蒂', description: '首次使用裸数对', category: 'skill', sealText: '并蒂', sealColor: 'gold' },
        first_hidden_pair: { id: 'first_hidden_pair', name: '对影', description: '首次使用隐数对', category: 'skill', sealText: '对影', sealColor: 'gold' },
        first_rule45: { id: 'first_rule45', name: '星衡', description: '首次使用45法则', category: 'skill', sealText: '星衡', sealColor: 'gold' },
        first_xwing: { id: 'first_xwing', name: '纵横', description: '首次使用X-Wing', category: 'skill', sealText: '纵横', sealColor: 'red' },
        first_swordfish: { id: 'first_swordfish', name: '游鱼', description: '首次使用Swordfish', category: 'skill', sealText: '游鱼', sealColor: 'red' },
        chapter1_clear: { id: 'chapter1_clear', name: '初识笼中', description: '完成第一章', category: 'progress', sealText: '已阅', sealColor: 'silver' },
        chapter2_clear: { id: 'chapter2_clear', name: '九域初开', description: '完成第二章', category: 'progress', sealText: '已阅', sealColor: 'silver' },
        chapter3_clear: { id: 'chapter3_clear', name: '幻影破局', description: '完成第三章', category: 'progress', sealText: '已阅', sealColor: 'gold' },
        chapter4_clear: { id: 'chapter4_clear', name: '笔记大成', description: '完成第四章', category: 'progress', sealText: '已阅', sealColor: 'gold' },
        chapter5_clear: { id: 'chapter5_clear', name: '嵌套之谜', description: '完成第五章', category: 'progress', sealText: '已阅', sealColor: 'gold' },
        chapter6_clear: { id: 'chapter6_clear', name: '双解终局', description: '完成第六章', category: 'progress', sealText: '已阅', sealColor: 'darkgold' },
        chapter7_clear: { id: 'chapter7_clear', name: '三幕终章', description: '完成第七章', category: 'progress', sealText: '已阅', sealColor: 'darkgold' },
        all_chapters_clear: { id: 'all_chapters_clear', name: '卷宗已结', description: '通关全部章节', category: 'progress', sealText: '结案', sealColor: 'red' },
        no_hint_run: { id: 'no_hint_run', name: '无声推理', description: '连续3关不使用提示', category: 'challenge', sealText: '推理', sealColor: 'silver' },
        no_hint_chapter: { id: 'no_hint_chapter', name: '独立侦破', description: '一章内全程无提示', category: 'challenge', sealText: '侦破', sealColor: 'gold' },
        speed_demon: { id: 'speed_demon', name: '闪电推演', description: '120秒内完成任意关卡', category: 'challenge', sealText: '神速', sealColor: 'gold' },
        flawless_victory: { id: 'flawless_victory', name: '无懈可击', description: '单关零错误通关', category: 'challenge', sealText: '完美', sealColor: 'darkgold' },
        true_ending: { id: 'true_ending', name: '真相大白', description: '解锁并通关真结局', category: 'challenge', sealText: '真相', sealColor: 'red' },
        first_hidden_level: { id: 'first_hidden_level', name: '暗格', description: '解锁第一个隐藏关', category: 'exploration', sealText: '暗格', sealColor: 'silver' },
        all_hidden_levels: { id: 'all_hidden_levels', name: '暗格全破', description: '解锁全部隐藏关', category: 'exploration', sealText: '暗格全破', sealColor: 'gold' },
        seal_collector: { id: 'seal_collector', name: '印记收集', description: '收集全部5枚印记', category: 'exploration', sealText: '印记', sealColor: 'darkgold' },
      };
    }

    _getUnlockedIds() {
      if (global.ProgressManager && typeof ProgressManager.getAchievements === 'function') {
        return ProgressManager.getAchievements();
      }
      const data = this._getProgressData();
      return data.achievements || [];
    }

    _getAchievementUnlockTime(achievementId) {
      // 优先从 ProgressManager 获取解锁时间
      if (global.ProgressManager && typeof ProgressManager.getAchievementUnlockTime === 'function') {
        return ProgressManager.getAchievementUnlockTime(achievementId);
      }
      // fallback：从 localStorage 读取旧格式的解锁时间
      try {
        const raw = localStorage.getItem(STORAGE_KEY + '_times');
        if (raw) {
          const times = JSON.parse(raw);
          return times[achievementId] || null;
        }
      } catch (e) {}
      return null;
    }

    _estimateTotalPlayTime() {
      // 优先从 ProgressManager 获取精确的累计游戏时长
      if (global.ProgressManager && typeof ProgressManager.getTotalPlayTime === 'function') {
        const totalSeconds = ProgressManager.getTotalPlayTime();
        return Math.round(totalSeconds / 60); // 返回分钟数
      }
      // fallback：基于所有关卡的通关时间估算总游戏时长
      const data = this._getProgressData();
      const scores = data.levelScores || {};
      let totalSeconds = 0;
      for (const key in scores) {
        if (scores[key] && typeof scores[key].time === 'number') {
          totalSeconds += scores[key].time;
        }
      }
      // 加上估算的思考/重试时间（每关额外 50%）
      totalSeconds = Math.round(totalSeconds * 1.5);
      return Math.round(totalSeconds / 60); // 返回分钟数
    }

    _getClearedChapterCount() {
      // 优先从 ProgressManager 获取
      if (global.ProgressManager && ProgressManager._data && ProgressManager._data.unlockedChapters) {
        // unlockedChapters 表示已解锁章节，通关章节需根据章节成绩判断
        // 这里近似用已解锁章节数 - 1（第一章默认解锁）
        // 更精确的方式是遍历 chaptersData，但 AchievementPanel 不持有该数据
        return ProgressManager._data.unlockedChapters.length - 1;
      }
      // fallback：从 localStorage 读取
      const data = this._getProgressData();
      const unlocked = data.unlockedChapters || [1];
      return unlocked.length - 1;
    }

    // === 工具方法 ===

    _formatDate(timestamp) {
      try {
        const d = new Date(timestamp);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return y + '.' + m + '.' + day;
      } catch (e) {
        return '';
      }
    }
  }

  global.AchievementPanel = AchievementPanel;

})(window);
