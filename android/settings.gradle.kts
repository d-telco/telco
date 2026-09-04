/* D-TELCO for Android.
 *
 * One module. The web storefront and this app share the contact key, the product ids, the order id
 * convention and the same backend functions, so a person who browsed on the web and then opens the
 * app is one profile in Dengage rather than two.
 */
pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}
dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    google()
    mavenCentral()
    // The Dengage Android SDK is published here, per reference/new-android-sdk-.
    maven { url = uri("https://jitpack.io") }
  }
}
rootProject.name = "dtelco"
include(":app")
