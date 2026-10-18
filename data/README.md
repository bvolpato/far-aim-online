# Data sources and reuse

The files in this directory do not share one blanket license. The repository's
[MIT License](../LICENSE) covers only original project-authored work, to the
extent the project has rights to license it. Source publications, figures,
third-party excerpts, and other incorporated material retain their applicable
rights and notices. See [the third-party notices](../THIRD_PARTY_NOTICES.md).

## Primary sources

| Dataset | Source and attribution | Notes |
| --- | --- | --- |
| FAR and selected related regulations (`far/`) | [eCFR Title 14](https://www.ecfr.gov/current/title-14) and [Title 49](https://www.ecfr.gov/current/title-49), maintained by the Office of the Federal Register at the National Archives with the Government Publishing Office | Includes Title 14 and selected Title 49 material such as 49 CFR part 830. The eCFR is a current editorial compilation, not the official legal edition. Check the official [CFR collection](https://www.govinfo.gov/app/collection/cfr) and Federal Register for authoritative legal text. |
| AIM and Pilot/Controller Glossary (`aim/`) | [FAA Air Traffic Plans and Publications](https://www.faa.gov/air_traffic/publications/) and the [FAA AIM HTML edition](https://www.faa.gov/air_traffic/publications/atpubs/aim_html/) | Use the FAA's current edition and effective changes. The FAA publication may contain material credited to other organizations. |
| Advisory Circular catalog and extracted text (`advisory-circulars/`) | [FAA Advisory Circulars catalog](https://www.faa.gov/regulations_policies/advisory_circulars/) | Catalog metadata and official document links identify FAA sources. An FAA-hosted document is not automatically covered by this project's MIT license or cleared for redistribution in extracted form. Check each publication's notices and incorporated content. |
| Quizzes, flashcards, and study paths (`quizzes/`, `flashcards/`, `study-paths.json`) | Project-authored study material, with source citations in the material where applicable | Keep questions and explanations original. A citation does not grant permission to reproduce a source's expressive text, tables, or figures. |

Section 105 of [Title 17 of the U.S. Code](https://www.govinfo.gov/content/pkg/USCODE-2024-title17/html/USCODE-2024-title17-chap1-sec105.htm)
generally excludes U.S. copyright protection for works of the U.S. Government as
defined there. It does not clear third-party material that a government
publication incorporates, nor establish rights in every government-hosted file.
Do not infer ownership or a redistribution license from a government URL. The
FAA's [Advisory Circular System order](https://www.faa.gov/documentLibrary/media/Order/FAA_Order_1320.46D.pdf)
instructs FAA authors to obtain written permission before using copyrighted
non-government material in an AC; that instruction does not itself give this
project permission to redistribute the material.

## Refresh integrity

Run the FAR, AIM, and glossary crawlers from `scripts/`, then run
`uv run python finalize_reference_refresh.py` to reconcile the source dates and
coverage in `source-status.json`. Rebuild search indexes and sync mobile bundles
after changing the shared data.

FAR `effectiveDate` values identify the eCFR snapshot actually downloaded. The
indexes record those dates separately from `fetchedAt`; a recent crawl date is
not proof that the downloaded regulations are current. Freshness checks use the
complete eCFR issue metadata, including the selected Title 49 parts.

AIM SVG and WebP figures are normalized to PNG for the offline mobile readers.
Publication figures must decode successfully; FAA export layout placeholders
and tracking pixels are not content. Missing sections or expected figures stop
the refresh before chapter JSON is published.

Numbered AIM figure captions are reconciled against the current dated FAA PDF.
The index records its source URL, effective date, and SHA-256 checksum. Repairs
that use an older FAA HTML mirror require that exact verified PDF checksum;
a future edition stops the refresh until those replacements are revalidated.

`uv run python crawl_advisory_circulars.py --check` audits every cached AC payload
without downloading or writing files. OCR can recover text from scanned pages,
but a complete text extraction does not reproduce every figure or PDF layout.
Records with omitted text pages remain marked partial, with official PDF links.

## Advisory Circulars with text withheld

These active FAA catalog records retain their metadata and official FAA links,
but their extracted text is withheld from the offline bundle while the noted
third-party rights remain unresolved:

| Advisory Circular | Reason the offline text is withheld |
| --- | --- |
| AC 150/5360-12F, *Airport Signing and Graphics* | Credits the copyrighted *The Sign Users Guide* and Lighthouse International material, including figures identified on PDF pages 115-116. [FAA catalog record](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1022248). |
| AC 150/5320-5D, *Airport Drainage Design* | Incorporates a Department of Defense Unified Facilities Criteria document. The extracted text includes its notice that copyrighted material is identified at point of use and requires copyright-holder permission for use apart from the UFC. [FAA catalog record](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1022186). |
| AC 20-167B, *Airworthiness Approval of Enhanced Vision System, Enhanced Flight Vision System, and Combined Vision System Equipment* | Page 5 identifies RTCA DO-315A as copyrighted and used with permission. FAA permission does not establish a license for this project. [FAA catalog record](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1044323). |
| AC 20-185A, *Airworthiness Approval of Synthetic Vision Systems, Synthetic Vision Guidance Systems and Aircraft State Awareness Synthetic Vision Systems* | Page 5 identifies RTCA DO-315A, DO-359, and DO-371 as copyrighted and used with permission. FAA permission does not establish a license for this project. [FAA catalog record](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1039337). |
| AC 61-134, *General Aviation Controlled Flight into Terrain Awareness* | Page 16 includes the Flight Safety Foundation CFIT Checklist copyright notice, © 1994. [FAA catalog record](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/22907). |

The catalog record and FAA link remain available so readers can consult the
official source. These exclusions address known notices; they are not a
representation that every remaining publication, figure, or asset has received
a complete rights review. Before adding or refreshing a source, inspect the
whole publication for copyright notices, incorporated standards, credited
figures, maps, photographs, and other third-party material. Record the source,
edition, relevant pages, and rights basis with the change. When redistribution
rights are unclear, keep the catalog citation and official link and omit the
offline text or asset.

AC 150/5370-16 cites a © 1986 airport-lighting book as resource material and
states that the book does not form part of the guidance. The citation alone did
not establish copied book content in the extracted AC. Preserve its source
notices and revisit if the payload changes.
