# Clinic operations design system

## Design read

Operate mode: clinic administration for front desk, doctors, and nurses. Calm blue, slate, and mint support long shifts and quick status recognition. Tailwind utilities provide shared layout and spacing; native labelled form controls provide accessible input.

## Pinned visual language

Use Segoe UI with system sans-serif fallback. Background `#F8FAFC`, white surfaces, primary `#2563EB`, secondary `#DBEAFE`, mint completion `#CCFBF1`, text `#0F172A`, secondary text `#334155`. Red alerts include text, never color alone. Muted text must meet readable contrast; spec `#94A3B8` is reserved for nonessential decoration, not small body text.

## Hierarchy

Persistent navigation, branch and user context, explicit screen title, primary action, then operational content. Queue work is tabular and room oriented. Patient identity and allergy banners accompany clinical work. Avoid marketing grids, decorative charts, gradients, and irrelevant icons.

## Interaction

Use concise screen titles and controls throughout the system. Omit promotional taglines and captions that only repeat a page or section title. Retain field guidance, validation, workflow rules, empty-state next steps and safety/privacy/demo notices.

Visible loading and connection state. Retain entered form content on failures. Every input has a label. Every mutation gives success or readable error feedback. Keyboard focus is visible. Mobile navigation wraps without hiding actions. Public TV board shows ticket numbers and rooms only; sound requires explicit user activation.

## Verification

Inspect desktop and narrow mobile screenshots. Verify login, registration, queue progression, chart save, and document generation against live MySQL data. Record limitations honestly in validation documentation.

## Task navigation

Operate surfaces with multiple tasks use shared WorkspaceSections: named native buttons, visible current state, sticky wrapping navigation and one visible content region. Inactive areas remain mounted to retain drafts within a module. Avoid nested vertical scroll regions. Desktop navigation reads horizontally; phone controls wrap with at least 44px targets. Single-task screens do not need a section bar.

## Detail views and form rhythm

Profiles, saved consultation details, document/receipt previews, inventory details and prescription reviews open native modal dialogs. Close/Escape restores the underlying workflow. Filters may expand inline. Use the two-column form grid with 12px row gaps and 16px column gaps; stack at the existing phone breakpoint. Use 16px panel spacing/padding and 20px desktop workspace padding, reducing outer padding to 12px and panels to 14px on phones. Nationality/country share this grid without reserving hidden custom-country rows.

## Compact operations density

Desktop controls use 36px minimum height and table cells use 10px padding. Keep body text at 14px and visible field labels; compactness comes from spacing rather than tiny type. Phone controls and section navigation retain 44px minimum targets. Keep inactive workspace sections hidden without reserved height. The login is a bounded single-column form with clinic branding instead of a full-viewport split panel. Public waiting-room display and printed document sizing remain purpose-specific.
