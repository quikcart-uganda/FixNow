# AppProvider Architecture Audit

## Root cause

`/technician` renders `SplashPage`, which calls `useApp()`.  
`AppProvider` was mounted only inside the authenticated shell layout (`RequireAuth` → `AppProvider` → `AppShell`), so the public technician entry routes were outside the context:

- `/technician` → `SplashPage` → `useApp()` ❌
- `/technician/onboarding` → `OnboardingPage` → `useApp()` ❌
- `/technician/register` → `RegisterPage` → `useApp()` ❌
- `/technician/dashboard` (and other shell routes) → inside `AppProvider` ✓

This was an intentional but incorrect optimisation comment (“Profile context only mounts after auth”) that broke the provider contract: any component that calls `useApp()` must sit under `AppProvider`.

Customer and Admin portals do not use technician `AppProvider`, which is why they kept working.

There is a single React root (`src/main.tsx` → `createRoot`). No duplicate trees.

## Provider tree before

```
createRoot
└─ StrictMode
   └─ AppErrorBoundary
      └─ BrowserRouter
         └─ AuthProvider
            └─ SocketProvider
               └─ PushProvider
                  └─ AppSplashGate
                     └─ App (Routes)
                        ├─ /customer/* → CustomerApp  (no technician AppProvider — OK)
                        ├─ /admin/*    → AdminRoutes  (no technician AppProvider — OK)
                        └─ /technician/*
                           └─ TechnicianRoutes
                              ├─ Splash / Onboarding / Login / Register   ← NO AppProvider
                              └─ RequireAuth
                                 └─ AppProvider          ← only here
                                    └─ AppShell + pages
```

## Provider tree after

```
createRoot
└─ StrictMode
   └─ AppErrorBoundary
      └─ BrowserRouter
         └─ AuthProvider
            └─ SocketProvider
               └─ PushProvider
                  └─ AppSplashGate
                     └─ App (Routes)
                        ├─ /customer/* → CustomerApp
                        ├─ /admin/*    → AdminRoutes
                        └─ /technician/*
                           └─ AppProvider                 ← portal root (once)
                              └─ TechnicianRoutes
                                 ├─ Splash / Onboarding / Login / Register
                                 └─ RequireAuth
                                    └─ AppShell + pages
```

Global providers (Auth / Socket / Push) remain at the app root.  
Technician `AppProvider` is portal-scoped once — not duplicated, not wrapped per page.

## Why this is safe

`AppProvider` already guards expensive work:

```ts
if (!isAuthenticated || !hasRole('technician')) return  // refreshProfile
```

Socket profile refresh is also gated with `isTechnician`. Mounting the provider on splash/login does not fetch technician profile until a technician session exists.

## Files modified

| File | Change |
|---|---|
| `apps/technician/routes.tsx` | Hoist `AppProvider` to `TechnicianApp`; remove nested provider under `RequireAuth` |
| `APP_PROVIDER_ARCHITECTURE_AUDIT.md` | This audit |

No changes to `main.tsx`, customer/admin portals, or auth.

## Reason for failure

Architectural mismatch: consumers of `useApp` on public technician routes were rendered outside the only `AppProvider` mount point. The error was correct and must not be silenced.

## Regression testing

| Check | Expectation |
|---|---|
| `/technician` | Splash loads; no provider error |
| `/technician/onboarding` | `setOnboarded` works |
| `/technician/register` | `refreshProfile` available after signup |
| `/technician/login` | Unchanged (does not need `useApp`) |
| `/technician/dashboard` | Shell + profile context works |
| `/customer/*` | Unaffected |
| `/admin/*` | Unaffected |
| Login / logout / role switch | Still driven by root `AuthProvider` |
| Desktop / Mobile Web / Capacitor | Same single provider hierarchy |

## Success criteria

- Technician portal loads without `useApp must be used within AppProvider`
- Customer and Admin unchanged
- Single technician `AppProvider` at portal root
- No per-component fake providers
- No silenced errors
