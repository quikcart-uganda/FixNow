$ErrorActionPreference = 'Stop'
$root = 'D:\FixNow\FIXNOW APP\FIXNOW APP'
Set-Location $root

# Create package dirs
New-Item -ItemType Directory -Force -Path packages\ui, packages\utils, packages\types, packages\api, packages\hooks, packages\shared | Out-Null
New-Item -ItemType Directory -Force -Path apps\technician\components\layout, apps\technician\components\jobs, apps\technician\components\trust, apps\technician\context | Out-Null
New-Item -ItemType Directory -Force -Path apps\admin | Out-Null
New-Item -ItemType Directory -Force -Path apps\customer\pages, apps\customer\reference\stitch | Out-Null
New-Item -ItemType Directory -Force -Path backend, docs | Out-Null

# packages/ui
Move-Item src\components\ui\*.tsx packages\ui\

# packages/utils
Move-Item src\lib\cn.ts packages\utils\cn.ts

# packages/types
Move-Item src\types\index.ts packages\types\index.ts
Move-Item src\admin\types.ts packages\types\admin.ts

# packages/api
Move-Item src\data\mock.ts packages\api\index.ts
Move-Item src\admin\data\mock.ts packages\api\admin.ts

# apps/technician
Move-Item src\pages apps\technician\pages
Move-Item src\components\layout\AppShell.tsx apps\technician\components\layout\AppShell.tsx
Move-Item src\components\jobs\JobCard.tsx apps\technician\components\jobs\JobCard.tsx
Move-Item src\components\trust\Trust.tsx apps\technician\components\trust\Trust.tsx
Move-Item src\context\AppContext.tsx apps\technician\context\AppContext.tsx

# apps/admin
Move-Item src\admin\pages apps\admin\pages
Move-Item src\admin\components apps\admin\components
Move-Item src\admin\AdminRoutes.tsx apps\admin\AdminRoutes.tsx

# Copy Stitch HTML for audit trail
$stitch = 'D:\FixNow\Customer ux\stitch_fixnow_elite_customer ux'
Get-ChildItem -Path $stitch -Directory | ForEach-Object {
  $html = Join-Path $_.FullName 'code.html'
  if (Test-Path $html) {
    $dest = Join-Path 'apps\customer\reference\stitch' $_.Name
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item $html (Join-Path $dest 'code.html')
  }
}

# Copy IA docs
Copy-Item 'D:\FixNow\Customer ux\*.md' docs\ -Force -ErrorAction SilentlyContinue

# cleanup now-empty source dirs
Remove-Item -Recurse -Force src\components, src\lib, src\types, src\data, src\context, src\admin -ErrorAction SilentlyContinue

Write-Output "MOVES_DONE"
