export const colors = {
  background: "#F4F5F7",
  surface: "#FFFFFF",
  textPrimary: "#16181D",
  textSecondary: "#4F5562",
  // At least 3:1 on surface and background: WCAG 2.2 AA asks it of an input's outline.
  border: "#7A808C",
  accent: "#1D4ED8",
  onAccent: "#FFFFFF",
  positive: "#067647",
  negative: "#B42318",
  warning: "#B54708",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24 };

export const radii = { sm: 8, md: 12 };

export const typography = {
  heading: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 16, lineHeight: 24, fontWeight: "600" },
} as const;

// Android's minimum touch target, the larger of the two platforms' minimums.
export const minTouchTarget = 48;
