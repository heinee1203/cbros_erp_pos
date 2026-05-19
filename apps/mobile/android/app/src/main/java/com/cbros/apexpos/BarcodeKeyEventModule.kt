package com.cbros.apexpos

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class BarcodeKeyEventModule(
    private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {

  companion object {
    private var activeModule: BarcodeKeyEventModule? = null

    fun emitKey(key: String) {
      activeModule?.sendKey(key)
    }
  }

  init {
    activeModule = this
  }

  override fun getName(): String = "BarcodeKeyEvent"

  override fun invalidate() {
    if (activeModule === this) {
      activeModule = null
    }
    super.invalidate()
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by NativeEventEmitter; events are emitted from MainActivity.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required by NativeEventEmitter.
  }

  private fun sendKey(key: String) {
    try {
      context
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("ApexBarcodeKey", key)
    } catch (_: RuntimeException) {
      // React context may not be ready during early activity startup.
    }
  }
}
