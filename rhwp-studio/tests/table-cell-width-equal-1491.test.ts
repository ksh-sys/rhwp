import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function source(path: string): string {
  return readFileSync(join(rootDir, path), 'utf8');
}

function commandBlock(commandId: string): string {
  const tableCmd = source('src/command/commands/table.ts');
  const start = tableCmd.indexOf(`id: '${commandId}'`);
  assert.notEqual(start, -1, `${commandId} command not found`);
  const end = tableCmd.indexOf('\n  {', start + 1);
  assert.notEqual(end, -1, `${commandId} command end not found`);
  return tableCmd.slice(start, end);
}

// #1491 에서는 행 단위 폭 delta 합이 반올림으로 0 이 아니게 되어 렌더러가 전역 격자로 되돌렸다.
// 지금은 셀마다 저장되는 크기만 바꾸고(줄 폭 합 보존 — table-cell-equalize.test.ts), 저장 불가능한
// local projection 이나 막는 안내 없이 InputHandler 의 undo 경로 한 곳으로만 적용한다.
for (const [commandId, axis] of [['table:cell-width-equal', 'width'], ['table:cell-height-equal', 'height']]) {
  test(`${commandId}은 셀 블록에서만 켜지고 저장 가능한 셀 크기 경로 하나로 적용된다`, () => {
    const block = commandBlock(commandId);
    assert.match(block, /canExecute:\s*canEqualizeCells/);
    assert.match(block, new RegExp(`equalizeSelectedCells\\('${axis}'\\)`));
    assert.doesNotMatch(block, /showToast|localResize|renderWidth|renderHeight|resizeTableCells/);
  });
}

test('균등화는 여러 칸을 고른 셀 블록에서만 실행된다', () => {
  const tableCmd = source('src/command/commands/table.ts');
  assert.match(tableCmd, /const canEqualizeCells = \(ctx: EditorContext\) => ctx\.inCellSelectionMode && ctx\.hasMultiCellSelection/);
});

test('균등화 적용은 executeOperation snapshot 안에서 resizeTableCells(경로 포함) 한 번이다', () => {
  const handler = source('src/engine/input-handler-table.ts');
  const start = handler.indexOf('export function equalizeSelectedCells');
  assert.notEqual(start, -1);
  const body = handler.slice(start, handler.indexOf('\n}\n', start));
  assert.match(body, /kind: 'snapshot'/);
  assert.match(body, /wasm\.resizeTableCellsByPath\(/);
  assert.match(body, /wasm\.resizeTableCells\(/);
  assert.doesNotMatch(body, /localResize/);
});
