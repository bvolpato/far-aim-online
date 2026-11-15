import AssetKit
import Foundation

struct BuildError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

func plist(_ url: URL) throws -> [String: Any] {
    guard let value = try PropertyListSerialization.propertyList(
        from: Data(contentsOf: url), format: nil
    ) as? [String: Any] else { throw BuildError("Expected plist dictionary: \(url.path)") }
    return value
}

func expand(_ value: Any, settings: [String: String]) throws -> Any {
    if let text = value as? String {
        var result = text
        for (key, value) in settings { result = result.replacingOccurrences(of: "$(\(key))", with: value) }
        guard !result.contains("$(") else { throw BuildError("Unresolved build setting: \(result)") }
        return result
    }
    if let values = value as? [Any] { return try values.map { try expand($0, settings: settings) } }
    if let values = value as? [String: Any] { return try values.mapValues { try expand($0, settings: settings) } }
    return value
}

func files(in directory: URL) throws -> [String: URL] {
    guard let enumerator = FileManager.default.enumerator(
        at: directory, includingPropertiesForKeys: [.isRegularFileKey]
    ) else { throw BuildError("Cannot enumerate \(directory.path)") }
    var result: [String: URL] = [:]
    for case let url as URL in enumerator {
        if try url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true {
            result[String(url.path.dropFirst(directory.path.count + 1))] = url
        }
    }
    return result
}

let iconSlots: [(idiom: String, points: String, scales: [Int])] = [
    ("iphone", "20", [2, 3]), ("iphone", "29", [2, 3]),
    ("iphone", "40", [2, 3]), ("iphone", "60", [2, 3]),
    ("ipad", "20", [1, 2]), ("ipad", "29", [1, 2]),
    ("ipad", "40", [1, 2]), ("ipad", "76", [1, 2]), ("ipad", "83.5", [2]),
]

func verifyIconPNG(_ file: URL, pixels: Int) throws {
    let data = try Data(contentsOf: file)
    guard data.count >= 33, data.prefix(8) == Data([137, 80, 78, 71, 13, 10, 26, 10]) else {
        throw BuildError("Invalid icon PNG: \(file.lastPathComponent)")
    }
    func uint32(_ offset: Int) -> Int { data[offset..<offset + 4].reduce(0) { ($0 << 8) | Int($1) } }
    guard uint32(16) == pixels, uint32(20) == pixels, data[24] == 8, data[25] == 2 else {
        throw BuildError("Icon must be an opaque 8-bit RGB \(pixels)x\(pixels) PNG: \(file.lastPathComponent)")
    }
    var offset = 8
    while offset + 12 <= data.count {
        let length = uint32(offset)
        guard offset + length + 12 <= data.count else { throw BuildError("Truncated icon PNG") }
        guard String(decoding: data[offset + 4..<offset + 8], as: UTF8.self) != "tRNS" else {
            throw BuildError("App icons cannot contain transparency")
        }
        offset += length + 12
    }
}

func prepareIconCatalog(_ catalog: URL) throws {
    let directory = catalog.appendingPathComponent("AppIcon.appiconset")
    let contentsURL = directory.appendingPathComponent("Contents.json")
    guard var contents = try JSONSerialization.jsonObject(with: Data(contentsOf: contentsURL)) as? [String: Any],
          var images = contents["images"] as? [[String: Any]] else { throw BuildError("Invalid AppIcon contents") }
    // AssetKit needs explicit device slots to emit SpringBoard's primary icon
    // roles and loose PNG fallback. Xcode expands this universal source itself.
    if images.count == 1, images[0]["idiom"] as? String == "universal",
       images[0]["size"] as? String == "1024x1024", let filename = images[0]["filename"] as? String {
        let original = directory.appendingPathComponent(filename)
        try verifyIconPNG(original, pixels: 1024)
        images[0]["scale"] = "1x"
        var generatedPixels: Set<Int> = []
        for slot in iconSlots {
            for scale in slot.scales {
                let pixels = Int(Double(slot.points)! * Double(scale))
                let generatedName = "GeneratedIcon\(pixels).png"
                if generatedPixels.insert(pixels).inserted {
                    let converter = Process()
                    converter.executableURL = URL(fileURLWithPath: "/usr/bin/env")
                    converter.arguments = ["convert", original.path, "-filter", "Lanczos", "-resize", "\(pixels)x\(pixels)",
                                           "-alpha", "off", "-strip", "PNG24:" + directory.appendingPathComponent(generatedName).path]
                    try converter.run()
                    converter.waitUntilExit()
                    guard converter.terminationStatus == 0 else { throw BuildError("ImageMagick failed to resize the app icon") }
                    try verifyIconPNG(directory.appendingPathComponent(generatedName), pixels: pixels)
                }
                images.append(["filename": generatedName, "idiom": slot.idiom, "scale": "\(scale)x", "size": "\(slot.points)x\(slot.points)"])
            }
        }
    }
    contents["images"] = images
    try JSONSerialization.data(withJSONObject: contents, options: [.sortedKeys]).write(to: contentsURL)
}

func verifyIcons(info: [String: Any], directory: URL) throws {
    for (key, requiredNames) in [
        ("CFBundleIcons", ["AppIcon60x60"]),
        ("CFBundleIcons~ipad", ["AppIcon76x76", "AppIcon83.5x83.5"]),
    ] {
        guard let icons = info[key] as? [String: Any],
              let primary = icons["CFBundlePrimaryIcon"] as? [String: Any],
              primary["CFBundleIconName"] as? String == "AppIcon",
              let files = primary["CFBundleIconFiles"] as? [String],
              Set(requiredNames).isSubset(of: Set(files)) else { throw BuildError("Missing primary icon metadata: \(key)") }
    }
    for slot in iconSlots {
        for scale in slot.scales {
            let suffix = scale == 1 ? "" : "@\(scale)x"
            try verifyIconPNG(directory.appendingPathComponent("AppIcon\(slot.points)x\(slot.points)\(suffix).png"),
                              pixels: Int(Double(slot.points)! * Double(scale)))
        }
    }
}

func prepare(source: URL, output: URL) async throws {
    let project = try plist(source.appendingPathComponent("FARAIMPro.xcodeproj/project.pbxproj"))
    guard let objects = project["objects"] as? [String: [String: Any]],
          let app = objects.values.first(where: { $0["name"] as? String == "FARAIMPro" && $0["isa"] as? String == "PBXNativeTarget" }),
          let projectID = project["rootObject"] as? String,
          let projectObject = objects[projectID] else { throw BuildError("Cannot resolve the Xcode app target") }

    func releaseSettings(_ object: [String: Any]) throws -> [String: Any] {
        guard let listID = object["buildConfigurationList"] as? String,
              let ids = objects[listID]?["buildConfigurations"] as? [String],
              let release = ids.compactMap({ objects[$0] }).first(where: { $0["name"] as? String == "Release" }),
              let settings = release["buildSettings"] as? [String: Any] else {
            throw BuildError("Cannot resolve Xcode Release settings")
        }
        return settings
    }
    let native = try releaseSettings(projectObject).merging(releaseSettings(app)) { _, app in app }
    guard let bundleID = native["PRODUCT_BUNDLE_IDENTIFIER"] as? String,
          let version = native["MARKETING_VERSION"] as? String,
          let build = native["CURRENT_PROJECT_VERSION"] as? String,
          native["IPHONEOS_DEPLOYMENT_TARGET"] as? String == "17.0" else {
        throw BuildError("Xcode identity/version settings are missing or the deployment target differs from Package.swift iOS 17")
    }
    let environment = ProcessInfo.processInfo.environment
    let buildNumber = environment["IOS_BUILD_NUMBER"] ?? build
    guard buildNumber.range(of: #"^[1-9][0-9]*$"#, options: .regularExpression) == buildNumber.startIndex..<buildNumber.endIndex else {
        throw BuildError("IOS_BUILD_NUMBER must contain ASCII digits, start with 1-9, and have no leading zero")
    }
    let settings = [
        "DEVELOPMENT_LANGUAGE": "en", "EXECUTABLE_NAME": "FARAIMPro", "PRODUCT_NAME": "FARAIMPro",
        "PRODUCT_BUNDLE_PACKAGE_TYPE": "APPL", "PRODUCT_BUNDLE_IDENTIFIER": bundleID,
        "CURRENT_PROJECT_VERSION": buildNumber, "MARKETING_VERSION": version,
    ]
    guard var info = try expand(plist(source.appendingPathComponent("FARAIMPro/Info.plist")), settings: settings) as? [String: Any] else {
        throw BuildError("Invalid app Info.plist")
    }

    // Compare source membership with Xcode so new native files cannot silently
    // disappear from, or unexpectedly enter, the cross-compiled application.
    let phases = (app["buildPhases"] as? [String] ?? []).compactMap { objects[$0] }
    guard let sourcePhase = phases.first(where: { $0["isa"] as? String == "PBXSourcesBuildPhase" }),
          let buildFiles = sourcePhase["files"] as? [String] else { throw BuildError("Missing Xcode source phase") }
    let nativeNames = Set(buildFiles.compactMap { objects[$0]?["fileRef"] as? String }.compactMap { objects[$0]?["path"] as? String })
    let actualNames = Set(try files(in: source.appendingPathComponent("FARAIMPro")).values.filter { $0.pathExtension == "swift" }.map(\.lastPathComponent))
    guard nativeNames == actualNames else { throw BuildError("SwiftPM/Xcode source membership differs: \(nativeNames.symmetricDifference(actualNames).sorted())") }

    try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
    let catalog = output.appendingPathComponent("Assets.xcassets")
    if FileManager.default.fileExists(atPath: catalog.path) { try FileManager.default.removeItem(at: catalog) }
    try FileManager.default.copyItem(at: source.appendingPathComponent("FARAIMPro/Assets.xcassets"), to: catalog)
    try prepareIconCatalog(catalog)
    let compiled = try await XCAssetCompiler(deploymentTarget: "17.0").compile(
        catalog: catalog
    )
    guard let icons = compiled.appIconBundle, icons.primaryIconName == "AppIcon" else {
        throw BuildError("AssetKit did not produce the app icon")
    }
    try compiled.carData.write(to: output.appendingPathComponent("Assets.car"), options: .atomic)
    for (key, value) in icons.infoPlistAdditions { info[key] = value }
    for icon in icons.looseFiles { try icon.data.write(to: output.appendingPathComponent(icon.name), options: .atomic) }
    try verifyIcons(info: info, directory: output)
    info["MinimumOSVersion"] = "17.0"
    info["UIDeviceFamily"] = [1, 2]
    try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0)
        .write(to: output.appendingPathComponent("Info.plist"), options: .atomic)

    func quote(_ value: String) throws -> String { String(decoding: try JSONEncoder().encode(value), as: UTF8.self) }
    let resources = [
        source.appendingPathComponent("FARAIMPro/Resources/data").path,
        source.appendingPathComponent("FARAIMPro/Resources/PrivacyInfo.xcprivacy").path,
        output.appendingPathComponent("Assets.car").path,
    ] + Set(icons.looseFiles.map(\.name)).sorted().map { output.appendingPathComponent($0).path }
    let config = try """
    version: 1
    bundleID: \(quote(bundleID))
    product: FARAIMPro
    infoPath: \(quote(output.appendingPathComponent("Info.plist").path))
    skipLSP: true
    resources:
    \(resources.map { "  - \(try quote($0))" }.joined(separator: "\n"))

    """
    try config.write(to: output.appendingPathComponent("xtool.yml"), atomically: true, encoding: .utf8)
    print("Prepared \(version) (\(buildNumber)): native sources, assets, privacy manifest, and offline data")
}

func verify(source: URL, app: URL) throws {
    let info = try plist(app.appendingPathComponent("Info.plist"))
    for (key, expected) in [
        "CFBundleIdentifier": "com.faraimpro.ios", "CFBundleExecutable": "FARAIMPro",
        "MinimumOSVersion": "17.0", "DTSDKName": "iphoneos27.2", "DTXcodeBuild": "27B52",
    ] {
        guard info[key] as? String == expected else { throw BuildError("App \(key) must be \(expected), found \(String(describing: info[key]))") }
    }
    guard info["UIDeviceFamily"] as? [Int] == [1, 2],
          info["CFBundleSupportedPlatforms"] as? [String] == ["iPhoneOS"] else { throw BuildError("Incorrect device family or platform") }
    let binary = try Data(contentsOf: app.appendingPathComponent("FARAIMPro"))
    func uint32(_ offset: Int) throws -> UInt32 {
        guard offset >= 0, offset + 4 <= binary.count else { throw BuildError("Truncated Mach-O") }
        return binary[offset..<offset + 4].enumerated().reduce(0) { $0 | UInt32($1.element) << ($1.offset * 8) }
    }
    guard try uint32(0) == 0xfeedfacf, try uint32(4) == 0x0100000c, try uint32(12) == 2 else { throw BuildError("Expected arm64 Mach-O executable") }
    var offset = 32
    var foundVersion = false
    for _ in 0..<(try uint32(16)) {
        let command = try uint32(offset)
        let size = try uint32(offset + 4)
        guard size >= 8, offset + Int(size) <= binary.count else { throw BuildError("Invalid Mach-O load command") }
        if command == 0x32 {
            guard try uint32(offset + 8) == 2, try uint32(offset + 12) == 0x00110000, try uint32(offset + 16) == 0x001b0200 else {
                throw BuildError("Mach-O must target iOS 17.0 with SDK 27.2")
            }
            foundVersion = true
        }
        offset += Int(size)
    }
    guard foundVersion else { throw BuildError("Missing Mach-O LC_BUILD_VERSION") }

    let expected = try files(in: source.appendingPathComponent("FARAIMPro/Resources/data"))
    let bundled = try files(in: app.appendingPathComponent("data"))
    guard !expected.isEmpty, Set(expected.keys) == Set(bundled.keys) else { throw BuildError("Offline data file inventory differs") }
    for (name, file) in expected {
        guard try Data(contentsOf: file) == Data(contentsOf: bundled[name]!) else { throw BuildError("Offline data differs: \(name)") }
    }
    guard try Data(contentsOf: source.appendingPathComponent("FARAIMPro/Resources/PrivacyInfo.xcprivacy")) == Data(contentsOf: app.appendingPathComponent("PrivacyInfo.xcprivacy")) else {
        throw BuildError("Privacy manifest differs")
    }
    guard FileManager.default.fileExists(atPath: app.appendingPathComponent("Assets.car").path), info["CFBundleIcons"] != nil else {
        throw BuildError("Compiled assets or app icon metadata missing")
    }
    try verifyIcons(info: info, directory: app)
    print("Verified arm64 iOS app: SDK 27.2, minimum iOS 17, compiled assets, privacy manifest, \(expected.count) matching data files")
}

@main
struct PrepareFARAIM {
    static func run() async throws {
        let arguments = CommandLine.arguments
        guard arguments.count == 4 else { throw BuildError("Usage: prepare-faraim prepare|verify <ios-source-directory> <output-directory-or-app>") }
        let source = URL(fileURLWithPath: arguments[2]).standardizedFileURL
        let output = URL(fileURLWithPath: arguments[3]).standardizedFileURL
        switch arguments[1] {
        case "prepare": try await prepare(source: source, output: output)
        case "verify": try verify(source: source, app: output)
        default: throw BuildError("Unknown command: \(arguments[1])")
        }
    }

    static func main() async {
        do { try await run() }
        catch {
            FileHandle.standardError.write(Data("error: \(error)\n".utf8))
            exit(EXIT_FAILURE)
        }
    }
}
