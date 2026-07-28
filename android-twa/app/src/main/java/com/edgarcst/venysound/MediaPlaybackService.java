package com.edgarcst.venysound;

import android.content.Intent;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.annotation.RequiresApi;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public final class MediaPlaybackService extends MediaSessionService {
    private static final String TAG = "VenySoundPlayback";
    private static final long CALL_MODE_DETECTION_WINDOW_MS = 3000L;
    private static final long CALL_MODE_POLL_INTERVAL_MS = 250L;
    private static final long NORMAL_MODE_STABLE_MS = 750L;
    private static final int MAX_NATIVE_QUEUE_ITEMS = 500;

    public static final String ACTION_BRIDGE_COMMAND =
            "com.edgarcst.venysound.action.BRIDGE_COMMAND";
    public static final String EXTRA_MESSAGE = "message";

    private AudioManager audioManager;
    @Nullable private Object audioModeListener;
    private ExoPlayer player;
    private MediaSession mediaSession;
    private final Handler positionHandler = new Handler(Looper.getMainLooper());
    private String currentBridgeSessionId = "";
    private String currentMode = "none";
    private boolean userIntendsPlayback;
    private boolean callRecoveryPending;
    private boolean callModeObserved;
    private long focusLossDetectedAtMs;
    private long normalModeSinceMs;

    private final Runnable positionReporter = new Runnable() {
        @Override
        public void run() {
            if (player != null && player.getCurrentMediaItem() != null) {
                sendState("player.position");
            }
            positionHandler.postDelayed(this, 1000L);
        }
    };

    private final Runnable callRecoveryMonitor = new Runnable() {
        @Override
        public void run() {
            if (!callRecoveryPending
                    || !userIntendsPlayback
                    || player == null
                    || player.getCurrentMediaItem() == null) {
                cancelCallRecovery();
                return;
            }

            long now = SystemClock.elapsedRealtime();
            int audioMode =
                    audioManager == null ? AudioManager.MODE_NORMAL : audioManager.getMode();
            if (isCallAudioMode(audioMode)) {
                if (!callModeObserved) {
                    Log.i(TAG, "Call audio mode observed; waiting for call end");
                }
                callModeObserved = true;
                normalModeSinceMs = 0L;
                positionHandler.postDelayed(this, CALL_MODE_POLL_INTERVAL_MS);
                return;
            }

            if (!callModeObserved) {
                if (now - focusLossDetectedAtMs < CALL_MODE_DETECTION_WINDOW_MS) {
                    positionHandler.postDelayed(this, CALL_MODE_POLL_INTERVAL_MS);
                } else {
                    Log.i(TAG, "Audio focus loss was not a call; auto-resume cancelled");
                    cancelCallRecovery();
                    sendState("player.state");
                }
                return;
            }

            if (normalModeSinceMs == 0L) {
                normalModeSinceMs = now;
                positionHandler.postDelayed(this, CALL_MODE_POLL_INTERVAL_MS);
                return;
            }
            if (now - normalModeSinceMs < NORMAL_MODE_STABLE_MS) {
                positionHandler.postDelayed(this, CALL_MODE_POLL_INTERVAL_MS);
                return;
            }

            callRecoveryPending = false;
            callModeObserved = false;
            normalModeSinceMs = 0L;
            focusLossDetectedAtMs = 0L;
            if (userIntendsPlayback
                    && player.getCurrentMediaItem() != null
                    && player.getPlaybackState() != Player.STATE_ENDED) {
                if (player.isPlaying()) {
                    Log.i(TAG, "Call ended; Media3 already restored playback");
                    return;
                }
                Log.i(TAG, "Call ended; restoring playback");
                if (player.getPlayWhenReady()) {
                    // Some Galaxy devices keep transient focus suppression after the call without
                    // sending AUDIOFOCUS_GAIN. Toggle the intent once to request focus again.
                    player.pause();
                    userIntendsPlayback = true;
                }
                player.play();
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && audioManager != null) {
            audioModeListener = Api31.registerAudioModeListener(audioManager, this);
        }
        AudioAttributes audioAttributes =
                new AudioAttributes.Builder()
                        .setUsage(C.USAGE_MEDIA)
                        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                        .build();
        player =
                new ExoPlayer.Builder(this)
                        .setAudioAttributes(audioAttributes, true)
                        .setHandleAudioBecomingNoisy(true)
                        .build();
        player.addListener(
                new Player.Listener() {
                    @Override
                    public void onIsPlayingChanged(boolean isPlaying) {
                        sendState("player.state");
                    }

                    @Override
                    public void onPlayWhenReadyChanged(
                            boolean playWhenReady, int reason) {
                        if (!playWhenReady
                                && reason
                                        == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS) {
                            if (userIntendsPlayback) {
                                beginCallRecoveryDetection();
                            }
                        } else {
                            userIntendsPlayback = playWhenReady;
                            if (!playWhenReady) {
                                cancelCallRecovery();
                            }
                        }
                        sendState("player.state");
                    }

                    @Override
                    public void onPlaybackSuppressionReasonChanged(
                            int playbackSuppressionReason) {
                        if (playbackSuppressionReason
                                        == Player
                                                .PLAYBACK_SUPPRESSION_REASON_TRANSIENT_AUDIO_FOCUS_LOSS
                                && userIntendsPlayback) {
                            beginCallRecoveryDetection();
                        }
                        sendState("player.state");
                    }

                    @Override
                    public void onPlaybackStateChanged(int playbackState) {
                        sendState("player.state");
                        if (playbackState == Player.STATE_ENDED) {
                            sendEvent("player.ended", null);
                        }
                    }

                    @Override
                    public void onMediaItemTransition(
                            @Nullable MediaItem mediaItem, int reason) {
                        if (mediaItem == null) return;
                        String nextSessionId = mediaItem.mediaId;
                        String previousSessionId = currentBridgeSessionId;
                        currentBridgeSessionId = nextSessionId;
                        if (!nextSessionId.equals(previousSessionId)) {
                            JSONObject payload = new JSONObject();
                            try {
                                payload.put("mode", currentMode);
                                payload.put("sessionId", nextSessionId);
                                payload.put("previousSessionId", previousSessionId);
                                payload.put("mediaIndex", player.getCurrentMediaItemIndex());
                                payload.put("positionMs", Math.max(0L, player.getCurrentPosition()));
                            } catch (JSONException ignored) {
                                // Best-effort transition payload.
                            }
                            sendEvent("player.transition", payload);
                        }
                        sendState("player.state");
                    }

                    @Override
                    public void onPlayerError(PlaybackException error) {
                        JSONObject payload = new JSONObject();
                        try {
                            payload.put("code", error.errorCode);
                            payload.put("message", error.getMessage());
                        } catch (JSONException ignored) {
                            // Best-effort diagnostic payload.
                        }
                        sendEvent("player.error", payload);
                    }
                });
        mediaSession = new MediaSession.Builder(this, player).build();
        // Bridge commands reach this service directly instead of through a MediaController.
        // Register the session so Media3 can observe playback and manage its foreground
        // notification even before an external controller binds.
        addSession(mediaSession);
        positionHandler.post(positionReporter);
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        int result = super.onStartCommand(intent, flags, startId);
        if (intent != null && ACTION_BRIDGE_COMMAND.equals(intent.getAction())) {
            String message = intent.getStringExtra(EXTRA_MESSAGE);
            if (message != null) handleBridgeCommand(message);
        }
        return result;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return super.onBind(intent);
    }

    private void handleBridgeCommand(String rawMessage) {
        try {
            JSONObject message = new JSONObject(rawMessage);
            if (message.optInt("v", 0) != 1) return;
            String type = message.optString("type", "");
            JSONObject payload = message.optJSONObject("payload");
            if (payload == null) payload = new JSONObject();
            String targetSessionId = payload.optString("sessionId", "");
            if (!"player.load".equals(type)
                    && !"bridge.hello".equals(type)
                    && !targetSessionId.isEmpty()
                    && !targetSessionId.equals(currentBridgeSessionId)) {
                return;
            }

            switch (type) {
                case "player.load":
                    load(payload);
                    break;
                case "player.play":
                    userIntendsPlayback = true;
                    if (isCallAudioMode(
                            audioManager == null
                                    ? AudioManager.MODE_NORMAL
                                    : audioManager.getMode())) {
                        beginCallRecoveryDetection();
                    } else {
                        player.play();
                    }
                    break;
                case "player.pause":
                    userIntendsPlayback = false;
                    cancelCallRecovery();
                    player.pause();
                    break;
                case "player.seek":
                    player.seekTo(Math.max(0L, payload.optLong("positionMs", 0L)));
                    break;
                case "player.stop":
                    userIntendsPlayback = false;
                    cancelCallRecovery();
                    player.stop();
                    player.clearMediaItems();
                    currentBridgeSessionId = "";
                    currentMode = "none";
                    stopSelf();
                    break;
                case "bridge.hello":
                    sendReady();
                    break;
                default:
                    break;
            }
        } catch (JSONException ignored) {
            sendEvent("bridge.error", null);
        }
    }

    private void load(JSONObject payload) {
        List<MediaItem> mediaItems = new ArrayList<>();
        JSONArray items = payload.optJSONArray("items");
        if (items != null) {
            int itemCount = Math.min(items.length(), MAX_NATIVE_QUEUE_ITEMS);
            for (int i = 0; i < itemCount; i++) {
                JSONObject itemPayload = items.optJSONObject(i);
                if (itemPayload == null) continue;
                MediaItem item = buildMediaItem(itemPayload);
                if (item != null) mediaItems.add(item);
            }
        }
        if (mediaItems.isEmpty()) {
            MediaItem singleItem = buildMediaItem(payload);
            if (singleItem == null) return;
            mediaItems.add(singleItem);
        }

        cancelCallRecovery();
        String requestedSessionId = payload.optString("sessionId", "");
        currentMode = payload.optString("mode", "music");
        boolean autoplay = payload.optBoolean("autoplay", true);
        userIntendsPlayback = autoplay;

        int startIndex = 0;
        if (!requestedSessionId.isEmpty()) {
            for (int i = 0; i < mediaItems.size(); i++) {
                if (requestedSessionId.equals(mediaItems.get(i).mediaId)) {
                    startIndex = i;
                    break;
                }
            }
        } else {
            startIndex =
                    Math.max(
                            0,
                            Math.min(
                                    payload.optInt("startIndex", 0),
                                    mediaItems.size() - 1));
        }
        currentBridgeSessionId = mediaItems.get(startIndex).mediaId;

        String repeatMode = payload.optString("repeatMode", "none");
        if ("one".equals(repeatMode)) {
            player.setRepeatMode(Player.REPEAT_MODE_ONE);
        } else if ("all".equals(repeatMode)) {
            player.setRepeatMode(Player.REPEAT_MODE_ALL);
        } else {
            player.setRepeatMode(Player.REPEAT_MODE_OFF);
        }
        player.setShuffleModeEnabled(false);
        player.setMediaItems(
                mediaItems,
                startIndex,
                Math.max(0L, payload.optLong("positionMs", 0L)));
        player.setPlayWhenReady(autoplay);
        player.prepare();
    }

    @Nullable
    private static MediaItem buildMediaItem(JSONObject payload) {
        String url = payload.optString("url", "");
        if (url.isEmpty()) return null;
        String sessionId = payload.optString("sessionId", url);

        MediaMetadata.Builder metadata =
                new MediaMetadata.Builder()
                        .setTitle(payload.optString("title", "VenySound"))
                        .setArtist(payload.optString("artist", ""))
                        .setAlbumTitle(payload.optString("album", "VenySound"));
        String artworkUrl = payload.optString("artworkUrl", "");
        if (!artworkUrl.isEmpty()) metadata.setArtworkUri(Uri.parse(artworkUrl));

        return new MediaItem.Builder()
                .setMediaId(sessionId)
                .setUri(Uri.parse(url))
                .setMediaMetadata(metadata.build())
                .build();
    }

    private void beginCallRecoveryDetection() {
        beginCallRecoveryDetection(false, "audio-focus");
    }

    private void beginCallRecoveryDetection(boolean confirmedCall, String trigger) {
        if (!userIntendsPlayback || player == null || player.getCurrentMediaItem() == null) {
            return;
        }
        if (!callRecoveryPending) {
            focusLossDetectedAtMs = SystemClock.elapsedRealtime();
            normalModeSinceMs = 0L;
        }
        callRecoveryPending = true;
        int audioMode =
                audioManager == null ? AudioManager.MODE_NORMAL : audioManager.getMode();
        if (confirmedCall || isCallAudioMode(audioMode)) {
            callModeObserved = true;
        }
        positionHandler.removeCallbacks(callRecoveryMonitor);
        positionHandler.post(callRecoveryMonitor);
        Log.i(TAG, "Call recovery armed by " + trigger + "; audioMode=" + audioMode);
        sendState("player.state");
    }

    private void onAudioModeChanged(int audioMode) {
        Log.i(TAG, "Audio mode changed: " + audioMode);
        if (isCallAudioMode(audioMode)) {
            if (userIntendsPlayback
                    && player != null
                    && player.getCurrentMediaItem() != null
                    && (player.isPlaying()
                            || player.getPlayWhenReady()
                            || callRecoveryPending)) {
                beginCallRecoveryDetection(true, "audio-mode");
            }
            return;
        }
        if (callRecoveryPending && callModeObserved) {
            normalModeSinceMs = SystemClock.elapsedRealtime();
            positionHandler.removeCallbacks(callRecoveryMonitor);
            positionHandler.postDelayed(callRecoveryMonitor, CALL_MODE_POLL_INTERVAL_MS);
            sendState("player.state");
        }
    }

    private void cancelCallRecovery() {
        positionHandler.removeCallbacks(callRecoveryMonitor);
        callRecoveryPending = false;
        callModeObserved = false;
        focusLossDetectedAtMs = 0L;
        normalModeSinceMs = 0L;
    }

    private static boolean isCallAudioMode(int audioMode) {
        return audioMode == AudioManager.MODE_RINGTONE
                || audioMode == AudioManager.MODE_IN_CALL
                || audioMode == AudioManager.MODE_IN_COMMUNICATION
                || audioMode == AudioManager.MODE_CALL_SCREENING
                || audioMode == AudioManager.MODE_CALL_REDIRECT;
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private static final class Api31 {
        private Api31() {}

        static Object registerAudioModeListener(
                AudioManager manager, MediaPlaybackService service) {
            AudioManager.OnModeChangedListener listener = service::onAudioModeChanged;
            manager.addOnModeChangedListener(service.getMainExecutor(), listener);
            return listener;
        }

        static void unregisterAudioModeListener(AudioManager manager, Object listener) {
            manager.removeOnModeChangedListener((AudioManager.OnModeChangedListener) listener);
        }
    }

    private void sendReady() {
        JSONObject payload = new JSONObject();
        try {
            payload.put("nativeVersion", 1);
            payload.put("media3", true);
        } catch (JSONException ignored) {
            // Fixed keys cannot fail in normal operation.
        }
        sendEvent("bridge.ready", payload);
    }

    private void sendState(String type) {
        if (player == null) return;
        JSONObject payload = new JSONObject();
        try {
            payload.put("mode", currentMode);
            payload.put("sessionId", currentBridgeSessionId);
            payload.put("isPlaying", player.isPlaying());
            payload.put(
                    "playWhenReady",
                    player.getPlayWhenReady()
                            || (callRecoveryPending && userIntendsPlayback));
            payload.put("userIntendsPlayback", userIntendsPlayback);
            payload.put("callInterrupted", callRecoveryPending && callModeObserved);
            payload.put("playbackState", player.getPlaybackState());
            payload.put("positionMs", Math.max(0L, player.getCurrentPosition()));
            payload.put("durationMs", Math.max(0L, player.getDuration()));
        } catch (JSONException ignored) {
            // Fixed keys cannot fail in normal operation.
        }
        sendEvent(type, payload);
    }

    private void sendEvent(String type, @Nullable JSONObject payload) {
        JSONObject message = new JSONObject();
        try {
            message.put("v", 1);
            message.put("type", type);
            message.put("ts", System.currentTimeMillis());
            message.put("payload", payload == null ? new JSONObject() : payload);
        } catch (JSONException ignored) {
            return;
        }
        TwaPostMessageBridge.send(message.toString());
    }

    @Override
    public void onDestroy() {
        cancelCallRecovery();
        positionHandler.removeCallbacksAndMessages(null);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && audioManager != null
                && audioModeListener != null) {
            Api31.unregisterAudioModeListener(audioManager, audioModeListener);
            audioModeListener = null;
        }
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        audioManager = null;
        super.onDestroy();
    }
}
