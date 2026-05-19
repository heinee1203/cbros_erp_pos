package com.cbros.apexpos

import android.os.Build
import android.os.Bundle
import android.graphics.Color
import android.view.KeyEvent
import android.view.View
import android.widget.EditText
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "ApexPOS"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    applyLightSystemBars()
    hideSystemUI()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      hideSystemUI()
    }
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.action == KeyEvent.ACTION_DOWN && currentFocus !is EditText) {
      val key = keyFromEvent(event)
      if (key != null) {
        BarcodeKeyEventModule.emitKey(key)
        return true
      }
    }
    return super.dispatchKeyEvent(event)
  }

  private fun keyFromEvent(event: KeyEvent): String? {
    if (event.keyCode == KeyEvent.KEYCODE_ENTER) return "Enter"

    if (!event.isPrintingKey) return null
    val unicode = event.getUnicodeChar(event.metaState)
    if (unicode <= 0) return null

    return unicode.toChar().toString()
  }

  private fun applyLightSystemBars() {
    window.statusBarColor = Color.rgb(246, 247, 249)
    window.navigationBarColor = Color.WHITE
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    controller.isAppearanceLightStatusBars = true
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      controller.isAppearanceLightNavigationBars = true
    }
  }

  private fun hideSystemUI() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val controller = WindowCompat.getInsetsController(window, window.decorView)
      controller.systemBarsBehavior =
          WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      controller.hide(WindowInsetsCompat.Type.navigationBars())
    } else {
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility = (
          View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
          or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
      )
    }
  }
}
