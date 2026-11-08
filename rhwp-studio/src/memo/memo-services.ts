/**
 * 메모 저장소·레이어에 대한 명령 쪽 접근자 — main.ts 가 생성 직후 등록한다.
 * CommandServices 에 필드를 늘리지 않고 검토 명령만 쓰는 의존을 한 곳에 둔다.
 */
import type { MemoLayer } from './memo-layer.ts';
import type { MemoStore } from './memo-store.ts';

export interface MemoServices {
  store: MemoStore;
  layer: MemoLayer;
}

let current: MemoServices | null = null;

export function setMemoServices(services: MemoServices | null): void {
  current = services;
}

export function getMemoServices(): MemoServices | null {
  return current;
}
