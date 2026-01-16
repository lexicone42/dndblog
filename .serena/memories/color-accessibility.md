# Color Accessibility Guidelines

## WCAG AA Requirements
- Normal text: minimum 4.5:1 contrast ratio
- Large text (18pt+ or 14pt bold): minimum 3:1 contrast ratio
- UI components/graphics: minimum 3:1 contrast ratio

## Light Mode Colors (on #f5f0e6 background)

| Color | Hex | Contrast Ratio | Status |
|-------|-----|----------------|--------|
| Text | #2c2416 | 13.49:1 | ✅ Pass |
| Text Secondary | #4a3f2f | 9.05:1 | ✅ Pass |
| Text Muted | #6b5d4d | 5.61:1 | ✅ Pass |
| Accent | #8b4513 | 6.25:1 | ✅ Pass |
| Link | #6b3a0f | 8.26:1 | ✅ Pass |
| Gold | #856410 | 4.83:1 | ✅ Pass |
| Success | #0d7a32 | 4.81:1 | ✅ Pass |
| Error | #b91c1c | 5.70:1 | ✅ Pass |
| Warning | #a95505 | 4.64:1 | ✅ Pass |

## Dark Mode Colors (on #1a120b background)

All dark mode colors pass WCAG AA with comfortable margins (5.7:1 to 13.7:1).

## Color Changes Made (2026-01-15)

Original light mode colors that failed:
- Gold: #b8860b → #856410 (2.87 → 4.83)
- Success: #16a34a → #0d7a32 (2.90 → 4.81)
- Error: #dc2626 → #b91c1c (4.25 → 5.70)
- Warning: #d97706 → #a95505 (2.80 → 4.64)

## Testing Contrast Ratios

Use this Node.js function to calculate contrast:
```javascript
function luminance(hex) {
  const rgb = parseInt(hex.slice(1), 16);
  const r = (rgb >> 16) / 255;
  const g = ((rgb >> 8) & 0xff) / 255;
  const b = (rgb & 0xff) / 255;
  const sRGB = [r, g, b].map(c => 
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2);
}
```
