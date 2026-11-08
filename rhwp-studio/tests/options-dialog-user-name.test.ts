import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(here, '..', rel), 'utf8');

test('환경 설정에 「일반」 탭과 사용자 이름 입력이 있고 확인 시 review 설정에 저장한다', () => {
  const src = read('src/ui/options-dialog.ts');
  assert.match(src, /dataset\.tab = 'general'/);
  assert.match(src, /dialog\.options\.userName\.label/);
  assert.match(src, /dialog\.options\.userName\.hint/);
  const onConfirm = src.slice(src.indexOf('protected onConfirm()'));
  assert.match(onConfirm, /updateReviewSettings\(\{\s*userName/);
});

test('일반 탭 i18n 키가 ko/en 양쪽에 있다', () => {
  for (const locale of ['ko', 'en']) {
    const src = read(`src/i18n/locales/${locale}.ts`);
    for (const key of ['dialog.options.tabGeneral.text', 'dialog.options.userName.label', 'dialog.options.userName.hint']) {
      assert.ok(src.includes(`"${key}"`), `${locale}: ${key}`);
    }
  }
});
