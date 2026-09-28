# Build the Android APK without Android Studio

This source packages the offline app in an Android WebView. There is no Internet permission. JSON/CSV exports use Android's document picker; imports use the file picker. Browser data must be exported and restored into Android; it will not transfer automatically.

## Easiest build: GitHub Actions

The project includes `.github/workflows/build-apk.yml`. Put the contents of this project folder in a private GitHub repository, then open **Actions → Build Pink Ledger APK → Run workflow**. When the run finishes, open it and download the `pink-ledger-apk` artifact. The artifact contains `app-debug.apk`, which can be installed on an Android phone. The build runs on GitHub's computer; Android Studio and Android build tools are not needed on your PC.

The APK is signed with a development key, which is fine for personal installation. GitHub's temporary runner creates that key during the build, so a future APK built by a separate run may not install as an in-place update. Export a JSON backup before replacing the app. A permanent signing key can be configured later if you want seamless updates.

## Local build (optional)

If you later want to compile locally without Android Studio, install JDK 17, Android SDK platform 35, and Gradle 8.9, then run `gradle assembleDebug` in this directory. GitHub Actions does this for you automatically.

## Required before calling this production-ready

The cloud build has not yet been run, and the app has not been tested on the intended phone. After installing, verify forms and keyboard behavior, restart persistence, card editing, a purchase and payment, JSON export/import, CSV export, and offline launch. Back up your ledger before installing a replacement APK.
