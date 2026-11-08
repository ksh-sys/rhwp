import type { EventBus } from '@/core/event-bus';
import type { CommandDispatcher } from '@/command/dispatcher';

/**
 * 한컴식 탭 도구 묶음 (리본)
 *
 * 메뉴바 제목을 누르면 그 메뉴의 도구 묶음을 기본 도구 상자 자리에 띄운다. 세로 메뉴는
 * 제목 옆 ▾ 가 연다(MenuBar 탭 모드). 「편집」은 손으로 고른 기본 도구 상자를 그대로 쓰고,
 * 나머지 탭은 index.html 의 메뉴 마크업에서 그 자리에서 만든다 — 목록을 따로 두면 메뉴와
 * 어긋난다. 아이콘이 있는 항목은 큰 단추, 없는 항목은 세 줄씩 쌓은 작은 단추가 된다.
 */

/** 기본 도구 상자를 보여 주는 탭 */
export const DEFAULT_RIBBON_TAB = 'edit';
/** 도구 묶음 없이 제목이 곧 세로 메뉴인 탭 (한컴의 「파일」) */
export const MENU_ONLY_TABS: ReadonlySet<string> = new Set(['file']);

const SMALL_ROWS = 3;

export interface RibbonTabs {
  select(menuName: string): void;
}

/** 메뉴 항목 이름에서 단축 글쇠 표시 「(F)」와 「...」를 뗀다 */
export function ribbonLabel(text: string): string {
  return text.replace(/\([A-Z]\)/g, '').replace(/(\.\.\.|…)$/, '').trim();
}

export function initRibbonTabs(
  menuBar: HTMLElement,
  iconToolbar: HTMLElement,
  dispatcher: CommandDispatcher,
  eventBus: EventBus,
): RibbonTabs {
  const viewport = iconToolbar.querySelector<HTMLElement>('#icon-toolbar-viewport');
  const panel = document.createElement('div');
  panel.id = 'ribbon-tab-panel';
  panel.className = 'tb-tab-panel';
  panel.setAttribute('role', 'toolbar');
  panel.hidden = true;
  viewport?.after(panel);

  let active = DEFAULT_RIBBON_TAB;
  let popup: HTMLElement | null = null;

  const menuOf = (name: string) =>
    menuBar.querySelector<HTMLElement>(`.menu-item[data-menu="${name}"]`);

  const closePopup = () => {
    popup?.remove();
    popup = null;
  };

  const refreshStates = () => {
    if (panel.hidden) return;
    for (const el of panel.querySelectorAll<HTMLElement>('[data-cmd]')) {
      el.classList.toggle('disabled', !dispatcher.isEnabled(el.dataset.cmd!));
    }
    for (const el of panel.querySelectorAll<HTMLElement>('[data-sub]')) {
      const sub = menuOf(active)?.querySelectorAll<HTMLElement>('.md-sub')[Number(el.dataset.sub)];
      const cmds = sub ? Array.from(sub.querySelectorAll<HTMLElement>('.md-item[data-cmd]')) : [];
      el.classList.toggle('disabled', !cmds.some((c) => dispatcher.isEnabled(c.dataset.cmd!)));
    }
  };

  const dispatchFrom = (el: HTMLElement) => {
    const params: Record<string, unknown> = { anchorEl: el };
    for (const [key, val] of Object.entries(el.dataset)) {
      if (key !== 'cmd') params[key] = val;
    }
    dispatcher.dispatch(el.dataset.cmd!, params);
  };

  const openSub = (button: HTMLElement) => {
    closePopup();
    const sub = menuOf(active)?.querySelectorAll<HTMLElement>('.md-sub')[Number(button.dataset.sub)];
    const items = sub?.querySelector('.md-sub-panel');
    if (!items) return;
    // 도구 상자는 overflow:hidden 이라 펼침 목록은 body 에 띄운다
    popup = document.createElement('div');
    popup.className = 'menu-dropdown tb-ribbon-popup';
    popup.setAttribute('role', 'menu');
    for (const child of Array.from(items.children)) {
      const copy = child.cloneNode(true) as HTMLElement;
      const cmd = copy.dataset.cmd;
      if (cmd) copy.classList.toggle('disabled', !dispatcher.isEnabled(cmd));
      popup.appendChild(copy);
    }
    const r = button.getBoundingClientRect();
    popup.style.left = `${r.left}px`;
    popup.style.top = `${r.bottom + 2}px`;
    popup.addEventListener('mousedown', (e) => e.preventDefault());
    popup.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.md-item[data-cmd]');
      if (!target || target.classList.contains('disabled')) return;
      closePopup();
      dispatchFrom(target);
    });
    document.body.appendChild(popup);
  };

  const build = (menu: HTMLElement) => {
    panel.replaceChildren();
    panel.setAttribute('aria-label', (menu.querySelector('.menu-title')?.textContent ?? '').trim());
    const dropdown = menu.querySelector('.menu-dropdown');
    if (!dropdown) return;
    const subs = Array.from(menu.querySelectorAll('.md-sub'));
    let stack: HTMLElement | null = null;

    const addSmall = (button: HTMLElement) => {
      if (!stack || stack.childElementCount >= SMALL_ROWS) {
        stack = document.createElement('div');
        stack.className = 'tb-stack';
        panel.appendChild(stack);
      }
      stack.appendChild(button);
    };
    const addSep = () => {
      stack = null;
      const last = panel.lastElementChild;
      if (!last || last.classList.contains('tb-sep')) return;
      const sep = document.createElement('span');
      sep.className = 'tb-sep';
      panel.appendChild(sep);
    };

    for (const el of Array.from(dropdown.children) as HTMLElement[]) {
      if (el.classList.contains('md-sep')) {
        addSep();
        continue;
      }
      const label = ribbonLabel(el.querySelector(':scope > .md-label')?.textContent ?? '');
      if (el.classList.contains('md-sub')) {
        // 최근 문서처럼 열 때 채우는 하위 메뉴는 세로 메뉴에만 둔다
        if (el.hasAttribute('data-recent')) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tb-small';
        button.dataset.sub = String(subs.indexOf(el));
        button.textContent = `${label} ▾`;
        button.setAttribute('aria-haspopup', 'menu');
        addSmall(button);
        continue;
      }
      const cmd = el.dataset.cmd;
      if (!el.classList.contains('md-item') || !cmd) continue;
      const icon = Array.from(el.querySelector('.md-icon')?.classList ?? []).find((c) => c.startsWith('icon-'));
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.cmd = cmd;
      for (const [key, val] of Object.entries(el.dataset)) {
        if (key !== 'cmd' && val !== undefined) button.dataset[key] = val;
      }
      button.title = el.title || label;
      // 조판 부호처럼 켜고 끄는 항목은 메뉴 쪽 표시를 이어받는다 (이후엔 명령이 [data-cmd] 전체를 갱신)
      const on = el.classList.contains('active') ? ' active' : '';
      if (icon) {
        stack = null;
        button.className = `tb-btn${on}`;
        const sprite = document.createElement('span');
        sprite.className = `tb-sprite ${icon}`;
        const text = document.createElement('span');
        text.className = 'tb-label';
        text.textContent = label;
        button.append(sprite, text);
        panel.appendChild(button);
      } else {
        button.className = `tb-small${on}`;
        button.textContent = label;
        addSmall(button);
      }
    }
    if (panel.lastElementChild?.classList.contains('tb-sep')) panel.lastElementChild.remove();
  };

  const select = (name: string) => {
    const menu = menuOf(name);
    if (!menu || MENU_ONLY_TABS.has(name)) return;
    closePopup();
    active = name;
    for (const item of menuBar.querySelectorAll('.menu-item')) {
      item.classList.toggle('tab-active', item === menu);
    }
    // 도구 상자를 접어 두었으면 탭을 고를 때 편다 (한컴과 같다)
    if (document.documentElement.dataset.toolboxBasic === 'hidden') {
      dispatcher.dispatch('view:toolbox-basic');
    }
    const isDefault = name === DEFAULT_RIBBON_TAB;
    if (viewport) viewport.hidden = !isDefault;
    panel.hidden = isDefault;
    if (!isDefault) {
      build(menu);
      refreshStates();
    }
  };

  panel.addEventListener('mousedown', (e) => {
    // 문서의 선택 영역을 지킨다
    e.preventDefault();
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-sub]');
    if (target && !target.classList.contains('disabled')) openSub(target);
  });
  panel.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-cmd]');
    if (!target || target.classList.contains('disabled')) return;
    dispatchFrom(target);
  });
  panel.addEventListener('mouseenter', refreshStates);

  document.addEventListener('mousedown', (e) => {
    // 펼침 단추 자신의 mousedown 은 여기까지 올라오므로, 방금 연 목록을 닫지 않게 거른다
    const target = e.target as HTMLElement;
    if (popup && !popup.contains(target) && !target.closest?.('#ribbon-tab-panel [data-sub]')) closePopup();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePopup();
  });

  let pending = 0;
  const scheduleRefresh = () => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      refreshStates();
    });
  };
  eventBus.on('cursor-format-changed', scheduleRefresh);
  eventBus.on('cursor-para-changed', scheduleRefresh);

  // 머리말·주석 편집처럼 기본 도구 상자 안에서 바뀌는 모드는 「편집」 탭에서만 보인다
  const modeGroups = iconToolbar.querySelectorAll<HTMLElement>('.tb-headerfooter-group, .tb-note-group');
  const observer = new MutationObserver(() => {
    if (Array.from(modeGroups).some((g) => !g.hidden)) select(DEFAULT_RIBBON_TAB);
  });
  for (const group of modeGroups) observer.observe(group, { attributes: true, attributeFilter: ['hidden'] });

  menuOf(DEFAULT_RIBBON_TAB)?.classList.add('tab-active');
  return { select };
}
