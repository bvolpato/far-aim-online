# iOS signing

Private signing files belong in the private GCS release bucket. The release
helper downloads reviewed object generations into an owner-only temporary
directory outside the checkout, verifies their size and SHA-256, and removes
them after the release command exits. Authenticate with your own `gcloud auth
login` account. Public GitHub Actions builds are unsigned and have no access to
the bucket.

The archived Apple certificate and provisioning profile are quarantined. The
helper refuses an iOS release while the private manifest marks iOS as
`quarantined`, before downloading those files. Revoke the previously committed
certificate, create a replacement certificate and App Store profile, and store
the replacement P12 password as a private file before enabling iOS releases.

The private manifest must mark iOS as `ready` and pin the generation, size, and
SHA-256 of each of these objects:

- `ios/ios_distribution.p12`
- `ios/FARAIMPro_App_Store_Distribution.mobileprovision`
- `ios/p12-password.txt`

Do not put signing files, passwords, or a copy of the private manifest in this
directory. The release scripts accept file paths supplied by the helper and do
not accept base64 credentials or a password environment variable.

## Run a release on macOS

Review the private manifest before selecting its generation. Its generation
number is metadata and can be retrieved with:

```bash
gcloud storage objects describe \
  gs://far-aim-online-release-secrets-3207647/release-manifest.json \
  --format='value(generation)'
```

Use that exact generation for the build:

```bash
export RELEASE_CREDENTIALS_MANIFEST_GENERATION='<reviewed generation>'
export IOS_TEAM_ID='83BXSDT7QC'
export IOS_PROFILE_NAME='FAR/AIM Pro App Store Distribution'
export IOS_BUILD_NUMBER='<unused App Store Connect build number>'
./scripts/package-ios.sh
```

The helper requires the active `far-aim-online-signing-3207647` project to have
no organization or folder parent and owner-only IAM. The bucket must belong to
that project, enforce uniform access and public access prevention, and restrict
direct bucket IAM to the same owner. Your user account needs permission to read
the project and bucket IAM policies. The helper rejects
CI environments, service account identities, and credential overrides. It
verifies pinned files before invoking the release script. The script uses an
ephemeral keychain and restores existing user keychain and provisioning profile
state when it exits.

For a build without signing credentials, use the public macOS CI workflow or
run `xcodebuild` with `CODE_SIGNING_ALLOWED=NO`.
