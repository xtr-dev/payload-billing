import { expect, test } from '@playwright/test'

test('test checkout renders provider choices and processes a successful payment', async ({
  page,
}) => {
  await page.route('**/api/payload-billing/test/config', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        scenarios: [
          {
            id: 'instant-success',
            name: 'Instant Success',
            description: 'Payment succeeds immediately',
            outcome: 'paid',
          },
        ],
        methods: [{ id: 'ideal', name: 'iDEAL', icon: 'bank' }],
        testModeIndicators: {
          showWarningBanners: true,
          showTestBadges: true,
          consoleWarnings: false,
        },
        defaultDelay: 0,
        customUiRoute: '/test-payment',
      },
    }),
  )
  await page.route('**/api/payload-billing/test/process', (route) =>
    route.fulfill({
      json: { success: true, delay: 1 },
    }),
  )
  await page.route('**/api/payload-billing/test/status/**', (route) =>
    route.fulfill({
      json: { status: 'paid' },
    }),
  )

  await page.goto('/test-payment/test_pay_e2e')
  await expect(
    page.getByText('TEST MODE - This is a simulated payment'),
  ).toBeVisible()
  await page.getByRole('button', { name: /iDEAL/ }).click()
  await page.getByRole('button', { name: /Instant Success/ }).click()
  await page.getByRole('button', { name: 'Process Test Payment' }).click()
  await expect(page.getByText('Payment successful!')).toBeVisible()
})
