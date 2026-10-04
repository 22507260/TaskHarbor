import { test, expect, type Page } from '@playwright/test';
async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workflow', exact: true }).click();
}
async function add(page: Page, type: string, label: string) {
  await page
    .getByRole('complementary', { name: 'Task palette' })
    .getByRole('button', { name: type, exact: true })
    .click();
  await page.getByRole('textbox', { name: 'Step label', exact: true }).fill(label);
  await page.getByRole('textbox', { name: 'Step label', exact: true }).blur();
}
test('branching workflow saves and executes through the actual worker', async ({
  page,
  request,
}) => {
  await open(page);
  await page.getByRole('textbox', { name: 'Workflow name' }).fill('Studio branch demo');
  await add(page, 'JSON transform', 'Prepare');
  await page
    .getByRole('textbox', { name: 'Fields to merge (JSON object)' })
    .fill('{"prepared":true}');
  await add(page, 'JSON transform', 'Left branch');
  await page.getByRole('textbox', { name: 'Fields to merge (JSON object)' }).fill('{"left":true}');
  await page.getByLabel('Add dependency', { exact: true }).selectOption('step_1');
  await add(page, 'JSON transform', 'Right branch');
  await page.getByRole('textbox', { name: 'Fields to merge (JSON object)' }).fill('{"right":true}');
  await page.getByLabel('Add dependency', { exact: true }).selectOption('step_1');
  await add(page, 'JSON transform', 'Join');
  await page
    .getByRole('textbox', { name: 'Fields to merge (JSON object)' })
    .fill('{"joined":true}');
  await page.getByLabel('Add dependency', { exact: true }).selectOption('step_2');
  await page.getByLabel('Add dependency', { exact: true }).selectOption('step_3');
  await page.getByRole('button', { name: 'Auto layout', exact: true }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(4);
  await page.getByRole('button', { name: 'Create workflow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Studio branch demo', exact: true })).toBeVisible();
  const workflows = await (await request.get('/api/workflows')).json();
  const workflow = workflows.find((w: { name: string }) => w.name === 'Studio branch demo');
  const run = await (
    await request.post(`/api/workflows/${workflow.id}/runs`, { data: { input: { order: 'demo' } } })
  ).json();
  await expect
    .poll(async () => (await (await request.get(`/api/runs/${run.id}`)).json()).status)
    .toBe('succeeded');
  const completed = await (await request.get(`/api/runs/${run.id}`)).json();
  expect(completed.jobs.find((j: { step_id: string }) => j.step_id === 'step_4').output).toEqual({
    order: 'demo',
    prepared: true,
    left: true,
    right: true,
    joined: true,
  });
  await page.getByRole('button', { name: 'Runs', exact: true }).click();
  await page.getByRole('button', { name: 'Studio branch demo', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Join');
});
test('invalid connections and JSON show errors; undo and redo restore grouped edits', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('textbox', { name: 'Workflow name' }).fill('Validation demo');
  await add(page, 'JSON transform', 'First');
  await add(page, 'Delay', 'Second');
  await page.getByLabel('Add dependency', { exact: true }).selectOption('step_1');
  await page.locator('.studio-step-list').getByRole('button', { name: 'First' }).click();
  await page.getByLabel('Add dependency', { exact: true }).selectOption('step_2');
  await expect(page.getByRole('alert')).toContainText('cycle');
  await page.getByRole('textbox', { name: 'Fields to merge (JSON object)' }).fill('{broken');
  await page.getByRole('textbox', { name: 'Fields to merge (JSON object)' }).blur();
  await expect(page.getByLabel('Validation issues')).toContainText('valid JSON');
  await page.getByRole('button', { name: 'Undo edit' }).click();
  await expect(page.getByRole('textbox', { name: 'Fields to merge (JSON object)' })).toHaveValue(
    '{}',
  );
  await page.getByRole('button', { name: 'Redo edit' }).click();
  await expect(page.getByRole('textbox', { name: 'Fields to merge (JSON object)' })).toHaveValue(
    '{broken',
  );
});
test('draft resumes after reload, including incomplete JSON; successful save removes it', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('textbox', { name: 'Workflow name' }).fill('Recovered draft');
  await add(page, 'JSON transform', 'Draft task');
  await page.getByRole('textbox', { name: 'Fields to merge (JSON object)' }).fill('{unfinished');
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved locally' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'New workflow', exact: true }).click();
  await page.getByRole('button', { name: 'Continue draft', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Workflow name' })).toHaveValue('Recovered draft');
  await expect(page.getByRole('textbox', { name: 'Fields to merge (JSON object)' })).toHaveValue(
    '{unfinished',
  );
  await page
    .getByRole('textbox', { name: 'Fields to merge (JSON object)' })
    .fill('{"recovered":true}');
  await page.getByRole('button', { name: 'Create workflow', exact: true }).click();
  await page.getByRole('button', { name: 'New workflow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue draft' })).toHaveCount(0);
});
test('historical copy uses the source revision and creates a fresh workflow', async ({
  page,
  request,
}) => {
  const created = await (
    await request.post('/api/workflows', {
      data: {
        name: 'Copy source',
        steps: [
          {
            id: 'prepare',
            name: 'Original task',
            type: 'transform',
            config: { fields: { version: 1 } },
          },
        ],
      },
    })
  ).json();
  await request.put(`/api/workflows/${created.id}`, {
    data: {
      expectedVersion: 1,
      name: 'Copy source',
      steps: [
        {
          id: 'prepare',
          name: 'Changed task',
          type: 'transform',
          config: { fields: { version: 2 } },
        },
      ],
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Copy source', exact: true }).click();
  await page.getByText(/Version 1 · Copy source/).click();
  await page.getByRole('button', { name: 'Copy version 1 to new workflow' }).click();
  await expect(page.getByRole('textbox', { name: 'Step label' })).toHaveValue('Original task');
  await page.getByRole('button', { name: 'Create workflow', exact: true }).click();
  const all = await (await request.get('/api/workflows')).json();
  const copy = all.find((w: { name: string }) => w.name === 'Copy source (v1 copy)');
  expect(copy.id).not.toBe(created.id);
  expect(copy.version).toBe(1);
});
test('stale save preserves draft and can create an independent workflow', async ({
  page,
  request,
}) => {
  const source = await (
    await request.post('/api/workflows', {
      data: { name: 'Conflict source', steps: [{ id: 'one', name: 'One', type: 'delay' }] },
    })
  ).json();
  await page.goto('/');
  await page.getByRole('button', { name: 'Conflict source', exact: true }).click();
  await page.getByRole('button', { name: 'Edit latest version' }).click();
  await page.getByRole('textbox', { name: 'Workflow name' }).fill('Preserved conflicting draft');
  await request.put(`/api/workflows/${source.id}`, {
    data: { expectedVersion: 1, name: 'Conflict updated', steps: source.steps },
  });
  await page.getByRole('button', { name: 'Save version', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'newer version' })).toBeVisible();
  await page.getByRole('button', { name: 'Save draft as new workflow' }).click();
  await expect(
    page.getByRole('button', { name: 'Preserved conflicting draft', exact: true }),
  ).toBeVisible();
  expect((await (await request.get(`/api/workflows/${source.id}`)).json()).name).toBe(
    'Conflict updated',
  );
});
test('390px editor supports keyboard forms and has no document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByRole('button', { name: 'Tasks & steps', exact: true }).click();
  await add(page, 'Delay', 'Mobile task');
  await page.getByRole('textbox', { name: 'Workflow name' }).fill('Mobile workflow');
  await page.getByRole('textbox', { name: 'Workflow name' }).press('Tab');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Create workflow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mobile workflow', exact: true })).toBeVisible();
});
test('canvas handles connect nodes and a completed node drag is one undo operation', async ({
  page,
}) => {
  await open(page);
  await add(page, 'Delay', 'Canvas first');
  await add(page, 'Delay', 'Canvas second');
  await page.getByRole('button', { name: 'Auto layout', exact: true }).click();
  const first = page.locator('.react-flow__node[data-id="step_1"]');
  const second = page.locator('.react-flow__node[data-id="step_2"]');
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect(first).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 16, 22.4)');
  await expect(second).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 16, 156.8)');
  await page.getByRole('button', { name: 'Fit View', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  // Locator actions wait for the handle's screen position to stabilize after fit-view.
  // Precomputed bounding boxes race the asynchronous camera update on fast CI hosts.
  await first.locator('.react-flow__handle.source').hover();
  await page.mouse.down();
  await second.locator('.react-flow__handle.target').hover();
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  const before = await first.evaluate((node) => (node as HTMLElement).style.transform);
  const bounds = await first.boundingBox();
  await page.mouse.move(bounds!.x + 50, bounds!.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 95, bounds!.y + 90, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(() => first.evaluate((node) => (node as HTMLElement).style.transform))
    .not.toBe(before);
  await page.getByRole('button', { name: 'Undo edit' }).click();
  await expect
    .poll(() => first.evaluate((node) => (node as HTMLElement).style.transform))
    .toBe(before);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo edit' }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
});
test('storage failure stays visible and successful creation cannot be submitted twice', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Test storage denial');
    };
  });
  await open(page);
  await page.getByRole('textbox', { name: 'Workflow name' }).fill('Storage denied workflow');
  await add(page, 'Delay', 'Safe task');
  await expect(page.getByRole('alert')).toContainText('Draft could not be saved');
  await page.getByRole('button', { name: 'Create workflow', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workflow saved', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create workflow', exact: true })).toHaveCount(0);
});
test('failed save retains draft and opening a stale local edit offers explicit conflict choices', async ({
  page,
  request,
}) => {
  const source = await (
    await request.post('/api/workflows', {
      data: { name: 'Resume conflict', steps: [{ id: 'one', name: 'One', type: 'delay' }] },
    })
  ).json();
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume conflict', exact: true }).click();
  await page.getByRole('button', { name: 'Edit latest version' }).click();
  await page.getByRole('textbox', { name: 'Workflow name' }).fill('Local old draft');
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved locally' })).toBeVisible();
  await page.route(`**/api/workflows/${source.id}`, async (route) => {
    if (route.request().method() === 'PUT')
      await route.fulfill({ status: 500, json: { error: 'Test write failure' } });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Save version', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Test write failure');
  await request.put(`/api/workflows/${source.id}`, {
    data: { expectedVersion: 1, name: 'Resume updated', steps: source.steps },
  });
  await page.reload();
  await page.getByRole('button', { name: 'Resume updated', exact: true }).click();
  await page.getByRole('button', { name: 'Edit latest version' }).click();
  await page.getByRole('button', { name: 'Continue draft' }).click();
  await expect(page.getByRole('textbox', { name: 'Workflow name' })).toHaveValue('Local old draft');
  await expect(page.getByRole('button', { name: 'Save draft as new workflow' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard draft and reload latest' }).click();
  await expect(page.getByRole('textbox', { name: 'Workflow name' })).toHaveValue('Resume updated');
});
test('saving only canvas position preserves the workflow version', async ({ page, request }) => {
  const source = await (
    await request.post('/api/workflows', {
      data: { name: 'Layout only', steps: [{ id: 'one', name: 'One', type: 'delay' }] },
    })
  ).json();
  await page.goto('/');
  await page.getByRole('button', { name: 'Layout only', exact: true }).click();
  await page.getByRole('button', { name: 'Edit latest version' }).click();
  const node = page.locator('.react-flow__node[data-id="one"]');
  await expect(node).toBeVisible();
  const box = await node.boundingBox();
  await page.mouse.move(box!.x + 50, box!.y + 30);
  await page.mouse.down();
  await page.mouse.move(box!.x + 85, box!.y + 70, { steps: 8 });
  await page.mouse.up();
  const moved = await node.getAttribute('style');
  await page.getByRole('button', { name: 'Save version', exact: true }).click();
  expect((await (await request.get(`/api/workflows/${source.id}`)).json()).version).toBe(1);
  await page.getByRole('button', { name: 'Layout only', exact: true }).click();
  await page.getByRole('button', { name: 'Edit latest version' }).click();
  await expect(node).toHaveAttribute('style', moved!);
});
test('palette drag, keyboard movement and deletion are accessible and reversible', async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole('complementary', { name: 'Task palette' })
    .getByRole('button', { name: 'Delay', exact: true })
    .dragTo(page.getByLabel('Workflow canvas', { exact: true }));
  const node = page.locator('.react-flow__node');
  await expect(node).toHaveCount(1);
  await expect(node).toBeVisible();
  const before = await node.evaluate((n) => (n as HTMLElement).style.transform);
  await node.press('ArrowRight');
  await expect
    .poll(() => node.evaluate((n) => (n as HTMLElement).style.transform))
    .not.toBe(before);
  await node.press('Control+z');
  await expect.poll(() => node.evaluate((n) => (n as HTMLElement).style.transform)).toBe(before);
  await node.press('Delete');
  await expect(node).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo edit' }).click();
  await expect(node).toHaveCount(1);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).press('Shift+Tab');
  await expect(page.getByRole('dialog')).toBeVisible();
});
