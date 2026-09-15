import vm from 'node:vm'
import { expect, test } from 'vitest'

import { testProvider } from '../src/providers/test.js'

// Regression test for the scenario-name sink: before the fix, the checkout page's click
// handler wrote `Processing payment with ${result.scenario}...` straight into status.innerHTML,
// so a scenario name containing markup was parsed as HTML rather than shown as text. The fix
// switched that line to status.appendChild(document.createTextNode(...)). Executes the actual
// shipped <script> block (via node:vm) against a minimal fake DOM, driving it through a real
// scenario click and a real call into the /process endpoint handler, so a regression back to
// raw innerHTML interpolation fails this test rather than only a manual check.
test('a hostile scenario name selected via the click handler renders as text, not markup', async () => {
  const hostileScenarioName = `Bolts <3" & washers <img src=x onerror=alert(1)>`

  const provider = testProvider({
    enabled: true,
    scenarios: [
      // delay is huge so the deferred processTestPayment() timer never fires during the test
      { id: 'hostile', name: hostileScenarioName, description: 'x', outcome: 'paid', delay: 999999999 },
    ],
  })!

  const payment: any = { amount: 1234, currency: 'eur' }
  // initPayment mutates `payment`, setting providerId, which keys the in-memory session.
  await provider.initPayment(null as any, payment)

  const config: any = { endpoints: [] }
  provider.onConfig!(config, { collections: {} } as any)

  const uiEndpoint = config.endpoints.find((e: any) => e.path === '/payload-billing/test/payment/:id')
  const processEndpoint = config.endpoints.find((e: any) => e.path === '/payload-billing/test/process')

  const res: Response = await uiEndpoint.handler({ url: `/api/payload-billing/test/payment/${payment.providerId}` })
  const html = await res.text()

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
  expect(scripts).toHaveLength(1)

  // Minimal fake element: only the properties/methods the checkout script touches.
  function makeElement(dataset: Record<string, string> = {}) {
    const innerHTMLLog: string[] = []
    const el: any = {
      classList: { add() {}, remove() {} },
      dataset,
      disabled: false,
      textContent: '',
      style: {},
      childNodes: [] as any[],
      innerHTMLLog,
      set innerHTML(value: string) { innerHTMLLog.push(value) },
      get innerHTML() { return innerHTMLLog[innerHTMLLog.length - 1] || '' },
      appendChild(node: any) { el.childNodes.push(node) },
      addEventListener(event: string, handler: (...args: any[]) => any) {
        el[`on_${event}`] = handler
      },
    }
    return el
  }

  const processBtn = makeElement()
  const status = makeElement()
  const methodEl = makeElement({ method: 'ideal' })
  const scenarioEl = makeElement({ scenario: 'hostile' })
  const elementsById: Record<string, any> = { processBtn, status }

  const fakeDocument = {
    getElementById: (id: string) => elementsById[id],
    querySelectorAll: (selector: string) => (selector === '.method' ? [methodEl] : selector === '.scenario' ? [scenarioEl] : []),
    createTextNode: (text: string) => ({ nodeType: 3, textContent: text }),
  }

  // Stands in for the browser's fetch: routes the checkout page's real request straight into
  // the real /process endpoint handler, so the JSON the click handler consumes is the same
  // JSON production would send, `scenario: scenario.name` included.
  const fakeFetch = async (url: string, opts: any) => {
    if (url !== '/api/payload-billing/test/process') {throw new Error(`unexpected fetch to ${url}`)}
    const response: Response = await processEndpoint.handler({ json: async () => JSON.parse(opts.body) })
    const data = await response.json()
    return { json: async () => data }
  }

  const sandbox: any = { document: fakeDocument, fetch: fakeFetch, setTimeout: () => {}, console }
  vm.createContext(sandbox)
  new vm.Script(scripts[0]).runInContext(sandbox)

  methodEl.on_click()
  scenarioEl.on_click()
  await processBtn.on_click()

  // The hostile name must never have been handed to innerHTML...
  expect(status.innerHTMLLog.join('\n')).not.toContain('<img')
  // ...it must instead show up as a text node's content, unparsed.
  expect(status.childNodes.some((n: any) => n.textContent === `Processing payment with ${hostileScenarioName}...`)).toBe(true)
})
