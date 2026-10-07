# Clinic operations design system

## Design read
Operate mode: clinic administration for front desk, doctors, and nurses. Calm blue, slate, and mint support long shifts and quick status recognition. Tailwind utilities provide shared layout and spacing; native labelled form controls provide accessible input.

## Pinned visual language
Use Segoe UI with system sans-serif fallback. Background `#F8FAFC`, white surfaces, primary `#2563EB`, secondary `#DBEAFE`, mint completion `#CCFBF1`, text `#0F172A`, secondary text `#334155`. Red alerts include text, never color alone. Muted text must meet readable contrast; spec `#94A3B8` is reserved for nonessential decoration, not small body text.

## Hierarchy
Persistent navigation, branch and user context, explicit screen title, primary action, then operational content. Queue work is tabular and room oriented. Patient identity and allergy banners accompany clinical work. Avoid marketing grids, decorative charts, gradients, and irrelevant icons.

## Interaction
Visible loading and connection state. Retain entered form content on failures. Every input has a label. Every mutation gives success or readable error feedback. Keyboard focus is visible. Mobile navigation wraps without hiding actions. Public TV board shows ticket numbers and rooms only; sound requires explicit user activation.

## Verification
Inspect desktop and narrow mobile screenshots. Verify login, registration, queue progression, chart save, and document generation against live MySQL data. Record limitations honestly in validation documentation.
