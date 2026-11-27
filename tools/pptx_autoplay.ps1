# Opens the PPTX in PowerPoint and sets every video to start automatically after the slide transition
# and to stay on its last frame. Usage: powershell -File tools/pptx_autoplay.ps1 deck.pptx
param([string]$Path)
$full = (Resolve-Path $Path).Path
$app = New-Object -ComObject PowerPoint.Application
$pres = $app.Presentations.Open($full, $false, $false, $false)
$n = 0
foreach ($sl in $pres.Slides) {
  foreach ($sh in $sl.Shapes) {
    if ($sh.Type -eq 16) {  # msoMedia
      $ps = $sh.AnimationSettings.PlaySettings
      $ps.PlayOnEntry = -1; $ps.HideWhileNotPlaying = 0; $ps.RewindMovie = 0; $ps.PauseAnimation = 0
      foreach ($e in $sl.TimeLine.MainSequence) { if ($e.Shape.Name -eq $sh.Name) { $e.Timing.TriggerType = 3; $e.Timing.TriggerDelayTime = 0 } }
      $n++
    }
  }
}
$pres.Save(); $pres.Close(); $app.Quit()
"$n videos set to play automatically"
