package com.edgarcst.venysound;

import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsCallback;
import androidx.browser.customtabs.CustomTabsService;
import androidx.browser.customtabs.CustomTabsServiceConnection;
import androidx.browser.customtabs.CustomTabsSession;

import com.google.androidbrowserhelper.trusted.TwaLauncher;

import org.json.JSONException;
import org.json.JSONObject;

import java.lang.reflect.Field;

/**
 * Adds a postMessage bridge without replacing Android Browser Helper's stable TWA launch flow.
 *
 * <p>The helper does not expose its CustomTabsSession. This controller only reads that already
 * created session after navigation; it never binds a browser, creates a session, or launches a
 * TWA. If the helper internals change, the bridge remains disabled and the website keeps using
 * its existing web player.
 */
final class StableTwaPostMessageController {
    private static final String TAG = "VenySoundTwaBridge";
    private static final Uri ORIGIN = Uri.parse("https://venysound.com");
    private static final long INITIAL_CHANNEL_DELAY_MS = 300L;
    private static final long CHANNEL_RETRY_DELAY_MS = 750L;
    private static final long CHANNEL_READY_TIMEOUT_MS = 2000L;
    private static final long BRIDGE_READY_RETRY_DELAY_MS = 500L;
    private static final int MAX_CHANNEL_ATTEMPTS = 8;
    private static final int MAX_BRIDGE_READY_ATTEMPTS = 12;

    private final LauncherActivity activity;
    private final Handler handler = new Handler(Looper.getMainLooper());
    @Nullable private TwaLauncher launcher;
    @Nullable private CustomTabsSession session;
    @Nullable private CustomTabsServiceConnection warmupConnection;
    private boolean warmupBound;
    private boolean warmupComplete;
    private boolean navigationFinished;
    private boolean channelRequested;
    private boolean channelReady;
    private int channelRequestAttempts;
    private boolean webBridgeAcknowledged;
    private int bridgeReadyAttempts;
    private boolean destroyed;

    private final Runnable channelRequestRunnable = this::requestChannelIfReady;
    private final Runnable channelReadyWatchdog =
            () -> {
                if (destroyed || channelReady || !navigationFinished) return;
                channelRequested = false;
                scheduleChannelRequest(CHANNEL_RETRY_DELAY_MS);
            };
    private final Runnable bridgeReadyAnnouncer =
            new Runnable() {
                @Override
                public void run() {
                    if (destroyed
                            || !channelReady
                            || webBridgeAcknowledged
                            || bridgeReadyAttempts >= MAX_BRIDGE_READY_ATTEMPTS) {
                        return;
                    }
                    bridgeReadyAttempts++;
                    boolean accepted = sendBridgeReady();
                    Log.i(
                            TAG,
                            "bridge.ready attempt "
                                    + bridgeReadyAttempts
                                    + "; accepted="
                                    + accepted);
                    if (!webBridgeAcknowledged
                            && bridgeReadyAttempts < MAX_BRIDGE_READY_ATTEMPTS) {
                        handler.postDelayed(this, BRIDGE_READY_RETRY_DELAY_MS);
                    }
                }
            };

    StableTwaPostMessageController(LauncherActivity activity) {
        this.activity = activity;
    }

    void attachLauncher(TwaLauncher value) {
        launcher = value;
        warmupChrome(value.getProviderPackage());
    }

    private void warmupChrome(String providerPackage) {
        if (providerPackage == null || providerPackage.isEmpty() || warmupConnection != null) {
            return;
        }
        warmupConnection =
                new CustomTabsServiceConnection() {
                    @Override
                    public void onCustomTabsServiceConnected(
                            @NonNull ComponentName name, @NonNull CustomTabsClient client) {
                        warmupComplete = client.warmup(0L);
                        Log.i(TAG, "Custom Tabs warmup result: " + warmupComplete);
                        if (navigationFinished) {
                            scheduleChannelRequest(INITIAL_CHANNEL_DELAY_MS);
                        }
                    }

                    @Override
                    public void onServiceDisconnected(@NonNull ComponentName name) {
                        warmupComplete = false;
                    }
                };
        warmupBound =
                CustomTabsClient.bindCustomTabsService(
                        activity, providerPackage, warmupConnection);
        if (!warmupBound) {
            Log.w(TAG, "Unable to bind Custom Tabs warmup connection");
        }
    }

    CustomTabsCallback wrap(CustomTabsCallback delegate) {
        return new CustomTabsCallback() {
            @Override
            public void onNavigationEvent(int navigationEvent, @Nullable Bundle extras) {
                delegate.onNavigationEvent(navigationEvent, extras);
                if (navigationEvent == NAVIGATION_STARTED) {
                    navigationFinished = false;
                    channelRequested = false;
                    channelReady = false;
                    channelRequestAttempts = 0;
                    webBridgeAcknowledged = false;
                    bridgeReadyAttempts = 0;
                    handler.removeCallbacks(channelRequestRunnable);
                    handler.removeCallbacks(channelReadyWatchdog);
                    handler.removeCallbacks(bridgeReadyAnnouncer);
                    TwaPostMessageBridge.setReady(false);
                } else if (navigationEvent == NAVIGATION_FINISHED) {
                    navigationFinished = true;
                    scheduleChannelRequest(INITIAL_CHANNEL_DELAY_MS);
                }
            }

            @Override
            public void onRelationshipValidationResult(
                    int relation,
                    @NonNull Uri requestedOrigin,
                    boolean result,
                    @Nullable Bundle extras) {
                delegate.onRelationshipValidationResult(relation, requestedOrigin, result, extras);
                if (relation != CustomTabsService.RELATION_USE_AS_ORIGIN
                        || !ORIGIN.equals(requestedOrigin)) {
                    return;
                }
                if (!result) {
                    Log.w(TAG, "use_as_origin validation not ready; retrying postMessage channel");
                    channelRequested = false;
                    handler.removeCallbacks(channelReadyWatchdog);
                    scheduleChannelRequest(CHANNEL_RETRY_DELAY_MS);
                    return;
                }
                Log.i(TAG, "use_as_origin validation succeeded");
            }

            @Override
            public void onMessageChannelReady(@Nullable Bundle extras) {
                delegate.onMessageChannelReady(extras);
                CustomTabsSession activeSession = getSession();
                if (activeSession == null) return;
                channelReady = true;
                webBridgeAcknowledged = false;
                bridgeReadyAttempts = 0;
                handler.removeCallbacks(channelRequestRunnable);
                handler.removeCallbacks(channelReadyWatchdog);
                handler.removeCallbacks(bridgeReadyAnnouncer);
                TwaPostMessageBridge.attach(activeSession);
                TwaPostMessageBridge.setReady(true);
                Log.i(TAG, "postMessage channel ready");
                handler.post(bridgeReadyAnnouncer);
            }

            @Override
            public void onPostMessage(@NonNull String message, @Nullable Bundle extras) {
                delegate.onPostMessage(message, extras);
                handleWebMessage(message);
            }

            @Override
            public void extraCallback(@NonNull String callbackName, @Nullable Bundle args) {
                delegate.extraCallback(callbackName, args);
            }

            @Nullable
            @Override
            public Bundle extraCallbackWithResult(
                    @NonNull String callbackName, @Nullable Bundle args) {
                return delegate.extraCallbackWithResult(callbackName, args);
            }

            @Override
            public void onActivityResized(
                    int height, int width, @NonNull Bundle extras) {
                delegate.onActivityResized(height, width, extras);
            }

            @Override
            public void onWarmupCompleted(@NonNull Bundle extras) {
                delegate.onWarmupCompleted(extras);
            }

            @Override
            public void onActivityLayout(
                    int left,
                    int top,
                    int right,
                    int bottom,
                    int state,
                    @NonNull Bundle extras) {
                delegate.onActivityLayout(left, top, right, bottom, state, extras);
            }

            @Override
            public void onMinimized(@NonNull Bundle extras) {
                delegate.onMinimized(extras);
            }

            @Override
            public void onUnminimized(@NonNull Bundle extras) {
                delegate.onUnminimized(extras);
            }
        };
    }

    private void scheduleChannelRequest(long delayMs) {
        if (destroyed
                || channelReady
                || !navigationFinished
                || channelRequestAttempts >= MAX_CHANNEL_ATTEMPTS) {
            return;
        }
        handler.removeCallbacks(channelRequestRunnable);
        handler.postDelayed(channelRequestRunnable, delayMs);
    }

    private void requestChannelIfReady() {
        if (destroyed
                || !navigationFinished
                || channelReady
                || channelRequested
                || channelRequestAttempts >= MAX_CHANNEL_ATTEMPTS) {
            return;
        }
        if (warmupBound && !warmupComplete) {
            scheduleChannelRequest(CHANNEL_RETRY_DELAY_MS);
            return;
        }
        CustomTabsSession activeSession = getSession();
        if (activeSession == null) {
            scheduleChannelRequest(CHANNEL_RETRY_DELAY_MS);
            return;
        }
        channelRequestAttempts++;
        channelRequested = activeSession.requestPostMessageChannel(ORIGIN);
        if (!channelRequested) {
            Log.w(
                    TAG,
                    "Browser rejected postMessage channel request; attempt "
                            + channelRequestAttempts);
            scheduleChannelRequest(CHANNEL_RETRY_DELAY_MS);
            return;
        }
        Log.i(TAG, "postMessage channel requested; attempt " + channelRequestAttempts);
        handler.removeCallbacks(channelReadyWatchdog);
        handler.postDelayed(channelReadyWatchdog, CHANNEL_READY_TIMEOUT_MS);
    }

    @Nullable
    private CustomTabsSession getSession() {
        if (destroyed) return null;
        if (session != null) return session;
        TwaLauncher activeLauncher = launcher;
        if (activeLauncher == null) return null;
        try {
            for (Field field : TwaLauncher.class.getDeclaredFields()) {
                if (!CustomTabsSession.class.isAssignableFrom(field.getType())) continue;
                field.setAccessible(true);
                Object value = field.get(activeLauncher);
                if (value instanceof CustomTabsSession) {
                    session = (CustomTabsSession) value;
                    return session;
                }
            }
        } catch (ReflectiveOperationException | SecurityException error) {
            Log.w(TAG, "Unable to access stable TWA session; keeping web playback", error);
        }
        return null;
    }

    private void handleWebMessage(String rawMessage) {
        try {
            JSONObject message = new JSONObject(rawMessage);
            if (message.optInt("v", 0) != 1) return;
                String type = message.optString("type", "");
                if ("bridge.hello".equals(type)) {
                    webBridgeAcknowledged = true;
                    handler.removeCallbacks(bridgeReadyAnnouncer);
                    Log.i(TAG, "web bridge acknowledged");
                    sendBridgeReady();
                    return;
            }
            if (!isPlayerCommand(type)) return;

            Intent command =
                    new Intent(activity, MediaPlaybackService.class)
                            .setAction(MediaPlaybackService.ACTION_BRIDGE_COMMAND)
                            .putExtra(MediaPlaybackService.EXTRA_MESSAGE, rawMessage);
            // MediaSessionService promotes itself while ExoPlayer is actually playing.
            // Starting every bridge command as an FGS is unsafe: pause/seek/stop and
            // call-suppressed play commands never enter the foreground and Android 16
            // terminates the process with ForegroundServiceDidNotStartInTimeException.
            activity.startService(command);
        } catch (JSONException error) {
            Log.w(TAG, "Ignoring malformed web bridge message");
        }
    }

    private static boolean isPlayerCommand(String type) {
        return "player.load".equals(type)
                || "player.play".equals(type)
                || "player.pause".equals(type)
                || "player.seek".equals(type)
                || "player.stop".equals(type);
    }

    private boolean sendBridgeReady() {
        return TwaPostMessageBridge.send(
                "{\"v\":1,\"type\":\"bridge.ready\",\"ts\":"
                        + System.currentTimeMillis()
                        + ",\"payload\":{\"nativeVersion\":1,\"media3\":true}}");
    }

    void destroy() {
        destroyed = true;
        handler.removeCallbacksAndMessages(null);
        if (warmupBound && warmupConnection != null) {
            try {
                activity.unbindService(warmupConnection);
            } catch (IllegalArgumentException ignored) {
                // The browser may have already disconnected while the TWA was closing.
            }
        }
        warmupBound = false;
        warmupComplete = false;
        warmupConnection = null;
        if (session != null) {
            TwaPostMessageBridge.detach(session);
        }
        session = null;
        launcher = null;
        TwaPostMessageBridge.setReady(false);
    }
}
