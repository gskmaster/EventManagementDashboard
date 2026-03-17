# Troubleshooting Payload CMS 3.x

## 1. ServerFunctionsProvider Error
**Issue**: `Error: ServerFunctionsProvider requires a serverFunction prop`.
**Root Cause**: Incompatibility with Next.js 15+ Server Actions in Payload layouts.
**Solution**:
1. Create `app/(payload)/actions.ts` with:
   ```typescript
   'use server'
   export const serverFunction = async () => {}
   ```
2. Pass it to the `RootLayout` in `app/(payload)/layout.tsx`.

## 2. React Hydration Mismatch (Error #418 / #423)
**Issue**: Browser console shows "Hydration failed" or server exception.
**Root Cause**: 
- Nested `html` or `body` tags (root layout wrapping payload layout).
- Missing database tables causing Server Component crashes.
**Solution**:
- Move site layout to `app/(site)/layout.tsx`.
- Ensure database is initialized using `push: true`.

## 3. Broken Admin Styles (White Sidebar/Hidden Text)
**Issue**: Tailwind CSS leaks into the Admin panel, resetting default Payload styles.
**Root Cause**: `@tailwind base` (Preflight) in a global CSS file.
**Solution**:
- Isolate layouts using Route Groups.
- Remove `@tailwind base;` from any CSS imported specifically into `app/(payload)/layout.tsx`.

## 4. Missing Components / importMap Warnings
**Issue**: `getFromImportMap: PayloadComponent not found` or collections missing from sidebar.
**Solution**:
1. Run `npx payload generate:importmap`.
2. Verify `app/(payload)/layout.tsx` passes the `importMap`.
3. Verify `app/(payload)/admin/[[...segments]]/page.tsx` passes the `importMap` to BOTH `generatePageMetadata` and `RootPage`.
4. If grouping is broken, ensure `Payload-Config` alias or direct import is correct.

## 5. Blank Collection List Pages (API Error: "Something went wrong")
**Issue**: Collection appears in sidebar, creation pages work, but the list page is blank and API requests fail.
**Root Cause**: Database schema mismatch (missing tables or renamed columns).
**Solution**:
1. **Check Status**: Run `npx payload migrate:status`.
2. **Apply Migrations**: Run `npx payload migrate`. 
3. **Manual Record**: If a migration fails because "table already exists", use a script to manually create a record in the `payload-migrations` collection for that migration name.
4. **Diagnostic Script**: Create a script using `payload.find()` to test raw data fetching for the affected collection and inspect the server-side stack trace.
