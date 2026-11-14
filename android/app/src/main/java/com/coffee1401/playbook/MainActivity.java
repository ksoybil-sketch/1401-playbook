package com.coffee1401.playbook;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Telefonun "yazı boyutu" ayarı arayüzü büyütüp düzeni bozmasın:
        // ekran zaten okunaklı boyutlarla tasarlandı.
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebSettings s = getBridge().getWebView().getSettings();
            s.setTextZoom(100);
        }
    }
}
