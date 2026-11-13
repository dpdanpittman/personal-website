#!/usr/bin/env python3
"""Makes the small test photos used by test/*.test.js. Run once: python3 make-fixtures.py (needs Pillow).
gps.jpg   JPEG with EXIF: camera make/model, date, and GPS position tags (0.5 N, 0.5 E: open sea, clearly fake).
meta.png  PNG with text chunks that name a made-up place and coordinates.
gps.webp  WebP with the same EXIF block as gps.jpg.
not-image.jpg  plain text with a .jpg name.   tiny.gif  a GIF (type not allowed)."""
import os
from PIL import Image, PngImagePlugin
here = os.path.dirname(os.path.abspath(__file__))
img = Image.new("RGB", (96, 64))
for x in range(96):
    for y in range(64):
        img.putpixel((x, y), (x * 2, y * 3, 120))
ex = Image.Exif()
ex[0x010F] = "TestCam"            # Make
ex[0x0110] = "Model 7"            # Model
ex[0x0132] = "2026:11:12 16:20:00"
ex[0x8825] = {1: "N", 2: (0.0, 30.0, 0.0), 3: "E", 4: (0.0, 30.0, 0.0), 5: 0, 6: 1.0}   # GPS IFD
img.save(os.path.join(here, "gps.jpg"), "JPEG", quality=90, exif=ex.tobytes())
img.save(os.path.join(here, "gps.webp"), "WEBP", quality=90, exif=ex.tobytes())
info = PngImagePlugin.PngInfo()
info.add_text("Location", "Testville, Nowhere 0.5000, 0.5000")
info.add_text("Comment", "made-up test text")
img.save(os.path.join(here, "meta.png"), "PNG", pnginfo=info)
open(os.path.join(here, "not-image.jpg"), "w").write("this is not a photo\n" * 10)
img.save(os.path.join(here, "tiny.gif"), "GIF")
check = Image.open(os.path.join(here, "gps.jpg")).getexif().get_ifd(0x8825)
assert check.get(2) and check.get(4), "GPS tags missing from gps.jpg"
print("fixtures written; gps.jpg GPS:", dict(check))
