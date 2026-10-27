# Rebuild the vector wordmark from the same Trebuchet family used by site headings.
# Only outlines are exported; the website does not need this font installed.
Add-Type -AssemblyName System.Drawing
$repoDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$publicDirectory = Join-Path $repoDirectory 'src/frontend/public'
$culture = [System.Globalization.CultureInfo]::InvariantCulture
function Number([single]$value) { return $value.ToString('0.###', $culture) }
$outline = New-Object System.Drawing.Drawing2D.GraphicsPath
$family = New-Object System.Drawing.FontFamily('Trebuchet MS')
$outline.AddString('puttential', $family, [int][System.Drawing.FontStyle]::Bold, 32, [System.Drawing.PointF]::new(0, 0), [System.Drawing.StringFormat]::GenericTypographic)
$bounds = $outline.GetBounds()
$transform = New-Object System.Drawing.Drawing2D.Matrix
$transform.Translate((50 - $bounds.X), (10 - $bounds.Y))
$outline.Transform($transform)
$points = $outline.PathPoints
$types = $outline.PathTypes
$commands = [System.Collections.Generic.List[string]]::new()
for ($index = 0; $index -lt $points.Length; $index++) {
  $kind = $types[$index] -band 7
  $point = $points[$index]
  if ($kind -eq 0) {
    $commands.Add("M$(Number $point.X) $(Number $point.Y)")
  } elseif ($kind -eq 1) {
    $commands.Add("L$(Number $point.X) $(Number $point.Y)")
  } elseif ($kind -eq 3) {
    $control2 = $points[$index + 1]
    $end = $points[$index + 2]
    $commands.Add("C$(Number $point.X) $(Number $point.Y) $(Number $control2.X) $(Number $control2.Y) $(Number $end.X) $(Number $end.Y)")
    $index += 2
  }
  if (($types[$index] -band 128) -ne 0) { $commands.Add('Z') }
}
$wordmark = '<path fill="#2d3a3a" d="' + ($commands -join '') + '"/>'
$mark = '<path d="M8 36V8h13a9 9 0 0 1 2 18" fill="none" stroke="#2e7d32" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="26" r="2.5" fill="#2e7d32"/>'
$width = [int][Math]::Ceiling(50 + $bounds.Width + 3)
$logo = '<svg xmlns="http://www.w3.org/2000/svg" width="' + $width + '" height="44" viewBox="0 0 ' + $width + ' 44" fill="none"><title>Puttential</title>' + $mark + $wordmark + '</svg>'
$symbol = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="44" viewBox="0 0 40 44" fill="none"><title>Puttential</title>' + $mark + '</svg>'
[System.IO.File]::WriteAllText((Join-Path $publicDirectory 'puttential-logo.svg'), $logo + "`n")
[System.IO.File]::WriteAllText((Join-Path $publicDirectory 'puttential-mark.svg'), $symbol + "`n")
$iconMark = $mark.Replace('#2e7d32', '#ffffff')
$icon = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="11" fill="#2e7d32"/><g transform="translate(4 2)">' + $iconMark + '</g></svg>'
[System.IO.File]::WriteAllText((Join-Path $repoDirectory 'src/frontend/app/icon.svg'), $icon + "`n")
$outline.Dispose()
$family.Dispose()
$transform.Dispose()
Write-Output "Wrote outlined logo (${width}x44), symbol, and favicon."
