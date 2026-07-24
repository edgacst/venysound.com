/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.edgarcst.venysound;

import android.Manifest;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.browser.customtabs.CustomTabsCallback;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsService;
import androidx.browser.customtabs.CustomTabsServiceConnection;
import androidx.browser.customtabs.CustomTabsSession;
import androidx.browser.trusted.TrustedWebActivityIntentBuilder;
import androidx.core.content.ContextCompat;

public class LauncherActivity extends Activity {
    private static final String TAG = "VenySoundTwa";
    private static final Uri ORIGIN = Uri.parse("https://venysound.com");

    private CustomTabsClient customTabsClient;
    private CustomTabsSession customTabsSession;
    private CustomTabsServiceConnection serviceConnection;
    private boolean launched;
    private boolean pausedAfterLaunch;
    private boolean bridgeHelloReceived;
    private int bridgeReadyAttempts;
    private final Handler bridgeHandler = new Handler(Looper.getMainLooper());
    private final Runnable bridgeReadyRetry =
            new Runnable() {
                @Override
                public void run() {
                    if (bridgeHelloReceived || bridgeReadyAttempts >= 20) return;
                    bridgeReadyAttempts += 1;
                    sendBridgeReady();
                    bridgeHandler.postDelayed(this, 500L);
                }
            };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1001);
            return;
        }
        bindAndLaunch();
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 1001) bindAndLaunch();
    }

    private void bindAndLaunch() {
        String packageName = CustomTabsClient.getPackageName(this, null);
        if (packageName == null) {
            openBrowserFallback();
            return;
        }
        serviceConnection =
                new CustomTabsServiceConnection() {
                    @Override
                    public void onCustomTabsServiceConnected(
                            @NonNull ComponentName name, @NonNull CustomTabsClient client) {
                        customTabsClient = client;
                        client.warmup(0L);
                        customTabsSession = client.newSession(customTabsCallback);
                        if (customTabsSession == null) {
                            openBrowserFallback();
                            return;
                        }
                        TwaPostMessageBridge.attach(customTabsSession);
                        customTabsSession.validateRelationship(
                                CustomTabsService.RELATION_USE_AS_ORIGIN, ORIGIN, null);
                        launchTwa();
                    }

                    @Override
                    public void onServiceDisconnected(ComponentName name) {
                        customTabsClient = null;
                        TwaPostMessageBridge.setReady(false);
                    }
                };
        if (!CustomTabsClient.bindCustomTabsService(this, packageName, serviceConnection)) {
            openBrowserFallback();
        }
    }

    private void launchTwa() {
        Uri launchUri = getIntent().getData();
        if (launchUri == null
                || !"https".equalsIgnoreCase(launchUri.getScheme())
                || !"venysound.com".equalsIgnoreCase(launchUri.getHost())) {
            launchUri = Uri.parse(getString(R.string.launchUrl));
        }
        launched = true;
        new TrustedWebActivityIntentBuilder(launchUri)
                .build(customTabsSession)
                .launchTrustedWebActivity(this);
    }

    private void openBrowserFallback() {
        Uri launchUri = getIntent().getData();
        if (launchUri == null) launchUri = Uri.parse(getString(R.string.launchUrl));
        startActivity(new Intent(Intent.ACTION_VIEW, launchUri));
        finish();
    }

    private final CustomTabsCallback customTabsCallback =
            new CustomTabsCallback() {
                @Override
                public void onRelationshipValidationResult(
                        int relation,
                        @NonNull Uri requestedOrigin,
                        boolean result,
                        @Nullable Bundle extras) {
                    Log.d(TAG, "use_as_origin validation=" + result);
                }

                @Override
                public void onNavigationEvent(int navigationEvent, @Nullable Bundle extras) {
                    if (navigationEvent != NAVIGATION_FINISHED || customTabsSession == null) return;
                    boolean requested =
                            customTabsSession.requestPostMessageChannel(
                                    ORIGIN, ORIGIN, new Bundle());
                    Log.d(TAG, "postMessage channel requested=" + requested);
                }

                @Override
                public void onMessageChannelReady(@Nullable Bundle extras) {
                    TwaPostMessageBridge.setReady(true);
                    bridgeHelloReceived = false;
                    bridgeReadyAttempts = 0;
                    bridgeHandler.removeCallbacks(bridgeReadyRetry);
                    bridgeHandler.post(bridgeReadyRetry);
                }

                @Override
                public void onPostMessage(
                        @NonNull String message, @Nullable Bundle extras) {
                    if (message.contains("\"type\":\"bridge.hello\"")) {
                        bridgeHelloReceived = true;
                        bridgeHandler.removeCallbacks(bridgeReadyRetry);
                        sendBridgeReady();
                        return;
                    }
                    Intent command =
                            new Intent(LauncherActivity.this, MediaPlaybackService.class)
                                    .setAction(MediaPlaybackService.ACTION_BRIDGE_COMMAND)
                                    .putExtra(MediaPlaybackService.EXTRA_MESSAGE, message);
                    if (message.contains("\"type\":\"player.load\"")) {
                        ContextCompat.startForegroundService(LauncherActivity.this, command);
                    } else {
                        startService(command);
                    }
                }
            };

    private void sendBridgeReady() {
        TwaPostMessageBridge.send(
                "{\"v\":1,\"type\":\"bridge.ready\",\"ts\":"
                        + System.currentTimeMillis()
                        + ",\"payload\":{\"nativeVersion\":1,\"media3\":true}}");
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (launched) pausedAfterLaunch = true;
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (launched && pausedAfterLaunch) finish();
    }

    @Override
    protected void onDestroy() {
        bridgeHandler.removeCallbacksAndMessages(null);
        if (customTabsSession != null) {
            TwaPostMessageBridge.detach(customTabsSession);
        }
        if (serviceConnection != null) {
            try {
                unbindService(serviceConnection);
            } catch (IllegalArgumentException ignored) {
                // Service was not bound.
            }
        }
        customTabsSession = null;
        customTabsClient = null;
        super.onDestroy();
    }
}
