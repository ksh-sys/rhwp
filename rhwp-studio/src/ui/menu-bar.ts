import type { EventBus } from '@/core/event-bus';
import type { CommandDispatcher } from '@/command/dispatcher';
import type { CommandRegistry } from '@/command/registry';
import { syncMenuShortcutLabels } from './menu-shortcut-labels';
import { t } from '../i18n/index.ts';

/**
 * 메뉴바 드롭다운 컨트롤러
 *
 * - 메뉴 타이틀 클릭 → 드롭다운 토글
 * - 열린 상태에서 다른 메뉴 hover → 자동 전환
 * - 바깥 클릭 / Escape → 닫기
 * - 항목 클릭 → CommandDispatcher 경유 실행
 * - 드롭다운 열릴 때 컨텍스트 감응 활성/비활성 갱신
 */
/** MenuBar 옵션 */
export interface MenuBarOptions {
  /** 드롭다운 메뉴가 열릴 때 호출 (동적 하위 항목 렌더 등). menuName = data-menu 값. */
  onMenuOpen?: (menuName: string, menuEl: HTMLElement) => void;
  /**
   * 한컴식 탭: 있으면 제목 클릭은 드롭다운 대신 이 콜백으로 도구 묶음을 고르고,
   * 드롭다운은 제목 옆 ▾ 단추가 연다. `menuOnly` 에 든 메뉴(파일)는 제목이 곧 드롭다운이다.
   */
  onTitleSelect?: (menuName: string) => void;
  menuOnly?: ReadonlySet<string>;
}

export class MenuBar {
  private menuItems: HTMLElement[];
  private openMenu: HTMLElement | null = null;
  private onMenuOpen?: (menuName: string, menuEl: HTMLElement) => void;
  private onTitleSelect?: (menuName: string) => void;
  private menuOnly: ReadonlySet<string>;

  constructor(
    private container: HTMLElement,
    private eventBus: EventBus,
    private dispatcher: CommandDispatcher,
    registry: CommandRegistry,
    options: MenuBarOptions = {},
  ) {
    this.onMenuOpen = options.onMenuOpen;
    this.onTitleSelect = options.onTitleSelect;
    this.menuOnly = options.menuOnly ?? new Set();
    this.menuItems = Array.from(container.querySelectorAll('.menu-item'));
    syncMenuShortcutLabels(container, registry);
    if (this.onTitleSelect) this.setupToggles();
    this.setupTitleClicks();
    this.setupTitleHover();
    this.setupItemClicks();
    this.setupOutsideClose();
    this.setupKeyboardClose();
  }

  /** 메뉴 타이틀 클릭 → 드롭다운 토글 (탭 모드면 도구 묶음 고르기) */
  private setupTitleClicks(): void {
    for (const item of this.menuItems) {
      const title = item.querySelector('.menu-title') as HTMLElement;
      if (!title) continue;
      title.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const name = item.dataset.menu ?? '';
        if (this.onTitleSelect && !this.menuOnly.has(name)) {
          this.closeAll();
          this.onTitleSelect(name);
          return;
        }
        this.toggleMenu(item);
      });
    }
  }

  /** 탭 모드: 제목 옆 ▾ 단추가 세로 메뉴를 연다 */
  private setupToggles(): void {
    for (const item of this.menuItems) {
      const title = item.querySelector('.menu-title') as HTMLElement;
      const name = item.dataset.menu ?? '';
      if (!title || this.menuOnly.has(name)) continue;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'menu-toggle';
      toggle.textContent = '▾';
      toggle.setAttribute('aria-haspopup', 'menu');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', t('ui.menuBar.toggle.ariaLabel', { p1: (title.textContent ?? '').trim() }));
      toggle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.toggleMenu(item);
      });
      // 키보드(Enter/Space)는 mousedown 없이 click 만 온다
      toggle.addEventListener('click', (e) => {
        if ((e as MouseEvent).detail === 0) this.toggleMenu(item);
      });
      toggle.addEventListener('mouseenter', () => this.hoverSwitch(item));
      title.after(toggle);
      item.classList.add('has-toggle');
    }
  }

  private toggleMenu(item: HTMLElement): void {
    if (this.openMenu === item) {
      this.closeAll();
      return;
    }
    this.openMenu?.classList.remove('open');
    this.setExpanded(this.openMenu, false);
    item.classList.add('open');
    this.setExpanded(item, true);
    this.openMenu = item;
    this.updateMenuStates(item);
    this.onMenuOpen?.(item.dataset.menu ?? '', item);
  }

  private setExpanded(item: HTMLElement | null, expanded: boolean): void {
    item?.querySelector('.menu-toggle')?.setAttribute('aria-expanded', String(expanded));
  }

  /** 드롭다운이 열려 있으면 hover 한 메뉴로 옮긴다 */
  private hoverSwitch(item: HTMLElement): void {
    if (this.openMenu && this.openMenu !== item) this.toggleMenu(item);
  }

  /** 열린 상태에서 다른 메뉴 hover → 자동 전환 */
  private setupTitleHover(): void {
    for (const item of this.menuItems) {
      const title = item.querySelector('.menu-title') as HTMLElement;
      if (!title) continue;
      title.addEventListener('mouseenter', () => this.hoverSwitch(item));
    }
  }

  /** 드롭다운 항목·메뉴바 직접 버튼 클릭 → 커맨드 디스패치 + 닫기 */
  private setupItemClicks(): void {
    this.container.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest(
        '.md-item[data-cmd], .menu-command[data-cmd]',
      ) as HTMLElement;
      if (!target) return;
      if (target.classList.contains('disabled')) return;

      const cmd = target.dataset.cmd;
      if (cmd) {
        // data-* 속성을 params로 변환 (data-cmd 제외)
        const params: Record<string, unknown> = { anchorEl: target };
        for (const [key, val] of Object.entries(target.dataset)) {
          if (key !== 'cmd') params[key] = val;
        }
        this.dispatcher.dispatch(cmd, params);
      }
      this.closeAll();
    });
  }

  /** 바깥 클릭 → 닫기 */
  private setupOutsideClose(): void {
    document.addEventListener('mousedown', (e) => {
      if (!this.openMenu) return;
      if (!this.container.contains(e.target as Node)) {
        this.closeAll();
      }
    });
  }

  /** 메뉴 열린 상태 키보드 처리: Escape 닫기 + 단일 키 hotkey 항목 활성 (#792) */
  private setupKeyboardClose(): void {
    document.addEventListener('keydown', (e) => {
      if (!this.openMenu) return;
      if (e.key === 'Escape') {
        this.closeAll();
        return;
      }
      // 메뉴 열린 상태에서 단일 키 (modifier 없음) → shortcutLabel 매칭
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      if (e.key.length !== 1) return;
      const key = e.key.toUpperCase();
      const items = this.openMenu.querySelectorAll('.md-item[data-cmd]:not(.disabled)');
      for (const item of items) {
        const shortcut = item.querySelector('.md-shortcut');
        if (shortcut && shortcut.textContent?.toUpperCase() === key) {
          e.preventDefault();
          const el = item as HTMLElement;
          const cmd = el.dataset.cmd;
          if (cmd) {
            const params: Record<string, unknown> = { anchorEl: item };
            for (const [k, v] of Object.entries(el.dataset)) {
              if (k !== 'cmd') params[k] = v;
            }
            this.dispatcher.dispatch(cmd, params);
          }
          this.closeAll();
          return;
        }
      }
    });
  }

  /** 드롭다운 열릴 때 항목별 활성/비활성 상태를 컨텍스트 기반으로 갱신 */
  private updateMenuStates(menuElement: HTMLElement): void {
    // 일반 항목
    const items = menuElement.querySelectorAll('.md-item[data-cmd]');
    for (const item of items) {
      const el = item as HTMLElement;
      const cmdId = el.dataset.cmd!;
      const enabled = this.dispatcher.isEnabled(cmdId);
      el.classList.toggle('disabled', !enabled);
      if (cmdId === 'file:save') {
        el.removeAttribute('title');
      }
    }
    // 서브메뉴 컨테이너: 하위 항목 중 활성이 하나라도 있으면 서브메뉴도 활성
    const subs = menuElement.querySelectorAll('.md-sub');
    for (const sub of subs) {
      const subItems = sub.querySelectorAll('.md-item[data-cmd]');
      let anyEnabled = false;
      for (const si of subItems) {
        if (!si.classList.contains('disabled')) {
          anyEnabled = true;
          break;
        }
      }
      sub.classList.toggle('disabled', !anyEnabled);
    }
  }

  private closeAll(): void {
    this.openMenu?.classList.remove('open');
    this.setExpanded(this.openMenu, false);
    this.openMenu = null;
  }
}
