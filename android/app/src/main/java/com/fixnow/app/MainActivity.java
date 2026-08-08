package com.fixnow.app;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

/**
 * Installs the Android 12+ SplashScreen API before the activity content is
 * created, so the branded native splash hands off cleanly into the WebView
 * (which paints the matching HTML splash on first frame).
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
    }
}
