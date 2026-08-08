# Category Icon Library Report

**Date:** 28 Jul 2026  
**Scope:** Expand FixNow Admin category icon catalogue for 100+ service verticals  
**Architecture reused:** Material Symbols Outlined ligature strings → `Category.icon` → shared `@fixnow/ui` `Icon`

---

## Verdict

The picker was not redesigned. The catalogue grew from **24 → 172** unique outline icons with **groups**, **aliases**, and smarter search. A **110-category** production seed dataset now maps each vertical to a meaningful default icon.

Administrators can create virtually any common service category without falling back to a generic handyman glyph.

---

## Architecture (unchanged)

| Layer | Detail |
|---|---|
| Storage | `Category.icon: String` (max 64) — Material Symbol name |
| Catalogue | `packages/assets/categoryIcons.ts` |
| Admin picker | `apps/admin/components/CategoryIconPicker.tsx` |
| Rendering | Shared `Icon` (Customer, Technician, Admin) — same ligature preview |
| Seed | `backend/scripts/data/serviceCategories.ts` → `seed-marketing.ts` |

Icons are **not** custom SVGs or dynamic imports. They remain outline Material Symbols for crisp rendering at 24px / 32px and in category cards.

---

## Totals

| Metric | Before | After |
|---|---|---|
| Catalogue icons | 24 | **172** |
| Industry groups | 0 (flat list) | **19** |
| Seed categories | 30 | **110** |
| Unique seed icons | ~28 (with drift) | **110** (1 intentional laundry pair fixed → unique) |
| Search aliases | none | per-icon keyword lists |

---

## Groups (19)

| Group | Icons |
|---|---|
| Electrical | 10 |
| Plumbing & Water | 8 |
| Construction | 18 |
| Home Interior | 9 |
| HVAC & Cooling | 7 |
| Cleaning | 10 |
| Outdoor | 8 |
| Security | 10 |
| Automotive | 10 |
| Technology | 14 |
| Appliances & Electronics | 8 |
| Health & Care | 9 |
| Beauty & Wellness | 8 |
| Education | 6 |
| Events & Creative | 8 |
| Food & Hospitality | 5 |
| Business & Logistics | 12 |
| Emergency | 6 |
| General | 6 |

---

## Search aliases

Search matches **label**, **Material Symbol value**, **group tokens**, and **aliases**.

Examples:

| Query | Finds (examples) |
|---|---|
| `electric` | Electrical, Power, Lighting, Solar, Generator, Battery, Metering, Cabling… |
| `car` | Vehicle Repair, Mechanics, Tyres, Battery, Car Wash, Auto Detailing, Oil Change… |
| `clean` | Cleaning, Deep Cleaning, Office Cleaning, Window Cleaning, Carpet… |
| `pest` | Pest Control, Fumigation |
| `ac` / `hvac` | HVAC, Air Conditioning, Cooling |
| `cctv` | CCTV |
| `wifi` / `internet` | Internet & Networking, Networking Gear |

Group matching is token-based so `car` does **not** falsely hit “Health & **Care**”.

---

## Picker enhancements (no redesign)

- Search input (existing) — now alias-aware  
- **Group filter** `<select>` in the same dropdown chrome  
- **Section headers** inside the scroll list (Electrical, Construction, …)  
- Footer count: “N icons · preview matches category cards…”  
- Legacy free-text icons still preserved until replaced  
- Preview uses the same `Icon` component / size as category cards across portals

---

## Seeded categories (110)

Full list lives in `backend/scripts/data/serviceCategories.ts`.

Coverage includes: Electrical · Lighting · Solar · Generators · Plumbing · Drainage · Boreholes · Pools · Carpentry · Furniture · Cabinets · Painting · Wallpaper · Interior · Curtains · Roofing · Waterproofing · Ceilings · Masonry · Concrete · Tiling · Paving · Flooring · HVAC · Ventilation · Refrigeration · Cold rooms · Cleaning suite · Landscaping · Lawn · Trees · Irrigation · Locksmith · Safes · CCTV · Access · Alarms · Automation · Satellite · Moving · Courier · Automotive suite · Phone/Laptop/TV/Printer · Appliances · Construction · Architecture · Engineering · Surveying · Glass · Welding · Pest · Fumigation · Waste · Recycling · Medical · Nursing · Babysitting · Pet · Vet · Photo/Video · DJ · Events · Catering · Bakery · Tailoring · Beauty · Hair · Spa · Fitness · Tutoring · Languages · Music · IT · Networking · Web · Graphics · Cloud · Data recovery · Cybersecurity · Drones · Signage · Fire safety · Inspection · Handyman · Emergency · Doors · Fencing · Bookkeeping · Legal · Consulting.

Each seed row includes: **name, slug, description, keywords, default icon, status (active), sort order**.

Run:

```bash
cd backend
npm run seed:marketing
```

---

## Files changed

| File | Role |
|---|---|
| `packages/assets/categoryIcons.ts` | **New** shared catalogue + filter/group helpers |
| `packages/assets/index.ts` | Re-exports |
| `apps/admin/components/CategoryIconPicker.tsx` | Uses catalogue; group filter + sections + alias search |
| `backend/scripts/data/serviceCategories.ts` | **New** 110-category seed dataset |
| `backend/scripts/seed-marketing.ts` | Consumes seed dataset |

---

## Validation checklist

- [x] Outline Material Symbols only (no mixed icon families)  
- [x] Unique catalogue `value`s (172 / 172)  
- [x] Search: electric → electrical verticals; car → automotive  
- [x] Grouped picker with searchable list  
- [x] Preview = same `Icon` used on Customer / Technician / Admin cards  
- [x] Seed icons aligned to catalogue (no orphan drift like old `bolt`-only seeds)  
- [ ] Manual: Desktop / Tablet / Android / iPhone picker scroll + keyboard  
- [ ] Manual: light / dark theme glyph contrast  
- [ ] Run `npm run seed:marketing` against local Mongo

---

## Remaining expansion opportunities

1. Add niche verticals (solar water heating, borehole camera inspection, generator hire).  
2. Optional `Category.searchKeywords` schema field (keywords currently appended into description for text index).  
3. Share catalogue with CMS `ContentIconPicker` where trade icons overlap.  
4. Admin “suggested icon” when typing a new category name (alias → best match).  
5. Banner imagery still separate — pair each seed slug with Cloudinary category banners via `seed:visual-assets`.

---

## Success criteria

| Criterion | Status |
|---|---|
| 100+ unique service icons | ✅ 172 |
| Meaningful icon per common vertical | ✅ |
| Alias search | ✅ |
| Grouped + searchable picker | ✅ |
| No picker redesign | ✅ |
| Production seed catalogue | ✅ 110 categories |
| Same render path platform-wide | ✅ Material Symbol → `Icon` |
