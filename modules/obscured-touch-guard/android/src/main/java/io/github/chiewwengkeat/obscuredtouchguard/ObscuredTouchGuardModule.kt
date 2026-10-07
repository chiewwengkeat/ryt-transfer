package io.github.chiewwengkeat.obscuredtouchguard

import android.os.Handler
import android.os.Looper
import android.view.KeyboardShortcutGroup
import android.view.Menu
import android.view.MotionEvent
import android.view.View
import android.view.Window
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ObscuredTouchGuardModule : Module() {
  private val uiThread = Handler(Looper.getMainLooper())
  private var guardHeld = false
  private var guardedWindow: Window? = null
  private var touchObserver: ObscuredTouchObserver? = null

  override fun definition() = ModuleDefinition {
    Name("ObscuredTouchGuard")
    Events("onObscuredTouchDropped")

    Function("enable") {
      onUiThread {
        guardHeld = true
        guardCurrentWindow()
      }
    }
    Function("disable") {
      onUiThread {
        guardHeld = false
        releaseGuardedWindow()
      }
    }
    // A recreated activity brings a new window, without the flag or the observer.
    OnActivityEntersForeground { onUiThread { if (guardHeld) guardCurrentWindow() } }
    OnActivityDestroys { onUiThread { releaseGuardedWindow() } }
    OnDestroy {
      uiThread.removeCallbacksAndMessages(null)
      onUiThread {
        guardHeld = false
        releaseGuardedWindow()
      }
    }
  }

  // Every entry point comes through here, so this class's fields and the window change on the UI thread only.
  private fun onUiThread(block: () -> Unit) {
    uiThread.post { block() }
  }

  private fun guardCurrentWindow() {
    val window = appContext.currentActivity?.window ?: return
    if (window === guardedWindow) return
    releaseGuardedWindow()
    val windowCallback = window.callback ?: return
    val observer = ObscuredTouchObserver(windowCallback, window.decorView) {
      sendEvent("onObscuredTouchDropped")
    }
    window.decorView.filterTouchesWhenObscured = true
    window.callback = observer
    guardedWindow = window
    touchObserver = observer
  }

  private fun releaseGuardedWindow() {
    val window = guardedWindow ?: return
    window.decorView.filterTouchesWhenObscured = false
    touchObserver?.let { observer ->
      observer.onTouchDropped = null
      // A wrapper set above the observer keeps it in the chain, where it now only forwards.
      if (window.callback === observer) window.callback = observer.wrappedCallback
    }
    guardedWindow = null
    touchObserver = null
  }
}

private class ObscuredTouchObserver(
  val wrappedCallback: Window.Callback,
  private val decorView: View,
  var onTouchDropped: (() -> Unit)?,
) : Window.Callback by wrappedCallback {
  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    // The decor view's own drop test (View.onFilterTouchEventForSecurity), on touch-down only so a gesture reports once.
    if (decorView.filterTouchesWhenObscured &&
      event.actionMasked == MotionEvent.ACTION_DOWN &&
      (event.flags and MotionEvent.FLAG_WINDOW_IS_OBSCURED) != 0
    ) {
      onTouchDropped?.invoke()
    }
    return wrappedCallback.dispatchTouchEvent(event)
  }

  // Kotlin's `by` does not forward Java default methods, so these two are forwarded by hand.
  override fun onPointerCaptureChanged(hasCapture: Boolean) {
    wrappedCallback.onPointerCaptureChanged(hasCapture)
  }

  override fun onProvideKeyboardShortcuts(
    data: MutableList<KeyboardShortcutGroup>?,
    menu: Menu?,
    deviceId: Int,
  ) {
    wrappedCallback.onProvideKeyboardShortcuts(data, menu, deviceId)
  }
}
