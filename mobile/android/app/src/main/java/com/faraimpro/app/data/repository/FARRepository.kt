package com.faraimpro.app.data.repository

import com.faraimpro.app.data.*

class FARRepository {
    
    fun getFARParts(): List<FARPart> = listOf(
        FARPart(
            part = 1,
            title = "Definitions and Abbreviations",
            cfr = "14 CFR Part 1",
            subchapter = "A",
            subchapterTitle = "Definitions and General Requirements",
            sections = listOf(
                FARSection(
                    section = "1.1",
                    title = "General definitions",
                    content = "As used in Subchapters A through K of this chapter, unless the context requires otherwise:",
                    definitions = listOf(
                        Definition("Aircraft", "A device that is used or intended to be used for flight in the air."),
                        Definition("Airplane", "An engine-driven fixed-wing aircraft heavier than air, that is supported in flight by the dynamic reaction of the air against its wings."),
                        Definition("Airport", "An area of land or water that is used or intended to be used for the landing and takeoff of aircraft."),
                        Definition("Pilot in Command", "The person who has final authority and responsibility for the operation and safety of the flight."),
                        Definition("Night", "The time between the end of evening civil twilight and the beginning of morning civil twilight.")
                    ),
                    keyPoints = listOf(
                        "These definitions apply throughout aviation regulations",
                        "Some terms may have different meanings in other contexts"
                    )
                )
            )
        ),
        FARPart(
            part = 61,
            title = "Certification: Pilots, Flight Instructors, and Ground Instructors",
            cfr = "14 CFR Part 61",
            subchapter = "D",
            subchapterTitle = "Airmen",
            subparts = listOf(
                Subpart(
                    subpart = "A",
                    title = "General",
                    sections = listOf(
                        FARSection(
                            section = "61.3",
                            title = "Requirement for certificates, ratings, and authorizations",
                            content = "A person may not act as pilot in command or in any other capacity as a required pilot flight crewmember unless that person has a valid pilot certificate in their physical possession.",
                            keyPoints = listOf(
                                "Must have valid pilot certificate in physical possession",
                                "Must have photo ID in physical possession",
                                "Must have medical certificate (if required)"
                            )
                        ),
                        FARSection(
                            section = "61.56",
                            title = "Flight review",
                            content = "No person may act as pilot in command unless within the preceding 24 calendar months, that person has accomplished a flight review.",
                            keyPoints = listOf(
                                "Required every 24 calendar months",
                                "Minimum 1 hour flight training",
                                "Minimum 1 hour ground training",
                                "Logbook endorsement from instructor"
                            )
                        ),
                        FARSection(
                            section = "61.57",
                            title = "Recent experience: Pilot in command",
                            content = "Currency requirements to carry passengers.",
                            keyPoints = listOf(
                                "Day currency: 3 takeoffs and landings in 90 days",
                                "Night currency: 3 takeoffs and landings to full stop in 90 days",
                                "Instrument currency: 6 approaches, holding, tracking in 6 months"
                            )
                        )
                    )
                )
            )
        ),
        FARPart(
            part = 91,
            title = "General Operating and Flight Rules",
            cfr = "14 CFR Part 91",
            subchapter = "F",
            subchapterTitle = "Air Traffic and General Operating Rules",
            subparts = listOf(
                Subpart(
                    subpart = "A",
                    title = "General",
                    sections = listOf(
                        FARSection(
                            section = "91.3",
                            title = "Responsibility and authority of the pilot in command",
                            content = "The pilot in command is directly responsible for, and is the final authority as to, the operation of that aircraft.",
                            keyPoints = listOf(
                                "PIC has final authority for operation and safety",
                                "May deviate from rules in emergency",
                                "Must submit written report upon request"
                            )
                        ),
                        FARSection(
                            section = "91.17",
                            title = "Alcohol or drugs",
                            content = "No person may act as a crewmember within 8 hours after consumption of alcohol or with blood alcohol of 0.04% or greater.",
                            keyPoints = listOf(
                                "8 hours bottle to throttle",
                                "0.04% blood alcohol limit",
                                "No drugs affecting safety"
                            )
                        )
                    )
                ),
                Subpart(
                    subpart = "B",
                    title = "Flight Rules - General",
                    sections = listOf(
                        FARSection(
                            section = "91.113",
                            title = "Right-of-way rules",
                            content = "When weather permits, vigilance shall be maintained to see and avoid other aircraft.",
                            keyPoints = listOf(
                                "Aircraft in distress has right-of-way",
                                "When converging, aircraft on right has right-of-way",
                                "Head-on: both alter course to right",
                                "Lower aircraft landing has right-of-way"
                            )
                        ),
                        FARSection(
                            section = "91.117",
                            title = "Aircraft speed",
                            content = "Speed limits for various airspace and situations.",
                            keyPoints = listOf(
                                "Below 10,000 MSL: 250 knots",
                                "Class B: 250 knots",
                                "Underlying Class B or in Class C/D within 4 NM: 200 knots"
                            )
                        )
                    )
                )
            )
        )
    )
}
