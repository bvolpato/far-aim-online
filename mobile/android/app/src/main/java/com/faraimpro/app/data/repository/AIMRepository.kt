package com.faraimpro.app.data.repository

import com.faraimpro.app.data.*

class AIMRepository {
    
    fun getAIMChapters(): List<AIMChapter> = listOf(
        AIMChapter(
            chapter = 1,
            title = "Air Navigation",
            sections = listOf(
                AIMSection(
                    section = "1-1",
                    title = "Navigation Aids",
                    content = "This section describes the various navigation aids available for aircraft guidance.",
                    subsections = listOf(
                        AIMSubsection(
                            subsection = "1-1-3",
                            title = "VHF Omnidirectional Range (VOR)",
                            content = "VORs operate within the 108.0 to 117.95 MHz frequency band and have a power output necessary to provide coverage within their assigned operational service volume.",
                            keyPoints = listOf(
                                "Line of sight propagation",
                                "Course accuracy ±1 degree",
                                "Frequencies: 108.0-117.95 MHz"
                            )
                        ),
                        AIMSubsection(
                            subsection = "1-1-4",
                            title = "VOR Receiver Check",
                            content = "The FAA VOR test facility (VOT) transmits a test signal which provides users a convenient means to determine the operational status and accuracy of a VOR receiver.",
                            keyPoints = listOf(
                                "VOT: ±4 degrees",
                                "Ground checkpoint: ±4 degrees",
                                "Airborne checkpoint: ±6 degrees",
                                "Dual VOR: within 4 degrees of each other"
                            )
                        )
                    )
                )
            )
        ),
        AIMChapter(
            chapter = 3,
            title = "Airspace",
            sections = listOf(
                AIMSection(
                    section = "3-2",
                    title = "Controlled Airspace",
                    content = "Controlled airspace is a generic term that covers the different classification of airspace and defined dimensions within which air traffic control service is provided.",
                    subsections = listOf(
                        AIMSubsection(
                            subsection = "3-2-2",
                            title = "Class A Airspace",
                            content = "Class A airspace is generally that airspace from 18,000 feet MSL up to and including FL600.",
                            keyPoints = listOf(
                                "18,000 feet MSL to FL600",
                                "IFR operations only",
                                "ATC clearance required"
                            )
                        ),
                        AIMSubsection(
                            subsection = "3-2-3",
                            title = "Class B Airspace",
                            content = "Class B airspace is generally from the surface to 10,000 feet MSL surrounding the nation's busiest airports.",
                            keyPoints = listOf(
                                "ATC clearance required to enter",
                                "Transponder with Mode C required",
                                "Private pilot minimum",
                                "3 SM visibility, clear of clouds"
                            )
                        ),
                        AIMSubsection(
                            subsection = "3-2-4",
                            title = "Class C Airspace",
                            content = "Class C airspace generally extends from the surface to 4,000 feet above the airport elevation.",
                            keyPoints = listOf(
                                "Two-way radio communication required",
                                "Transponder with Mode C required",
                                "3 SM visibility, 500/1000/2000 cloud clearance"
                            )
                        ),
                        AIMSubsection(
                            subsection = "3-2-5",
                            title = "Class D Airspace",
                            content = "Class D airspace generally extends from the surface to 2,500 feet above the airport elevation.",
                            keyPoints = listOf(
                                "Two-way radio communication required",
                                "3 SM visibility, 500/1000/2000 cloud clearance"
                            )
                        ),
                        AIMSubsection(
                            subsection = "3-2-6",
                            title = "Class E Airspace",
                            content = "Class E airspace is controlled airspace that is designated to serve a variety of terminal or en route purposes.",
                            keyPoints = listOf(
                                "Above Class G up to but not including 18,000 feet",
                                "No ATC clearance required for VFR",
                                "3 SM visibility below 10,000 feet"
                            )
                        )
                    )
                )
            )
        )
    )
}
