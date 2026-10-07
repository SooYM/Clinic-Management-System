# Free Render browser demo

The GitHub main release replaces the previous V1 demo. Render runs **one free native Node web service**, serving compiled demo assets. No MySQL, PostgreSQL, paid worker, persistent disk, secret, migration, or bootstrap job is needed for this demo.

## Existing Blueprint resource

Root render.yaml preserves the inspected V1 project **Clinic Management System**, environment **Production**, web service **Clinic Management System**, Oregon region, GitHub repository, and main branch. Runtime remains Node and plan remains free. Commit-triggered deploys build with `npm ci --include=dev && npm run build:demo` and start with `npm run start:demo`. Health path is `/healthz`.

The demo build emits dist-demo. Normal `npm run build` emits dist and retains the real MySQL API transport. Demo mode is selected at build time; changing a runtime environment variable cannot turn a normal build into the browser demo. The static demo server never imports database or authentication modules.

Render matches existing resources by name. Sync the existing Blueprint and review its preview to ensure the same web resource is updated. No cloud resource ID was guessed or embedded. [Render Blueprint reference](https://render.com/docs/blueprint-spec)

## Sync and verify

1. Open the existing Render Blueprint linked to this repository and main branch.
2. Sync the updated root render.yaml. Confirm the existing Node/free web service, new build/start commands, and `/healthz` check. There should be no database or worker creation.
3. Remove obsolete V1 demo/Next/Prisma/database/signing environment values if unused; this demo requires none. NODE_VERSION=22.14.0, NODE_ENV=production and HOST=0.0.0.0 are specified by the Blueprint. Render supplies PORT.
4. Deploy the replacement main commit. Verify `/healthz` reports browser-session-demo with database:false, then open the homepage.
5. Use a listed fictional account and password **00000000000000** (14 zeros). Canonical accounts are admin@example.test, gp@example.test, reception@example.test, nurse@example.test and therapist@example.test. Older demo.clinic aliases are accepted for UI compatibility. These are simulated role choices, not secure backend accounts.

Free Render services can spin down when idle and have usage limits; first access can wait for startup. Browser data is independent of server restarts because it lives in sessionStorage. Free hosting is suitable for this simulated demo, not a clinical production database. [Render free-service behavior](https://render.com/docs/free)

## Preloaded fictional examples

Each fresh browser session starts with fictional administrator, GP, receptionist, nurse and therapist accounts; two demo branches; consultation rooms; four sample patients; Malaysian IC examples using fictional place code 00; passport examples; today's queue; an upcoming appointment; a signed demo prescription awaiting simulated dispensing; medication batches; a paid cash invoice; a deposit; and an UNCONFIGURED demo notification. Dates are generated when the session starts. Notes explicitly identify examples and provide no medical advice.

No sample fixture is inserted into local MySQL. Demo seed exists only in the browser transport, loaded by the demo build. Do not enter real patient data, contact details, passwords, or payments.

Changes persist through reload within the same tab's sessionStorage. Other devices and independent browser tabs do not share records. Browsers may initially copy sessionStorage when duplicating a tab or opening through an opener; subsequent edits remain separate. Reset demo discards that namespace, restores fictional examples, and signs out. Closing the browser session normally clears sessionStorage, but browser session-restore behavior can retain it; use Reset demo to explicitly discard data. [Browser sessionStorage behavior](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)

## Simulated versus real behavior

The browser adapter demonstrates patient registration, postcode choices, booking conflicts, room/queue transitions, GP notes and structured prescriptions, allergy checks, FEFO stock changes, split payment arithmetic, role-module configuration, and branch filters. Users can inspect or change browser data and code. These checks are **not authentication, authorization, audit security, transactional durability, or evidence of backend isolation**.

The demo server returns 503 for `/api/*`. Actual signed documents, QR verification, PDF receipts, and message delivery require the real MySQL application. Download links open `/demo-unavailable`; simulated documents are marked unsigned and cannot verify. Notifications remain UNCONFIGURED and never contact providers. No worker runs on free Render.

## Real local application

Use `npm run build` plus `npm start`, or `npm run dev`, with the MySQL schema and private local .env. Follow [DEPLOYMENT.md](DEPLOYMENT.md) for migrations, separate runtime credentials, bootstrap, and production configuration. Run migrations 001–009 in order; never run demo seed against MySQL. Existing local data remains separate from the Render browser demo.

## Validation limits

The Blueprint was checked against Render's current published JSON schema. Run the demo build, typecheck, automated tests, and HTTP/browser smoke tests before release. GitHub publication and a valid Blueprint do not prove a successful Render sync or deploy. The deployed HTTPS URL must be checked after Render finishes.

V1's recovery Git tag preserves prior source. Reverting a main commit restores source configuration but does not transfer browser session data to any database. Never reset local MySQL to repair the demo.
