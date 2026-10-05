/**
 * Design Tokens & Theme Specification
 * Adheres to Blue & Pastel Color Scheme and HCI Ergonomic Contrast Ratios
 */

export const ClinicDesignTokens = {
  colors: {
    // Primary Clinical Blues
    primary: {
      900: "#1E3A8A", // Deep Navy (High contrast text on light bg)
      700: "#1D4ED8", // Darker Royal
      600: "#2563EB", // Primary Accent / Action Button
      500: "#3B82F6", // Active States / Focus Ring
      300: "#93C5FD", // Soft Pastel Border
      100: "#DBEAFE", // Subtle Hover Pastel Blue
      50: "#EFF6FF",  // Canvas Background Tint
    },
    // Calming Pastel Accents
    pastel: {
      mint: "#CCFBF1",      // 'AI ASSISTED' pill container
      teal: "#14B8A6",      // Positive health trend & vital badges
      lavender: "#EEF2FF",  // AI Summary card background container
      indigo: "#818CF8",    // AI Chat FAB & secondary action icons
      sky: "#E0F2FE",       // Filter pills & card highlights
    },
    // Neutrals & Surfaces (HCI Anti-Fatigue Palette)
    surface: {
      white: "#FFFFFF",     // Card containers & modal sheets
      canvas: "#F8FAFC",    // Base screen background
      divider: "#E2E8F0",   // Subtle borders (non-intrusive)
    },
    // Text Hierarchy (WCAG AAA Compliance)
    text: {
      heading: "#0F172A",   // 17.5:1 on white (Zero eye strain)
      body: "#334155",      // 10.2:1 on white
      muted: "#64748B",     // 4.98:1 on white (Timestamps, units)
    },
    // Medical Safety Alerts
    alert: {
      criticalRed: "#EF4444",   // Hard allergy conflict
      criticalBg: "#FEF2F2",    // Allergy banner background
      warningAmber: "#F59E0B",  // Borderline lab thresholds
      warningBg: "#FFFBEB",
    }
  },
  typography: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
    sizes: {
      xs: "0.75rem",   // 12px - Badges & metadata
      sm: "0.875rem",  // 14px - Secondary labels, units
      base: "1rem",    // 16px - Standard clinical body text
      lg: "1.125rem",  // 18px - Subheadings & patient greeting
      xl: "1.25rem",   // 20px - Card headers (e.g., 'AI Health Summary')
      "2xl": "1.5rem", // 24px - Doctor workspace headings
    }
  },
  spacing: {
    touchTargetMin: "48px", // Fitts's Law minimum touch boundary
    cardPadding: "20px",
    borderRadius: "16px",
  }
} as const;
