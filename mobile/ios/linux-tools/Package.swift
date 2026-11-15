// swift-tools-version: 6.3
import PackageDescription

let package = Package(
    name: "FARAIMLinuxTools",
    products: [.executable(name: "prepare-faraim", targets: ["PrepareFARAIM"])],
    dependencies: [
        .package(
            url: "https://github.com/bvolpato/AssetKit",
            revision: "eb6331f1a3f3ad40670d8e430f605bd884cc0203"
        )
    ],
    targets: [.executableTarget(name: "PrepareFARAIM", dependencies: ["AssetKit"])]
)
