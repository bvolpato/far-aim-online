#!/usr/bin/env python3
"""
Add titles to FAR parts from a known mapping.
"""

import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "far"

# Standard FAR part titles
PART_TITLES = {
    1: "Definitions and Abbreviations",
    3: "General Requirements",
    5: "Safety Management Systems",
    11: "General Rulemaking Procedures",
    13: "Investigative and Enforcement Procedures",
    14: "Rules Implementing the Equal Access to Justice Act",
    15: "Administrative Claims Under Federal Tort Claims Act",
    16: "Rules of Practice for Federally-Assisted Airport Enforcement Proceedings",
    17: "Procedures for Protests and Contract Disputes",
    21: "Certification Procedures for Products and Articles",
    23: "Airworthiness Standards: Normal Category Airplanes",
    25: "Airworthiness Standards: Transport Category Airplanes",
    26: "Continued Airworthiness and Safety Improvements for Transport Category Airplanes",
    27: "Airworthiness Standards: Normal Category Rotorcraft",
    29: "Airworthiness Standards: Transport Category Rotorcraft",
    31: "Airworthiness Standards: Manned Free Balloons",
    33: "Airworthiness Standards: Aircraft Engines",
    34: "Fuel Venting and Exhaust Emission Requirements",
    35: "Airworthiness Standards: Propellers",
    36: "Noise Standards: Aircraft Type and Airworthiness Certification",
    39: "Airworthiness Directives",
    43: "Maintenance, Preventive Maintenance, Rebuilding, and Alteration",
    45: "Identification and Registration Marking",
    47: "Aircraft Registration",
    48: "Registration and Marking Requirements for Small Unmanned Aircraft",
    49: "Recording of Aircraft Titles and Security Documents",
    60: "Flight Simulation Training Device Initial and Continuing Qualification and Use",
    61: "Certification: Pilots, Flight Instructors, and Ground Instructors",
    63: "Certification: Flight Crewmembers Other Than Pilots",
    65: "Certification: Airmen Other Than Flight Crewmembers",
    67: "Medical Standards and Certification",
    68: "Requirements for Operating Certain Small Aircraft Without a Medical Certificate",
    71: "Designation of Class A, B, C, D, and E Airspace Areas; Air Traffic Service Routes; and Reporting Points",
    73: "Special Use Airspace",
    77: "Safe, Efficient Use, and Preservation of the Navigable Airspace",
    91: "General Operating and Flight Rules",
    93: "Special Air Traffic Rules",
    95: "IFR Altitudes",
    97: "Standard Instrument Procedures",
    99: "Security Control of Air Traffic",
    101: "Moored Balloons, Kites, Amateur Rockets, Unmanned Free Balloons, and Certain Model Aircraft",
    103: "Ultralight Vehicles",
    105: "Parachute Operations",
    107: "Small Unmanned Aircraft Systems",
    110: "General Requirements",
    117: "Flight and Duty Limitations and Rest Requirements: Flightcrew Members",
    119: "Certification: Air Carriers and Commercial Operators",
    120: "Drug and Alcohol Testing Program",
    121: "Operating Requirements: Domestic, Flag, and Supplemental Operations",
    125: "Certification and Operations: Airplanes Having a Seating Capacity of 20 or More Passengers",
    129: "Operations: Foreign Air Carriers and Foreign Operators of U.S.-Registered Aircraft",
    133: "Rotorcraft External-Load Operations",
    135: "Operating Requirements: Commuter and On Demand Operations",
    136: "Commercial Air Tours and National Parks Air Tour Management",
    137: "Agricultural Aircraft Operations",
    139: "Certification of Airports",
    141: "Pilot Schools",
    142: "Training Centers",
    145: "Repair Stations",
    147: "Aviation Maintenance Technician Schools",
    150: "Airport Noise Compatibility Planning",
    151: "Federal Aid to Airports",
    152: "Airport Aid Program",
    153: "Airport Operations",
    155: "Release of Airport Property from Surplus Property Disposal Restriction",
    156: "State Block Grant Pilot Program",
    157: "Notice of Construction, Alteration, Activation, and Deactivation of Airports",
    158: "Passenger Facility Charges (PFCs)",
    161: "Notice and Approval of Airport Noise and Access Restrictions",
    169: "Expenditure of Federal Funds for Nonmilitary Airports",
    170: "Establishment and Discontinuance Criteria for Air Traffic Control Services",
    171: "Non-Federal Navigation Facilities",
    183: "Representatives of the Administrator",
    185: "Testimony by Employees and Production of Records",
    187: "Fees",
    189: "Use of Federal Aviation Administration Communications System",
    193: "Protection of Voluntarily Submitted Information",
    198: "Aviation Insurance",
    375: "Navigation of Foreign Civil Aircraft Within the United States",
    # 49 CFR
    172: "Hazardous Materials Table, Special Provisions, Hazardous Materials Communications",
    175: "Hazardous Materials: Carriage by Aircraft",
    830: "Notification and Reporting of Aircraft Accidents or Incidents",
    1544: "Aircraft Operator Security: Air Carriers and Commercial Operators",
    1552: "Flight Schools",
}


def main():
    updated = 0

    # Update individual part files
    for part_file in DATA_DIR.glob("part*.json"):
        part_num = int(part_file.stem.replace("part", ""))

        with open(part_file, "r") as f:
            data = json.load(f)

        if not data.get("title") and part_num in PART_TITLES:
            data["title"] = PART_TITLES[part_num]
            with open(part_file, "w") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            updated += 1
            print(f"Updated Part {part_num}: {PART_TITLES[part_num]}")

    # Update index files
    for index_file in [DATA_DIR / "index.json", DATA_DIR / "pilot-index.json"]:
        if not index_file.exists():
            continue

        with open(index_file, "r") as f:
            data = json.load(f)

        for part in data.get("parts", []):
            part_num = part.get("part")
            if not part.get("title") and part_num in PART_TITLES:
                part["title"] = PART_TITLES[part_num]

        with open(index_file, "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"Updated {index_file.name}")

    print(f"\nTotal parts updated: {updated}")


if __name__ == "__main__":
    main()
