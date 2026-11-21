package com.alnawras.pos;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LanPrinterPlugin.class); // direct printing to Ethernet printers
        super.onCreate(savedInstanceState);
    }
}
