# Clinic staff user guide

This guide covers the current clinic workflows. Use **User guide** in the application for help while working. Guide topics use the expandable-help approach reviewed in the Car Loan reference project, adapted to clinic screens and permissions.

## Visual walkthroughs and phone use

Open **User guide → Show me on the screen** and choose an available workflow.
Or select **Show me** in the current screen's header. The guide circles actual buttons, fields and workflow sections.
Use **Next**, **Back**, **Close**, or **Escape**. **Focus highlighted control** moves keyboard focus to the relevant field or button.
Tours follow your role's modules and never save patients, bookings, prescriptions, payments or administrative changes.
Some steps open an input form for demonstration; review and submit it yourself only after closing the guide.
An already-open form stays open. Unavailable controls show an explanation rather than blocking progress.
Changing screen or branch ends the walkthrough. Replay any guide when needed.

On phones, open the menu button to switch modules. Forms stack vertically and tables scroll within their own area.
The guide scrolls targets into view and places instructions near the bottom of the phone screen.
You can scroll or interact with controls while a guide is open; it does not lock the workspace.

## Administrator setup

1. Sign in and select the correct branch.
2. Open **Administration**. Add consultation rooms with names your staff recognise. Rename or deactivate rooms from the room list. Busy rooms cannot be deactivated; finish or reassign their booked appointments and active queue visits first.
3. Add staff accounts. Choose **GP** for practitioners and enter their professional registration number. Active GPs assigned to the branch automatically appear in appointment and queue practitioner selectors.
4. Configure **Role module access**. Enable the modules each role needs, then save. The server checks access as well as hiding unavailable navigation. Administrative settings remain administrator-only; account security and help remain available to staff.
5. Add medications in **Dispensary**, then receive their stock batches. A medication entry alone is not available stock.

Module access controls which workflows staff can open and use. Signing prescriptions and issuing clinical documents also require practitioner authority. Giving a receptionist clinical module access does not turn that account into a GP.

## Register a patient

Open **Patients → Register patient**. Enter first name and optional last name as recorded on the patient's identity document.
For a single legal name, leave last name blank.

For **Malaysian** patients, enter 12 IC digits. The form adds hyphens as `YYMMDD-SS-NNNN`, derives birth date and assigns male for an odd final digit or female for an even final digit. Review the derived details before saving. The two-digit year does not identify its century; use the birth-date correction provided by the form when needed. The system checks number/date format; it does not verify the IC with a government registry.

For **Non-Malaysian** patients, enter passport number, date of birth and gender manually. Enter address line 1, optional line 2, postcode, city and state. Malaysian postcodes fill city/state from the bundled lookup. Confirm the locality if more than one matches; unknown postcodes and non-Malaysian addresses allow manual entry. Record contact details, allergies, chronic conditions and notification consent.

Search the directory by name, identity number or phone. Open a chart to edit demographics or review the patient's encounter history. Signed clinical records remain unchanged by demographic edits.

Record IDs are numeric: 1, 2, 3 and onward within each table. Patient IDs are separate from IC/passport numbers. Workspace shows tenant and branch IDs. Deleted records leave gaps; existing records keep their IDs.

IC format/date fields are described in [Microsoft's Malaysia identity number definition](https://learn.microsoft.com/en-us/purview/sit-defn-malaysia-identification-card-number); the parity convention is documented in the [Malaysian Inland Revenue identity-number reference](https://phl.hasil.gov.my/pdf/pdfam/MALAYSIA_TIN_NUMBER_AND_TIN_REGISTRATION_02122020.pdf).

## Appointment and queue

Open **Appointments → Book appointment**. Search for the patient instead of scrolling through the whole directory. Confirm the selected patient, practitioner, optional room, date and time before booking. A room or practitioner conflict prevents saving.

Use **Clinic overview** to check patients into the queue. Assign the GP and room when calling a ticket. Start the consultation, then move the visit to dispensary or payment as appropriate. The waiting-room display shows ticket numbers and rooms without patient identity.

## GP consultation and prescribing

Open **Clinical workspace**, choose the patient and record subjective history, objective findings, assessment and plan. Review allergies before prescribing.

Choose the medication from the catalog. Record total quantity, dosage instructions, number of times per day, meal timing (before meals, after meals or any time), and supply duration. These are prescribed instructions, not suggestions generated by the software. Check every prescription before signing.

Draft consultations can be corrected. Sign only after the clinical note and prescriptions are complete. Signed consultations become eligible for dispensing when they contain medication prescriptions. Issue MCs, referrals or laboratory requisitions from the signed consultation as authorised.

## Stock receipt and dispensing

In **Dispensary**, create the drug catalog item, then receive its batch using the correct item, unique batch number, expiry date and quantity. The catalog refreshes after a successful receipt. Only eligible unexpired stock contributes to available quantity; expired stock is not dispensable.

Choose a consultation from **Dispense prescription**. The list contains signed consultations in the active branch with prescriptions that have not already been dispensed. An empty list usually means there is no signed prescription awaiting dispensing. Draft notes, notes without medicine and completed dispenses are excluded.

Review prescription instructions and stock before dispensing. FEFO uses the earliest eligible expiry first. Insufficient stock prevents the whole dispense, rather than partially completing it. After success, stock totals refresh and the consultation leaves the pending list.

## Billing, notifications and access problems

Use **Billing & payments** for itemised invoices, split cash/card/QR/deposit payments and receipts. Payment amounts must equal the invoice total. Commissions and treatment packages are not part of the active application.

Notification delivery requires configured providers and recorded patient consent. Unconfigured providers do not claim successful delivery. The before/after photo workflow is removed.

If a module is unavailable, ask the administrator to review your role's access. If no GP appears, check the account's role, active status and branch assignment. If stock remains unchanged, inspect the receipt's validation message, selected branch and batch expiry. If a prescription list is empty, confirm the GP signed a consultation containing medication and that it was not already dispensed.

Change your password in **Account security**. New passwords require 14–128 characters. Sign out when leaving the workstation.

## Browser demo

The free-hosted demo displays a **Browser demo** banner on every screen. Use sample data only, never real patient records.
Sign in with `admin@example.test`, `gp@example.test`, `reception@example.test`, `nurse@example.test` or `therapist@example.test`; password is `demo`.
These accounts illustrate roles and are not real clinic authentication.
Changes stay in that tab's browser sessionStorage. Refresh preserves them; closing the session normally discards them.
Browsers can restore previous tab storage, so select **Reset demo** when you need a fresh sample workspace.
Existing tabs retain prior records and edited passwords. Use Reset demo to load the refreshed fictional Malaysian names, addresses and history examples. Reset clears only demo storage, restores the current fictional examples and returns to login. It never changes local MySQL records.
Patients, appointments, queue visits, prescriptions, stock and billing examples are preloaded only in the browser demo.
Normal MySQL bootstrap creates clinic/staff/room setup without business fixtures. Development seeding is a separate guarded command.
Messages are simulated; receipt and document downloads explain their demo limitation. Use the normal MySQL application for durable clinic work.
