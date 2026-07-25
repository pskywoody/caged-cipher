// SealAnimation - 印章盖印动画组件
// 成就解锁时在屏幕中央显示盖印动画效果：印章从上方落下 + 缩放 + "啪"的弹动效果
// 0.8s 后淡出，播放 stamp 音效

;(function(global) {
  'use strict';

  // 印章颜色映射
  const SEAL_COLORS = {
    silver: '#94a3b8',
    gold: '#c9a84c',
    darkgold: '#b8860b',
    red: '#b91c1c',
  };

  class SealAnimation {
    constructor() {
      this._container = null;
      this._isShowing = false;
      this._queue = [];
      this._hideTimer = null;
    }

    /**
     * 显示成就印章盖印动画
     * @param {Object} achievement - 成就定义对象
     *   - id: 成就ID
     *   - name: 成就名称
     *   - description: 成就描述
     *   - sealText: 印章文字
     *   - sealColor: 印章颜色等级 (silver/gold/darkgold/red)
     */
    show(achievement) {
      if (!achievement) return;

      // 如果当前正在显示，加入队列
      if (this._isShowing) {
        this._queue.push(achievement);
        return;
      }

      this._isShowing = true;
      this._playAnimation(achievement);
    }

    _playAnimation(achievement) {
      if (!this._container) {
        this._buildDOM();
      }

      const sealText = achievement.sealText || achievement.name || '成就';
      const colorName = achievement.sealColor || 'gold';
      const sealColor = SEAL_COLORS[colorName] || SEAL_COLORS.gold;
      const name = achievement.name || '';
      const description = achievement.description || achievement.desc || '';

      // 更新印章内容
      const sealEl = this._container.querySelector('.seal-animation-seal');
      const textEl = this._container.querySelector('.seal-animation-text');
      const nameEl = this._container.querySelector('.seal-animation-name');
      const descEl = this._container.querySelector('.seal-animation-desc');

      if (sealEl) {
        sealEl.style.borderColor = sealColor;
        sealEl.style.color = sealColor;
        sealEl.style.boxShadow = '0 0 40px ' + sealColor + '60, inset 0 0 20px ' + sealColor + '30';
      }
      if (textEl) {
        textEl.textContent = sealText;
        textEl.style.color = sealColor;
      }
      if (nameEl) {
        nameEl.textContent = name;
      }
      if (descEl) {
        descEl.textContent = description;
      }

      // 播放音效
      this._playStampSound();

      // 显示容器
      this._container.style.display = 'flex';

      // 重置动画状态
      const overlay = this._container.querySelector('.seal-animation-overlay');
      const content = this._container.querySelector('.seal-animation-content');
      if (overlay) {
        overlay.style.opacity = '0';
      }
      if (sealEl) {
        sealEl.style.transform = 'translateY(-200px) scale(2) rotate(-15deg)';
        sealEl.style.opacity = '0';
      }
      if (content) {
        content.style.opacity = '0';
        content.style.transform = 'translateY(20px)';
      }

      // 强制重排
      void this._container.offsetWidth;

      // 阶段1：遮罩淡入
      if (overlay) {
        overlay.style.transition = 'opacity 0.3s ease';
        overlay.style.opacity = '1';
      }

      // 阶段2：印章从上方落下 + 缩放 + 弹动 (0~0.5s)
      requestAnimationFrame(() => {
        if (sealEl) {
          sealEl.style.transition = 'transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease';
          sealEl.style.opacity = '1';
          // 落下到目标位置，带有轻微的旋转和"啪"的弹动效果
          sealEl.style.transform = 'translateY(0) scale(1) rotate(-3deg)';
        }
      });

      // 阶段3：名称描述淡入 (0.3s 后)
      setTimeout(() => {
        if (content) {
          content.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          content.style.opacity = '1';
          content.style.transform = 'translateY(0)';
        }
      }, 300);

      // 阶段4：印章"啪"的弹动效果 (在落下完成时)
      setTimeout(() => {
        if (sealEl) {
          sealEl.style.transition = 'transform 0.1s ease-out';
          sealEl.style.transform = 'translateY(0) scale(1.08) rotate(-3deg)';
        }
      }, 420);

      // 弹动回弹
      setTimeout(() => {
        if (sealEl) {
          sealEl.style.transition = 'transform 0.15s ease-in';
          sealEl.style.transform = 'translateY(0) scale(1) rotate(-3deg)';
        }
      }, 520);

      // 阶段5：0.8s 后开始淡出
      this._hideTimer = setTimeout(() => {
        this._fadeOut();
      }, 800);
    }

    _fadeOut() {
      if (!this._container) return;

      const overlay = this._container.querySelector('.seal-animation-overlay');
      const sealEl = this._container.querySelector('.seal-animation-seal');
      const content = this._container.querySelector('.seal-animation-content');

      // 淡出
      if (overlay) {
        overlay.style.transition = 'opacity 0.4s ease';
        overlay.style.opacity = '0';
      }
      if (sealEl) {
        sealEl.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        sealEl.style.opacity = '0';
        sealEl.style.transform = 'translateY(0) scale(0.9) rotate(-3deg)';
      }
      if (content) {
        content.style.transition = 'opacity 0.3s ease';
        content.style.opacity = '0';
      }

      // 隐藏容器
      setTimeout(() => {
        if (this._container) {
          this._container.style.display = 'none';
        }
        this._isShowing = false;

        // 检查队列中是否有待显示的
        if (this._queue.length > 0) {
          const next = this._queue.shift();
          this._isShowing = true;
          this._playAnimation(next);
        }
      }, 450);
    }

    _playStampSound() {
      try {
        if (global.AudioService && global.AudioService.sfx) {
          if (typeof global.AudioService.sfx.play === 'function') {
            global.AudioService.sfx.play('seal_stamp');
            return;
          }
        }
        // 备用：尝试 sealUnlock 方法
        if (global.AudioService && global.AudioService.sfx &&
            typeof global.AudioService.sfx.sealUnlock === 'function') {
          global.AudioService.sfx.sealUnlock();
        }
      } catch (e) {
        // 静默失败，音效不是必需的
      }
    }

    _buildDOM() {
      // 最外层容器
      const container = document.createElement('div');
      container.className = 'seal-animation-container';
      container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'z-index:30000;display:none;' +
        'align-items:center;justify-content:center;' +
        'pointer-events:none;';

      // 半透明遮罩
      const overlay = document.createElement('div');
      overlay.className = 'seal-animation-overlay';
      overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(15,23,42,0.6);backdrop-filter:blur(3px);' +
        'opacity:0;transition:opacity 0.3s ease;';

      // 内容容器
      const contentWrap = document.createElement('div');
      contentWrap.className = 'seal-animation-content-wrap';
      contentWrap.style.cssText = 'position:relative;z-index:1;' +
        'display:flex;flex-direction:column;align-items:center;gap:24px;' +
        'text-align:center;';

      // 印章元素
      const seal = document.createElement('div');
      seal.className = 'seal-animation-seal';
      seal.style.cssText = 'width:140px;height:140px;border-radius:50%;' +
        'border:5px solid #c9a84c;' +
        'background:rgba(201,168,76,0.1);' +
        'display:flex;align-items:center;justify-content:center;' +
        'opacity:0;' +
        'transform:translateY(-200px) scale(2) rotate(-15deg);' +
        'box-shadow:0 0 40px rgba(201,168,76,0.4), inset 0 0 20px rgba(201,168,76,0.2);' +
        'backdrop-filter:blur(2px);';

      const sealText = document.createElement('span');
      sealText.className = 'seal-animation-text';
      sealText.style.cssText = 'font-size:28px;font-weight:900;' +
        'color:#c9a84c;letter-spacing:2px;' +
        'text-shadow:0 0 10px rgba(201,168,76,0.5);' +
        'line-height:1.2;';
      sealText.textContent = '成就';
      seal.appendChild(sealText);

      // 名称 + 描述
      const content = document.createElement('div');
      content.className = 'seal-animation-content';
      content.style.cssText = 'opacity:0;transform:translateY(20px);' +
        'transition:opacity 0.3s ease, transform 0.3s ease;';

      const nameEl = document.createElement('div');
      nameEl.className = 'seal-animation-name';
      nameEl.style.cssText = 'font-size:20px;font-weight:700;color:#fef3c7;' +
        'letter-spacing:3px;margin-bottom:6px;text-shadow:0 2px 8px rgba(0,0,0,0.5);';
      nameEl.textContent = '';

      const descEl = document.createElement('div');
      descEl.className = 'seal-animation-desc';
      descEl.style.cssText = 'font-size:14px;color:#94a3b8;' +
        'letter-spacing:1px;';
      descEl.textContent = '';

      // "成就解锁"标签
      const label = document.createElement('div');
      label.style.cssText = 'font-size:11px;color:#c9a84c;letter-spacing:4px;' +
        'margin-bottom:8px;opacity:0.8;';
      label.textContent = '◆ 成就解锁 ◆';

      content.appendChild(label);
      content.appendChild(nameEl);
      content.appendChild(descEl);

      contentWrap.appendChild(seal);
      contentWrap.appendChild(content);

      container.appendChild(overlay);
      container.appendChild(contentWrap);

      document.body.appendChild(container);
      this._container = container;
    }

    // 清除队列并强制隐藏
    clear() {
      this._queue = [];
      if (this._hideTimer) {
        clearTimeout(this._hideTimer);
        this._hideTimer = null;
      }
      if (this._container) {
        this._container.style.display = 'none';
      }
      this._isShowing = false;
    }
  }

  // 单例模式 - 全局共享实例
  const _instance = new SealAnimation();

  global.SealAnimation = SealAnimation;
  global.SealAnimationInstance = _instance;

})(window);
