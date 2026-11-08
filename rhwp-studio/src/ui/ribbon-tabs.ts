import type { EventBus } from '@/core/event-bus';
import type { CommandDispatcher } from '@/command/dispatcher';

/**
 * 한컴식 탭 도구 묶음 (리본)
 *
 * 메뉴바 제목을 누르면 그 탭의 도구 묶음을 기본 도구 상자 자리에 띄운다. 세로 메뉴는 제목 옆 ▾ 가
 * 연다(MenuBar 탭 모드). 묶음과 순서는 한컴오피스 한글의 리본을 따르되, rhwp 에 있는 명령만 둔다 —
 * 그래서 아래 RIBBONS 는 명령 id 와 이름·아이콘만 적은 목록이다. 아이콘은 icons-lucide.css.
 *
 * 머리말·주석 편집처럼 기본 도구 상자 안에서 바뀌는 모드는 원래 도구 상자(#icon-toolbar-viewport)를
 * 잠시 다시 보여 준다 — 그 도구는 거기에만 있다.
 */

/** 처음 고른 탭 */
export const DEFAULT_RIBBON_TAB = 'edit';
/** 도구 묶음 없이 제목이 곧 세로 메뉴인 탭 (한컴의 「파일」) */
export const MENU_ONLY_TABS: ReadonlySet<string> = new Set(['file']);

/** 단추 하나. label 의 \n 은 줄바꿈. small 이면 세 줄씩 쌓는 작은 단추. */
export interface RibbonCommand {
  cmd: string;
  label: string;
  icon?: string;
  /** 아이콘 대신 쓰는 글자 (예: 100%) */
  glyph?: string;
  small?: boolean;
  /** 켜고 끄는 보기 항목 — 체크 상자로 그린다 (항상 small) */
  check?: boolean;
}

/** 펼침 단추. items 를 목록으로 띄우거나, sub 로 세로 메뉴의 하위 메뉴(data-i18n 키)를 그대로 띄운다. */
export interface RibbonMenu {
  label: string;
  icon?: string;
  small?: boolean;
  items?: RibbonCommand[];
  sub?: { menu: string; labelKey: string };
}

export type RibbonItem = RibbonCommand | RibbonMenu;
export type RibbonGroup = RibbonItem[];

const ROTATE_ITEMS: RibbonCommand[] = [
  { cmd: 'insert:rotate-cw', label: '오른쪽 90° 회전', icon: 'rotate-cw' },
  { cmd: 'insert:rotate-ccw', label: '왼쪽 90° 회전', icon: 'rotate-ccw' },
  { cmd: 'insert:flip-horz', label: '좌우 대칭', icon: 'flip-horz' },
  { cmd: 'insert:flip-vert', label: '상하 대칭', icon: 'flip-vert' },
];

export const RIBBONS: Record<string, RibbonGroup[]> = {
  edit: [
    [
      { cmd: 'edit:cut', label: '오려\n두기', icon: 'cut' },
      { cmd: 'edit:copy', label: '복사\n하기', icon: 'copy' },
      { cmd: 'edit:paste', label: '붙이기', icon: 'paste' },
      { cmd: 'edit:format-copy', label: '모양\n복사', icon: 'format-copy' },
    ],
    [
      { cmd: 'format:char-shape', label: '글자\n모양', icon: 'char-shape' },
      { cmd: 'format:para-shape', label: '문단\n모양', icon: 'para-shape' },
      { cmd: 'format:style-dialog', label: '스타일', icon: 'style' },
    ],
    [
      { cmd: 'page:setup', label: '편집\n용지', icon: 'page-setup' },
      { label: '단', icon: 'columns', sub: { menu: 'page', labelKey: 'menu.page.label.x0a2ddb' } },
    ],
    [
      { cmd: 'insert:shape', label: '도형', icon: 'shape' },
      { cmd: 'insert:image', label: '그림', icon: 'image' },
      { cmd: 'table:create', label: '표', icon: 'table' },
    ],
    [
      { cmd: 'format:object-properties', label: '개체\n속성', icon: 'obj-props' },
      { label: '회전/\n대칭', icon: 'rotate-cw', items: ROTATE_ITEMS },
    ],
    [
      { cmd: 'edit:find', label: '찾기', icon: 'find' },
      { cmd: 'edit:find-replace', label: '찾아 바꾸기', icon: 'find-replace', small: true },
      { cmd: 'edit:find-again', label: '다시 찾기', icon: 'find-again', small: true },
      { cmd: 'edit:goto', label: '찾아가기', icon: 'goto', small: true },
    ],
  ],
  view: [
    [
      { cmd: 'view:para-mark', label: '문단 부호', check: true },
      { cmd: 'view:ctrl-mark', label: '조판 부호', check: true },
      { cmd: 'view:border-transparent', label: '투명 선', check: true },
      { cmd: 'view:toggle-clip', label: '잘림 보기', check: true },
    ],
    [
      { cmd: 'view:toggle-grid', label: '격자', icon: 'grid' },
      { cmd: 'view:grid-settings', label: '격자 설정', icon: 'grid-settings', small: true },
    ],
    [
      { cmd: 'view:zoom-out', label: '축소', icon: 'zoom-menu-out' },
      { cmd: 'view:zoom-in', label: '확대', icon: 'zoom-menu-in' },
    ],
    [
      { cmd: 'view:zoom-100', label: '100%', glyph: '100' },
      { cmd: 'view:zoom-fit-page', label: '쪽 맞춤', icon: 'zoom-fit-page', small: true },
      { cmd: 'view:zoom-fit-width', label: '폭 맞춤', icon: 'zoom-fit-width', small: true },
      { cmd: 'view:zoom-dialog', label: '화면 확대/축소', icon: 'find', small: true },
    ],
    [
      { label: '테마', icon: 'theme', small: true, sub: { menu: 'view', labelKey: 'menu.view.label.xe7ded2' } },
      { label: '도구 상자', icon: 'toolbox', small: true, sub: { menu: 'view', labelKey: 'menu.view.label.xec36d5' } },
    ],
  ],
  insert: [
    [
      { cmd: 'insert:shape', label: '도형', icon: 'shape' },
      { cmd: 'insert:textbox', label: '글상자', icon: 'textbox' },
      { cmd: 'insert:image', label: '그림', icon: 'image' },
      { cmd: 'table:create', label: '표', icon: 'table' },
      { cmd: 'insert:equation', label: '수식', icon: 'equation' },
    ],
    [
      { cmd: 'insert:field', label: '누름틀', icon: 'field' },
    ],
    [
      { cmd: 'insert:footnote', label: '각주', icon: 'footnote' },
      { cmd: 'insert:endnote', label: '미주', icon: 'endnote' },
      { cmd: 'insert:endnote-shape', label: '각주/미주 모양', icon: 'endnote', small: true },
    ],
    [
      { cmd: 'insert:bookmark', label: '책갈피', icon: 'bookmark' },
      { cmd: 'insert:hyperlink', label: '하이퍼\n링크', icon: 'hyperlink' },
    ],
    [
      { cmd: 'insert:symbols', label: '문자표', icon: 'symbols' },
    ],
  ],
  format: [
    [
      { cmd: 'format:style-dialog', label: '스타일', icon: 'style' },
    ],
    [
      { cmd: 'format:char-shape', label: '글자\n모양', icon: 'char-shape' },
      { cmd: 'format:bold', label: '진하게', icon: 'bold', small: true },
      { cmd: 'format:italic', label: '기울임', icon: 'italic', small: true },
      { cmd: 'format:underline', label: '밑줄', icon: 'underline', small: true },
      { cmd: 'format:strikethrough', label: '취소선', icon: 'strike', small: true },
      { cmd: 'format:superscript', label: '위 첨자', icon: 'superscript', small: true },
      { cmd: 'format:subscript', label: '아래 첨자', icon: 'subscript', small: true },
      { cmd: 'format:font-size-increase', label: '글자 크게', icon: 'font-up', small: true },
      { cmd: 'format:font-size-decrease', label: '글자 작게', icon: 'font-down', small: true },
    ],
    [
      { cmd: 'format:para-shape', label: '문단\n모양', icon: 'para-shape' },
      { cmd: 'format:align-left', label: '왼쪽 정렬', icon: 'align-left', small: true },
      { cmd: 'format:align-center', label: '가운데 정렬', icon: 'align-center', small: true },
      { cmd: 'format:align-right', label: '오른쪽 정렬', icon: 'align-right', small: true },
      { cmd: 'format:align-justify', label: '양쪽 정렬', icon: 'align-justify', small: true },
      { cmd: 'format:align-distribute', label: '배분 정렬', icon: 'align-distribute', small: true },
      { cmd: 'format:hanging-indent', label: '내어쓰기', icon: 'hanging-indent', small: true },
      { cmd: 'format:line-spacing-increase', label: '줄 간격 늘림', icon: 'line-spacing-up', small: true },
      { cmd: 'format:line-spacing-decrease', label: '줄 간격 줄임', icon: 'line-spacing-down', small: true },
    ],
    [
      { cmd: 'format:toggle-numbering', label: '문단\n번호', icon: 'numbering' },
      { cmd: 'format:toggle-bullet', label: '글머리표', icon: 'bullet' },
      { cmd: 'format:para-num-shape', label: '문단 번호 모양', small: true },
      { cmd: 'format:bullet-shape', label: '글머리표 모양', small: true },
      { cmd: 'format:level-increase', label: '한 수준 증가', icon: 'level-up', small: true },
      { cmd: 'format:level-decrease', label: '한 수준 감소', icon: 'level-down', small: true },
    ],
  ],
  page: [
    [
      { cmd: 'page:setup', label: '편집\n용지', icon: 'page-setup' },
    ],
    [
      { label: '머리말', icon: 'header', sub: { menu: 'page', labelKey: 'menu.page.label.xa76ec3' } },
      { label: '꼬리말', icon: 'footer', sub: { menu: 'page', labelKey: 'menu.page.label.xb0333e' } },
      { cmd: 'page:page-border', label: '쪽 테두리/\n배경', icon: 'page-border' },
      { cmd: 'page:new-page-num', label: '새 번호로\n시작', icon: 'new-page-num' },
      { cmd: 'page:hide-current', label: '현재 쪽만\n감추기', icon: 'hide-page' },
    ],
    [
      { cmd: 'page:break', label: '쪽\n나누기', icon: 'page-break' },
      { cmd: 'page:column-break', label: '단\n나누기', icon: 'column-break' },
    ],
    [
      { label: '단', icon: 'columns', sub: { menu: 'page', labelKey: 'menu.page.label.x0a2ddb' } },
      { cmd: 'page:col-settings', label: '다단\n설정', icon: 'col-settings' },
    ],
    [
      { cmd: 'page:section-settings', label: '구역\n설정', icon: 'section' },
    ],
  ],
  review: [
    [
      { cmd: 'edit:document-history', label: '문서 이력\n관리', icon: 'history' },
      { cmd: 'edit:compare-documents', label: '문서\n비교', icon: 'compare' },
    ],
  ],
  tool: [
    [
      { cmd: 'tool:options', label: '환경\n설정', icon: 'options' },
    ],
  ],
  table: [
    [
      { cmd: 'table:create', label: '표\n만들기', icon: 'table' },
      { cmd: 'table:cell-props', label: '표/셀\n속성', icon: 'cell-props' },
      {
        label: '셀 테두리/\n배경', icon: 'cell-border', items: [
          { cmd: 'table:border-each', label: '각 셀마다 적용' },
          { cmd: 'table:border-one', label: '하나의 셀처럼 적용' },
        ],
      },
    ],
    [
      { cmd: 'table:insert-row-col', label: '줄/칸\n추가하기', icon: 'row-below' },
      { cmd: 'table:insert-row-above', label: '위쪽에 줄 추가', icon: 'row-above', small: true },
      { cmd: 'table:insert-row-below', label: '아래쪽에 줄 추가', icon: 'row-below', small: true },
      { cmd: 'table:insert-col-left', label: '왼쪽에 칸 추가', icon: 'col-left', small: true },
      { cmd: 'table:insert-col-right', label: '오른쪽에 칸 추가', icon: 'col-right', small: true },
      { cmd: 'table:delete-row-col', label: '줄/칸\n지우기', icon: 'row-col-delete' },
      { cmd: 'table:delete-row', label: '줄 지우기', small: true },
      { cmd: 'table:delete-col', label: '칸 지우기', small: true },
    ],
    [
      { cmd: 'table:cell-split', label: '셀\n나누기', icon: 'cell-split' },
      { cmd: 'table:cell-merge', label: '셀\n합치기', icon: 'cell-merge' },
      { cmd: 'table:cell-height-equal', label: '셀 높이를 같게', icon: 'height-equal', small: true },
      { cmd: 'table:cell-width-equal', label: '셀 너비를 같게', icon: 'width-equal', small: true },
    ],
    [
      { cmd: 'table:block-formula', label: '계산식', icon: 'formula' },
      { cmd: 'table:block-sum', label: '블록 합계', small: true },
      { cmd: 'table:block-avg', label: '블록 평균', small: true },
      { cmd: 'table:block-product', label: '블록 곱', small: true },
      { cmd: 'table:thousand-sep', label: '1,000 단위 쉼표', small: true },
      { cmd: 'table:decimal-add', label: '자릿점 넣기', small: true },
      { cmd: 'table:decimal-remove', label: '자릿점 빼기', small: true },
    ],
    [
      { cmd: 'table:transpose-copy', label: '행/열 바꿈 복사', icon: 'transpose', small: true },
      { cmd: 'table:transpose-paste', label: '행/열 바꿈 붙여넣기', icon: 'transpose', small: true },
      { cmd: 'table:delete', label: '표 지우기', icon: 'table-delete', small: true },
    ],
  ],
};

const SMALL_ROWS = 3;

export interface RibbonTabs {
  select(menuName: string): void;
}

const isMenu = (item: RibbonItem): item is RibbonMenu => !('cmd' in item);

export function initRibbonTabs(
  menuBar: HTMLElement,
  iconToolbar: HTMLElement,
  dispatcher: CommandDispatcher,
  eventBus: EventBus,
  /** 등록되지 않은 명령(예: embed 에서 뺀 문서 비교)은 단추를 만들지 않는다 */
  isRegistered: (commandId: string) => boolean = () => true,
): RibbonTabs {
  const viewport = iconToolbar.querySelector<HTMLElement>('#icon-toolbar-viewport');
  const panel = document.createElement('div');
  panel.id = 'ribbon-tab-panel';
  panel.className = 'tb-tab-panel';
  panel.setAttribute('role', 'toolbar');
  viewport?.after(panel);

  let active = DEFAULT_RIBBON_TAB;
  let popup: HTMLElement | null = null;
  /** 펼침 단추 → 그 목록 (data-menu-index 로 찾는다) */
  let menus: RibbonMenu[] = [];

  const menuOf = (name: string) =>
    menuBar.querySelector<HTMLElement>(`.menu-item[data-menu="${name}"]`);

  /** 세로 메뉴의 하위 메뉴 패널 — 이름이 아니라 data-i18n 키로 찾아 언어와 무관하다 */
  const subPanelOf = (sub: { menu: string; labelKey: string }) => {
    const label = menuOf(sub.menu)?.querySelector(`.md-sub > .md-label[data-i18n="${sub.labelKey}"]`);
    return label?.parentElement?.querySelector<HTMLElement>(':scope > .md-sub-panel') ?? null;
  };

  const cmdsOfMenu = (m: RibbonMenu): string[] => {
    if (m.items) return m.items.map((i) => i.cmd);
    const panelEl = m.sub ? subPanelOf(m.sub) : null;
    return panelEl
      ? Array.from(panelEl.querySelectorAll<HTMLElement>('.md-item[data-cmd]')).map((el) => el.dataset.cmd!)
      : [];
  };

  const closePopup = () => {
    popup?.remove();
    popup = null;
  };

  const refreshStates = () => {
    if (panel.hidden) return;
    for (const el of panel.querySelectorAll<HTMLElement>('[data-cmd]')) {
      el.classList.toggle('disabled', !dispatcher.isEnabled(el.dataset.cmd!));
    }
    for (const el of panel.querySelectorAll<HTMLElement>('[data-menu-index]')) {
      const m = menus[Number(el.dataset.menuIndex)];
      el.classList.toggle('disabled', !m || !cmdsOfMenu(m).some((c) => dispatcher.isEnabled(c)));
    }
  };

  const dispatchFrom = (el: HTMLElement) => {
    const params: Record<string, unknown> = { anchorEl: el };
    for (const [key, val] of Object.entries(el.dataset)) {
      if (key !== 'cmd') params[key] = val;
    }
    dispatcher.dispatch(el.dataset.cmd!, params);
  };

  const menuItemEl = (item: RibbonCommand): HTMLElement => {
    const row = document.createElement('div');
    row.className = 'md-item';
    row.dataset.cmd = item.cmd;
    const icon = document.createElement('span');
    icon.className = `md-icon${item.icon ? ` icon-${item.icon}` : ''}`;
    const label = document.createElement('span');
    label.className = 'md-label';
    label.textContent = item.label;
    row.append(icon, label);
    return row;
  };

  const openMenu = (button: HTMLElement) => {
    closePopup();
    const m = menus[Number(button.dataset.menuIndex)];
    if (!m) return;
    // 도구 상자는 overflow:hidden 이라 펼침 목록은 body 에 띄운다
    popup = document.createElement('div');
    popup.className = 'menu-dropdown tb-ribbon-popup';
    popup.setAttribute('role', 'menu');
    if (m.items) {
      for (const item of m.items) popup.appendChild(menuItemEl(item));
    } else if (m.sub) {
      // 머리말·단·테마처럼 세로 메뉴에 이미 있는 하위 메뉴는 그대로 복사한다(서식 갈래 포함)
      const source = subPanelOf(m.sub);
      for (const child of Array.from(source?.children ?? [])) popup.appendChild(child.cloneNode(true));
    }
    for (const el of popup.querySelectorAll<HTMLElement>('.md-item[data-cmd]')) {
      el.classList.toggle('disabled', !dispatcher.isEnabled(el.dataset.cmd!));
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

  const labelEl = (text: string): HTMLElement => {
    const span = document.createElement('span');
    span.className = 'tb-label';
    text.split('\n').forEach((line, i) => {
      if (i) span.appendChild(document.createElement('br'));
      span.appendChild(document.createTextNode(line));
    });
    return span;
  };

  const iconEl = (item: { icon?: string; glyph?: string }): HTMLElement | null => {
    if ('glyph' in item && item.glyph) {
      const g = document.createElement('span');
      g.className = 'tb-icon-text tb-glyph';
      g.textContent = item.glyph;
      return g;
    }
    if (!item.icon) return null;
    const s = document.createElement('span');
    s.className = `tb-sprite icon-${item.icon}`;
    return s;
  };

  const buttonFor = (item: RibbonItem): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    const flat = item.label.replace(/\n/g, ' ').replace(/\/ /g, '/');
    button.title = flat;
    const small = item.small || (!isMenu(item) && item.check);
    if (isMenu(item)) {
      menus.push(item);
      button.dataset.menuIndex = String(menus.length - 1);
      button.setAttribute('aria-haspopup', 'menu');
    } else {
      button.dataset.cmd = item.cmd;
      // 조판 부호처럼 켜고 끄는 항목은 메뉴 쪽 표시를 이어받는다 (이후엔 명령이 [data-cmd] 전체를 갱신)
      if (menuBar.querySelector(`.md-item[data-cmd="${item.cmd}"].active`)) button.classList.add('active');
    }
    if (small) {
      button.classList.add('tb-small');
      if (!isMenu(item) && item.check) {
        button.classList.add('tb-check');
        const box = document.createElement('span');
        box.className = 'tb-checkbox';
        button.appendChild(box);
      } else {
        const icon = iconEl(item);
        if (icon) button.appendChild(icon);
      }
      button.appendChild(document.createTextNode(isMenu(item) ? `${flat} ▾` : flat));
    } else {
      button.classList.add('tb-btn');
      const icon = iconEl(item);
      if (icon) button.appendChild(icon);
      button.appendChild(labelEl(isMenu(item) ? `${item.label} ▾` : item.label));
    }
    return button;
  };

  const build = (name: string) => {
    panel.replaceChildren();
    menus = [];
    panel.setAttribute('aria-label', (menuOf(name)?.querySelector('.menu-title')?.textContent ?? '').trim());
    const groups = (RIBBONS[name] ?? [])
      .map((group) => group
        .map((item) => (isMenu(item) && item.items
          ? { ...item, items: item.items.filter((i) => isRegistered(i.cmd)) }
          : item))
        .filter((item) => (isMenu(item)
          ? (item.items ? item.items.length > 0 : !!(item.sub && subPanelOf(item.sub)))
          : isRegistered(item.cmd))))
      .filter((group) => group.length > 0);
    groups.forEach((group, gi) => {
      if (gi) {
        const sep = document.createElement('span');
        sep.className = 'tb-sep';
        panel.appendChild(sep);
      }
      let stack: HTMLElement | null = null;
      for (const item of group) {
        const button = buttonFor(item);
        if (button.classList.contains('tb-small')) {
          if (!stack || stack.childElementCount >= SMALL_ROWS) {
            stack = document.createElement('div');
            stack.className = 'tb-stack';
            panel.appendChild(stack);
          }
          stack.appendChild(button);
        } else {
          stack = null;
          panel.appendChild(button);
        }
      }
    });
  };

  /** 머리말·주석 편집 모드면 원래 도구 상자를, 아니면 탭 도구 묶음을 보인다 */
  const modeGroups = iconToolbar.querySelectorAll<HTMLElement>('.tb-headerfooter-group, .tb-note-group');
  const inEditMode = () => Array.from(modeGroups).some((g) => !g.hidden);
  const applyVisibility = () => {
    const mode = inEditMode();
    if (viewport) viewport.hidden = !mode;
    panel.hidden = mode;
    if (!mode) refreshStates();
  };

  const select = (name: string, fromUser = true) => {
    const menu = menuOf(name);
    if (!menu || MENU_ONLY_TABS.has(name)) return;
    closePopup();
    active = name;
    for (const item of menuBar.querySelectorAll('.menu-item')) {
      item.classList.toggle('tab-active', item === menu);
    }
    // 도구 상자를 접어 두었으면 탭을 고를 때 편다 (한컴과 같다)
    if (fromUser && document.documentElement.dataset.toolboxBasic === 'hidden') {
      dispatcher.dispatch('view:toolbox-basic');
    }
    build(name);
    applyVisibility();
  };

  panel.addEventListener('mousedown', (e) => {
    // 문서의 선택 영역을 지킨다
    e.preventDefault();
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-menu-index]');
    if (target && !target.classList.contains('disabled')) openMenu(target);
  });
  panel.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-cmd]');
    if (!target || target.classList.contains('disabled')) return;
    dispatchFrom(target);
  });
  panel.addEventListener('mouseenter', refreshStates);
  // 창이 좁아 단추가 넘치면 세로 휠로 좌우 이동한다 (스크롤바는 숨김)
  panel.addEventListener('wheel', (e) => {
    if (panel.scrollWidth <= panel.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    panel.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('mousedown', (e) => {
    // 펼침 단추 자신의 mousedown 은 여기까지 올라오므로, 방금 연 목록을 닫지 않게 거른다
    const target = e.target as HTMLElement;
    if (popup && !popup.contains(target) && !target.closest?.('#ribbon-tab-panel [data-menu-index]')) closePopup();
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

  const observer = new MutationObserver(applyVisibility);
  for (const group of modeGroups) observer.observe(group, { attributes: true, attributeFilter: ['hidden'] });

  select(active, false);
  return { select };
}
