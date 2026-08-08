# FixNow Mongoose Typing Fix — Render Build Failure

**Date:** 2026-08-08  
**Branch:** `clean-master`  
**Constraint:** No `any` / `@ts-ignore` / `@ts-nocheck` / `as unknown as` suppressions for this fix.

---

## 1. Root cause

Render failed at **TypeScript compile** (`Exited with status 2 while building`) because Mongoose models resolved to **`Document<unknown>`** / **`FlattenMaps<unknown>`**.

That is **not** an Atlas, MongoDB, or Render runtime issue. Express never started because `tsc` failed first.

### Why models became `Document<unknown>`

1. Helper `createSchema` in `backend/src/models/shared/base.ts` did:
   - `new Schema(definition)` **without** a document type parameter
   - then `return schema as Schema<T & …>` (post-hoc assertion)

2. **Mongoose 8.24** (with TypeScript 5.9) prefers this `model()` overload:

   ```ts
   model<TSchema extends Schema>(name, schema): Model<InferSchemaType<TSchema>, …>
   ```

3. `InferSchemaType<TSchema>` reads the Schema’s **`DocType`** generic.  
   An untyped `new Schema(definition)` leaves DocType effectively empty/unknown.  
   A return-type assertion does **not** reconstruct path typing for InferSchemaType.

4. Result: `Wallet.findOne()`, `Transaction.find()`, `.lean()`, etc. returned documents with only `_id` / `__v` in the type system → hundreds of `Property 'currency' does not exist on type Document<unknown>` errors (starting in `payment.service.ts`, then wallet/platform services).

---

## 2. Why the typing broke (timing)

| Factor | Detail |
|--------|--------|
| Mongoose | `8.24.1` (schema/model generics tightened; InferSchemaType-first `model` overload) |
| TypeScript | `5.9.3` |
| Fragile pattern | Untyped `Schema` + cast return — worked under older inference, fails under 8.24 |

Local/Atlas URI configuration did not cause this.

---

## 3. Why the fix is correct

`createSchema` now constructs:

```ts
const schema = new Schema<T>(definition, { timestamps: true, versionKey: false });
```

So `RawDocType` / `DocType` = the domain interface (`IWallet`, `ITransaction`, …).

Then:

- `model<IWallet>('Wallet', walletSchema)` / InferSchemaType both see real fields (`currency`, `customerId`, …)
- Plugins still add soft-delete / dataEnvironment / metadata at runtime
- Optional `metadata` / `dataEnvironment` declared on `SoftDeleteFields` so HydratedDocument exposes plugin fields without casts
- Remaining service/controller errors fixed with real types (HydratedDocument, union narrowing, `fullName` vs `name`, etc.) — not suppressions

---

## 4. Files changed (primary)

### Architecture (root fix)

- `backend/src/models/shared/base.ts` — typed `new Schema<T>()`, plugin field typing, safer options handling

### Follow-on typing repairs (no business-logic redesign)

- Controllers / platform mode aliases  
- Community, marketplace, sandbox seed, portfolio, referral, tracking, verification, boost, company team, auth, AI context, development access, sockets, `ensurePublicJobReference`  
- `backend/src/services/sandbox/dataEnvironment.ts` — `documentDataEnvironment(object)` via `Reflect.get` (accepts HydratedDocuments)

---

## 5. Validation (local)

| Command | Result |
|---------|--------|
| `npx tsc -p tsconfig.json --noEmit` | **PASS** (`TYPECHECK_OK`) |
| `npm run build` (`tsc -p tsconfig.json`) | **PASS** (`BUILD_OK`) |
| `npm run lint` (same as typecheck in this package) | **PASS** (`LINT_OK`) |

Payment / wallet `Document<unknown>` errors: **gone**.

---

## 6. Render / Atlas (post-deploy)

After this commit is on `origin/clean-master` and Render auto-deploys (branch must be **`clean-master`**):

1. Build should compile (no TS status 2)
2. Then verify:
   - `GET https://fixnow-dpjg.onrender.com/livez`
   - `GET …/readyz` → `mongodb: connected`
   - `GET …/health`
   - `GET …/diagnostics` → `mongodb.target.kind` should be `atlas` when Atlas URI is set

Atlas connectivity is separate from this compile fix; Render env must still have `MONGODB_URI` Atlas.

---

## 7. GitHub

Push target: **`origin/clean-master`** (there is still no remote `master`).

---

## Success criteria

- Backend compiles with **zero** TypeScript errors  
- Architectural fix to Schema generics (not suppressions)  
- Ready for Render build to proceed past `tsc`
