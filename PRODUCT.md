# Clinic Management System V2

## Purpose

Replace the earlier demonstration with a database-backed GP clinic workspace for daily staff operations.
The [system specification](CLINIC_MANAGEMENT_SYSTEM_SPECIFICATION.md) defines current scope; migrations and executable validation define persistence and API constraints.

## People and work

| Staff            | Work                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| Front desk       | Register patients, book appointments, check in visits, manage queues, collect payment                              |
| GP               | Review history and allergies, record SOAP consultations, prescribe medicines, sign notes, issue clinical documents |
| Dispensary staff | Receive batches, review signed prescriptions, dispense eligible stock by earliest expiry                           |
| Administrator    | Create staff and branches, manage rooms, configure role modules, inspect audit records                             |

Module grants determine ordinary workflow access. Professional authority remains separate: only the attending GP writes clinical notes and issues documents.
The UI labels practitioners **GP**; the API role is `DOCTOR`.

## Current product boundaries

The application supports multi-branch access, Malaysian IC and passport registration, address/postcode assistance, appointments, queues, GP records, stock, billing, documents and notification tracking.
Treatment packages, commissions, payroll export and before/after photos are retired. Their historical tables remain for retention and migration.
Dental and aesthetic workflows, medical hardware, OCR, payment gateway authorization and external EMR integrations are outside current delivery.

## Platform and trust

React and TypeScript provide the browser workspace. Express application services persist to MySQL 8.4 with InnoDB.
All entity IDs and foreign keys are numeric; record numbers are distinct from IC/passport numbers and secret tokens.
Default language is English, currency is MYR, and clinic service dates follow `Asia/Kuala_Lumpur`.

Screens read actual server records and expose loading, empty and error states. No demonstration patients or invented metrics are required.
The authenticated waiting-room display shows ticket numbers and room names without patient names.
Money uses integer cents. Clinical decisions remain with practitioners. Notification providers require operator configuration.

See [requirements](docs/REQUIREMENTS.md), [staff guide](docs/USER_GUIDE.md) and [architecture](docs/ARCHITECTURE.md) for delivery details and limits.

## Browser demonstration

A separate free-hosting demo build uses tab-scoped `sessionStorage` instead of MySQL or the real API.
It contains clearly labeled sample data, demo-only account credentials and a reset control.
Fictitious patients, appointments, queue visits, signed prescriptions, stock and billing examples are preloaded only in `DemoClinic`.
Reset restores those initial demo fixtures. Real MySQL bootstrap creates clinic/staff/room setup without business fixtures.
The guarded `db:seed` development command is separate and is not part of normal bootstrap or demo startup.
Data survives refresh in that tab and resets when its browser session ends or the user selects Reset demo.
Browser restore behavior can retain a previous tab session; explicit reset reliably clears the demo namespace.
This mode does not provide real authentication, durable clinical storage, provider delivery or signed PDF/verification services.
The normal local/production build retains MySQL persistence and server security. Never enter real patient data into the browser demo.
