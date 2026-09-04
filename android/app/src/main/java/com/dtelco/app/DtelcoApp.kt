package com.dtelco.app

import android.app.Application
import com.dengage.sdk.util.DengageLifecycleTracker

/* reference/new-android-sdk-, Register Lifecycle Callbacks: this is required for the in-app
 * message list to be fetched and for session and visit analytics to be calculated at all. It is
 * registered before init, in onCreate, because a tracker registered after the first activity has
 * already resumed has missed the visit it was meant to count.
 */
class DtelcoApp : Application() {
  override fun onCreate() {
    super.onCreate()
    registerActivityLifecycleCallbacks(DengageLifecycleTracker())
    DengageBridge.start(applicationContext, Config.FIREBASE_INTEGRATION_KEY)
    DengageBridge.notificationChannel(Config.NOTIFICATION_CHANNEL)
    DengageBridge.country(Config.COUNTRY)
  }
}
