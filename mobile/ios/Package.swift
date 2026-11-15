// swift-tools-version: 5.9
import PackageDescription

// xtool packages this library as an iOS application. Resources stay at the app
// bundle root, matching the Xcode target and its Bundle.main lookups.
let package = Package(
    name: "FARAIMPro",
    platforms: [.iOS(.v17)],
    products: [.library(name: "FARAIMPro", targets: ["FARAIMPro"])],
    targets: [
        .target(
            name: "FARAIMPro",
            path: "FARAIMPro",
            exclude: ["Info.plist", "Assets.xcassets", "Resources"]
        )
    ],
    swiftLanguageVersions: [.v5]
)
