# Clinic staff user guide

This guide covers the current clinic workflows. Use **User guide** in the application for help while working. Guide topics use the expandable-help approach reviewed in the Car Loan reference project, adapted to clinic screens and permissions.

## Visual walkthroughs and phone use

Open **User guide → Show me on the screen** and choose an available workflow.
Select **User guide** in the current screen's header or sidebar to label its tabs and explain their functions. The guide circles actual buttons, fields and workflow sections. The dedicated guide page also retains workflow topics.
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
5. Add medication, consumable or retail items in **Dispensary**, then receive their stock batches. A catalog entry alone is not available stock.
6. Open **Clinic settings** to change the clinic name used on future receipts and documents. Existing receipt snapshots retain their recorded clinic name; legacy receipts use current metadata where no snapshot exists.

Module access controls which workflows staff can open and use. Signing prescriptions and issuing clinical documents also require practitioner authority. Giving a receptionist clinical module access does not turn that account into a GP.

## Register a patient

Open **Patients → Register patient**. Enter first name and optional last name as recorded on the patient's identity document.
Choose **Phone country code** from the dropdown, then enter the phone number. Malaysia (+60) is the default; its domestic leading zero is removed when composing an edited international number. Pasting a full international number detects listed prefixes without duplicating them. Choose **Other country — enter full number** for unlisted countries and include `+` and the calling code. Phone remains optional; existing numbers stay unchanged until edited. Spaces, hyphens and extensions are retained within the existing 50-character limit.
The selected calling code appears inside the number field. It is included automatically when saving. Country of nationality occupies a fixed position; Malaysia is shown as a fixed country for Malaysian patients.

For **Non-Malaysian**, choose **Country of nationality** as shown on the passport. This is independent of address and phone calling code. Existing foreign patients without recorded country need a selection when their demographics are edited.

Record lists include **Search loaded records**, relevant filters, **Sort by**, **Direction** and **Clear filters**. Patients and inventory items default to ascending IDs; their Default option and Clear filters return to ID order. Queue views retain their workflow order. Counts show matches out of loaded records; server searches/Load older retrieve more records. Filters affect the view, not stock, billing totals or saved records.
For a single legal name, leave last name blank.

For **Malaysian** patients, enter 12 IC digits. The form adds hyphens as `YYMMDD-SS-NNNN`, derives birth date and assigns male for an odd final digit or female for an even final digit. Review the derived details before saving. The two-digit year does not identify its century; use the birth-date correction provided by the form when needed. The system checks number/date format; it does not verify the IC with a government registry.

For **Non-Malaysian** patients, enter passport number, date of birth and gender manually. Enter address line 1, optional line 2, postcode, city and state. Malaysian postcodes fill city/state from the bundled lookup. Confirm the locality if more than one matches; unknown postcodes and non-Malaysian addresses allow manual entry. Record contact details, allergies, chronic conditions and notification consent.

Search the directory by name, identity number or phone. Click a patient row or **Open profile** to view identity, nationality, phone, email, full address, allergies, conditions, consent and timestamps. Use Edit patient for demographic changes. Signed clinical records remain unchanged by demographic edits.

Record IDs are numeric: 1, 2, 3 and onward within each table. Patient IDs are separate from IC/passport numbers. Workspace shows tenant and branch IDs. Deleted records leave gaps; existing records keep their IDs.

IC format/date fields are described in [Microsoft's Malaysia identity number definition](https://learn.microsoft.com/en-us/purview/sit-defn-malaysia-identification-card-number); the parity convention is documented in the [Malaysian Inland Revenue identity-number reference](https://phl.hasil.gov.my/pdf/pdfam/MALAYSIA_TIN_NUMBER_AND_TIN_REGISTRATION_02122020.pdf).

## Appointment and queue

Open **Appointments → Book appointment**. Search for the patient instead of scrolling through the whole directory. Confirm the selected patient, practitioner, optional room, date and time before booking. A room or practitioner conflict prevents saving.

Patient choices follow ascending patient IDs. Booking dates must be today or later in Malaysia time; an earlier time today remains permitted. Use Delete appointment and confirm removal for unused booked or cancelled appointments. Attended appointments cannot be removed; removal preserves history and audit records.

Use **Clinic overview** to check patients into the queue. Assign the GP and room when calling a ticket. Start the consultation, then move the visit to dispensary or payment as appropriate. The waiting-room display shows ticket numbers and rooms without patient identity.

## GP consultation and prescribing

Open **Clinical workspace → New consultation**, choose the patient and record subjective history, objective findings, assessment and plan. Creating the consultation opens its Notes & prescription section. Review allergies before prescribing.

The Consultations section groups matching loaded records by patient. Click a patient to load their consultation history, then Open consultation to select a record. Notes & prescription, Documents and Medication logs stay greyed out until a consultation is selected. New consultation clears record selection and opens a separate creation form.

SOAP fields use separate rows. Search the patient selector or consultation list to locate the correct record.
Enter blood pressure as `SYS/DIA`, such as `120/80`, using positive whole numbers with systolic greater than diastolic.
Unusual readings show a warning but remain recordable. Reference limits are SYS 60–260 and DIA 40–215 mmHg from the [Omron monitor specification](https://omronhealthcare.com/storage/pdfs/3146838-2d_bp5465_hem-7382t1-azaz_im_en_frca_web.pdf); these are measurement limits, not a healthy range.

Choose the medication from the catalog. Record total quantity, dosage instructions, number of times per day, meal timing (before meals, after meals or any time), and supply duration. These are prescribed instructions, not suggestions generated by the software. Check every prescription before signing.

Draft consultations can be corrected. Sign only after the clinical note and prescriptions are complete. Signed consultations become eligible for dispensing when they contain medication prescriptions. Issue MCs, referrals or laboratory requisitions from the signed consultation as authorised.

Signing reserves the prescribed quantities immediately and reduces **Available** stock. Drafts hold nothing.
If eligible free stock is insufficient, the entire sign operation fails; receive stock or review the prescription, then retry.

MC issuance requires a signed encounter belonging to the signed-in GP. The form explains unmet conditions.
Enter the optional employer or department when needed for the letter.
Leave starts prefilled with today before 17:00 Malaysia time, or tomorrow from 17:00 onward. Review or override the date before issuing.
Render demo creates an explicitly unsigned simulated document; actual signed certificates and PDF downloads require the MySQL application.

Open **Preview document** after issuance or from document history. Review the patient, leave dates, practitioner, status and diagnosis visibility.
The preview uses a clinic letterhead and ruled certificate fields. Choose **Download PDF** only when you want a file.
The browser demo previews an unsigned sample; it does not issue a verified certificate.

For a signed consultation, open **Medication-taking records** in the clinical workspace.
A GP or nurse with clinical access records the prescribed medicine, taken/missed outcome, patient-report/staff-observation source, occurrence time, amount taken and optional notes.
Review the medicine and unit before saving. These records preserve who entered the report and when; they do not reduce clinic inventory again.
The list shows the newest 500 entries for the selected consultation, ordered by dose occurrence time.
Inventory-only staff can view clinic dispensing activity, but cannot access patient medication-taking records.

## Stock receipt and dispensing

In **Dispensary**, create catalog items for medication, consumables or retail stock, including lab coats.
Receive each batch with item, batch number and quantity. Medication requires an expiry date; non-medication supplies can leave expiry blank.
Use search and category filters to find items. **Unexpired stock** is eligible physical stock; **Reserved** is held for signed prescriptions; **Available** is their difference.
Expiry today or earlier is ineligible. Signing reserves stock; dispensing physically deducts it once.
Use **Use supplies** to record non-medication items issued or consumed, with quantity and reason. Medication must follow prescription dispensing.

Search the **Dispense prescription** list by patient, identity, record number, GP or medicine, then choose the consultation.
The list contains signed consultations in the active branch with prescriptions that have not already been dispensed. Draft notes, notes without medicine and completed dispenses are excluded.

Review prescription instructions and stock before dispensing. FEFO uses the earliest eligible expiry first. Insufficient stock prevents the whole dispense, rather than partially completing it. After success, stock totals refresh and the consultation leaves the pending list.

Use **Prescription activity log** to review prescribed instructions, reserved batches and completed dispensing with quantities, staff and times.
In **Dispensary → Prescription history and activity**, search and select a pending or completed record. Completed prescriptions remain searchable here after leaving the dispensing queue.
Clinic stock events do not confirm that a patient took their medicine. Medication-taking records are entered separately by clinical staff.

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

## Edit dropdown and stock choices

Administrators use **Administration → Catalog choices** to add or edit lab panels, specimen types, inventory units and referral destinations. Set display order, archive unused choices, or restore them. New forms use active choices from the selected branch. Configure these lists before using an empty local installation.

In **Dispensary → Stock catalogue**, administrators edit drug/supply names, SKU, prices and reorder levels, or archive/restore items. Prescription choices come from active medication items. Used stock units, categories and ingredients cannot change. New signed prescriptions retain captured medicine details; legacy records without snapshots use catalog fallback. Existing signed prescriptions remain dispensable after archival. Existing archived stock can still be received or used. Rooms remain editable in Administration; practitioners come from active GP accounts.

## Find features without long scrolling

Use the section buttons below each module title. The highlighted button identifies your current task. Buttons stay available while scrolling and wrap to fit a phone. Only that section is displayed.

| Module             | Sections                                                                                |
| ------------------ | --------------------------------------------------------------------------------------- |
| Clinic overview    | Live queue; Check in patient                                                            |
| Patients           | Patient directory; Patient registration / Edit patient                                  |
| Appointments       | Scheduled visits; Book appointment                                                      |
| Clinical workspace | Consultations; Note & prescription; Documents; Medication logs                          |
| Dispensary         | Stock catalogue; Receive stock; Use supplies; Dispense medicines; Prescription history  |
| Billing            | Invoice history; Patient checkout; Patient deposits                                     |
| Administration     | Staff accounts; Branches; Consultation rooms; Catalog choices; Role access; Audit trail |
| User guide         | Visual walkthroughs; Written instructions                                               |

Section switches keep entered values until you save or leave the module. They do not save drafts to the database. Add/edit buttons open the matching section. User guide highlights tabs and opens permitted walkthrough sections. Clinical record tools stay disabled until a consultation is selected. Reports & delivery is removed from navigation; retained notification infrastructure does not require a staff screen.

## Rename or remove settings

Administration provides Edit name for staff, Edit name / address for branches, and room rename/removal controls. Remove hides a setting from normal choices; Show removed reveals entries for Restore. Unused rooms are deleted; rooms with historical records are archived. Rooms in use or with upcoming bookings cannot be removed. Remove access disables staff login while preserving history.

Switch away from a branch before removing it. Branches assigned as home branch to active staff must stay available; removal also keeps at least one active branch. Names can be edited while branches are active. Staff cannot restore access into a removed home branch. Catalog choices and inventory items have direct Remove/Restore buttons; used stock units/categories/ingredients remain protected.

**Stock unit** means how one stock quantity is counted: tablet, capsule, bottle, vial, pair or piece. Configure choices in **Administration → Catalog choices → Inventory units**, then select one while adding an item. Received quantities and prescribed quantities use that unit; changing a used unit would reinterpret existing stock and is blocked.

In Billing → Invoice history, select **Preview receipt**. The official-receipt layout shows actual clinic/patient details, itemized fees, totals, tender methods, cashier and issue time. The MySQL app provides separate printable PDF and Download PDF actions. Demo previews are sample receipts, with no real payment or PDF verification. New receipt identities stay fixed after later name edits; old invoices use existing current records.
