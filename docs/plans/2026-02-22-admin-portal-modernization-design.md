# Admin Portal Modernization Design

**Date:** 2026-02-22
**Status:** Approved
**Approach:** Shell First, Pages Incremental (Approach 2)

## Overview

Modernize the SSMSPL admin portal to match the design language and UX of the Jetty (carferry.online) legacy portal while adding missing features. Introduces shadcn/ui component library, a multi-theme system, collapsible sidebar with grouped navigation, and enhanced dashboard/reports pages.

## Scope

### In Scope
- Full UI redesign of all existing admin pages
- shadcn/ui component library integration
- New collapsible sidebar with icons, groups, and user card
- Minimal header (page title + search + notification bell)
- Multi-theme system (light/dark + color palettes)
- Enhanced dashboard with stats, charts, quick actions
- Employee Transfer page
- Ticket Verification page (search + verify + print)
- Reports page (filters, stats, CSV export)
- Theme management in Settings (admin changes active, super admin adds/removes)

### Out of Scope
- Guest management (Guests, Guest Categories)
- Houseboat feature
- Customer portal changes
- Public website changes
- Backend API changes (except active_theme field on company settings)

## Design Decisions

### 1. Component Library: shadcn/ui
- Install shadcn/ui with Tailwind CSS v4 compatibility
- Core components: Button, Card, Input, Select, Dialog, Table, Badge, DropdownMenu, Separator, Sheet, Tooltip, Tabs, Avatar, Command (for search)
- All existing raw-Tailwind components migrated to shadcn equivalents

### 2. Layout Shell

```
+-----------------------------------------------------------+
| [Sidebar]                [Main Content Area]              |
| +----------+  +----------------------------------------+ |
| | Logo [<] |  | Page Title              [Search] [Bell]| |
| |----------|  |----------------------------------------| |
| | Dashboard|  |                                        | |
| | Counter  |  |   Page content with cards, tables,     | |
| | v Reports|  |   forms using shadcn/ui components     | |
| |  Tickets |  |                                        | |
| |  Vehicle |  |                                        | |
| | v Masters|  |                                        | |
| |  Items   |  |                                        | |
| |  Categs  |  |                                        | |
| |  Rates   |  |                                        | |
| |  Ferries |  |                                        | |
| |  Schedls |  |                                        | |
| |  Branchs |  |                                        | |
| |  SpclChrg|  |                                        | |
| | Transfer |  |                                        | |
| | Verify   |  |                                        | |
| |----------|  |                                        | |
| | ADMIN    |  |                                        | |
| | v Users  |  |                                        | |
| | Settings |  +----------------------------------------+ |
| |----------|                                              |
| | [A] User |                                              |
| | email    |                                              |
| |     [=>] |                                              |
| +----------+                                              |
+-----------------------------------------------------------+
```

**Sidebar:**
- Width: 240px expanded, 64px collapsed (icon-only)
- Toggle button at top next to logo
- Menu items with lucide-react icons
- Collapsible groups: Reports, Masters, User Management
- Section divider: "ADMINISTRATION" label before User Management
- Active item: highlighted with theme accent color + left border
- Bottom: user avatar (initials circle), full name, email, logout icon
- Backend RBAC still controls which items appear per role
- Frontend groups items by category based on item name mapping

**Header:**
- No full top navbar bar (removed)
- Inline with main content: page title (left), search bar (center-right), notification bell (right)
- Minimal, clean design

### 3. Theme System

**Architecture:**
- Predefined themes stored in `frontend/src/lib/themes.ts`
- Each theme defines CSS variable values for light and dark modes
- Active theme name stored in company settings (`active_theme` field)
- `ThemeProvider` React context wraps dashboard layout
- Applies CSS variables to `<html>` element

**Default Themes:**
| Theme Name | Sidebar | Primary | Description |
|------------|---------|---------|-------------|
| `ocean` | Dark navy (#0f172a) | Blue (#2563eb) | Default, marine branding |
| `indigo` | Dark indigo (#1e1b4b) | Indigo (#6366f1) | Jetty-style |
| `emerald` | Dark teal (#022c22) | Emerald (#10b981) | Green variation |
| `slate` | Dark gray (#1e293b) | Slate (#64748b) | Neutral |

Each theme has light and dark mode variants.

**CSS Variables:**
```css
--sidebar-bg, --sidebar-text, --sidebar-hover, --sidebar-active
--primary, --primary-foreground
--secondary, --secondary-foreground
--accent, --accent-foreground
--background, --foreground
--card, --card-foreground
--muted, --muted-foreground
--destructive, --destructive-foreground
--border, --input, --ring
--radius
```

**Permissions:**
- All users: see current theme
- Admin: change active theme (dropdown in Settings)
- Super Admin: add/remove custom themes (JSON editor in Settings)

**Backend Change:**
- Add `active_theme` VARCHAR column to `companies` table (default: 'ocean')
- Returned via existing `GET /api/company/` endpoint
- Updated via existing `PUT /api/company/` endpoint

### 4. Sidebar Menu Structure (Hybrid)

Backend RBAC `ROLE_MENU_ITEMS` remains the authority. Frontend groups the flat menu item list into visual categories:

```typescript
const MENU_GROUPS = {
  main: ['Dashboard', 'Ticketing', 'Multi-Ticketing'],
  reports: { label: 'Reports', items: ['Reports'] },
  masters: {
    label: 'Masters',
    items: ['Items', 'Item Rates', 'Ferries', 'Branches', 'Routes', 'Schedules', 'Payment Modes']
  },
  operations: ['Transfer', 'Ticket Verification'],
  admin: {
    label: 'User Management',
    section: 'ADMINISTRATION',
    items: ['Users']
  },
  settings: ['System Settings']
};
```

Items not in the user's `menu_items` list are hidden. Groups with zero visible items are hidden entirely.

### 5. Page Designs

#### Enhanced Dashboard
- Welcome banner with gradient (theme-colored)
- Date picker + Daily/Monthly toggle
- 4 stats cards: Tickets Issued, Revenue, Active Ferries, Pending Verifications
- Quick Actions: New Ticket, View Reports, Verify Tickets
- Recent Tickets list (5 most recent)
- System Status card

#### All CRUD Pages (Users, Ferries, Branches, Routes, Schedules, Items, Item Rates, Payment Modes)
- shadcn Card wrapper
- Page header: Title + subtitle + "Add New" button
- shadcn DataTable with sorting, filtering, pagination
- shadcn Dialog for create/edit forms
- Status badges using shadcn Badge
- Avatar circles for entities (branches, users)
- Empty state with icon + message
- Keep existing export functionality (PDF/Excel on Branches)

#### Ticketing / Multi-Ticketing
- Migrate to shadcn Card sections
- shadcn Select for dropdowns
- shadcn Input for form fields
- Payment modal using shadcn Dialog
- Keep existing line items table pattern with shadcn styling

#### Employee Transfer (New)
- Table of employees with current branch assignment
- Transfer action: opens dialog with target branch selector
- Confirmation step before executing transfer

#### Ticket Verification (New)
- Centered search card with ticket ID input
- Ticket details card with verification status badge
- Line items breakdown table
- Actions: Mark Verified, Print 58mm, Print 80mm

#### Reports (New)
- Filter panel: branch, payment mode, ferry, date range
- 4 stats summary cards with gradient backgrounds
- Ticket details table with pagination
- CSV export button
- Page total footer

#### Settings (Enhanced)
- Company Information card (existing)
- Theme Management card:
  - Active theme selector (Admin+)
  - Light/dark mode toggle
  - Theme preview strip
  - Custom theme editor (Super Admin only)

#### Change Password
- Centered shadcn Card with form inputs

## Implementation Phases

### Phase 1: Foundation (Shell + Theme)
- Install and configure shadcn/ui
- Create new layout components (Sidebar, Header, ThemeProvider)
- Create reusable DataTable component
- Add active_theme to company settings (backend migration)
- Wire up theme provider

### Phase 2: Migrate Existing Pages
- Dashboard (enhanced version)
- All CRUD pages: Users, Ferries, Branches, Routes, Schedules, Items, Item Rates, Payment Modes
- Ticketing + Multi-Ticketing
- Settings (enhanced with theme management)
- Change Password
- Login page (optional refresh)

### Phase 3: Add New Features
- Employee Transfer page + backend endpoint
- Ticket Verification page + backend endpoint
- Reports page + backend endpoint

### Phase 4: Polish
- Theme management UI (super admin custom themes)
- Responsive mobile sidebar (sheet overlay)
- Loading skeletons
- Empty states with illustrations
- Final QA pass
