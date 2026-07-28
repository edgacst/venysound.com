# StableTwaPostMessageController reads Android Browser Helper's already-created session.
# Keep that private field so release minification cannot remove or rewrite the bridge hook.
-keepclassmembers class com.google.androidbrowserhelper.trusted.TwaLauncher {
    androidx.browser.customtabs.CustomTabsSession mSession;
}
