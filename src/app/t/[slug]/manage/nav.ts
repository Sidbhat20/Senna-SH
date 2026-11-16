/** The organiser workspace sections, in order. `href` is relative to /t/[slug]; Desk lives outside the workspace. */
export const SECTIONS = [
  { key: "overview", label: "Overview", href: "/manage" },
  { key: "details", label: "Details", href: "/manage/details" },
  { key: "categories", label: "Categories", href: "/manage/categories" },
  { key: "entries", label: "Entries", href: "/manage/entries" },
  { key: "payments", label: "Payments", href: "/manage/payments" },
  { key: "notifications", label: "Notifications", href: "/manage/notifications" },
  { key: "fixtures", label: "Fixtures", href: "/manage/fixtures" },
  { key: "schedule", label: "Schedule", href: "/manage/schedule" },
  { key: "desk", label: "Desk", href: "/desk" },
  { key: "settings", label: "Settings", href: "/manage/settings" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];
