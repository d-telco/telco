package com.dtelco.app

import android.app.Application
import com.dengage.sdk.util.DengageLifecycleTracker

/* reference/new-android-sdk-, Register Lifecycle Callbacks: this is required for the in-app
 * message list to be fetched and for session and visit analytics to be calculated at all. It is
 * registered before init, in onCreate, because a tracker registered after the first activity has
 * already resumed has missed the visit it was meant to count.
 *
 * Kept short on purpose. A geofence signal starts this process from cold when the app is not
 * running, so everything in here runs on the way to a person walking past a shop. Anything slow
 * added below is a delay on that, and the failure is invisible: the region is entered, the process
 * is still starting, and the moment is gone.
 */
class DtelcoApp : Application() {
  override fun onCreate() {
    super.onCreate()
    registerActivityLifecycleCallbacks(DengageLifecycleTracker())
    DengageBridge.start(applicationContext, Config.FIREBASE_INTEGRATION_KEY)
    DengageBridge.notificationChannel(Config.NOTIFICATION_CHANNEL)
    DengageBridge.country(Config.COUNTRY)
    DengageBridge.language(Config.LANGUAGE)
    /* A debug build takes the sandbox push route. Without this a handset in the room can consume a
       production send, and the send looks delivered to everybody watching. */
    DengageBridge.developmentStatus(BuildConfig.DEBUG)
  }
}
