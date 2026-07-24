package com.edgarcst.venysound;

import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

import org.json.JSONException;
import org.json.JSONObject;

public final class MediaPlaybackService extends MediaSessionService {
    public static final String ACTION_BRIDGE_COMMAND =
            "com.edgarcst.venysound.action.BRIDGE_COMMAND";
    public static final String EXTRA_MESSAGE = "message";

    private ExoPlayer player;
    private MediaSession mediaSession;
    private final Handler positionHandler = new Handler(Looper.getMainLooper());
    private String currentBridgeSessionId = "";
    private String currentMode = "none";

    private final Runnable positionReporter = new Runnable() {
        @Override
        public void run() {
            if (player != null && player.getCurrentMediaItem() != null) {
                sendState("player.position");
            }
            positionHandler.postDelayed(this, 1000L);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
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
                    public void onPlaybackStateChanged(int playbackState) {
                        sendState("player.state");
                        if (playbackState == Player.STATE_ENDED) {
                            sendEvent("player.ended", null);
                        }
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
                    player.play();
                    break;
                case "player.pause":
                    player.pause();
                    break;
                case "player.seek":
                    player.seekTo(Math.max(0L, payload.optLong("positionMs", 0L)));
                    break;
                case "player.stop":
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
        String url = payload.optString("url", "");
        if (url.isEmpty()) return;
        currentBridgeSessionId = payload.optString("sessionId", url);
        currentMode = payload.optString("mode", "music");

        MediaMetadata.Builder metadata =
                new MediaMetadata.Builder()
                        .setTitle(payload.optString("title", "VenySound"))
                        .setArtist(payload.optString("artist", ""))
                        .setAlbumTitle(payload.optString("album", "VenySound"));
        String artworkUrl = payload.optString("artworkUrl", "");
        if (!artworkUrl.isEmpty()) metadata.setArtworkUri(Uri.parse(artworkUrl));

        MediaItem item =
                new MediaItem.Builder()
                        .setMediaId(currentBridgeSessionId)
                        .setUri(Uri.parse(url))
                        .setMediaMetadata(metadata.build())
                        .build();
        player.setMediaItem(item, Math.max(0L, payload.optLong("positionMs", 0L)));
        player.setPlayWhenReady(payload.optBoolean("autoplay", true));
        player.prepare();
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
            payload.put("playWhenReady", player.getPlayWhenReady());
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
        positionHandler.removeCallbacksAndMessages(null);
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}
