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

import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import androidx.browser.customtabs.CustomTabsCallback;

import com.google.androidbrowserhelper.trusted.TwaLauncher;

public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    private StableTwaPostMessageController postMessageController;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        postMessageController = new StableTwaPostMessageController(this);
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
    }

    @Override
    protected TwaLauncher createTwaLauncher() {
        TwaLauncher launcher = super.createTwaLauncher();
        postMessageController.attachLauncher(launcher);
        return launcher;
    }

    @Override
    protected CustomTabsCallback getCustomTabsCallback() {
        return postMessageController.wrap(super.getCustomTabsCallback());
    }

    @Override
    protected Uri getLaunchingUrl() {
        Uri uri = super.getLaunchingUrl();

        return uri;
    }

    @Override
    protected void onDestroy() {
        postMessageController.destroy();
        super.onDestroy();
    }
}
