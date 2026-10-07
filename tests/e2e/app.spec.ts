import { expect, test, type Page } from '@playwright/test'

/** Reads every care event straight out of IndexedDB. */
async function readEvents(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('tinytracker')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const read = (store: string) =>
      new Promise<unknown[]>((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    return {
      events: (await read('events')) as Record<string, unknown>[],
      outbox: (await read('outbox')) as Record<string, unknown>[],
    }
  })
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  ;(page as unknown as { _errors: string[] })._errors = errors
})

test.afterEach(async ({ page }) => {
  const errors = (page as unknown as { _errors: string[] })._errors ?? []
  expect(errors, 'no console or page errors').toEqual([])
})

test('logs a nursing feed through the full timer state machine', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('No feeds yet')).toBeVisible()
  await page.getByRole('button', { name: /^LEFT/ }).click()

  const timer = page.getByRole('timer')
  await expect(timer).toBeVisible()
  await expect(timer).toHaveText(/^0:0\d$/)

  // Pause freezes the clock.
  await page.getByRole('button', { name: 'Pause' }).click()
  const frozen = await timer.textContent()
  await page.waitForTimeout(1500)
  expect(await timer.textContent()).toBe(frozen)

  // Switching sides implicitly resumes.
  await page.getByRole('button', { name: /Switch to Right/ }).click()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()

  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  // "Keep feeding" must return to the running timer, not lose the feed.
  await page.getByRole('button', { name: 'Keep feeding' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(timer).toBeVisible()

  await page.getByRole('button', { name: 'Stop' }).click()
  await page.getByRole('button', { name: 'Save feed' }).click()

  await expect(page.getByRole('button', { name: /^LEFT/ })).toBeVisible()
  await expect(page.locator('header')).toContainText('Right')

  const { events, outbox } = await readEvents(page)
  expect(events).toHaveLength(1)
  expect(events[0].kind).toBe('nursing')
  expect(events[0].lastSide).toBe('right')
  expect(events[0].deletedAt).toBeNull()
  // Every local write is queued for the server.
  expect(outbox).toHaveLength(1)
})

test('discarding a feed saves nothing', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^RIGHT/ }).click()
  await page.getByRole('button', { name: 'Stop' }).click()
  await page.getByRole('button', { name: 'Discard' }).click()

  await expect(page.getByRole('button', { name: /^LEFT/ })).toBeVisible()
  const { events } = await readEvents(page)
  expect(events).toHaveLength(0)
})

test('a running feed survives a reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^LEFT/ }).click()
  await page.waitForTimeout(2200)

  await page.reload()

  const timer = page.getByRole('timer')
  await expect(timer).toBeVisible()
  // Elapsed is derived from timestamps, so it kept counting across the reload.
  const seconds = Number((await timer.textContent())!.split(':')[1])
  expect(seconds).toBeGreaterThanOrEqual(2)
})

test('theme toggles, persists, and repaints the status bar', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day')

  await page.getByRole('button', { name: /night mode/i }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    '#000000',
  )

  await page.reload()
  // No flash: the inline bootstrap sets the attribute before first paint.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
})

test('logs bottle, pump and diaper entries', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('link', { name: 'Diaper' }).click()
  await page.getByRole('button', { name: 'Both' }).click()

  await page.getByRole('link', { name: 'Bottle' }).click()
  await page.getByRole('button', { name: 'Increase Amount' }).click()
  await page.getByRole('button', { name: 'Log bottle' }).click()

  await page.getByRole('link', { name: 'Pump' }).click()
  await page.getByRole('button', { name: 'Increase Left' }).click()
  await page.getByRole('button', { name: 'Log pumping' }).click()

  const { events } = await readEvents(page)
  expect(events.map((e) => e.kind).sort()).toEqual(['bottle', 'diaper', 'pump'])

  const bottle = events.find((e) => e.kind === 'bottle')!
  expect(bottle.amountMl).toBe(70) // 60 default + one 10 ml step

  await page.getByRole('link', { name: 'History' }).click()
  await expect(page.getByText('Today')).toBeVisible()
  await expect(page.getByText('Wet + dirty')).toBeVisible()
})

test('history tabs split feeds, pumping and diapers', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Diaper' }).click()
  await page.getByRole('button', { name: 'Wet' }).click()
  await page.getByRole('link', { name: 'Bottle' }).click()
  await page.getByRole('button', { name: 'Log bottle' }).click()

  await page.getByRole('link', { name: 'History' }).click()
  await expect(page.getByRole('listitem')).toHaveCount(2)

  await page.getByRole('button', { name: 'Feeding' }).click()
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.locator('li')).toContainText('Bottle')

  await page.getByRole('button', { name: 'Diapers' }).click()
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.locator('li')).toContainText('Diaper')

  await page.getByRole('button', { name: 'Pumping' }).click()
  await expect(page.getByText('No pumping sessions yet.')).toBeVisible()
})

test('deleting from history tombstones rather than dropping the row', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Diaper' }).click()
  await page.getByRole('button', { name: 'Wet' }).click()

  await page.getByRole('link', { name: 'History' }).click()
  await page.locator('li').getByRole('button', { name: /Diaper/ }).first().click()
  await page.getByRole('button', { name: 'Delete entry' }).click()
  // Deletion is two-step: nothing destructive is ever a single tap.
  await page.getByRole('button', { name: 'Tap again to confirm delete' }).click()

  await expect(page.getByText('No logs yet.')).toBeVisible()

  const { events } = await readEvents(page)
  expect(events).toHaveLength(1)
  // The tombstone must persist so the delete can replicate to the partner.
  expect(events[0].deletedAt).not.toBeNull()
})

test('works with no network at all', async ({ page, context }) => {
  await page.goto('/')
  await page.waitForTimeout(1200) // let the service worker take control

  await context.setOffline(true)
  await page.goto('/')

  await expect(page.getByRole('button', { name: /^LEFT/ })).toBeVisible()

  await page.getByRole('link', { name: 'Diaper' }).click()
  await page.getByRole('button', { name: 'Wet' }).click()

  const { events, outbox } = await readEvents(page)
  expect(events).toHaveLength(1)
  // Queued, not lost: it will push when the network returns.
  expect(outbox).toHaveLength(1)

  await context.setOffline(false)
})

test('editing an entry corrects its time and re-queues it', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Bottle' }).click()
  await page.getByRole('button', { name: 'Log bottle' }).click()

  await page.getByRole('link', { name: 'History' }).click()
  await page.locator('li').getByRole('button', { name: /Bottle/ }).first().click()

  const field = page.locator('input[type="datetime-local"]')
  await expect(field).toBeVisible()
  await field.fill('2026-09-06T02:14')
  await page.getByRole('button', { name: 'Increase Amount' }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByText('02:14')).toBeVisible()

  const { events, outbox } = await readEvents(page)
  expect(events).toHaveLength(1)
  expect(events[0].amountMl).toBe(70)
  expect(new Date(events[0].startedAt as number).getHours()).toBe(2)
  // The create and the edit are both queued for the partner's device.
  expect(outbox).toHaveLength(2)
})


/**
 * Seeds two children into the local mirror, as a family sync would.
 *
 * Writing straight to IndexedDB keeps the twins path testable with no
 * Supabase: the babies table is a mirror, so seeding it is exactly what a
 * pull does.
 */
async function seedTwins(page: Page) {
  // Opening with no version would CREATE an empty v1 database if the app has
  // not finished its own open yet, and the babies store would not exist.
  await page.waitForFunction(async () => {
    const dbs = await indexedDB.databases()
    return dbs.some((d) => d.name === 'tinytracker' && (d.version ?? 0) >= 3)
  })
  await page.evaluate(async () => {
    const familyId = localStorage.getItem('tt.familyId')!
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('tinytracker')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('babies', 'readwrite')
      const store = tx.objectStore('babies')
      store.put({ id: 'baby-ada', familyId, name: 'Ada', bornAt: null })
      store.put({ id: 'baby-bo', familyId, name: 'Bo', bornAt: null })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
    localStorage.setItem('tt.babyId', 'baby-ada')
  })
}

test('twins: the header chip picks which child a log belongs to', async ({ page }) => {
  await page.goto('/')
  await seedTwins(page)
  await page.reload()

  const chip = page.getByRole('button', { name: /Logging for/ })
  await expect(chip).toHaveText('Ada')

  await page.getByRole('link', { name: 'Diaper' }).click()
  await page.getByRole('button', { name: 'Both' }).click()

  // Logging a diaper returns to the home screen, where the chip lives.
  await chip.click()
  await expect(chip).toHaveText('Bo')

  await page.getByRole('link', { name: 'Diaper' }).click()
  await page.getByRole('button', { name: 'Both' }).click()

  const { events } = await readEvents(page)
  expect(events).toHaveLength(2)
  expect(events.map((e) => e.babyId).sort()).toEqual(['baby-ada', 'baby-bo'])

  // History shows both children, and filtering narrows to one.
  await page.getByRole('link', { name: 'History' }).click()
  await expect(page.getByText('Ada · Diaper')).toBeVisible()
  await expect(page.getByText('Bo · Diaper')).toBeVisible()

  await page.getByRole('button', { name: 'Ada', exact: true }).click()
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByText('Bo · Diaper')).toHaveCount(0)
})

test('twins: the chip locks while a feed is running', async ({ page }) => {
  await page.goto('/')
  await seedTwins(page)
  await page.reload()

  const chip = page.getByRole('button', { name: /Logging for/ })

  await page.getByRole('button', { name: /^LEFT/ }).click()
  await expect(page.getByRole('timer')).toBeVisible()
  // The overlay covers the header, so the running feed names its own child.
  const overlay = page.locator('div.fixed.inset-0.z-40')
  await expect(overlay.getByText('Ada')).toBeVisible()
  // Switching mid-feed is locked: the save is already bound to Ada, and a
  // header saying otherwise is its own kind of wrong at 3 AM.
  await expect(chip).toBeDisabled()

  await page.getByRole('button', { name: 'Stop' }).click()
  await page.getByRole('button', { name: /Discard/ }).click()

  await expect(chip).toBeEnabled()
})
