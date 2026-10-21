import test from "node:test";
import assert from "node:assert/strict";
import { sleep } from "./timer.ts";

test("sleep 正常延时解析", async () => {
  const start = Date.now();
  await sleep(60);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 50, `预期耗时 >= 50ms，实际耗时: ${elapsed}ms`);
});

test("sleep 支持 AbortSignal 提前中止", async () => {
  const controller = new AbortController();
  const start = Date.now();

  setTimeout(() => {
    controller.abort();
  }, 50);

  // 计划等待 5 秒，但应在 50ms 左右因 abort 提前结束
  await sleep(5000, controller.signal);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 1000, `应在 1000ms 内提前中止，实际耗时: ${elapsed}ms`);
});

test("sleep 接收已中止的 signal 时立即返回", async () => {
  const controller = new AbortController();
  controller.abort();

  const start = Date.now();
  await sleep(5000, controller.signal);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 100, `已中止 signal 应在 100ms 内立即返回，实际耗时: ${elapsed}ms`);
});

test("多题并发独立重试场景下的 AbortController 隔离性验证（中止单题不影响另一题）", async () => {
  const stepAbortControllers = new Map();
  stepAbortControllers.set(0, new AbortController());
  stepAbortControllers.set(1, new AbortController());

  // 模拟题 0 重新发起重试，中断题 0 的旧 controller
  stepAbortControllers.get(0)?.abort();
  stepAbortControllers.set(0, new AbortController());

  assert.equal(stepAbortControllers.get(0)?.signal.aborted, false);
  assert.equal(stepAbortControllers.get(1)?.signal.aborted, false);

  // 验证题 1 仍在独立运行不受影响
  let step1Finished = false;
  const task1 = sleep(60, stepAbortControllers.get(1)?.signal).then(() => {
    step1Finished = true;
  });

  // 中止题 0，题 1 必须不受影响成功完成
  stepAbortControllers.get(0)?.abort();
  await task1;
  assert.equal(step1Finished, true);
  assert.equal(stepAbortControllers.get(0)?.signal.aborted, true);
  assert.equal(stepAbortControllers.get(1)?.signal.aborted, false);
});
