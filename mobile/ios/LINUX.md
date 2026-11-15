# iOS development from Linux

Use xtool to compile the native SwiftUI app, Limulator to exercise a real iOS
guest, and GitHub's Apple runners for XCTest and release archives. The deployment
target remains iOS 17. The Linux and native archive paths use the iOS 27.2 SDK
from stable Xcode 27.2 (27B52).

## Build

The workstation needs `uv`, Node.js, `jq`, `flock`, ImageMagick (`convert`), and a
prepared Limulator toolchain. The build requires xtool revision
`e3c615391817cde2512a38118a064f834ff64a32`, Swift 6.4.1, and the Apple SDK above.
For a new workstation, follow Limulator's
[setup guide](https://github.com/bvolpato/limulator/blob/main/docs/SETUP.md).
An existing guest does not need another firmware restore or SDK installation.

From the repository root:

```sh
./mobile/ios/build-linux.sh doctor
./mobile/ios/build-linux.sh build release
```

Tools default to the prepared installation under
`${XDG_DATA_HOME:-$HOME/.local/share}/limulator`. Set `FARAIM_XTOOL` and
`FARAIM_SWIFT` to absolute executable paths for another installation.
`IOS_BUILD_NUMBER` optionally overrides the Xcode project's build number.

The script checks generated search indexes, syncs `/data`, builds the same Swift
sources as Xcode, compiles the asset catalog with pinned AssetKit, and checks the
resulting ARM64 device executable, metadata, and bundled resources. It writes:

- `mobile/ios/build/linux/package/xtool/FARAIMPro.app`
- `mobile/ios/build/linux/provenance.json`, including source SHA, dirty state,
  compiler and SDK metadata, and executable SHA-256

The app is unsigned. This build does not run XCTest or establish store
acceptance. Use `build debug` for an incremental development build.

## Run in an existing guest

Create the ignored `.limulator/dev.env` with the paths and registered device name
from your existing Limulator installation:

```dotenv
LIMULATOR_PROJECT=/absolute/path/to/limulator-checkout
LIMULATOR_HOME=/absolute/path/to/registered-guest-data
LIMULATOR_BACKEND=/absolute/path/to/shared/backends/vphone-linux
LIMULATOR_PREFIX=/absolute/path/to/shared/tools
LIMULATOR_DEVICE=registered-device-name
```

The wrapper loads these values as environment data through `uv`; it does not
execute the file as shell code. `LIMULATOR_ENV_FILE` selects another file. Keep
SDKs, VM disks, credentials, captures, and generated apps outside Git.

```sh
./mobile/ios/limulator.sh devices
./mobile/ios/limulator.sh status
# Start only when the selected guest is stopped. Add --window for desktop UI.
./mobile/ios/limulator.sh start --wait 300
./mobile/ios/limulator.sh install "$PWD/mobile/ios/build/linux/package/xtool/FARAIMPro.app"
./mobile/ios/limulator.sh unlock
./mobile/ios/limulator.sh launch com.faraimpro.ios
./mobile/ios/limulator.sh tree
```

Use the prepared app above rather than `limulator run mobile/ios`: FAR/AIM needs
the shared-data and asset preparation in `build-linux.sh`. Installation signs
for the guest environment and does not test an Apple Distribution identity.

## Reader and fold checks

Unlock the guest before each scenario and use a new output directory. Scenarios
navigate through the real app UI and verify resulting state after input,
rather than accepting a successful tap response as proof.

```sh
./mobile/ios/limulator.sh unlock
./mobile/ios/limulator.sh test mobile/ios/scenarios/reader-smoke.json \
  --output "$PWD/mobile/ios/build/limulator/reader-01"
./mobile/ios/limulator.sh unlock
./mobile/ios/limulator.sh test mobile/ios/scenarios/duo-reader.json \
  --output "$PWD/mobile/ios/build/limulator/duo-01"
./mobile/ios/limulator.sh unlock
./mobile/ios/limulator.sh test mobile/ios/scenarios/duo-reader-broad.json \
  --output "$PWD/mobile/ios/build/limulator/duo-broad-01"
```

The reader smoke covers search handoff, expand/collapse, reader settings, and
native note entry. The Duo scenario requires a Duo guest and checks an unsaved
note through closed, book, open, and closed postures. The broad scenario repeats
these checks with `FAR student pilot` and a note in § 61.83, keeping many matching
sections expanded. Run both the exact-reference and broad-content cases.
Inspect `report.json` and the screenshots. Keep the guest OS version and graphics
policy with results.
The bounded waits allow for CPU emulation and guest accessibility inspection;
these are functional checks, not responsiveness benchmarks. Retain the build's
`provenance.json` beside the test report to identify the installed source.
Diagnostic graphics are for investigation; they are not acceptance evidence.

The guest's installed iOS version can differ from the build SDK. A passed Linux
scenario establishes only the observed guest behavior. It does not replace the
iPhone, Duo, and iPad XCTest matrix on iOS 27.2, physical-device checks, or the
safe-area and accessibility checklist in [AGENTS_TESTING.md](../../AGENTS_TESTING.md).
If a guest's input, display geometry, or startup is broken, report that failure
without weakening the scenario or recreating an existing guest.

## Distribute

Use the native CI archive and the local signing wrapper in
[RELEASE.md](RELEASE.md). The release workflow requires successful phone, Duo,
and iPad CI jobs for the exact source commit. Signing and upload are separate
explicit commands; building or running a guest never uploads to Apple.
