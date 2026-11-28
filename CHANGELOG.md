# Changelog

## [0.7.0](https://github.com/xtr-dev/payload-billing/compare/v0.6.0...v0.7.0) - 2026-11-28

### Features
- **invoices:** add discountAmount so an invoice can show a discount ([#122](https://github.com/xtr-dev/payload-billing/issues/122)) ([ae75c83](https://github.com/xtr-dev/payload-billing/commit/ae75c8355b05f50da3833546c081e4903bd41572))
- **invoices:** accept guest invoices when a customerInfoExtractor is configured ([#121](https://github.com/xtr-dev/payload-billing/issues/121)) ([ab03567](https://github.com/xtr-dev/payload-billing/commit/ab035672f4d65093917d8eb2b9560edabc0c7453))

## [0.6.0](https://github.com/xtr-dev/payload-billing/compare/v0.5.1...v0.6.0) - 2026-11-27

### Breaking
- remove the placeholder /client and /rsc exports ([#119](https://github.com/xtr-dev/payload-billing/issues/119)) ([84a4d5d](https://github.com/xtr-dev/payload-billing/commit/84a4d5d50853512b0525ecebb701d8ab0855c1ff))

### Other
- replace the pre-release warning with a v0.x note ([#120](https://github.com/xtr-dev/payload-billing/issues/120)) ([9f0ede9](https://github.com/xtr-dev/payload-billing/commit/9f0ede9b467e81510234cf38acba1d9edefb84c5))

## [0.5.1](https://github.com/xtr-dev/payload-billing/compare/v0.5.0...v0.5.1) - 2026-11-27

### Fixes
- **stripe:** stop sending return_url when creating the PaymentIntent ([#117](https://github.com/xtr-dev/payload-billing/issues/117)) ([475d404](https://github.com/xtr-dev/payload-billing/commit/475d404bfd39e8ca7d5afc0c989c152713ab4f1d))

### Other
- **stripe:** deprecate the ignored webhookUrl option ([#118](https://github.com/xtr-dev/payload-billing/issues/118)) ([d9f4e2c](https://github.com/xtr-dev/payload-billing/commit/d9f4e2c58c4d807351a18cd703fe0790adb55b75))
- audit README and docs for accuracy and brevity ([#116](https://github.com/xtr-dev/payload-billing/issues/116)) ([8e1ed1a](https://github.com/xtr-dev/payload-billing/commit/8e1ed1abd1e42a3cdc41237c8e89bc5a548e3759))

## [0.5.0](https://github.com/xtr-dev/payload-billing/compare/v0.4.0...v0.5.0) - 2026-11-26

### Features
- **refunds:** send admin-created refunds through Payload's jobs queue ([#115](https://github.com/xtr-dev/payload-billing/issues/115)) ([7f57523](https://github.com/xtr-dev/payload-billing/commit/7f57523e4aa84a93aa0eeb2c1cf48e6ebde81c48))

### Fixes
- **test-provider:** return to the site on every final outcome and honour delay 0 ([#114](https://github.com/xtr-dev/payload-billing/issues/114)) ([62e7f3c](https://github.com/xtr-dev/payload-billing/commit/62e7f3ca34fe1e09601cf6331641b32234f7e8b1))

## [0.4.0] - 2026-11-25

### Features
- {returnToken} placeholder in payment redirect URLs ([#104](https://github.com/xtr-dev/payload-billing/issues/104)) ([4982a9a](https://github.com/xtr-dev/payload-billing/commit/4982a9a91903024bd3f341d319e4e2b4f091291f))
- export syncPaymentFromProvider (and the Mollie status mapping) ([#103](https://github.com/xtr-dev/payload-billing/issues/103)) ([866f3d8](https://github.com/xtr-dev/payload-billing/commit/866f3d832a3ee199ef9c571cb89b320af5bd8db1))

### Fixes
- **deps:** align all @payloadcms packages with payload 3.90.0 ([#111](https://github.com/xtr-dev/payload-billing/issues/111)) ([d29d7fa](https://github.com/xtr-dev/payload-billing/commit/d29d7faa3fb1ac2f53325d928cbfdd8f32da8e72))
- allow stripe 19-22 as a peer and loosen the apiVersion type ([#35](https://github.com/xtr-dev/payload-billing/issues/35)) ([308d629](https://github.com/xtr-dev/payload-billing/commit/308d629501faae2f6cedf7929eaa210caf29bf94))
- read a runtime server URL before NEXT_PUBLIC_SERVER_URL ([#102](https://github.com/xtr-dev/payload-billing/issues/102)) ([f5a61ef](https://github.com/xtr-dev/payload-billing/commit/f5a61efa8ee4171a77eebc66394c04240322f999))
- never move a settled payment back, check the version in the database ([#101](https://github.com/xtr-dev/payload-billing/issues/101)) ([c0ca356](https://github.com/xtr-dev/payload-billing/commit/c0ca356cc3a4dbf68d7c3196eb7ea8ce01b35a92))
- page refund sweeps through every row, add a manual (hold) flag ([#110](https://github.com/xtr-dev/payload-billing/issues/110)) ([ae154f0](https://github.com/xtr-dev/payload-billing/commit/ae154f06a24221100bd809637fc9fb2933749c6c))
- **types:** use Id for refund ids and stop requiring invoice number ([#100](https://github.com/xtr-dev/payload-billing/issues/100)) ([680623f](https://github.com/xtr-dev/payload-billing/commit/680623fcccd873f4fee2ae932b8257b4c0f28141))

### Other
- release through the shared workflow with xtr-dev/changelog ([#113](https://github.com/xtr-dev/payload-billing/issues/113)) ([54762fd](https://github.com/xtr-dev/payload-billing/commit/54762fde2ababa62b57e6acb5f495ae2ed92083d))
- refunds section no longer claims open default access ([#112](https://github.com/xtr-dev/payload-billing/issues/112)) ([dd29671](https://github.com/xtr-dev/payload-billing/commit/dd2967152e8c73a0e5f94c65cbdf77c8184ccd92))
- **deps:** bump the npm_and_yarn group across 1 directory with 15 updates ([#109](https://github.com/xtr-dev/payload-billing/issues/109)) ([cec1820](https://github.com/xtr-dev/payload-billing/commit/cec18209beb69bfb3f8ba80129c87d5ace068896))
