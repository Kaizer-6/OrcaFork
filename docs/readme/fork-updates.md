# OrcaFork updates

This fork adds per-agent completion sounds. Its desktop updater uses
`Kaizer-6/OrcaFork`, including the fallback feed. Alternate channels use fork-owned
repositories; none switches the app to an official Orca installer.

## Automatic builds

The **OrcaFork Updates** workflow checks for an upstream stable release every six
hours. It waits until the official Windows installer and update manifest exist,
then merges that release into the fork source in a detached build checkout.
It keeps the fork's workflows, runs sound-feature and updater regression tests,
typechecks main/renderer/CLI, checks changed code, and builds Windows x64.

The workflow publishes only after checking the packaged update identity and
installer checksum. It uploads to a draft release before making the complete
release public. A merge conflict or failing check stops publication; the installed
app stays on its existing version. GitHub Actions reports the failure.

Build tags identify the exact merged source, for example
`v1.4.215+fork.1`. The workflow pushes that tag and its build commit after successful
checks. It does not update `main`. Subsequent builds merge the next upstream tag
into the maintained fork source again. Changes to the feature go on `main`.

The fork identity and revision are in `src/shared/fork-release-config.json`.
Build metadata keeps normal upstream version comparisons: a newer upstream
version updates the installed fork. Changes only to the fork revision at the same
upstream version need a manual installer, because semver ignores build metadata.

## Activation

Push the feature and workflow to the fork's default branch after reviewing them.
Enable GitHub Actions for the fork and run **OrcaFork Updates** once manually.
Install the resulting fork installer once to replace the old official update feed.
Future fork releases appear through Orca's existing Update button; checks are
automatic, downloading and restarting begin after the user clicks Update.

Only Windows x64 is published by this workflow. Other platform code still builds
with the fork feed, but macOS/Linux release automation is not configured.

## Windows signing

These personal fork installers are unsigned, using Orca's existing unsigned
dev-build policy. The packaged updater omits the official SignPath publisher name.
Downloads use the fork's GitHub HTTPS feed and the generated SHA-512 manifest;
they do not get Authenticode publisher verification. Signing future fork releases
requires the fork's own signing certificate and publisher configuration.

Official installers replace the fork's program files. Install updates from this
fork to retain the sound feature. GitHub may disable public-repository scheduled
workflows after 60 days without repository activity; re-enable the workflow if
that happens. See [GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
