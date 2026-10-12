# Third-party content and notices

FAR/AIM Online combines project-authored software and study aids with source
material from public agencies and software maintained by other authors. The
[MIT License](LICENSE) applies only to project-authored code, documentation, and
original study material, to the extent the project has rights to license that
work. It does not grant rights to government publications, incorporated
third-party content, or dependencies. This list records known sources and
exceptions; it is not a complete rights audit or a substitute for notices in
the source files and upstream packages.

## Government publications

- **Federal regulations:** Data under [`data/far/`](data/far/) is sourced from
  [eCFR Title 14](https://www.ecfr.gov/current/title-14) and [Title
  49](https://www.ecfr.gov/current/title-49), maintained by the Office of
  the Federal Register at the National Archives with the Government Publishing
  Office. The eCFR is an editorial
  compilation, not the official legal edition. Consult the [official CFR
  collection](https://www.govinfo.gov/app/collection/cfr) and Federal Register
  for authoritative legal text.
- **FAA publications:** AIM, the Pilot/Controller Glossary, and Advisory
  Circular metadata and source links are attributed to the [FAA publication
  pages](https://www.faa.gov/air_traffic/publications/) and [FAA Advisory
  Circular catalog](https://www.faa.gov/regulations_policies/advisory_circulars/).
  FAA-hosted material can incorporate copyrighted work from other parties.
  Retain the source publication's notices and check the specific document
  before copying or redistributing its extracted text or figures.
- **Federal copyright rule:** [17 U.S.C. § 105](https://www.govinfo.gov/content/pkg/USCODE-2024-title17/html/USCODE-2024-title17-chap1-sec105.htm)
  generally bars U.S. copyright protection for qualifying works prepared by
  federal employees as part of official duties. It does not place third-party
  material incorporated into a publication under the MIT License.
- **FAA permissions process:** [FAA Order 1320.46D](https://www.faa.gov/documentLibrary/media/Order/FAA_Order_1320.46D.pdf)
  tells FAA authors to obtain written permission to use copyrighted
  non-government material in an AC. Any permission granted to the FAA does not
  by itself establish a redistribution license for this project.

## FAA Advisory Circular text withheld from offline bundles

The following FAA catalog entries and official links remain available, but the
project withholds their extracted text pending rights review:

| AC | Notice found in the source | Official source |
| --- | --- | --- |
| 150/5360-12F | Credits copyrighted *The Sign Users Guide* and Lighthouse International material, including figures on PDF pages 115-116. | [FAA catalog record](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1022248) |
| 150/5320-5D | Incorporates a DoD Unified Facilities Criteria document whose notice requires copyright-holder permission for reuse of copyrighted material apart from that UFC. | [FAA catalog record](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1022186) |
| 20-167B | Identifies copyrighted RTCA DO-315A as used with permission. | [FAA catalog record](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1044323) |
| 20-185A | Identifies copyrighted RTCA DO-315A, DO-359, and DO-371 as used with permission. | [FAA catalog record](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1039337) |
| 61-134 | Includes a © 1994 Flight Safety Foundation CFIT Checklist notice. | [FAA catalog record](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/22907) |

An FAA grant of permission to reproduce material in an FAA publication does not
by itself establish that the permission extends to this project. The source-only
catalog entries preserve FAA attribution and a route to the official document.

The text extractor also found an © 1986 bibliographic reference in AC
150/5370-16 to a book that the AC says “does not form a part of this guidance.”
The reference alone did not establish that the book itself was reproduced; its
notice is retained and the item remains subject to review if its content changes.
See the [FAA catalog record](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/22555).

## Software and assets

Third-party software is declared in the web, iOS, Android, and Python manifests
and lockfiles where applicable. Each component retains its own license and
attribution terms. The current web lockfile includes these visual assets:

| Package | Version | License and upstream notice |
| --- | --- | --- |
| `lucide-react` | 1.23.0 | ISC; the upstream [Lucide license](https://github.com/lucide-icons/lucide/blob/main/LICENSE) also includes an MIT notice for icons derived from Feather. Preserve the complete license notice when redistributing the bundled icons. |
| `@fontsource-variable/inter` | 5.3.0 | SIL Open Font License 1.1; copyright Inter Project Authors. See the [upstream Inter license](https://github.com/rsms/inter/blob/master/LICENSE.txt). |
| `@fontsource-variable/jetbrains-mono` | 5.3.0 | SIL Open Font License 1.1; copyright JetBrains Mono Project Authors. See the [upstream JetBrains Mono license](https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt). |

Review the license distributed with the exact dependency version before
redistributing or changing it. The project does not relicense these components
under MIT. Content figures and images also require source-specific review; a
figure's appearance in an FAA publication does not itself establish that it is
project-owned.

FAR/AIM Online is independent and is not affiliated with or endorsed by the FAA
or U.S. Department of Transportation. Government names and links identify
sources; they do not imply government sponsorship. Do not use government seals
or agency marks to suggest endorsement.

## License texts for bundled web assets

These texts were copied from the exact package versions in `web/pnpm-lock.yaml`.
They apply to the bundled icons and font files listed above.

### Lucide React 1.23.0

```text
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Inter font 5.3.0

```text
Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) Inter-Italic[opsz,wght].ttf: Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

### JetBrains Mono font 5.3.0

```text
Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono) JetBrainsMono-Italic[wght].ttf: Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```
