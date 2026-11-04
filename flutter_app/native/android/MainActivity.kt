package __NAJD_PACKAGE__

import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Rational
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private lateinit var pipChannel: MethodChannel
    private var eligible = false
    private var playing = false
    private var session = ""
    private var ratio = 16.0 / 9.0
    private var registered = false
    private val actionName get() = "$packageName.NAJD_PIP_TOGGLE"
    private fun supported() = Build.VERSION.SDK_INT >= 26 &&
        packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == actionName) emit(if (playing) "pause" else "play")
        }
    }
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        pipChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "najd/pip")
        pipChannel.setMethodCallHandler { call, result ->
            when (call.method) {
                "supported" -> result.success(supported())
                "update", "enter" -> {
                    session = call.argument<String>("session") ?: ""
                    playing = call.argument<Boolean>("playing") ?: false
                    eligible = playing
                    val w = call.argument<Number>("width")?.toDouble() ?: 16.0
                    val h = call.argument<Number>("height")?.toDouble() ?: 9.0
                    ratio = (if (w > 0 && h > 0) w / h else 16.0 / 9.0).coerceIn(1.0/2.39, 2.39)
                    if (!supported()) result.success(false) else {
                        try {
                            val params = params()
                            setPictureInPictureParams(params)
                            result.success(if (call.method == "enter") enterPictureInPictureMode(params) else true)
                        } catch (_: Exception) { result.success(false) }
                    }
                }
                "close" -> { if (call.argument<String>("session") == session) {
                    eligible = false
                    if (supported()) try { setPictureInPictureParams(params()) } catch (_: Exception) {}
                  }; result.success(true) }
                else -> result.notImplemented()
            }
        }
        if (!registered) {
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(receiver, IntentFilter(actionName), Context.RECEIVER_NOT_EXPORTED)
            else {
                @Suppress("DEPRECATION")
                registerReceiver(receiver, IntentFilter(actionName))
            }
            registered = true
        }
    }
    private fun params(): PictureInPictureParams {
        val intent = Intent(actionName).setPackage(packageName)
        val pending = PendingIntent.getBroadcast(this, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val action = RemoteAction(Icon.createWithResource(this, if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play),
            if (playing) "إيقاف مؤقت" else "تشغيل", "Najd TV", pending)
        val builder = PictureInPictureParams.Builder().setAspectRatio(Rational((ratio*1000).toInt(),1000)).setActions(listOf(action))
        if (Build.VERSION.SDK_INT >= 31) builder.setAutoEnterEnabled(eligible).setSeamlessResizeEnabled(true)
        return builder.build()
    }
    private fun emit(command: String? = null) {
        if (::pipChannel.isInitialized) pipChannel.invokeMethod("pipState", mapOf(
            "session" to session, "active" to (Build.VERSION.SDK_INT >= 26 && isInPictureInPictureMode), "command" to command))
    }
    override fun onPictureInPictureModeChanged(active: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(active, newConfig)
        emit()
    }
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (eligible && supported() && Build.VERSION.SDK_INT < 31 && !isInPictureInPictureMode) {
            try { enterPictureInPictureMode(params()) } catch (_: Exception) {}
        }
    }
    override fun onDestroy() {
        if (registered) { unregisterReceiver(receiver); registered = false }
        super.onDestroy()
    }
}
