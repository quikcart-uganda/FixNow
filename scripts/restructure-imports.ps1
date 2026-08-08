$ErrorActionPreference = 'Stop'
$root = 'D:\FixNow\FIXNOW APP\FIXNOW APP'
Set-Location $root

# Ordered literal module-path replacements (applied to all files under apps/ and packages/)
$moduleMap = [ordered]@{
  '@/components/ui/Button'        = '@fixnow/ui'
  '@/components/ui/Card'          = '@fixnow/ui'
  '@/components/ui/Badge'         = '@fixnow/ui'
  '@/components/ui/Field'         = '@fixnow/ui'
  '@/components/ui/Icon'          = '@fixnow/ui'
  '@/components/ui/Progress'      = '@fixnow/ui'
  '@/components/layout/AppShell'  = '@technician/components/layout/AppShell'
  '@/components/jobs/JobCard'     = '@technician/components/jobs/JobCard'
  '@/components/trust/Trust'      = '@technician/components/trust/Trust'
  '@/context/AppContext'          = '@technician/context/AppContext'
  '@/data/mock'                   = '@fixnow/api'
  '@/types'                       = '@fixnow/types'
  '@/lib/cn'                      = '@fixnow/utils'
  "'../data/mock'"                = "'@fixnow/api/admin'"
  "'../types'"                    = "'@fixnow/types/admin'"
}

$files = Get-ChildItem -Path apps, packages -Recurse -Include *.ts, *.tsx -File
foreach ($f in $files) {
  $c = Get-Content -Raw -LiteralPath $f.FullName
  $orig = $c
  foreach ($k in $moduleMap.Keys) {
    $c = $c.Replace($k, $moduleMap[$k])
  }
  if ($c -ne $orig) {
    Set-Content -NoNewline -LiteralPath $f.FullName -Value $c
    Write-Output ("MODULE  " + $f.FullName.Substring($root.Length + 1))
  }
}

# Technician route prefixing: prefix internal absolute paths with /technician
$navPattern = '([''"`])/(dashboard|jobs|active|complete|portfolio|reviews|earnings|locked|upgrade|notifications|messages|profile|settings|availability|service-areas|services|reputation|achievements|community|referrals|guarantee|help|onboarding|register)'
$navReplace = '$1/technician/$2'

$navFiles = Get-ChildItem -Path apps\technician -Recurse -Include *.ts, *.tsx -File
$navFiles += Get-Item -LiteralPath packages\api\index.ts
foreach ($f in $navFiles) {
  $c = Get-Content -Raw -LiteralPath $f.FullName
  $orig = $c
  $c = [regex]::Replace($c, $navPattern, $navReplace)
  if ($c -ne $orig) {
    Set-Content -NoNewline -LiteralPath $f.FullName -Value $c
    Write-Output ("NAV     " + $f.FullName.Substring($root.Length + 1))
  }
}

Write-Output "IMPORTS_DONE"
