const HASH = '0x2c659b590c6d7cb34e3a34bb799cb86285f2ef35605a674f957d74e75e6d53c0'

export default async function run(page, ui) {
  const before = await ui.snapshot()
  const out = { hasForm: false, clicked: false, actionTitle: null, hasWarning: false, warningText: null, hasFooter: false, consoleErrors: [] }

  page.on('console', (msg) => {
    if (msg.type() === 'error') out.consoleErrors.push(msg.text())
  })

  out.hasForm = /Analyze/.test(before) && /textarea/.test(before)

  // fill the textarea
  const ta = 'textarea[id="arc-input"]'
  await page.locator(ta).fill(HASH)
  await page.locator('button[id="arc-analyze"]').click()
  out.clicked = true

  // wait for the result to mount (server + network call)
  await page.waitForSelector('[id="action-title"]', { timeout: 30000 })

  // wait for risk checks to finish rendering
  await page.waitForTimeout(1500)

  out.actionTitle = await page.locator('[id="action-title"]').innerText()
  out.hasWarning = (await page.locator('.finding-warning, .finding-severe').count()) > 0
  const warningSummary = page.locator('.finding summary')
  try {
    out.warningText = await warningSummary.first().innerText()
  } catch {
    out.warningText = null
  }
  out.hasFooter = (await page.locator('.report-foot').count()) > 0

  const body = await page.locator('body').innerText()
  out.hasUnlimited = body.includes('Unlimited')
  out.hasEvidence = body.includes('Evidence:')

  return out
}