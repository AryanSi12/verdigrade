# Image credits

All photos come from [Pexels](https://www.pexels.com/) and are used under the
[Pexels License](https://www.pexels.com/license/): free for personal and commercial
use, modification allowed, **no attribution required**. Credit is listed here as a courtesy.

They were downloaded from `images.pexels.com`, cropped, and re-encoded to AVIF + WebP
(full size and a 400 px variant; the hero also has an 800 px variant). The original
files are not kept in the repository.

| File (base name) | Subject | Photographer | Source | License |
| --- | --- | --- | --- | --- |
| `hero-pipeline` (1600×900, 800, 400) | Server drive bays with status lights | Panumas Nikhomkhai | https://www.pexels.com/photo/close-up-photo-of-mining-rig-1148820/ | Pexels License |
| `bots-flow` (800×534, 400) | Blue-lit server hardware | Panumas Nikhomkhai | https://www.pexels.com/photo/light-on-computer-hardware-17489150/ | Pexels License |
| `stage-scan` (800×534, 400) | Code seen through eyeglasses | Kevin Ku | https://www.pexels.com/photo/data-codes-through-eyeglasses-577585/ | Pexels License |
| `stage-rewrite` (800×534, 400) | Code in an editor on a laptop | Luis Gomes | https://www.pexels.com/photo/close-up-photo-of-programming-of-codes-546819/ | Pexels License |
| `stage-verify` (800×534, 400) | Developer desk with terminal monitors | Josh Sorenson | https://www.pexels.com/photo/black-flat-screen-computer-monitor-1714208/ | Pexels License |
| `stage-report` (800×534, 400) | Printed charts and dashboard report | Lukas Blazek | https://www.pexels.com/photo/person-writing-on-notebook-669615/ | Pexels License |
| `report-desk` (800×534, 400) | Workstation with code on several screens | Christina Morillo | https://www.pexels.com/photo/1181675/ | Pexels License |

To replace an image, keep the base name and regenerate every variant, for example:

```bash
ffmpeg -i source.jpg -vf "scale=800:534:force_original_aspect_ratio=increase,crop=800:534" -c:v libwebp -quality 80 stage-scan.webp
ffmpeg -i source.jpg -vf "scale=800:534:force_original_aspect_ratio=increase,crop=800:534,format=yuv420p" -c:v libaom-av1 -still-picture 1 -crf 32 stage-scan.avif
```

Then update the dominant color / placeholder in `web/src/images.js`.
