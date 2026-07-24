package com.edgarcst.venysound;

import android.os.Bundle;

import androidx.annotation.Nullable;
import androidx.browser.customtabs.CustomTabsSession;

final class TwaPostMessageBridge {
    private static final Object LOCK = new Object();

    @Nullable
    private static CustomTabsSession session;
    private static boolean ready;

    private TwaPostMessageBridge() {}

    static void attach(CustomTabsSession customTabsSession) {
        synchronized (LOCK) {
            session = customTabsSession;
            ready = false;
        }
    }

    static void setReady(boolean value) {
        synchronized (LOCK) {
            ready = value;
        }
    }

    static void detach(CustomTabsSession customTabsSession) {
        synchronized (LOCK) {
            if (session == customTabsSession) {
                session = null;
                ready = false;
            }
        }
    }

    static boolean send(String message) {
        synchronized (LOCK) {
            if (!ready || session == null) return false;
            return session.postMessage(message, (Bundle) null) >= 0;
        }
    }
}
